// ÖNEMLİ: .env.test diğer import'lardan ÖNCE yüklenmeli (bkz. helpers/test-app.ts).
import * as dotenv from 'dotenv';
import { join } from 'path';
dotenv.config({ path: join(__dirname, '../.env.test') });

import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AiProviderService } from '../src/modules/ai/ai-provider.service';
import { resetDatabase, seedRoles, createTestUser, E2E_TEST_PASSWORD } from './helpers/fixtures';
import { validV3 } from '../src/modules/ai/eval-v3/eval-v3.fixtures';

/**
 * E2E — Kontrol & Kanıt Değerlendirme v3: otomatik kaynak taraması, doğrulanmış atıf, yeniden değerlendirme,
 * geçmiş kayıtların açılması, yetki. Model MOCK'tur (kalite kanıtı değildir); veritabanı, kaynak tabloları,
 * retrieval, doğrulama ve kayıt GERÇEKTİR (izole grc_db_test).
 */
describe('E2E — AI Kontrol & Kanıt Değerlendirme v3', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let adminToken: string;
    let viewerToken: string;
    let unitId: string;
    let versionId: string;
    const chat = jest.fn();

    const login = async (email: string) =>
        (await request(app.getHttpServer()).post('/auth/login').send({ email, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken as string;

    const modelOutput = (over: Record<string, unknown> = {}) => validV3({
        references: [{ refId: 'REF1', sourceType: 'OFFICIAL_GUIDE', sourceName: 'x', version: '1.1', articleNumber: 'BIGR-3.2.9.1', articleTitle: 'x', page: 87, sourceUnitId: unitId, relation: 'Şifreli iletişim beklentisiyle ilişkilidir.', assessment: 'RELEVANT' }],
        evaluatedEvidence: [{ evidenceId: 'E0', name: 'x', type: 'beyan', observation: 'Beyan incelenmiştir.', limitations: 'Sistem kaydı değildir.' }],
        usedSourceUnitIds: [unitId],
        ...over,
    });

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(AiProviderService)
            .useValue({
                chat, isEnabled: () => true, reload: () => undefined,
                config: { enabled: true, evalModel: null, models: { heavy: 'mock-heavy', light: 'mock-light', vision: 'mock-vision' }, maxTokens: 4096 },
            })
            .compile();
        app = moduleRef.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
        await app.init();
        prisma = app.get(PrismaService);

        await resetDatabase(prisma);
        const roleIds = await seedRoles(prisma);
        const admin = await createTestUser(prisma, roleIds['SYSTEM_ADMIN'], { email: 'admin@e2e.local' });
        await createTestUser(prisma, roleIds['VIEWER'], { email: 'viewer@e2e.local' });
        adminToken = await login('admin@e2e.local');
        viewerToken = await login('viewer@e2e.local');

        // Sistem kaynağı (SENTETİK metin): onaylı + RAG izinli + sistem-yönetimli + aktif.
        const src = await prisma.source.create({
            data: {
                kind: 'OFFICIAL_GUIDE', slug: 'e2e-rehber', title: 'E2E Bilgi ve İletişim Güvenliği Rehberi', language: 'tr',
                confidentiality: 'PUBLIC', rightRag: 'ALLOWED', rightFullText: 'ALLOWED', rightRefLink: 'ALLOWED',
                rightsVerifiedAt: new Date(), rightsVerifiedById: admin.id, isSystemManaged: true, isActive: true, createdById: admin.id,
            },
        });
        const ver = await prisma.sourceVersion.create({
            data: { sourceId: src.id, versionLabel: '1.1', approvalStatus: 'APPROVED', contentReviewedAt: new Date(), contentReviewedById: admin.id },
        });
        versionId = ver.id;
        const u = await prisma.sourceUnit.create({
            data: {
                versionId: ver.id, stableKey: 'BIGR-3.2.9.1', unitCode: 'BIGR-3.2.9.1', unitType: 'control',
                title: 'İletişim kanallarında gizliliğin sağlanması',
                originalText: 'Ağ üzerinden iletilen verinin gizliliği için şifreli iletişim protokolleri kullanılır. Şifreleme belgelenir.',
                locator: { page: 87 },
            },
        });
        unitId = u.id;
        // Alakasız ikinci birim: eşik/alaka kapısı testleri için.
        await prisma.sourceUnit.create({
            data: { versionId: ver.id, stableKey: 'BIGR-2.1.1', unitCode: 'BIGR-2.1.1', unitType: 'control', title: 'Fiziksel giriş kontrolü', originalText: 'Sunucu odalarına girişler kayıt altına alınır.', locator: { page: 40 } },
        });
    });

    afterAll(async () => { await app.close(); });
    beforeEach(() => chat.mockReset());

    const create = async (over: Record<string, unknown> = {}) =>
        (await request(app.getHttpServer()).post('/ai/eval-sessions').set('Authorization', `Bearer ${adminToken}`).send({
            controlText: 'Ağ iletişiminin şifreli protokollerle yapılması kontrolü.',
            evidenceText: 'Sunucu yapılandırmasında TLS şifreleme ayarları görülmektedir.',
            ...over,
        }).expect(201)).body;

    const evaluate = (id: string, body: Record<string, unknown>, token = adminToken) =>
        request(app.getHttpServer()).post(`/ai/eval-sessions/${id}/evaluate`).set('Authorization', `Bearer ${token}`).send(body);

    it('yetkisiz rol (VIEWER) değerlendirme oturumu oluşturamaz → 403', async () => {
        await request(app.getHttpServer()).post('/ai/eval-sessions').set('Authorization', `Bearer ${viewerToken}`).send({ controlText: 'x' }).expect(403);
        await request(app.getHttpServer()).post('/ai/eval-sessions').send({ controlText: 'x' }).expect(401);
    });

    it('kaynak seçmeden "Değerlendir": OTOMATİK taranan tedbir bulunur, atıf doğrulanır, snapshot + skor kaydedilir', async () => {
        chat.mockResolvedValue({ model: 'mock-heavy', parsed: modelOutput(), text: '', latencyMs: 5, tokensIn: 10, tokensOut: 20 });
        const s = await create();
        expect(s.sourceUnitIds).toEqual([]); // kullanıcı hiçbir kaynak seçmedi

        const res = await evaluate(s.id, { contentVersion: s.contentVersion, controlText: s.controlText, evidenceText: s.evidenceText }).expect(201);
        const prompt: string = chat.mock.calls[0][0].user;
        expect(prompt).toContain('[U1]');
        expect(prompt).not.toContain('Fiziksel giriş kontrolü'); // ilgisiz birim prompt'a girmedi

        const le = res.body.latestEvaluation;
        expect(le.schemaVersion).toBe('eval-v3.1');
        expect(le.schemaValid).toBe(true);
        const ref = le.effective.references[0];
        expect(ref).toMatchObject({ sourceUnitId: unitId, articleNumber: 'BIGR-3.2.9.1', page: 87, version: '1.1', verified: true });
        expect(ref.snapshotText).toContain('şifreli iletişim');
        expect(ref.retrievalScore).toBeGreaterThan(0);
        expect(le.retrievalNote.method).toBe('LEXICAL_ONLY');
        expect(le.sentSourceUnitIds).toEqual([unitId]);
        expect(res.body.usedSourceUnitIds).toEqual([unitId]);
        expect(JSON.stringify(le.effective)).not.toMatch(/requirementAssessments|applicability/);
        const msg = await prisma.aiEvalMessage.findFirst({ where: { sessionId: s.id, role: 'ASSISTANT' } });
        expect(msg?.inputHash).toMatch(/^[0-9a-f]{32}$/);
        expect(msg?.promptVersion).toBeTruthy();
        expect(msg?.modelVersion).toBe('mock-heavy');
    });

    it('yeniden değerlendirme: yeni açıklama prompt\'a girer; girdi değişince hash değişir; önceki cevap ham JSON olarak girmez', async () => {
        chat.mockResolvedValue({ model: 'mock-heavy', parsed: modelOutput(), text: '', latencyMs: 5 });
        const s = await create();
        await evaluate(s.id, { contentVersion: s.contentVersion, controlText: s.controlText, evidenceText: s.evidenceText }).expect(201);
        const s2 = (await request(app.getHttpServer()).get(`/ai/eval-sessions/${s.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200)).body;

        await evaluate(s.id, { contentVersion: s2.contentVersion, controlText: s.controlText, evidenceText: s.evidenceText, additionalNote: 'YENİ AÇIKLAMA: TLS 1.3 zorunlu kılındı.' }).expect(201);
        const prompt2: string = chat.mock.calls[1][0].user;
        expect(prompt2).toContain('<yeniden_degerlendirme_talimati>');
        expect(prompt2).toContain('YENİ AÇIKLAMA: TLS 1.3 zorunlu kılındı.');
        expect(prompt2).toContain('Önceki cevabı tekrar etme.');
        expect(prompt2).not.toContain('snapshotText');

        const msgs = await prisma.aiEvalMessage.findMany({ where: { sessionId: s.id, role: 'ASSISTANT', kind: 'EVALUATION' }, orderBy: { createdAt: 'asc' } });
        expect(msgs).toHaveLength(2);
        expect(msgs[0].inputHash).not.toBe(msgs[1].inputHash);
    });

    it('model retrieval\'da olmayan madde uydurursa çıktı kaydına girmez (rejectedReferences) ve inceleme işaretlenir', async () => {
        chat.mockResolvedValue({
            model: 'mock-heavy', text: '', latencyMs: 5,
            parsed: modelOutput({ references: [{ refId: 'REF1', sourceType: 'OFFICIAL_GUIDE', sourceName: 'x', version: '1.1', articleNumber: 'BIGR-9.9.9', articleTitle: 'uydurma', page: 1, sourceUnitId: 'cuid-yok', relation: 'r', assessment: 'RELEVANT' }] }),
        });
        const s = await create();
        const res = await evaluate(s.id, { contentVersion: s.contentVersion, controlText: s.controlText, evidenceText: s.evidenceText }).expect(201);
        const eff = res.body.latestEvaluation.effective;
        expect(eff.references).toEqual([]);
        expect(eff.rejectedReferences[0].claimed).toContain('BIGR-9.9.9');
        expect(res.body.needsReview).toBe(true);
    });

    it('onarım da başarısızsa 400 ve anlamlı mesaj; önceki değerlendirme yeni sonuç olarak kaydedilmez', async () => {
        chat.mockResolvedValueOnce({ model: 'mock-heavy', parsed: modelOutput(), text: '', latencyMs: 5 });
        const s = await create();
        await evaluate(s.id, { contentVersion: s.contentVersion, controlText: s.controlText, evidenceText: s.evidenceText }).expect(201);
        const cur = (await request(app.getHttpServer()).get(`/ai/eval-sessions/${s.id}`).set('Authorization', `Bearer ${adminToken}`)).body;

        chat.mockResolvedValue({ model: 'mock-heavy', parsed: { yanlis: true }, text: 'json değil', latencyMs: 5 });
        const bad = await evaluate(s.id, { contentVersion: cur.contentVersion, controlText: s.controlText, evidenceText: s.evidenceText, additionalNote: 'başka not' }).expect(400);
        expect(bad.body.message).toMatch(/doğrulanamadı ve kaydedilmedi/);
        expect(JSON.stringify(bad.body)).not.toMatch(/stack|prisma/i);

        const after = (await request(app.getHttpServer()).get(`/ai/eval-sessions/${s.id}`).set('Authorization', `Bearer ${adminToken}`)).body;
        expect(after.latestEvaluation.messageId).toBe(cur.latestEvaluation.messageId); // hâlâ önceki geçerli sonuç
    });

    it('bulgu varsa insan incelemesi (group=finding) çalışır; çıktı üretimi bulguyu içerir', async () => {
        chat.mockResolvedValue({
            model: 'mock-heavy', text: '', latencyMs: 5,
            parsed: modelOutput({
                controlResult: { status: 'NON_COMPLIANT', text: 'İletilen kanıtlar incelendiğinde şifrelemenin uygulandığını gösteren bir kayda rastlanmamıştır.' },
                additionalEvidenceRequired: [],
                finding: { exists: true, title: 'İletişim şifrelemesi doğrulanamamıştır', explanation: 'Şifreli iletişimi gösteren yapılandırma kanıtı sunulmamıştır.', relatedReferenceIds: ['REF1'] },
            }),
        });
        const s = await create();
        await evaluate(s.id, { contentVersion: s.contentVersion, controlText: s.controlText, evidenceText: s.evidenceText }).expect(201);
        const rev = await request(app.getHttpServer()).post(`/ai/eval-sessions/${s.id}/findings/review`).set('Authorization', `Bearer ${adminToken}`)
            .send({ group: 'finding', index: 0, status: 'ACCEPTED' }).expect(201);
        expect(rev.body.latestEvaluation.effective.finding._review.status).toBe('ACCEPTED');
        const out = await request(app.getHttpServer()).get(`/ai/eval-sessions/${s.id}/outputs`).set('Authorization', `Bearer ${adminToken}`).expect(200);
        expect(out.body.findingCandidates).toHaveLength(1);
        expect(out.body.controlResult).toMatch(/NON COMPLIANT/);
    });

    it('geçmiş (v2) değerlendirme kaydı hâlâ açılır ve yeni akışı bozmaz', async () => {
        const s = await create();
        await prisma.aiEvalMessage.create({
            data: {
                sessionId: s.id, role: 'ASSISTANT', kind: 'EVALUATION', content: 'eski özet', schemaVersion: '2026-09-10.1',
                evaluation: { summary: 'Eski v2 özeti', requirementAssessments: [], controlResult: { overall: 'INSUFFICIENT_EVIDENCE', summary: 'x', samplingPeriodLimits: '' }, impact: { type: 'UNDETERMINED' }, findingAssessment: [] },
            },
        });
        const res = await request(app.getHttpServer()).get(`/ai/eval-sessions/${s.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
        expect(res.body.latestEvaluation.schemaVersion).toBe('2026-09-10.1');
        expect(res.body.latestEvaluation.effective.summary).toBe('Eski v2 özeti');
    });

    it('kaynak sonradan güncellense de eski değerlendirmenin atıf snapshot\'ı korunur', async () => {
        chat.mockResolvedValue({ model: 'mock-heavy', parsed: modelOutput(), text: '', latencyMs: 5 });
        const s = await create();
        await evaluate(s.id, { contentVersion: s.contentVersion, controlText: s.controlText, evidenceText: s.evidenceText }).expect(201);
        await prisma.sourceUnit.update({ where: { id: unitId }, data: { originalText: 'KAYNAK SONRADAN DEĞİŞTİRİLDİ' } });
        const res = await request(app.getHttpServer()).get(`/ai/eval-sessions/${s.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
        const ref = res.body.latestEvaluation.effective.references[0];
        expect(ref.snapshotText).toContain('şifreli iletişim protokolleri');
        expect(ref.snapshotText).not.toContain('SONRADAN');
        await prisma.sourceUnit.update({ where: { id: unitId }, data: { originalText: 'Ağ üzerinden iletilen verinin gizliliği için şifreli iletişim protokolleri kullanılır. Şifreleme belgelenir.' } });
    });

    it('sürümü onaydan çıkan kaynak otomatik taramaya girmez (retrieval yalnız APPROVED)', async () => {
        chat.mockResolvedValue({ model: 'mock-heavy', parsed: modelOutput({ references: [], usedSourceUnitIds: [] }), text: '', latencyMs: 5 });
        await prisma.sourceVersion.update({ where: { id: versionId }, data: { approvalStatus: 'WITHDRAWN' } });
        try {
            const s = await create();
            await evaluate(s.id, { contentVersion: s.contentVersion, controlText: s.controlText, evidenceText: s.evidenceText }).expect(201);
            expect(chat.mock.calls[0][0].user).not.toContain('[U1]');
            expect(chat.mock.calls[0][0].user).toMatch(/onaylı kaynak birimi bulunamadı/);
        } finally {
            await prisma.sourceVersion.update({ where: { id: versionId }, data: { approvalStatus: 'APPROVED' } });
        }
    });
});
