import { Test, TestingModule } from '@nestjs/testing';
import { AiEvalService } from './ai-eval.service';
import { AiProviderService } from './ai-provider.service';
import { AiEmbeddingService } from './ai-embedding.service';
import { TextExtractService } from './text-extract.service';
import { PrismaService } from '../../prisma';
import { EvalSourceRetrievalService } from './eval-v3/eval-source-retrieval.service';

describe('AiEvalService — kaynak & emsal katmanı', () => {
    let service: AiEvalService;
    let prisma: Record<string, any>;
    let embeddings: { enabled: boolean; rankBySimilarity: jest.Mock };

    beforeEach(async () => {
        prisma = {
            aiEvalSession: { create: jest.fn(), update: jest.fn() },
            control: { findUnique: jest.fn() },
            regulationArticle: { findMany: jest.fn().mockResolvedValue([]) },
            knowledgeDoc: { findMany: jest.fn().mockResolvedValue([]) },
            finding: { findMany: jest.fn().mockResolvedValue([]) },
        };
        embeddings = { enabled: false, rankBySimilarity: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AiEvalService,
                { provide: PrismaService, useValue: prisma },
                { provide: AiProviderService, useValue: {} },
                { provide: AiEmbeddingService, useValue: embeddings },
                { provide: TextExtractService, useValue: {} },
                { provide: EvalSourceRetrievalService, useValue: {} },
            ],
        }).compile();

        service = module.get<AiEvalService>(AiEvalService);
    });

    afterEach(() => jest.clearAllMocks());

    describe('knowledgeAsText', () => {
        it('boş snapshot için boş string döner', () => {
            expect((service as any).knowledgeAsText({ knowledgeSnapshot: null })).toBe('');
        });

        it('snapshot kalemlerini tür/kod/başlık ile biçimler', () => {
            const text = (service as any).knowledgeAsText({
                knowledgeSnapshot: [
                    { tur: 'POLICY', kod: 'POL-1', baslik: 'Erişim Politikası', metin: 'İçerik', kaynak: 'DOK-9' },
                ],
            });
            expect(text).toContain('[POLICY POL-1] Erişim Politikası');
            expect(text).toContain('(kaynak: DOK-9)');
            expect(text).toContain('İçerik');
        });
    });

    describe('loadPrecedentFindings', () => {
        it('embedding devre dışıysa boş dizi döner ve DB sorgusu yapmaz', async () => {
            embeddings.enabled = false;
            const out = await (service as any).loadPrecedentFindings('ctrl-1', 'sorgu');
            expect(out).toEqual([]);
            expect(prisma.finding.findMany).not.toHaveBeenCalled();
        });

        it('embedding açıkken benzerlik hatası özelliği bozmaz (boş dizi)', async () => {
            embeddings.enabled = true;
            prisma.finding.findMany.mockResolvedValue([
                { findingId: '2026.BT.01', summary: 'x', description: 'y', severity: 'HIGH', status: 'OPEN', recommendation: null },
            ]);
            embeddings.rankBySimilarity.mockResolvedValue([]); // servis hatada [] döndürür
            const out = await (service as any).loadPrecedentFindings('ctrl-1', 'sorgu');
            expect(out).toEqual([]);
        });

        it('kontrol referansı varsa o kontrole bağlı bulguları havuza alır', async () => {
            embeddings.enabled = true;
            prisma.finding.findMany.mockResolvedValue([]);
            await (service as any).loadPrecedentFindings('ctrl-1', 'sorgu');
            expect(prisma.finding.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { OR: [{ controlId: 'ctrl-1' }, { controlTest: { controlId: 'ctrl-1' } }] },
                }),
            );
        });
    });

    describe('deriveTitle', () => {
        it('kontrol adı + dönemden anlamlı başlık üretir', () => {
            const t = (service as any).deriveTitle({ name: 'E-posta güvenliği' }, null, 'Eylül 2026');
            expect(t).toBe('E-posta güvenliği — Eylül 2026');
        });
        it('elle metinden kısa başlık türetir (ekstra LLM çağrısı yok)', () => {
            const t = (service as any).deriveTitle(null, 'Yetkilendirme matrisi gözden geçirildi mi', 'Ekim 2026');
            expect(t).toBe('Yetkilendirme matrisi gözden geçirildi mi — Ekim 2026');
        });
    });

    describe('countUnreviewed', () => {
        it('yalnızca uyumsuzAlanlar ve bulguAdaylari içinden _review taşımayanları sayar', () => {
            const n = (service as any).countUnreviewed({
                uyumluAlanlar: [{ konu: 'x' }],
                uyumsuzAlanlar: [{ konu: 'a', _review: { status: 'ACCEPTED' } }, { konu: 'b' }],
                bulguAdaylari: [{ baslik: 'c' }],
            });
            expect(n).toBe(2);
        });
    });

    describe('completeSession', () => {
        beforeEach(() => {
            prisma.aiEvalSession.findUnique = jest.fn();
            prisma.aiEvalMessage = { count: jest.fn() };
        });

        it('AWAITING_REVIEW değilse tamamlamayı reddeder', async () => {
            prisma.aiEvalSession.findUnique.mockResolvedValue({
                id: 's1', createdById: 'u1', runStatus: 'DRAFT', messages: [], attachments: [],
            });
            await expect(service.completeSession('s1', 'MET', 'u1')).rejects.toThrow(/İnceleme bekliyor/);
        });

        it('incelenmemiş tespit varsa tamamlamayı reddeder', async () => {
            prisma.aiEvalSession.findUnique.mockResolvedValue({
                id: 's1', createdById: 'u1', runStatus: 'AWAITING_REVIEW', attachments: [],
                messages: [{
                    id: 'm1', role: 'ASSISTANT', cancelled: false, stale: false,
                    evaluation: { uyumsuzAlanlar: [{ konu: 'a' }], bulguAdaylari: [] }, editedEvaluation: null,
                }],
            });
            await expect(service.completeSession('s1', 'NOT_MET', 'u1')).rejects.toThrow(/incelenmedi/);
        });
    });

    describe('trashSession', () => {
        it('çalışan değerlendirme çöpe taşınamaz', async () => {
            prisma.aiEvalSession.findUnique = jest.fn().mockResolvedValue({
                id: 's1', createdById: 'u1', runStatus: 'RUNNING',
            });
            await expect(service.trashSession('s1', 'u1')).rejects.toThrow(/sürüyor/);
        });

        it('başkasının oturumuna erişimi reddeder', async () => {
            prisma.aiEvalSession.findUnique = jest.fn().mockResolvedValue({
                id: 's1', createdById: 'other', runStatus: 'DRAFT',
            });
            await expect(service.trashSession('s1', 'u1')).rejects.toThrow(/erişiminiz yok/);
        });
    });

    describe('updateSession — iyimser eşzamanlılık', () => {
        it('contentVersion uyuşmazsa 409 (eski istek yeni içeriği ezmez)', async () => {
            prisma.aiEvalSession.findUnique = jest.fn().mockResolvedValue({
                id: 's1', createdById: 'u1', status: 'ACTIVE', contentVersion: 5,
                regulationArticleIds: [], knowledgeDocIds: [],
            });
            await expect(
                service.updateSession('s1', { contentVersion: 3, controlText: 'x' }, 'u1'),
            ).rejects.toThrow(/başka bir yerden güncellendi/);
        });
    });

    describe('createSession — knowledge snapshot', () => {
        it('yalnızca aktif kaynak dokümanlarını snapshot alır', async () => {
            prisma.knowledgeDoc.findMany.mockResolvedValue([
                { kind: 'RUBRIC', code: 'RUB-1', title: 'Rehber', body: 'metin', sourceRef: null },
            ]);
            prisma.aiEvalSession.create.mockResolvedValue({ id: 's-1' });
            // createSession artık tutarlı tam şekil için getSession'a düşüyor.
            prisma.aiEvalSession.findUnique = jest.fn().mockResolvedValue({
                id: 's-1', createdById: 'user-1', messages: [], attachments: [],
            });

            await service.createSession(
                { controlText: 'Kontrol', knowledgeDocIds: ['k-1', 'k-2'] },
                'user-1',
            );

            expect(prisma.knowledgeDoc.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: { in: ['k-1', 'k-2'] }, isActive: true } }),
            );
            const data = prisma.aiEvalSession.create.mock.calls[0][0].data;
            expect(data.knowledgeDocIds).toEqual(['k-1', 'k-2']);
            expect(data.knowledgeSnapshot).toEqual([
                { tur: 'RUBRIC', kod: 'RUB-1', baslik: 'Rehber', metin: 'metin', kaynak: null },
            ]);
        });
    });
});
