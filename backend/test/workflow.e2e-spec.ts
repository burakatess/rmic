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
    let managerToken: string;
    let managerUserId: string;
    let auditorToken: string;
    let auditorUserId: string;

    async function loginAs(email: string): Promise<string> {
        const res = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email, password: E2E_TEST_PASSWORD })
            .expect(200);
        return res.body.accessToken;
    }

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);

        await resetDatabase(prisma);
        roleIds = await seedRoles(prisma);

        const adminUser = await createTestUser(prisma, roleIds['SYSTEM_ADMIN'], { email: 'admin@e2e.local' });
        adminUserId = adminUser.id;
        const viewerUser = await createTestUser(prisma, roleIds['VIEWER'], { email: 'viewer@e2e.local' });
        const managerUser = await createTestUser(prisma, roleIds['RISK_CONTROL_MANAGER'], { email: 'manager@e2e.local' });
        managerUserId = managerUser.id;
        const auditorUser = await createTestUser(prisma, roleIds['AUDITOR'], { email: 'auditor@e2e.local' });
        auditorUserId = auditorUser.id;

        adminToken = await loginAs('admin@e2e.local');
        viewerToken = await loginAs('viewer@e2e.local');
        managerToken = await loginAs('manager@e2e.local');
        auditorToken = await loginAs('auditor@e2e.local');
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Paylaşılan yardımcılar (aşağıdaki tüm describe blokları kullanabilir) ──

    async function setupFinding(overrides: Record<string, any> = {}) {
        const directorate = await createTestDirectorate(prisma);
        const control = await createTestControl(prisma, { ownerId: adminUserId, directorateId: directorate.id });
        const controlTest = await createTestControlTest(prisma, { controlId: control.id, assigneeId: adminUserId });

        const findingRes = await request(app.getHttpServer())
            .post('/findings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                findingType: 'BT',
                description: 'Yardımcı fonksiyon ile oluşturulan yeterli uzunlukta bulgu açıklaması',
                summary: 'Yardımcı fonksiyon bulgusu',
                relatedDepartment: 'BT Ağ Yönetimi',
                status: 'IN_PROGRESS',
                severity: 'MEDIUM',
                controlTestId: controlTest.id,
                ...overrides,
            })
            .expect(201);
        return { findingId: findingRes.body.id, controlId: control.id, controlTestId: controlTest.id };
    }

    async function addAction(findingId: string, overrides: Record<string, any> = {}) {
        const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const res = await request(app.getHttpServer())
            .post(`/findings/${findingId}/actions`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                description: 'Yardımcı fonksiyon ile oluşturulan yeterli uzunlukta aksiyon açıklaması',
                ownerId: adminUserId,
                dueDate,
                ...overrides,
            })
            .expect(201);
        return res.body;
    }

    async function getFollowUpForAction(findingId: string, actionId: string) {
        const res = await request(app.getHttpServer())
            .get(`/findings/${findingId}/follow-ups`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        return res.body.find((f: any) => f.actionId === actionId);
    }

    async function getFinding(findingId: string) {
        const res = await request(app.getHttpServer())
            .get(`/findings/${findingId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        return res.body;
    }

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

        it('İş kuralı (güncellendi): YENI_AKSIYON_GEREKLI + newAction verisi olmadan → 400, placeholder Action ÜRETİLMEZ', async () => {
            // Not: Bu test önceden "fallback placeholder Action otomatik oluşur" davranışını
            // doğruluyordu. İş kuralı netleştirildi: YENI_AKSIYON_GEREKLI seçildiğinde
            // newAction.description/ownerId/dueDate zorunludur, sistem placeholder üretmez.
            const { findingId: fId, actionId: originalActionId, followUpId: fuId } = await setupFindingWithAction();

            await request(app.getHttpServer())
                .put(`/findings/${fId}/follow-ups/${fuId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    currentStatusDetail: 'Ek düzeltici aksiyon gerekiyor.',
                    result: 'YENI_AKSIYON_GEREKLI',
                    resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                })
                .expect(400);

            // Hiçbir yeni Action oluşmamış olmalı (yalnızca orijinal aksiyon var)
            const actions = await request(app.getHttpServer())
                .get(`/findings/${fId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(actions.body.length).toBe(1);
            expect(actions.body[0].id).toBe(originalActionId);
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

    describe('Kontrol Testi — Bulgu Zorunluluğu Senaryoları', () => {
        it('BULGUSU_YOK: test TAMAMLANDI olur, bulgu oluşmaz (bulgu zorunluluğu yalnız BULGUSU_VAR için geçerli)', async () => {
            const directorate = await createTestDirectorate(prisma);
            const control = await createTestControl(prisma, { ownerId: adminUserId, directorateId: directorate.id });
            const controlTest = await createTestControlTest(prisma, { controlId: control.id, assigneeId: adminUserId });

            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTest.id}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTest.id}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_YOK', resultText: 'Sapma tespit edilmedi.' })
                .expect(200);

            expect(res.body.status).toBe('TAMAMLANDI');
            expect(res.body.findingStatus).toBe('BULGUSU_YOK');

            const findingCount = await prisma.finding.count({ where: { controlTestId: controlTest.id } });
            expect(findingCount).toBe(0);
        });

        it('BULGUSU_VAR ama bağlı bulgu kaydı yok → 400 (bağımsız fixture ile izole doğrulama)', async () => {
            const directorate = await createTestDirectorate(prisma);
            const control = await createTestControl(prisma, { ownerId: adminUserId, directorateId: directorate.id });
            const controlTest = await createTestControlTest(prisma, { controlId: control.id, assigneeId: adminUserId });

            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTest.id}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTest.id}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_VAR' });

            expect(res.status).toBe(400);

            // Test hâlâ tamamlanmamış olmalı (reddedilen işlem yan etki bırakmamalı)
            const test = await prisma.controlTest.findUnique({ where: { id: controlTest.id } });
            expect(test?.status).toBe('DEVAM_EDIYOR');
        });
    });

    describe('Bulgu Kapatma Senaryoları', () => {
        it('Tek aksiyonlu bulgu: FollowUp YETERLI/KAPATILDI → Action KAPATILDI, Finding CLOSED/KAPATILDI, closedDate dolu, history/audit oluşur', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);
            expect(followUp).toBeDefined();

            const res = await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    currentStatusDetail: 'Düzeltme uygulandı ve doğrulandı.',
                    result: 'YETERLI',
                    resolutionOutcome: 'KAPATILDI',
                })
                .expect(200);
            expect(res.body.result).toBe('YETERLI');

            const finding = await getFinding(findingId);
            expect(finding.status).toBe('CLOSED');
            expect(finding.resolutionStatus).toBe('KAPATILDI');
            expect(finding.closedDate).not.toBeNull();

            const updatedAction = finding.actions.find((a: any) => a.id === action.id);
            expect(updatedAction.status).toBe('KAPATILDI');

            const history = await prisma.findingStatusHistory.findMany({ where: { findingId } });
            expect(history.some(h => h.operation === 'ACTION_CLOSED')).toBe(true);
            expect(history.some(h => h.operation === 'FOLLOWUP_COMPLETED')).toBe(true);

            const auditLogs = await prisma.auditLog.findMany({ where: { entityType: 'Finding', entityId: findingId } });
            expect(auditLogs.length).toBeGreaterThan(0);
        });

        it('BUG DÜZELTMESİ: Tüm aksiyonlar kapanmadan bulgu kapanmasın — 2 aksiyonlu bulguda yalnız 1. kapanınca Finding CLOSED olmamalı', async () => {
            const { findingId } = await setupFinding();
            const action1 = await addAction(findingId, { description: 'Birinci aksiyon — yeterli uzunlukta açıklama metni' });
            const action2 = await addAction(findingId, { description: 'İkinci aksiyon — yeterli uzunlukta açıklama metni' });

            const followUp1 = await getFollowUpForAction(findingId, action1.id);
            expect(followUp1).toBeDefined();

            // Yalnız 1. aksiyonun takibini YETERLI/KAPATILDI ile kapat
            await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp1.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    currentStatusDetail: 'Birinci aksiyon tamamlandı.',
                    result: 'YETERLI',
                    resolutionOutcome: 'KAPATILDI',
                })
                .expect(200);

            let finding = await getFinding(findingId);
            const act1After = finding.actions.find((a: any) => a.id === action1.id);
            const act2After = finding.actions.find((a: any) => a.id === action2.id);
            expect(act1After.status).toBe('KAPATILDI');
            expect(act2After.status).not.toBe('KAPATILDI');
            // Kritik doğrulama: 2. aksiyon hâlâ açıkken bulgu CLOSED olmamalı
            expect(finding.status).not.toBe('CLOSED');
            expect(finding.closedDate).toBeNull();

            // 2. aksiyonun takibini de kapat
            const followUp2 = await getFollowUpForAction(findingId, action2.id);
            await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp2.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    currentStatusDetail: 'İkinci aksiyon da tamamlandı.',
                    result: 'YETERLI',
                    resolutionOutcome: 'KAPATILDI',
                })
                .expect(200);

            // Şimdi TÜM aksiyonlar kapandığı için bulgu kapanabilmeli
            finding = await getFinding(findingId);
            expect(finding.status).toBe('CLOSED');
            expect(finding.closedDate).not.toBeNull();
        });

        it('Kısmen kapatıldı: 2 aksiyondan biri yeterli, FollowUp resolutionOutcome=KISMEN_KAPATILDI → Finding PARTIALLY_CLOSED, tam kapanmaz, açık aksiyon korunur', async () => {
            const { findingId } = await setupFinding();
            const action1 = await addAction(findingId, { description: 'Kısmen senaryo — birinci aksiyon açıklaması' });
            const action2 = await addAction(findingId, { description: 'Kısmen senaryo — ikinci aksiyon açıklaması' });

            const followUp1 = await getFollowUpForAction(findingId, action1.id);

            await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp1.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    currentStatusDetail: 'Bir aksiyon tamamlandı, diğeri devam ediyor.',
                    result: 'YETERLI',
                    resolutionOutcome: 'KISMEN_KAPATILDI',
                })
                .expect(200);

            const finding = await getFinding(findingId);
            expect(finding.status).toBe('PARTIALLY_CLOSED');
            expect(finding.resolutionStatus).toBe('KISMEN_KAPATILDI');
            expect(finding.status).not.toBe('CLOSED');

            const act2After = finding.actions.find((a: any) => a.id === action2.id);
            expect(act2After.status).not.toBe('KAPATILDI');

            // Not (raporlama davranışı): reports.service.ts "openFindings" sayısı
            // status !== 'CLOSED' koşuluyla hesaplanıyor — PARTIALLY_CLOSED bu koşulu
            // sağladığından dashboard'da hâlâ "açık bulgu" olarak sayılıyor. Beklenen budur.
        });
    });

    describe('Ertelendi Senaryosu', () => {
        it('resolutionOutcome=ERTELENDI + newFollowUpDate var → Finding testDate güncellenir, bulgu kapanmaz, status log eklenir', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);

            const newDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const logsBefore = await request(app.getHttpServer())
                .get(`/findings/${findingId}/status-logs`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    currentStatusDetail: 'Test tarihi ertelendi, ek süre gerekiyor.',
                    resolutionOutcome: 'ERTELENDI',
                    newFollowUpDate: newDate,
                })
                .expect(200);

            const finding = await getFinding(findingId);
            expect(finding.status).not.toBe('CLOSED');
            expect(finding.resolutionStatus).toBe('ERTELENDI');
            expect(new Date(finding.testDate).toISOString().split('T')[0]).toBe(newDate);

            const logsAfter = await request(app.getHttpServer())
                .get(`/findings/${findingId}/status-logs`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(logsAfter.body.length).toBe(logsBefore.body.length + 1);
        });

        it('BUG DÜZELTMESİ: resolutionOutcome=ERTELENDI + newFollowUpDate YOK → 400', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);

            const res = await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    currentStatusDetail: 'Ertelenmek isteniyor ama tarih unutuldu.',
                    resolutionOutcome: 'ERTELENDI',
                });

            expect(res.status).toBe(400);

            // Reddedilen istek yan etki bırakmamalı: bulgu hâlâ eski resolutionStatus'ta
            const finding = await getFinding(findingId);
            expect(finding.resolutionStatus).not.toBe('ERTELENDI');
        });
    });

    describe('Devam Ediyor Senaryosu', () => {
        it('resolutionOutcome=DEVAM_EDIYOR: Action kapanmaz, Finding kapanmaz, status log append-only eklenir', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);

            const logsBefore = await request(app.getHttpServer())
                .get(`/findings/${findingId}/status-logs`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'DEVAM_EDIYOR',
                    currentStatusDetail: 'Düzeltme çalışması hâlâ sürüyor.',
                    resolutionOutcome: 'DEVAM_EDIYOR',
                })
                .expect(200);

            const finding = await getFinding(findingId);
            expect(finding.status).not.toBe('CLOSED');
            expect(finding.resolutionStatus).toBe('DEVAM_EDIYOR');
            const actionAfter = finding.actions.find((a: any) => a.id === action.id);
            expect(actionAfter.status).not.toBe('KAPATILDI');

            const logsAfterFirst = await request(app.getHttpServer())
                .get(`/findings/${findingId}/status-logs`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(logsAfterFirst.body.length).toBe(logsBefore.body.length + 1);

            // İkinci bir "devam ediyor" güncellemesi eskiyi silmemeli, üstüne eklemeli
            await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'DEVAM_EDIYOR',
                    currentStatusDetail: 'İkinci güncelleme: hâlâ devam ediyor.',
                    resolutionOutcome: 'DEVAM_EDIYOR',
                })
                .expect(200);

            const logsAfterSecond = await request(app.getHttpServer())
                .get(`/findings/${findingId}/status-logs`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(logsAfterSecond.body.length).toBe(logsBefore.body.length + 2);
            // İlk log kaybolmamış olmalı (append-only)
            const firstLogText = logsAfterFirst.body[0].text;
            expect(logsAfterSecond.body.some((l: any) => l.text === firstLogText)).toBe(true);
        });
    });

    describe('Yeni Aksiyon Gerekli — Zorunlu Alanlar', () => {
        it('newAction eksiksiz gönderilirse: yeni Action tam olarak verilen bilgilerle oluşur + otomatik FollowUp kurulur; orijinal Action durumu değişmez', async () => {
            const { findingId } = await setupFinding();
            const originalAction = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, originalAction.id);
            const otherUser = await createTestUser(prisma, roleIds['SYSTEM_ADMIN'], { email: `owner-${Date.now()}@e2e.local` });
            const dueDate = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    currentStatusDetail: 'Ek düzeltici aksiyon gerekiyor.',
                    result: 'YENI_AKSIYON_GEREKLI',
                    resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                    newAction: {
                        description: 'Zorunlu alan testi — gerçek kullanıcı girdisi açıklama',
                        ownerId: otherUser.id,
                        dueDate,
                        responsibleDepartment: 'BT Operasyon',
                        notes: 'Test notu',
                    },
                })
                .expect(200);

            const finding = await getFinding(findingId);
            const newAction = finding.actions.find((a: any) => a.id !== originalAction.id);
            expect(newAction).toBeDefined();
            expect(newAction.description).toBe('Zorunlu alan testi — gerçek kullanıcı girdisi açıklama');
            expect(newAction.ownerId).toBe(otherUser.id);
            expect(new Date(newAction.dueDate).toISOString().split('T')[0]).toBe(dueDate);
            expect(newAction.status).toBe('BEKLIYOR');

            // Not (ürün kuralı doğrulaması): orijinal aksiyonun durumu YENI_AKSIYON_GEREKLI
            // dalında DOKUNULMUYOR — yalnızca yeni bir Action ekleniyor, eskisi ne ise öyle kalıyor.
            const originalAfter = finding.actions.find((a: any) => a.id === originalAction.id);
            expect(originalAfter.status).toBe(originalAction.status);

            // Yeni aksiyon için otomatik FollowUp oluşmuş olmalı
            const newFollowUp = await getFollowUpForAction(findingId, newAction.id);
            expect(newFollowUp).toBeDefined();
        });

        it('newAction hiç gönderilmezse → 400 (BULGU zaten yukarıda test edildi — burada ayrıca DTO/servis seviyesinde doğrulanıyor)', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);

            const res = await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'ONAYLANDI', result: 'YENI_AKSIYON_GEREKLI' });

            expect(res.status).toBe(400);
        });

        it('newAction.description eksikse → 400', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);
            const dueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const res = await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    result: 'YENI_AKSIYON_GEREKLI',
                    newAction: { ownerId: adminUserId, dueDate },
                });

            expect(res.status).toBe(400);
        });

        it('newAction.ownerId eksikse → 400', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);
            const dueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const res = await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    result: 'YENI_AKSIYON_GEREKLI',
                    newAction: { description: 'Sorumlusu eksik aksiyon açıklaması', dueDate },
                });

            expect(res.status).toBe(400);
        });

        it('newAction.dueDate eksikse → 400', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);

            const res = await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ONAYLANDI',
                    result: 'YENI_AKSIYON_GEREKLI',
                    newAction: { description: 'Tarihi eksik aksiyon açıklaması', ownerId: adminUserId },
                });

            expect(res.status).toBe(400);
        });
    });

    describe('Yanlış Workflow Sırası', () => {
        it('TASLAK bulgu doğrudan mutabakat-onayla yapılamaz → 400', async () => {
            const { findingId } = await setupFinding();

            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/mutabakat-onayla`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(res.status).toBe(400);
        });

        it('TASLAK bulgu, mutabakata-gonder atlanarak doğrudan ic-kontrol-onayina-gonder yapılamaz → 400', async () => {
            const { findingId } = await setupFinding();

            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/ic-kontrol-onayina-gonder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ birimCevabi: 'Sıra dışı deneme.' });

            expect(res.status).toBe(400);
        });

        it('MUTABAKAT_YAPILDI sonrası tekrar mutabakat-onayla → 400', async () => {
            const { findingId } = await setupFinding();
            await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/mutabakata-gonder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(201);
            await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/ic-kontrol-onayina-gonder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ birimCevabi: 'Yanıt.' })
                .expect(201);
            await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/mutabakat-onayla`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({})
                .expect(201);

            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/mutabakat-onayla`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(res.status).toBe(400);
        });

        it('MUTABAKAT_YAPILDI sonrası mutabakat-geri-gonder yapılamaz → 400', async () => {
            const { findingId } = await setupFinding();
            await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/mutabakata-gonder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(201);
            await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/ic-kontrol-onayina-gonder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ birimCevabi: 'Yanıt.' })
                .expect(201);
            await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/mutabakat-onayla`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({})
                .expect(201);

            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/mutabakat-geri-gonder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'Sıra dışı deneme.' });

            expect(res.status).toBe(400);
        });
    });

    describe('Yetki Matrisi (RBAC)', () => {
        it('POST /findings — SYSTEM_ADMIN/RISK_CONTROL_MANAGER/AUDITOR 201, VIEWER 403', async () => {
            const payload = {
                findingType: 'BT',
                description: 'RBAC matrisi testi için yeterli uzunlukta bulgu açıklaması',
                relatedDepartment: 'BT Ağ Yönetimi',
                severity: 'MEDIUM',
            };
            for (const token of [adminToken, managerToken, auditorToken]) {
                await request(app.getHttpServer())
                    .post('/findings')
                    .set('Authorization', `Bearer ${token}`)
                    .send(payload)
                    .expect(201);
            }
            await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${viewerToken}`)
                .send(payload)
                .expect(403);
        });

        it('POST /findings/:id/actions — SYSTEM_ADMIN/RISK_CONTROL_MANAGER/AUDITOR 201, VIEWER 403', async () => {
            const { findingId } = await setupFinding();
            const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const payload = { description: 'RBAC matrisi aksiyon testi açıklaması', ownerId: adminUserId, dueDate };

            for (const token of [adminToken, managerToken, auditorToken]) {
                await request(app.getHttpServer())
                    .post(`/findings/${findingId}/actions`)
                    .set('Authorization', `Bearer ${token}`)
                    .send(payload)
                    .expect(201);
            }
            await request(app.getHttpServer())
                .post(`/findings/${findingId}/actions`)
                .set('Authorization', `Bearer ${viewerToken}`)
                .send(payload)
                .expect(403);
        });

        it('PUT /findings/:id/follow-ups/:followUpId — SYSTEM_ADMIN/RISK_CONTROL_MANAGER/AUDITOR 200, VIEWER 403', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);

            await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${viewerToken}`)
                .send({ currentStatusDetail: 'Yetkisiz deneme.' })
                .expect(403);

            for (const token of [managerToken, auditorToken, adminToken]) {
                await request(app.getHttpServer())
                    .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({ currentStatusDetail: `Yetkili güncelleme (${token.slice(0, 6)})` })
                    .expect(200);
            }
        });

        it('Workflow geçişleri: mutabakata-gonder SYSTEM_ADMIN/RISK_CONTROL_MANAGER/AUDITOR yapabilir, VIEWER yapamaz', async () => {
            for (const token of [adminToken, managerToken, auditorToken]) {
                const { findingId } = await setupFinding();
                await request(app.getHttpServer())
                    .post(`/findings/${findingId}/workflow/mutabakata-gonder`)
                    .set('Authorization', `Bearer ${token}`)
                    .expect(201);
            }
            const { findingId: fIdViewer } = await setupFinding();
            await request(app.getHttpServer())
                .post(`/findings/${fIdViewer}/workflow/mutabakata-gonder`)
                .set('Authorization', `Bearer ${viewerToken}`)
                .expect(403);
        });

        it('mutabakat-onayla: SYSTEM_ADMIN/RISK_CONTROL_MANAGER yapabilir, AUDITOR ve VIEWER yapamaz (403)', async () => {
            async function advanceToIcKontrolOnayi() {
                const { findingId } = await setupFinding();
                await request(app.getHttpServer())
                    .post(`/findings/${findingId}/workflow/mutabakata-gonder`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(201);
                await request(app.getHttpServer())
                    .post(`/findings/${findingId}/workflow/ic-kontrol-onayina-gonder`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ birimCevabi: 'Yanıt.' })
                    .expect(201);
                return findingId;
            }

            const fId1 = await advanceToIcKontrolOnayi();
            await request(app.getHttpServer())
                .post(`/findings/${fId1}/workflow/mutabakat-onayla`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({})
                .expect(201);

            const fId2 = await advanceToIcKontrolOnayi();
            await request(app.getHttpServer())
                .post(`/findings/${fId2}/workflow/mutabakat-onayla`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({})
                .expect(201);

            const fId3 = await advanceToIcKontrolOnayi();
            await request(app.getHttpServer())
                .post(`/findings/${fId3}/workflow/mutabakat-onayla`)
                .set('Authorization', `Bearer ${auditorToken}`)
                .send({})
                .expect(403);

            const fId4 = await advanceToIcKontrolOnayi();
            await request(app.getHttpServer())
                .post(`/findings/${fId4}/workflow/mutabakat-onayla`)
                .set('Authorization', `Bearer ${viewerToken}`)
                .send({})
                .expect(403);
        });

        it('DELETE /findings/:id/actions/:actionId — SYSTEM_ADMIN/RISK_CONTROL_MANAGER/AUDITOR yapabilir, VIEWER 403', async () => {
            const { findingId: fIdViewer } = await setupFinding();
            const actionViewer = await addAction(fIdViewer);
            await request(app.getHttpServer())
                .delete(`/findings/${fIdViewer}/actions/${actionViewer.id}`)
                .set('Authorization', `Bearer ${viewerToken}`)
                .expect(403);

            for (const token of [adminToken, managerToken, auditorToken]) {
                const { findingId } = await setupFinding();
                const action = await addAction(findingId);
                await request(app.getHttpServer())
                    .delete(`/findings/${findingId}/actions/${action.id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .expect(200);
            }
        });
    });

    describe('Validation / FK Senaryoları', () => {
        it('olmayan ownerId ile aksiyon oluşturma → 400', async () => {
            const { findingId } = await setupFinding();
            const dueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Olmayan sorumlu ile aksiyon deneme açıklaması', ownerId: 'nonexistent-user-id', dueDate });
            expect(res.status).toBe(400);
        });

        it('olmayan controlTestId ile bulgu oluşturma → 400', async () => {
            const res = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT',
                    description: 'Olmayan controlTestId ile deneme açıklaması metni',
                    relatedDepartment: 'BT Ağ Yönetimi',
                    severity: 'LOW',
                    controlTestId: 'nonexistent-control-test-id',
                });
            expect(res.status).toBe(400);
        });

        it('olmayan directorateId ile kontrol oluşturma → 400', async () => {
            const res = await request(app.getHttpServer())
                .post('/controls')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'RBAC/FK testi için kontrol',
                    type: 'BT',
                    nature: 'PREVENTIVE',
                    automation: 'MANUAL',
                    frequency: 'MONTHLY',
                    ownerId: adminUserId,
                    directorateId: 'nonexistent-directorate-id',
                });
            expect(res.status).toBe(400);
        });

        it('geçersiz enum (findingType) ile bulgu oluşturma → 400', async () => {
            const res = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'GECERSIZ_TUR',
                    description: 'Geçersiz findingType enum testi açıklaması',
                    relatedDepartment: 'BT Ağ Yönetimi',
                    severity: 'LOW',
                });
            expect(res.status).toBe(400);
        });

        it('bilinmeyen ekstra alan ile aksiyon oluşturma (forbidNonWhitelisted) → 400', async () => {
            const { findingId } = await setupFinding();
            const dueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Bilinmeyen alan testi açıklaması', ownerId: adminUserId, dueDate, sneakyField: 'x' });
            expect(res.status).toBe(400);
        });

        it('eksik zorunlu alan (description) ile aksiyon oluşturma → 400', async () => {
            const { findingId } = await setupFinding();
            const dueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ ownerId: adminUserId, dueDate });
            expect(res.status).toBe(400);
        });

        it('geçersiz tarih formatı (dueDate) ile aksiyon oluşturma → 400', async () => {
            const { findingId } = await setupFinding();
            const res = await request(app.getHttpServer())
                .post(`/findings/${findingId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Geçersiz tarih formatı testi açıklaması', ownerId: adminUserId, dueDate: 'yarin-aksam' });
            expect(res.status).toBe(400);
        });
    });

    describe('Audit / History Doğrulaması', () => {
        it('Action create/update işlemleri AuditLog kaydı bırakır', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);

            const createLogs = await prisma.auditLog.findMany({ where: { entityType: 'Action', entityId: action.id, action: 'CREATE' } });
            expect(createLogs.length).toBeGreaterThan(0);

            await request(app.getHttpServer())
                .put(`/findings/${findingId}/actions/${action.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ notes: 'Güncellenmiş not' })
                .expect(200);

            const updateLogs = await prisma.auditLog.findMany({ where: { entityType: 'Action', entityId: action.id, action: 'UPDATE' } });
            expect(updateLogs.length).toBeGreaterThan(0);
        });

        it('FollowUp update işlemi AuditLog kaydı bırakır', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);

            await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ currentStatusDetail: 'Audit log doğrulama güncellemesi' })
                .expect(200);

            const logs = await prisma.auditLog.findMany({ where: { entityType: 'FindingFollowUp', entityId: followUp.id, action: 'UPDATE' } });
            expect(logs.length).toBeGreaterThan(0);
        });

        it('Workflow geçişleri FindingStatusHistory kaydı bırakır ve eski kayıtlar silinmez (append-only)', async () => {
            const { findingId } = await setupFinding();

            const beforeCount = await prisma.findingStatusHistory.count({ where: { findingId } });

            await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/mutabakata-gonder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(201);

            const afterFirst = await prisma.findingStatusHistory.count({ where: { findingId } });
            expect(afterFirst).toBeGreaterThan(beforeCount);

            await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/ic-kontrol-onayina-gonder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ birimCevabi: 'Yanıt.' })
                .expect(201);

            const afterSecond = await prisma.findingStatusHistory.count({ where: { findingId } });
            expect(afterSecond).toBeGreaterThan(afterFirst);

            // İlk geçişe ait kayıt hâlâ tabloda olmalı (append-only, silinmez)
            const history = await prisma.findingStatusHistory.findMany({ where: { findingId }, orderBy: { createdAt: 'asc' } });
            expect(history[0].workflowStatus).toBe('MUTABAKATA_GONDERILDI');
            expect(history.length).toBe(afterSecond);
        });
    });
});
