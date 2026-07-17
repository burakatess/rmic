import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import {
    resetDatabase, seedRoles, createTestUser, createTestDirectorate,
    createTestControl, createTestControlTest, E2E_TEST_PASSWORD,
} from './helpers/fixtures';

describe('E2E — Bulgu/Aksiyon/Takip Workflow Zinciri', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let roleIds: Record<string, string>;

    // Ana akış boyunca kullanılan ortak fixture'lar
    let adminToken: string;
    let adminUserId: string;
    let viewerToken: string;

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);

        await resetDatabase(prisma);
        roleIds = await seedRoles(prisma);

        const adminUser = await createTestUser(prisma, roleIds['SYSTEM_ADMIN'], { email: 'admin@e2e.local' });
        adminUserId = adminUser.id;
        const viewerUser = await createTestUser(prisma, roleIds['VIEWER'], { email: 'viewer@e2e.local' });

        const loginAdmin = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: 'admin@e2e.local', password: E2E_TEST_PASSWORD })
            .expect(200);
        adminToken = loginAdmin.body.accessToken;

        const loginViewer = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: 'viewer@e2e.local', password: E2E_TEST_PASSWORD })
            .expect(200);
        viewerToken = loginViewer.body.accessToken;
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Ana Workflow Zinciri (Test → Bulgu → Mutabakat → Aksiyon → Takip)', () => {
        let controlId: string;
        let controlTestId: string;
        let findingId: string;
        let actionId: string;
        let followUpId: string;

        it('1. Kontrol testi tamamlanır ve findingStatus = BULGUSU_VAR olur (önce bulgu şart)', async () => {
            const directorate = await createTestDirectorate(prisma);
            const control = await createTestControl(prisma, { ownerId: adminUserId, directorateId: directorate.id });
            controlId = control.id;
            const controlTest = await createTestControlTest(prisma, { controlId: control.id, assigneeId: adminUserId });
            controlTestId = controlTest.id;

            // Testi başlat
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            // Bulgu olmadan BULGUSU_VAR ile tamamlamayı dene → iş kuralı reddetmeli
            const rejected = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_VAR' });
            expect(rejected.status).toBe(400);
        });

        it('2. Bulgu oluşturulur (controlTestId ile bağlı)', async () => {
            const res = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT',
                    description: 'E2E workflow testi için oluşturulan yeterli uzunlukta bulgu açıklaması',
                    summary: 'E2E workflow bulgusu',
                    relatedDepartment: 'BT Ağ Yönetimi',
                    status: 'IN_PROGRESS',
                    severity: 'HIGH',
                    controlTestId,
                    impact: 'E2E test etkisi',
                })
                .expect(201);

            expect(res.body.workflowStatus).toBe('TASLAK');
            findingId = res.body.id;
        });

        it('3. Kontrol testi artık BULGUSU_VAR ile tamamlanabilir (bulgu bağlandığı için)', async () => {
            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_VAR', resultText: 'E2E test sonucu' })
                .expect(200);

            expect(res.body.findingStatus).toBe('BULGUSU_VAR');
            expect(res.body.status).toBe('TAMAMLANDI');
        });

        it('4. Bulgu mutabakata gönderilir: TASLAK → MUTABAKATA_GONDERILDI', async () => {
            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/mutabakata-gonder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(201);
            expect(res.body.workflowStatus).toBe('MUTABAKATA_GONDERILDI');
        });

        it('5. İç kontrol onayına gönderilir: MUTABAKATA_GONDERILDI → IC_KONTROL_ONAYINA_GONDERILDI', async () => {
            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/ic-kontrol-onayina-gonder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ birimCevabi: 'Birim yanıtı: sorun tespit edildi, düzeltme planlanıyor.' })
                .expect(201);
            expect(res.body.workflowStatus).toBe('IC_KONTROL_ONAYINA_GONDERILDI');
        });

        it('6a. Mutabakat geri gönderilebilir: IC_KONTROL_ONAYINA_GONDERILDI → MUTABAKATA_GONDERILDI', async () => {
            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/mutabakat-geri-gonder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'Yetersiz birim yanıtı, ek bilgi gerekli.' })
                .expect(201);
            expect(res.body.workflowStatus).toBe('MUTABAKATA_GONDERILDI');

            // Zinciri devam ettirmek için tekrar ic-kontrol-onayina-gonder'e ilerlet
            await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/ic-kontrol-onayina-gonder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ birimCevabi: 'Ek bilgi ile güncellenmiş birim yanıtı.' })
                .expect(201);
        });

        it('6b. Mutabakat onaylanır: IC_KONTROL_ONAYINA_GONDERILDI → MUTABAKAT_YAPILDI', async () => {
            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/mutabakat-onayla`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ internalControlAssessment: 'İç kontrol değerlendirmesi: onaylandı.' })
                .expect(201);
            expect(res.body.workflowStatus).toBe('MUTABAKAT_YAPILDI');
        });

        it('7. Bulguya aksiyon eklenir', async () => {
            const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    description: 'E2E test aksiyonu — yeterli uzunlukta açıklama metni',
                    ownerId: adminUserId,
                    dueDate,
                })
                .expect(201);
            actionId = res.body.id;
            expect(res.body.status).toBe('BEKLIYOR');
        });

        it('8. Aksiyon için otomatik FindingFollowUp oluşur', async () => {
            const res = await request(app.getHttpServer())
                .get(`/findings/${findingId}/follow-ups`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(Array.isArray(res.body)).toBe(true);
            const linked = res.body.find((f: any) => f.actionId === actionId);
            expect(linked).toBeDefined();
            expect(linked.status).toBe('BEKLIYOR');
            followUpId = linked.id;
        });

        it('9. FollowUp sonucu YETERLI → bağlı Action KAPATILDI olur', async () => {
            const res = await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUpId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    currentStatusDetail: 'Düzeltme uygulandı ve doğrulandı.',
                    result: 'YETERLI',
                    resolutionOutcome: 'KAPATILDI',
                })
                .expect(200);
            expect(res.body.result).toBe('YETERLI');

            const action = await request(app.getHttpServer())
                .get(`/findings/${findingId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const updatedAction = action.body.find((a: any) => a.id === actionId);
            expect(updatedAction.status).toBe('KAPATILDI');
        });

        it('10. FindingStatusHistory: her workflow geçişi + aksiyon oluşturma kayıt bırakmış olmalı', async () => {
            const history = await prisma.findingStatusHistory.findMany({ where: { findingId } });
            const changeTypes = history.map(h => h.changeType);

            expect(changeTypes.filter(c => c === 'WORKFLOW_CHANGE').length).toBeGreaterThanOrEqual(5); // mutabakata-gonder, ic-kontrol x2, geri-gonder, onayla
            expect(changeTypes).toContain('ACTION_CREATED');
            expect(history.length).toBeGreaterThan(5);
        });
    });

    describe('FollowUp Sonuç Senaryoları (bağımsız fixture seti)', () => {
        async function setupFindingWithAction() {
            const directorate = await createTestDirectorate(prisma);
            const control = await createTestControl(prisma, { ownerId: adminUserId, directorateId: directorate.id });
            const controlTest = await createTestControlTest(prisma, { controlId: control.id, assigneeId: adminUserId });

            const findingRes = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT',
                    description: 'Bağımsız senaryo için yeterli uzunlukta bulgu açıklaması metni',
                    summary: 'Bağımsız senaryo bulgusu',
                    relatedDepartment: 'BT Ağ Yönetimi',
                    status: 'IN_PROGRESS',
                    severity: 'MEDIUM',
                    controlTestId: controlTest.id,
                })
                .expect(201);
            const fId = findingRes.body.id;

            const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const actionRes = await request(app.getHttpServer())
                .post(`/findings/${fId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Bağımsız senaryo aksiyonu — yeterli uzunlukta açıklama', ownerId: adminUserId, dueDate })
                .expect(201);
            const aId = actionRes.body.id;

            const followUps = await request(app.getHttpServer())
                .get(`/findings/${fId}/follow-ups`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const fu = followUps.body.find((f: any) => f.actionId === aId);

            return { findingId: fId, actionId: aId, followUpId: fu.id };
        }

        it('FollowUp sonucu YETERSIZ → bağlı Action YETERSIZ olur', async () => {
            const { findingId: fId, actionId: aId, followUpId: fuId } = await setupFindingWithAction();

            await request(app.getHttpServer())
                .put(`/findings/${fId}/follow-ups/${fuId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    currentStatusDetail: 'Düzeltme yetersiz bulundu.',
                    result: 'YETERSIZ',
                })
                .expect(200);

            const action = await request(app.getHttpServer())
                .get(`/findings/${fId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(action.body.find((a: any) => a.id === aId).status).toBe('YETERSIZ');
        });

        it('FollowUp sonucu YENI_AKSIYON_GEREKLI + newAction verisi olmadan → fallback placeholder Action otomatik oluşur', async () => {
            const { findingId: fId, actionId: originalActionId, followUpId: fuId } = await setupFindingWithAction();

            const res = await request(app.getHttpServer())
                .put(`/findings/${fId}/follow-ups/${fuId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    currentStatusDetail: 'Ek düzeltici aksiyon gerekiyor.',
                    result: 'YENI_AKSIYON_GEREKLI',
                    resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                })
                .expect(200);

            expect(res.body.newActionRequired).toBe(true);

            const actions = await request(app.getHttpServer())
                .get(`/findings/${fId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            // 1 orijinal aksiyon + 1 otomatik oluşan yeni aksiyon
            expect(actions.body.length).toBe(2);
            const autoAction = actions.body.find((a: any) => a.id !== originalActionId);
            expect(autoAction).toBeTruthy();
            expect(autoAction.status).toBe('BEKLIYOR');

            // Yeni aksiyon için de otomatik FollowUp oluşmuş olmalı (createAction reuse edildiği için)
            const followUps = await request(app.getHttpServer())
                .get(`/findings/${fId}/follow-ups`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const newFollowUp = followUps.body.find((f: any) => f.actionId === autoAction.id);
            expect(newFollowUp).toBeDefined();
        });

        it('FollowUp sonucu YENI_AKSIYON_GEREKLI + newAction verisiyle → gerçek kullanıcı girdisiyle Action oluşur', async () => {
            const { findingId: fId, followUpId: fuId } = await setupFindingWithAction();
            const otherUser = await createTestUser(prisma, roleIds['SYSTEM_ADMIN'], { email: `owner-${Date.now()}@e2e.local` });
            const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            await request(app.getHttpServer())
                .put(`/findings/${fId}/follow-ups/${fuId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    currentStatusDetail: 'Ek düzeltici aksiyon gerekiyor.',
                    result: 'YENI_AKSIYON_GEREKLI',
                    resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                    newAction: {
                        description: 'Kullanıcının girdiği gerçek yeni aksiyon açıklaması metni',
                        ownerId: otherUser.id,
                        dueDate,
                        notes: 'Kullanıcı notu',
                    },
                })
                .expect(200);

            const actions = await request(app.getHttpServer())
                .get(`/findings/${fId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(actions.body.length).toBe(2);
            const newAction = actions.body.find((a: any) => a.description === 'Kullanıcının girdiği gerçek yeni aksiyon açıklaması metni');
            expect(newAction).toBeDefined();
            expect(newAction.ownerId).toBe(otherUser.id);
        });
    });

    describe('Yetkisiz Erişim ve Geçersiz Payload', () => {
        it('VIEWER rolü bulgu oluşturamaz → 403', async () => {
            await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${viewerToken}`)
                .send({ description: 'Yetkisiz deneme', severity: 'HIGH' })
                .expect(403);
        });

        it('Geçersiz DTO payload (enum dışı severity) → 400', async () => {
            await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT',
                    description: 'Geçersiz enum testi için yeterli uzunlukta açıklama',
                    relatedDepartment: 'BT Ağ Yönetimi',
                    severity: 'COK_YUKSEK_GECERSIZ',
                })
                .expect(400);
        });

        it('Bilinmeyen alan (forbidNonWhitelisted) → 400', async () => {
            await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT',
                    description: 'Bilinmeyen alan testi için yeterli uzunlukta açıklama metni',
                    relatedDepartment: 'BT Ağ Yönetimi',
                    severity: 'HIGH',
                    hackerField: 'malicious',
                })
                .expect(400);
        });

        it('Token olmadan istek → 401', async () => {
            await request(app.getHttpServer())
                .get('/findings')
                .expect(401);
        });
    });
});
