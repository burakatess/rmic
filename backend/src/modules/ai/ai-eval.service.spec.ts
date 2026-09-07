import { Test, TestingModule } from '@nestjs/testing';
import { AiEvalService } from './ai-eval.service';
import { AiProviderService } from './ai-provider.service';
import { AiEmbeddingService } from './ai-embedding.service';
import { TextExtractService } from './text-extract.service';
import { PrismaService } from '../../prisma';

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

    describe('createSession — knowledge snapshot', () => {
        it('yalnızca aktif kaynak dokümanlarını snapshot alır', async () => {
            prisma.knowledgeDoc.findMany.mockResolvedValue([
                { kind: 'RUBRIC', code: 'RUB-1', title: 'Rehber', body: 'metin', sourceRef: null },
            ]);
            prisma.aiEvalSession.create.mockResolvedValue({ id: 's-1' });

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
