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
    // Yeni aksiyon tanımı için zorunlu "Sorumlu Birim".
    let e2eDirectorateId: string;

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
        e2eDirectorateId = (await createTestDirectorate(prisma, 'E2E Yeni Aksiyon Birimi')).id;

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
                severity: 'HIGH',
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

    // İki aktörlü takip onayı (Madde 3): admin değerlendirir + ikinci kontrolcü (manager)
    // atar; ardından manager onaylar. `status: 'ONAYLANDI'` yalnızca onay adımında,
    // manager tarafından gönderilir (kendi değerlendirmesini onaylayamaz kuralı).
    async function recordFollowUp(findingId: string, followUpId: string, payload: Record<string, any>) {
        const { status, secondControllerId, ...rest } = payload;
        void status; void secondControllerId;
        return request(app.getHttpServer())
            .put(`/findings/${findingId}/follow-ups/${followUpId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send(rest);
    }
    async function assignSecondController(findingId: string, followUpId: string, controllerId = managerUserId) {
        return request(app.getHttpServer())
            .post(`/findings/${findingId}/follow-ups/${followUpId}/second-controller`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ secondControllerId: controllerId, reason: 'e2e ikinci kontrolcü ataması' });
    }
    /** Maker (değerlendiren) takibi tamamlayıp onaya gönderir — ikinci kontrolcü atanmış olmalıdır. */
    async function submitFollowUp(findingId: string, followUpId: string, extra: Record<string, any> = {}) {
        return request(app.getHttpServer())
            .put(`/findings/${findingId}/follow-ups/${followUpId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'TAMAMLANDI', ...extra });
    }
    async function approveFollowUp(findingId: string, followUpId: string, extra: Record<string, any> = {}) {
        return request(app.getHttpServer())
            .put(`/findings/${findingId}/follow-ups/${followUpId}`)
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ status: 'ONAYLANDI', ...extra });
    }
    /** Gerçek kullanıcı akışı: değerlendir → ikinci kontrolcü ata → tamamla/onaya gönder →
     *  AYRI ikinci kontrolcüyle onayla. Statü DB'ye doğrudan yazılmaz. YENI_AKSIYON_GEREKLI'de
     *  yeni aksiyon taslağı değerlendirmede saklanır, aksiyon onayda oluşturulur. */
    async function recordAndApprove(findingId: string, followUpId: string, payload: Record<string, any>) {
        const { status, ...rest } = payload;
        void status;
        const r1 = await recordFollowUp(findingId, followUpId, rest);
        expect(r1.status).toBe(200);
        expect((await assignSecondController(findingId, followUpId)).status).toBe(201);
        const rs = await submitFollowUp(findingId, followUpId);
        expect(rs.status).toBe(200);
        const r2 = await approveFollowUp(findingId, followUpId);
        expect(r2.status).toBe(200);
        return r2;
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
                // Maker/checker: İç Kontrol onayına gönderen admin aynı kaydı
                // onaylayamaz; farklı yetkili aktör manager onaylar.
                .set('Authorization', `Bearer ${managerToken}`)
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
            await recordAndApprove(findingId, followUpId, {
                currentStatusDetail: 'Düzeltme uygulandı ve doğrulandı.',
                result: 'YETERLI',
            });

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
                    severity: 'HIGH',
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

            await recordAndApprove(fId, fuId, {
                currentStatusDetail: 'Düzeltme yetersiz bulundu.',
                result: 'YETERSIZ',
            });

            const action = await request(app.getHttpServer())
                .get(`/findings/${fId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(action.body.find((a: any) => a.id === aId).status).toBe('YETERSIZ');
        });

        it('YETERSIZ onayından sonra yeni takip döngüsü YETERLI sonuçla aksiyon ve bulguyu kapatır', async () => {
            const { findingId: fId, actionId: aId, followUpId: firstFollowUpId } = await setupFindingWithAction();
            await recordAndApprove(fId, firstFollowUpId, {
                currentStatusDetail: 'İlk doğrulamada düzeltme yetersiz.',
                result: 'YETERSIZ',
                resolutionOutcome: 'DEVAM_EDIYOR',
            });

            const nextDate = new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0];
            await request(app.getHttpServer()).put(`/findings/${fId}/actions/${aId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ dueDate: nextDate }).expect(200);
            const followUps = await request(app.getHttpServer()).get(`/findings/${fId}/follow-ups`)
                .set('Authorization', `Bearer ${adminToken}`).expect(200);
            const secondFollowUp = followUps.body.find((item: any) => item.actionId === aId && item.id !== firstFollowUpId);
            expect(secondFollowUp).toBeDefined();

            await recordAndApprove(fId, secondFollowUp.id, {
                currentStatusDetail: 'İkinci doğrulamada düzeltme yeterli.',
                result: 'YETERLI',
            });
            const finding = await getFinding(fId);
            expect(finding.status).toBe('CLOSED');
            expect(finding.actions.find((item: any) => item.id === aId).status).toBe('KAPATILDI');
        });

        it('ERTELENDI onayından sonra ertelenen tarihte yeni takip değerlendirilir ve bulgu kapanır', async () => {
            const { findingId: fId, actionId: aId, followUpId: firstFollowUpId } = await setupFindingWithAction();
            const deferredDate = new Date(Date.now() + 35 * 86400000).toISOString().split('T')[0];

            await recordAndApprove(fId, firstFollowUpId, {
                currentStatusDetail: 'İlk doğrulamada ek süre gerektiği için takip ertelendi.',
                result: 'YETERSIZ',
                resolutionOutcome: 'ERTELENDI',
                newFollowUpDate: deferredDate,
            });

            let finding = await getFinding(fId);
            expect(finding.status).not.toBe('CLOSED');
            expect(finding.resolutionStatus).toBe('ERTELENDI');
            expect(new Date(finding.testDate).toISOString().split('T')[0]).toBe(deferredDate);

            await request(app.getHttpServer()).put(`/findings/${fId}/actions/${aId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ dueDate: deferredDate }).expect(200);
            const followUps = await request(app.getHttpServer()).get(`/findings/${fId}/follow-ups`)
                .set('Authorization', `Bearer ${adminToken}`).expect(200);
            const nextFollowUp = followUps.body.find((item: any) => item.actionId === aId && item.id !== firstFollowUpId);
            expect(nextFollowUp).toBeDefined();
            expect(new Date(nextFollowUp.plannedDate).toISOString().split('T')[0]).toBe(deferredDate);

            await recordAndApprove(fId, nextFollowUp.id, {
                currentStatusDetail: 'Ertelenen tarihte düzeltmenin yeterli olduğu doğrulandı.',
                result: 'YETERLI',
            });

            finding = await getFinding(fId);
            expect(finding.status).toBe('CLOSED');
            expect(finding.actions.find((item: any) => item.id === aId).status).toBe('KAPATILDI');
        });

        it('YETERSIZ değerlendirme KAPATILDI bulgu sonucu ile kaydedilemez', async () => {
            const { findingId: fId, followUpId: fuId } = await setupFindingWithAction();

            const res = await recordFollowUp(fId, fuId, {
                currentStatusDetail: 'Kanıt yetersiz olmasına rağmen kapatma denemesi.',
                result: 'YETERSIZ',
                resolutionOutcome: 'KAPATILDI',
            });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('YETERSIZ');
        });

        it('YENI_AKSIYON_GEREKLI değerlendirme KAPATILDI bulgu sonucu ile kaydedilemez', async () => {
            const { findingId: fId, followUpId: fuId } = await setupFindingWithAction();
            const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const res = await recordFollowUp(fId, fuId, {
                currentStatusDetail: 'Yeni aksiyon gerekirken kapatma denemesi.',
                result: 'YENI_AKSIYON_GEREKLI',
                resolutionOutcome: 'KAPATILDI',
                newAction: { directorateId: e2eDirectorateId,
                    description: 'Çelişkili sonuç test aksiyonu açıklaması',
                    ownerId: adminUserId,
                    dueDate,
                },
            });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('YENI_AKSIYON_GEREKLI');
        });

        it('ikinci kontrolcü değerlendirmeyi gerekçeyle reddeder; düzeltme sonrası yeniden onaylanabilir', async () => {
            const { findingId: fId, actionId: aId, followUpId: fuId } = await setupFindingWithAction();

            expect((await recordFollowUp(fId, fuId, {
                currentStatusDetail: 'İlk değerlendirme yeniden çalışılmalı.',
                result: 'YETERSIZ',
                resolutionOutcome: 'DEVAM_EDIYOR',
            })).status).toBe(200);
            expect((await assignSecondController(fId, fuId)).status).toBe(201);
            expect((await submitFollowUp(fId, fuId)).status).toBe(200);

            const rejected = await request(app.getHttpServer())
                .put(`/findings/${fId}/follow-ups/${fuId}`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ approvalStatus: 'REDDEDILDI', explanation: 'Kanıt ve değerlendirme açıklaması yetersiz.' })
                .expect(200);
            expect(rejected.body.status).toBe('DEVAM_EDIYOR');
            expect(rejected.body.approvalStatus).toBe('REDDEDILDI');

            const beforeCorrection = await getFinding(fId);
            expect(beforeCorrection.status).not.toBe('CLOSED');
            expect(beforeCorrection.actions.find((a: any) => a.id === aId).status).not.toBe('KAPATILDI');

            expect((await recordFollowUp(fId, fuId, {
                currentStatusDetail: 'Kanıtlar tamamlandı ve değerlendirme düzeltildi.',
                result: 'YETERLI',
            })).status).toBe(200);
            expect((await submitFollowUp(fId, fuId)).status).toBe(200);
            expect((await approveFollowUp(fId, fuId)).status).toBe(200);

            const afterApproval = await getFinding(fId);
            expect(afterApproval.actions.find((a: any) => a.id === aId).status).toBe('KAPATILDI');
            expect(afterApproval.status).toBe('CLOSED');
        });

        it('değerlendirme sonucu olmadan bulgu kapanış sonucu kaydedilemez', async () => {
            const { findingId: fId, followUpId: fuId } = await setupFindingWithAction();

            const res = await recordFollowUp(fId, fuId, {
                currentStatusDetail: 'Değerlendirme sonucu olmadan kapatma denemesi.',
                resolutionOutcome: 'KAPATILDI',
            });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('değerlendirme sonucu');
        });

        it('YETERLI değerlendirmede bulgu sonucu kullanıcı tarafından seçilemez', async () => {
            const { findingId: fId, followUpId: fuId } = await setupFindingWithAction();

            const res = await recordFollowUp(fId, fuId, {
                currentStatusDetail: 'Yeterli değerlendirmeye elle sonuç verme denemesi.',
                result: 'YETERLI',
                resolutionOutcome: 'ERTELENDI',
                newFollowUpDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
            });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('sistem');
        });

        it.each(['KISMEN_KAPATILDI', 'YENI_AKSIYON_GEREKLI'])(
            'YETERLI değerlendirmede %s sonucu kullanıcı tarafından seçilemez',
            async (resolutionOutcome) => {
                const { findingId: fId, followUpId: fuId } = await setupFindingWithAction();
                const res = await recordFollowUp(fId, fuId, {
                    currentStatusDetail: 'Yeterli sonuçta elle çözüm sonucu seçme denemesi.',
                    result: 'YETERLI',
                    resolutionOutcome,
                });
                expect(res.status).toBe(400);
                expect(res.body.message).toContain('sistem');
            },
        );

        it('YENI_AKSIYON_GEREKLI değerlendirme ERTELENDI sonucu ile birleştirilemez', async () => {
            const { findingId: fId, followUpId: fuId } = await setupFindingWithAction();
            const res = await recordFollowUp(fId, fuId, {
                currentStatusDetail: 'Yeni aksiyon ve erteleme çelişkisi.',
                result: 'YENI_AKSIYON_GEREKLI',
                resolutionOutcome: 'ERTELENDI',
                newFollowUpDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
                newAction: { directorateId: e2eDirectorateId,
                    description: 'Çelişkili erteleme için yeni aksiyon açıklaması',
                    ownerId: adminUserId,
                    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
                },
            });
            expect(res.status).toBe(400);
            expect(res.body.message).toContain('YENI_AKSIYON_GEREKLI');
        });

        it('değerlendirme sonucu olmadan ERTELENDI sonucu kaydedilemez', async () => {
            const { findingId: fId, followUpId: fuId } = await setupFindingWithAction();
            const res = await recordFollowUp(fId, fuId, {
                currentStatusDetail: 'Sonuçsuz erteleme denemesi.',
                resolutionOutcome: 'ERTELENDI',
                newFollowUpDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
            });
            expect(res.status).toBe(400);
            expect(res.body.message).toContain('değerlendirme sonucu');
        });

        it('İş kuralı (güncellendi): YENI_AKSIYON_GEREKLI + newAction verisi olmadan → 400, placeholder Action ÜRETİLMEZ', async () => {
            // Not: Bu test önceden "fallback placeholder Action otomatik oluşur" davranışını
            // doğruluyordu. İş kuralı netleştirildi: YENI_AKSIYON_GEREKLI seçildiğinde
            // newAction.description/ownerId/dueDate zorunludur, sistem placeholder üretmez.
            const { findingId: fId, actionId: originalActionId, followUpId: fuId } = await setupFindingWithAction();

            await recordFollowUp(fId, fuId, {
                currentStatusDetail: 'Ek düzeltici aksiyon gerekiyor.',
                result: 'YENI_AKSIYON_GEREKLI',
                resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
            }).then((r) => expect(r.status).toBe(400));

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

            await recordAndApprove(fId, fuId, {
                currentStatusDetail: 'Ek düzeltici aksiyon gerekiyor.',
                result: 'YENI_AKSIYON_GEREKLI',
                resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                newAction: { directorateId: e2eDirectorateId,
                    description: 'Kullanıcının girdiği gerçek yeni aksiyon açıklaması metni',
                    ownerId: otherUser.id,
                    dueDate,
                    notes: 'Kullanıcı notu',
                },
            });

            const actions = await request(app.getHttpServer())
                .get(`/findings/${fId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(actions.body.length).toBe(2);
            const newAction = actions.body.find((a: any) => a.description === 'Kullanıcının girdiği gerçek yeni aksiyon açıklaması metni');
            expect(newAction).toBeDefined();
            expect(newAction.ownerId).toBe(otherUser.id);
            expect(newAction.directorateId).toBe(e2eDirectorateId);
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

            await recordAndApprove(findingId, followUp.id, {
                currentStatusDetail: 'Düzeltme uygulandı ve doğrulandı.',
                result: 'YETERLI',
            });

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
            await recordAndApprove(findingId, followUp1.id, {
                currentStatusDetail: 'Birinci aksiyon tamamlandı.',
                result: 'YETERLI',
            });

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
            await recordAndApprove(findingId, followUp2.id, {
                currentStatusDetail: 'İkinci aksiyon da tamamlandı.',
                result: 'YETERLI',
            });

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

            await recordAndApprove(findingId, followUp1.id, {
                currentStatusDetail: 'Bir aksiyon tamamlandı, diğeri devam ediyor.',
                result: 'YETERLI',
            });

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

        it('kapalı bulgu gerekçeyle yeniden açılır, yeni aksiyonun onaylı takibiyle ikinci kez kapanır', async () => {
            const { findingId } = await setupFinding();
            const firstAction = await addAction(findingId, { description: 'İlk yaşam döngüsü aksiyonu açıklaması' });
            const firstFollowUp = await getFollowUpForAction(findingId, firstAction.id);
            await recordAndApprove(findingId, firstFollowUp.id, {
                currentStatusDetail: 'İlk yaşam döngüsü tamamlandı.', result: 'YETERLI',
            });
            expect((await getFinding(findingId)).status).toBe('CLOSED');

            await request(app.getHttpServer()).post(`/findings/${findingId}/workflow/yeniden-ac`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'Yeni kanıt yeni bir düzeltici çalışma gerektiriyor.' }).expect(201);
            const secondAction = await addAction(findingId, { description: 'İkinci yaşam döngüsü aksiyonu açıklaması' });
            const secondFollowUp = await getFollowUpForAction(findingId, secondAction.id);
            await recordAndApprove(findingId, secondFollowUp.id, {
                currentStatusDetail: 'İkinci yaşam döngüsü tamamlandı.', result: 'YETERLI',
            });

            const finding = await getFinding(findingId);
            expect(finding.status).toBe('CLOSED');
            expect(finding.resolutionStatus).toBe('KAPATILDI');
            expect(finding.actions).toHaveLength(2);
        });
    });

    describe('Bulgu İptal Senaryoları', () => {
        it('açık aksiyon varken bulgu iptal edilebilir; açık aksiyon ve takipler IPTAL olur, gerekçe denetim izine yazılır', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId, {
                description: 'Bulgu iptal kaskadı için açık aksiyon açıklaması',
            });
            const followUp = await getFollowUpForAction(findingId, action.id);

            const cancel = await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/iptal-et`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'Kontrol kapsamı değiştiği için bulgu iptal edildi.' });

            expect(cancel.status).toBe(201);
            expect(cancel.body.workflowStatus).toBe('IPTAL');

            const cancelledAction = await prisma.action.findUnique({ where: { id: action.id } });
            const cancelledFollowUp = await prisma.findingFollowUp.findUnique({ where: { id: followUp.id } });
            expect(cancelledAction?.status).toBe('IPTAL');
            expect(cancelledFollowUp?.status).toBe('IPTAL');

            const findingAudit = await prisma.auditLog.findFirst({
                where: { entityType: 'Finding', entityId: findingId, action: 'CANCEL' },
                orderBy: { createdAt: 'desc' },
            });
            expect(findingAudit?.newValue).toMatchObject({
                workflowStatus: 'IPTAL',
                reason: 'Kontrol kapsamı değiştiği için bulgu iptal edildi.',
            });
        });

        it('iptal edilmiş bulguya yeni aksiyon veya takip eklenemez', async () => {
            const { findingId } = await setupFinding();
            // Takip çalışması aksiyona bağlı olmak zorunda — iptal öncesi mevcut bir aksiyon.
            const existingAction = await addAction(findingId);
            await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/iptal-et`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'Yeni iş üretimini engelleme testi.' })
                .expect(201);

            const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const actionResult = await request(app.getHttpServer())
                .post(`/findings/${findingId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    description: 'İptal edilmiş bulguya eklenmemesi gereken aksiyon',
                    ownerId: adminUserId,
                    dueDate,
                });
            expect(actionResult.status).toBe(400);
            expect(actionResult.body.message).toContain('iptal');

            const followUpResult = await request(app.getHttpServer())
                .post(`/findings/${findingId}/follow-ups`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ actionId: existingAction.id, currentStatusDetail: 'Eklenmemesi gereken takip çalışması' });
            expect(followUpResult.status).toBe(400);
            expect(followUpResult.body.message).toContain('iptal');
        });

        it('iptalde onaylı/kapatılmış geçmiş korunur, yalnız açık aksiyon ve takipler IPTAL olur', async () => {
            const { findingId } = await setupFinding();
            const closedAction = await addAction(findingId, { description: 'İptalde korunacak kapalı aksiyon açıklaması' });
            const openAction = await addAction(findingId, { description: 'İptalde iptal edilecek açık aksiyon açıklaması' });
            const approvedFollowUp = await getFollowUpForAction(findingId, closedAction.id);
            const openFollowUp = await getFollowUpForAction(findingId, openAction.id);

            await recordAndApprove(findingId, approvedFollowUp.id, {
                currentStatusDetail: 'Bu aksiyon iptal öncesinde yeterli bulundu.',
                result: 'YETERLI',
            });
            await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/iptal-et`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'Kalan çalışma kapsamdan çıkarıldı.' })
                .expect(201);

            expect((await prisma.action.findUnique({ where: { id: closedAction.id } }))?.status).toBe('KAPATILDI');
            expect((await prisma.findingFollowUp.findUnique({ where: { id: approvedFollowUp.id } }))?.status).toBe('ONAYLANDI');
            expect((await prisma.action.findUnique({ where: { id: openAction.id } }))?.status).toBe('IPTAL');
            expect((await prisma.findingFollowUp.findUnique({ where: { id: openFollowUp.id } }))?.status).toBe('IPTAL');
        });

        it('kapalı bulgu yeniden açılmadan yeni aksiyon veya takip kabul etmez', async () => {
            const { findingId } = await setupFinding();
            await prisma.finding.update({
                where: { id: findingId },
                data: { status: 'CLOSED', resolutionStatus: 'KAPATILDI', closedDate: new Date() },
            });

            const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            await request(app.getHttpServer())
                .post(`/findings/${findingId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Kapalı bulguda engellenecek aksiyon açıklaması', ownerId: adminUserId, dueDate })
                .expect(400);
            await request(app.getHttpServer())
                .post(`/findings/${findingId}/follow-ups`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ currentStatusDetail: 'Kapalı bulguda engellenecek takip' })
                .expect(400);

            await request(app.getHttpServer())
                .post(`/findings/${findingId}/workflow/yeniden-ac`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'Yeni kanıt nedeniyle çalışma yeniden başlatıldı.' })
                .expect(201);

            await request(app.getHttpServer())
                .post(`/findings/${findingId}/actions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Yeniden açılan bulguya eklenen aksiyon açıklaması', ownerId: adminUserId, dueDate })
                .expect(201);
        });
    });

    describe('Ertelendi Senaryosu', () => {
        it('YETERSIZ değerlendirme geçmiş bir tarihe ertelenemez', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);

            const res = await recordFollowUp(findingId, followUp.id, {
                currentStatusDetail: 'Geçmiş tarihe erteleme denemesi.',
                result: 'YETERSIZ',
                resolutionOutcome: 'ERTELENDI',
                newFollowUpDate: '2020-01-01',
            });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('bugünden sonra');
        });

        it('resolutionOutcome=ERTELENDI + newFollowUpDate: onaya kadar bulgu değişmez; onayda testDate güncellenir, bulgu kapanmaz, status log eklenir', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);

            const newDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const logsBefore = await request(app.getHttpServer())
                .get(`/findings/${findingId}/status-logs`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const payload = {
                currentStatusDetail: 'Test tarihi ertelendi, ek süre gerekiyor.',
                result: 'YETERSIZ',
                resolutionOutcome: 'ERTELENDI',
                newFollowUpDate: newDate,
            };
            expect((await recordFollowUp(findingId, followUp.id, payload)).status).toBe(200);
            // Maker-checker: onaysız değerlendirme bulguyu değiştirmez.
            expect((await getFinding(findingId)).resolutionStatus).not.toBe('ERTELENDI');

            expect((await assignSecondController(findingId, followUp.id)).status).toBe(201);
            expect((await submitFollowUp(findingId, followUp.id)).status).toBe(200);
            expect((await approveFollowUp(findingId, followUp.id)).status).toBe(200);

            const finding = await getFinding(findingId);
            expect(finding.status).not.toBe('CLOSED');
            expect(finding.resolutionStatus).toBe('ERTELENDI');
            expect(new Date(finding.testDate).toISOString().split('T')[0]).toBe(newDate);

            const logsAfter = await request(app.getHttpServer())
                .get(`/findings/${findingId}/status-logs`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(logsAfter.body.length).toBe(logsBefore.body.length + 1);
            expect(logsAfter.body.some((l: any) => String(l.text).includes('Test tarihi ertelendi'))).toBe(true);
        });
        it('ardışık ertelemeler: her onay yeni takip üretir, geçmiş korunur ve son tarih bulguya yansır', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            let followUp = await getFollowUpForAction(findingId, action.id);
            const firstDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
            const secondDate = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0];

            await recordAndApprove(findingId, followUp.id, {
                currentStatusDetail: 'Birinci erteleme', result: 'YETERSIZ', resolutionOutcome: 'ERTELENDI', newFollowUpDate: firstDate,
            });
            // Onaylı takip tarihsel kayıttır; ikinci erteleme onayda üretilen ardıl takipte yapılır.
            const next = await prisma.findingFollowUp.findFirst({
                where: { findingId, actionId: action.id, status: 'BEKLIYOR' }, orderBy: { createdAt: 'desc' },
            });
            expect(next).toBeTruthy();
            followUp = next;
            await recordAndApprove(findingId, followUp.id, {
                currentStatusDetail: 'İkinci erteleme', result: 'YETERSIZ', resolutionOutcome: 'ERTELENDI', newFollowUpDate: secondDate,
            });

            const finding = await getFinding(findingId);
            expect(new Date(finding.testDate).toISOString().split('T')[0]).toBe(secondDate);
            const history = await prisma.findingStatusHistory.findMany({
                where: { findingId, operation: 'FOLLOWUP_COMPLETED' },
            });
            expect(history).toHaveLength(2);
        });
        it('BUG DÜZELTMESİ: resolutionOutcome=ERTELENDI + newFollowUpDate YOK → 400', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);

            const res = await recordFollowUp(findingId, followUp.id, {
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
        it('resolutionOutcome=DEVAM_EDIYOR: onayda Action/Finding kapanmaz, status log append-only eklenir', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);

            const logsBefore = await request(app.getHttpServer())
                .get(`/findings/${findingId}/status-logs`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            await recordAndApprove(findingId, followUp.id, {
                currentStatusDetail: 'Düzeltme çalışması hâlâ sürüyor.',
                result: 'YETERSIZ',
                resolutionOutcome: 'DEVAM_EDIYOR',
            });

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

            // İkinci döngü (yeni takip) eskiyi silmemeli, üstüne eklemeli.
            const second = await request(app.getHttpServer())
                .post(`/findings/${findingId}/actions/${action.id}/follow-ups`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ notes: 'İkinci döngü' })
                .expect(201);
            await recordAndApprove(findingId, second.body.id, {
                currentStatusDetail: 'İkinci güncelleme: hâlâ devam ediyor.',
                result: 'YETERSIZ',
                resolutionOutcome: 'DEVAM_EDIYOR',
            });

            const logsAfterSecond = await request(app.getHttpServer())
                .get(`/findings/${findingId}/status-logs`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(logsAfterSecond.body.length).toBe(logsBefore.body.length + 2);
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

            await recordAndApprove(findingId, followUp.id, {
                currentStatusDetail: 'Ek düzeltici aksiyon gerekiyor.',
                result: 'YENI_AKSIYON_GEREKLI',
                resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                newAction: { directorateId: e2eDirectorateId,
                    description: 'Zorunlu alan testi — gerçek kullanıcı girdisi açıklama',
                    ownerId: otherUser.id,
                    dueDate,
                    // Sorumlu birim artık directorateId'dir; responsibleDepartment birim adından türetilir.
                    notes: 'Test notu',
                },
            });

            const finding = await getFinding(findingId);
            const newAction = finding.actions.find((a: any) => a.id !== originalAction.id);
            expect(newAction).toBeDefined();
            expect(newAction.description).toBe('Zorunlu alan testi — gerçek kullanıcı girdisi açıklama');
            expect(newAction.ownerId).toBe(otherUser.id);
            expect(new Date(newAction.dueDate).toISOString().split('T')[0]).toBe(dueDate);
            expect(newAction.status).toBe('BEKLIYOR');
            expect(newAction.directorateId).toBe(e2eDirectorateId);
            expect(newAction.responsibleDepartment).toBe('E2E Yeni Aksiyon Birimi');

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

            const res = await recordFollowUp(findingId, followUp.id, {
                result: 'YENI_AKSIYON_GEREKLI', resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
            });

            expect(res.status).toBe(400);
            expect(String(res.body.message)).toContain('Yeni aksiyon planı');
        });

        it('newAction.description eksikse → 400', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);
            const dueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const res = await recordFollowUp(findingId, followUp.id, {
                result: 'YENI_AKSIYON_GEREKLI', resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                newAction: { directorateId: e2eDirectorateId, ownerId: adminUserId, dueDate },
            });

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body.message)).toContain('description');
        });

        it('newAction.directorateId (Sorumlu Birim) eksikse → 400', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);
            const dueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const res = await recordFollowUp(findingId, followUp.id, {
                result: 'YENI_AKSIYON_GEREKLI', resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                newAction: { description: 'Birimi eksik aksiyon açıklaması', ownerId: adminUserId, dueDate },
            });

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body.message)).toContain('directorateId');
        });

        it('newAction.ownerId verilmezse mevcut aksiyonun sorumlusu taslağa yazılır (opsiyonel alan)', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);
            const dueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const res = await recordFollowUp(findingId, followUp.id, {
                result: 'YENI_AKSIYON_GEREKLI', resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                newAction: { directorateId: e2eDirectorateId, description: 'Sorumlusu verilmemiş aksiyon açıklaması', dueDate },
            });

            expect(res.status).toBe(200);
            expect(res.body.newActionDraft).toMatchObject({ ownerId: action.ownerId, directorateId: e2eDirectorateId });
        });

        it('newAction.dueDate eksikse → 400', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);

            const res = await recordFollowUp(findingId, followUp.id, {
                result: 'YENI_AKSIYON_GEREKLI', resolutionOutcome: 'YENI_AKSIYON_GEREKLI',
                newAction: { directorateId: e2eDirectorateId, description: 'Tarihi eksik aksiyon açıklaması', ownerId: adminUserId },
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
                .set('Authorization', `Bearer ${managerToken}`)
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
                .set('Authorization', `Bearer ${managerToken}`)
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
                severity: 'HIGH',
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

        it('PUT /findings/:id/follow-ups/:followUpId — yalnız atanmış birinci kontrolcü düzenler; diğer roller ve VIEWER 403', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId);
            const followUp = await getFollowUpForAction(findingId, action.id);
            expect(followUp.assigneeId).toBe(adminUserId); // test görevlisi = birinci kontrolcü

            await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${viewerToken}`)
                .send({ currentStatusDetail: 'Yetkisiz deneme.' })
                .expect(403);

            // Rol yetkisi olsa da atanmamış kullanıcı başkasının takibini düzenleyemez (maker-checker).
            for (const token of [managerToken, auditorToken]) {
                const res = await request(app.getHttpServer())
                    .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({ currentStatusDetail: 'Atanmamış kullanıcı güncellemesi' })
                    .expect(403);
                expect(res.body.message).toContain('birinci kontrolcü');
            }

            await request(app.getHttpServer())
                .put(`/findings/${findingId}/follow-ups/${followUp.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ currentStatusDetail: 'Atanmış birinci kontrolcü güncellemesi' })
                .expect(200);
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
            async function advanceToIcKontrolOnayi(senderToken = adminToken) {
                const { findingId } = await setupFinding();
                await request(app.getHttpServer())
                    .post(`/findings/${findingId}/workflow/mutabakata-gonder`)
                    .set('Authorization', `Bearer ${senderToken}`)
                    .expect(201);
                await request(app.getHttpServer())
                    .post(`/findings/${findingId}/workflow/ic-kontrol-onayina-gonder`)
                    .set('Authorization', `Bearer ${senderToken}`)
                    .send({ birimCevabi: 'Yanıt.' })
                    .expect(201);
                return findingId;
            }

            // Admin onay vakasında kaydı manager gönderir; aksi halde maker/checker
            // kuralı rol kontrolünden önce haklı olarak 403 üretir.
            const fId1 = await advanceToIcKontrolOnayi(managerToken);
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

        it('çoklu aksiyonda hedef tarih en geç termindir; silmede ilişkili geçmiş korunur ve son aksiyonda hedef tarih temizlenir', async () => {
            const { findingId } = await setupFinding();
            const earlyDate = new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0];
            const lateDate = new Date(Date.now() + 40 * 86400000).toISOString().split('T')[0];
            const early = await addAction(findingId, { description: 'Erken terminli aksiyon açıklaması', dueDate: earlyDate });
            const late = await addAction(findingId, { description: 'Geç terminli aksiyon açıklaması', dueDate: lateDate });
            const lateFollowUp = await getFollowUpForAction(findingId, late.id);
            const history = await prisma.findingStatusHistory.create({
                data: { findingId, actionId: late.id, operation: 'ACTION_UPDATED', userId: adminUserId, explanation: 'Silme bütünlüğü testi' },
            });

            expect(new Date((await getFinding(findingId)).targetResolutionDate).toISOString().split('T')[0]).toBe(lateDate);

            await request(app.getHttpServer()).delete(`/findings/${findingId}/actions/${late.id}`)
                .set('Authorization', `Bearer ${adminToken}`).expect(200);
            expect(new Date((await getFinding(findingId)).targetResolutionDate).toISOString().split('T')[0]).toBe(earlyDate);
            expect((await prisma.findingFollowUp.findUnique({ where: { id: lateFollowUp.id } }))?.actionId).toBeNull();
            expect((await prisma.findingStatusHistory.findUnique({ where: { id: history.id } }))?.actionId).toBeNull();

            await request(app.getHttpServer()).delete(`/findings/${findingId}/actions/${early.id}`)
                .set('Authorization', `Bearer ${adminToken}`).expect(200);
            const findingAfterLastDelete = await getFinding(findingId);
            expect(findingAfterLastDelete.targetResolutionDate).toBeNull();
            expect(findingAfterLastDelete.status).toBe('IN_PROGRESS');
        });
    });

    describe('Validation / FK Senaryoları', () => {
        it('kontrol metin alanlarında Unicode korunur, uzunluk sınırını aşan giriş reddedilir', async () => {
            const unicodeName = 'Erişim Kontrolü — İŞLEM, ğüşiöç ✅';
            const created = await request(app.getHttpServer())
                .post('/controls')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: unicodeName,
                    description: 'Türkçe karakter ve emoji kabul testi: ĞÜŞİÖÇ ğüşiöç 🔐',
                    type: 'BT', nature: 'PREVENTIVE', automation: 'MANUAL', frequency: 'MONTHLY',
                }).expect(201);
            expect(created.body.name).toBe(unicodeName);

            await request(app.getHttpServer())
                .post('/controls')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'x'.repeat(501), description: 'Sınır testi' })
                .expect(400);
            await request(app.getHttpServer())
                .post('/controls')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Açıklama sınırı testi', description: 'x'.repeat(10001) })
                .expect(400);
        });

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
                    severity: 'HIGH',
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
                    severity: 'HIGH',
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

    describe('Kontrol Testi — İkinci Kontrolcü Onay Merkezi', () => {
        async function setupControlTest(overrides: Record<string, any> = {}) {
            const directorate = await createTestDirectorate(prisma);
            const control = await createTestControl(prisma, { ownerId: adminUserId, directorateId: directorate.id });
            const controlTest = await createTestControlTest(prisma, {
                controlId: control.id, assigneeId: adminUserId, ...overrides,
            });
            return { controlId: control.id, controlTestId: controlTest.id, directorateId: directorate.id };
        }

        it('BULGUSU_YOK + bağlı bulgu yok → test tamamlanır, TAMAMLANDI (onaya gönderildi) olur', async () => {
            const { controlTestId } = await setupControlTest();
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_YOK' })
                .expect(200);

            expect(res.body.status).toBe('TAMAMLANDI');
        });

        it('BULGUSU_YOK ya da BULGUSU_VAR farketmeksizin test TAMAMLANDI olunca doğrudan final ONAYLANDI sayılmaz', async () => {
            const { controlTestId } = await setupControlTest();
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_YOK' })
                .expect(200);

            expect(res.body.status).not.toBe('ONAYLANDI');
            expect(res.body.status).toBe('TAMAMLANDI');
        });

        it('İkinci kontrolcü onaylarsa test ONAYLANDI olur', async () => {
            const { controlTestId } = await setupControlTest({ secondControllerId: managerUserId });
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_YOK' })
                .expect(200);

            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/approve`)
                .set('Authorization', `Bearer ${managerToken}`)
                .expect(200);

            expect(res.body.status).toBe('ONAYLANDI');
        });

        it('İkinci kontrolcü geri gönderirse test GERI_GONDERILDI olur ve testi yapan tekrar tamamlayabilir', async () => {
            const { controlTestId } = await setupControlTest({ secondControllerId: managerUserId });
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_YOK' })
                .expect(200);

            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/return`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ reason: 'Kanıt yetersiz, tekrar gözden geçirin.' })
                .expect(200);
            expect(res.body.status).toBe('GERI_GONDERILDI');

            // Testi yapan kullanıcı GERI_GONDERILDI durumundan doğrudan tekrar tamamlayabilmeli
            const resubmit = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_YOK' })
                .expect(200);
            expect(resubmit.body.status).toBe('TAMAMLANDI');
        });

        it('Geri gönderme gerekçesi zorunludur → boşsa 400', async () => {
            const { controlTestId } = await setupControlTest();
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_YOK' })
                .expect(200);

            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/return`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: '' });
            expect(res.status).toBe(400);
        });

        it('Testi yapan kullanıcı kendi ikinci kontrol onayını veremez → 400', async () => {
            const { controlTestId } = await setupControlTest({ assigneeId: adminUserId });
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_YOK' })
                .expect(200);

            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/approve`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});
            expect(res.status).toBe(400);
        });

        it('Final onaylı (ONAYLANDI) testi admin dışı bir rol iptal edemez → 403', async () => {
            const { controlTestId } = await setupControlTest({ secondControllerId: managerUserId });
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_YOK' })
                .expect(200);
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/approve`)
                .set('Authorization', `Bearer ${managerToken}`)
                .expect(200);

            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/cancel-final`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ reason: 'Deneme.' })
                .expect(403);
        });

        it('Final onaylı (ONAYLANDI) testi SYSTEM_ADMIN iptal edebilir → IPTAL', async () => {
            const { controlTestId } = await setupControlTest({ secondControllerId: managerUserId });
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_YOK' })
                .expect(200);
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/approve`)
                .set('Authorization', `Bearer ${managerToken}`)
                .expect(200);

            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/cancel-final`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'Yanlış onaylanmış.' })
                .expect(200);
            expect(res.body.status).toBe('IPTAL');
        });

        it('eski test sonradan onaylansa da kontrol özeti en yeni testi gösterir; en yeni onay iptalinde önceki onaya döner', async () => {
            const directorate = await createTestDirectorate(prisma);
            const control = await createTestControl(prisma, { ownerId: adminUserId, directorateId: directorate.id });
            const oldTest = await createTestControlTest(prisma, {
                controlId: control.id, assigneeId: adminUserId, secondControllerId: managerUserId,
            });
            const newTest = await createTestControlTest(prisma, {
                controlId: control.id, assigneeId: adminUserId, secondControllerId: managerUserId,
            });
            await prisma.controlTest.update({
                where: { id: oldTest.id },
                data: { status: 'TAMAMLANDI', findingStatus: 'BULGUSU_YOK', completedAt: new Date('2026-01-10') },
            });
            await prisma.controlTest.update({
                where: { id: newTest.id },
                data: { status: 'TAMAMLANDI', findingStatus: 'BULGUSU_VAR', completedAt: new Date('2026-02-10') },
            });

            await request(app.getHttpServer()).patch(`/controls/tests/${newTest.id}/approve`)
                .set('Authorization', `Bearer ${managerToken}`).expect(200);
            await request(app.getHttpServer()).patch(`/controls/tests/${oldTest.id}/approve`)
                .set('Authorization', `Bearer ${managerToken}`).expect(200);

            let updatedControl = await prisma.control.findUnique({ where: { id: control.id } });
            expect(updatedControl?.effectivenessStatus).toBe('INEFFECTIVE');
            expect(updatedControl?.lastTestDate?.toISOString()).toBe(new Date('2026-02-10').toISOString());

            await request(app.getHttpServer()).patch(`/controls/tests/${newTest.id}/cancel-final`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'En yeni test onayı hatalıydı.' })
                .expect(200);

            updatedControl = await prisma.control.findUnique({ where: { id: control.id } });
            expect(updatedControl?.effectivenessStatus).toBe('EFFECTIVE');
            expect(updatedControl?.lastTestDate?.toISOString()).toBe(new Date('2026-01-10').toISOString());
        });

        it('GET /approvals/my-pending yalnızca kendi üzerindeki bekleyen onayları döner', async () => {
            const { controlTestId: mineId } = await setupControlTest({ secondControllerId: managerUserId });
            const { controlTestId: othersId } = await setupControlTest({ secondControllerId: adminUserId });

            // Testi ikinci kontrolcüsü yürütemez (maker/checker) — her testi diğer kullanıcı yürütür.
            for (const [id, makerToken] of [[mineId, adminToken], [othersId, managerToken]]) {
                await request(app.getHttpServer())
                    .patch(`/controls/tests/${id}/start`)
                    .set('Authorization', `Bearer ${makerToken}`)
                    .expect(200);
                await request(app.getHttpServer())
                    .patch(`/controls/tests/${id}/complete`)
                    .set('Authorization', `Bearer ${makerToken}`)
                    .send({ findingStatus: 'BULGUSU_YOK' })
                    .expect(200);
            }

            const res = await request(app.getHttpServer())
                .get('/approvals/my-pending')
                .set('Authorization', `Bearer ${managerToken}`)
                .expect(200);

            const ids = res.body.data.map((t: any) => t.id);
            expect(ids).toContain(mineId);
            expect(ids).not.toContain(othersId);
        });

        it('ikinci kontrolcü testi yürütemez; onay bekleyen testin içeriği dondurulur', async () => {
            const { controlTestId } = await setupControlTest({ secondControllerId: managerUserId });
            await request(app.getHttpServer()).patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${managerToken}`).expect(403);
            await request(app.getHttpServer()).patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`).expect(200);
            let current = await prisma.controlTest.findUniqueOrThrow({ where: { id: controlTestId } });
            await request(app.getHttpServer()).patch(`/controls/tests/${controlTestId}/draft`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ contentVersion: current.contentVersion, evidenceSummary: 'checker yazdı' }).expect(403);
            await request(app.getHttpServer()).patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`).send({ findingStatus: 'BULGUSU_YOK' }).expect(200);
            current = await prisma.controlTest.findUniqueOrThrow({ where: { id: controlTestId } });
            await request(app.getHttpServer()).patch(`/controls/tests/${controlTestId}/draft`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ contentVersion: current.contentVersion, evidenceSummary: 'onay beklerken değişiklik' }).expect(409);
            const after = await prisma.controlTest.findUniqueOrThrow({ where: { id: controlTestId } });
            expect(after.evidenceSummary).toBe(current.evidenceSummary);
        });

        it('taslakta adım gözlemleri kaybolmadan saklanır; yetenek bayrakları maker/checker ayrımını yansıtır', async () => {
            const { controlTestId } = await setupControlTest({ secondControllerId: managerUserId });
            await request(app.getHttpServer()).patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`).expect(200);
            const current = await prisma.controlTest.findUniqueOrThrow({ where: { id: controlTestId } });
            await request(app.getHttpServer()).patch(`/controls/tests/${controlTestId}/draft`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ contentVersion: current.contentVersion, stepObservations: [{ index: 0, observation: 'Adım 1 gözlemi' }, { index: 1, observation: 'Adım 2 gözlemi' }] })
                .expect(200);
            const saved = await prisma.controlTest.findUniqueOrThrow({ where: { id: controlTestId } });
            expect(saved.stepObservations).toEqual([{ index: 0, observation: 'Adım 1 gözlemi' }, { index: 1, observation: 'Adım 2 gözlemi' }]);

            const asChecker = await request(app.getHttpServer()).get(`/controls/tests/${controlTestId}`)
                .set('Authorization', `Bearer ${managerToken}`).expect(200);
            expect(asChecker.body.capabilities).toMatchObject({ canEditContent: false, canComplete: false, canApprove: false });
            const asMaker = await request(app.getHttpServer()).get(`/controls/tests/${controlTestId}`)
                .set('Authorization', `Bearer ${adminToken}`).expect(200);
            expect(asMaker.body.capabilities).toMatchObject({ canEditContent: true, canComplete: true });
        });

        it('GET /approvals/:id onay detayında task bilgilerini döner (kontrol, test, gönderen, tarih)', async () => {
            const { controlTestId } = await setupControlTest({ secondControllerId: managerUserId });
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ findingStatus: 'BULGUSU_YOK', resultText: 'Test sonucu açıklaması.' })
                .expect(200);

            const res = await request(app.getHttpServer())
                .get(`/approvals/${controlTestId}`)
                .set('Authorization', `Bearer ${managerToken}`)
                .expect(200);

            expect(res.body.control).toBeDefined();
            expect(res.body.resultText).toBe('Test sonucu açıklaması.');
            expect(res.body.submittedBy).toBeDefined();
            expect(res.body.submittedAt).toBeDefined();
        });

        it('Açık bulguya referans verilerek test doğrudan onaya gönderilebilir (BULGUSU_VAR kabul edilir)', async () => {
            const { controlId, controlTestId } = await setupControlTest();

            // Bu kontrole bağlı, açık bir bulgu oluştur (başka bir test üzerinden)
            const otherTest = await createTestControlTest(prisma, { controlId, assigneeId: adminUserId });
            const findingRes = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT', description: 'Referans testi için yeterli uzunlukta açık bulgu açıklaması',
                    relatedDepartment: 'BT Ağ Yönetimi', severity: 'HIGH', controlTestId: otherTest.id,
                })
                .expect(201);
            const openFindingId = findingRes.body.id;

            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ referencedFindingId: openFindingId, referenceReason: 'Aynı açık bulgu devam ediyor.', continuationConfirmed: true })
                .expect(200);

            expect(res.body.status).toBe('TAMAMLANDI');
            expect(res.body.findingStatus).toBe('BULGUSU_VAR');
            expect(res.body.referencedFindingId).toBe(openFindingId);
        });

        it('Kapalı bir bulguya referans verilemez → 400', async () => {
            const { controlId, controlTestId } = await setupControlTest();

            const otherTest = await createTestControlTest(prisma, { controlId, assigneeId: adminUserId });
            const findingRes = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT', description: 'Kapalı bulgu referans testi için açıklama metni',
                    relatedDepartment: 'BT Ağ Yönetimi', severity: 'HIGH', controlTestId: otherTest.id,
                })
                .expect(201);
            const closedFindingId = findingRes.body.id;
            await prisma.finding.update({ where: { id: closedFindingId }, data: { status: 'CLOSED' } });

            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ referencedFindingId: closedFindingId, referenceReason: 'Deneme.' });
            expect(res.status).toBe(400);
        });

        it('Başka bir kontrolün bulgusuna referans verilemez → 400', async () => {
            const { controlTestId } = await setupControlTest();
            const { controlId: otherControlId } = await setupControlTest();
            const otherTest = await createTestControlTest(prisma, { controlId: otherControlId, assigneeId: adminUserId });
            const findingRes = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT', description: 'Farklı kontrole ait açık bulgu açıklaması metni',
                    relatedDepartment: 'BT Ağ Yönetimi', severity: 'HIGH', controlTestId: otherTest.id,
                })
                .expect(201);

            await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/start`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const res = await request(app.getHttpServer())
                .patch(`/controls/tests/${controlTestId}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ referencedFindingId: findingRes.body.id, referenceReason: 'Deneme.' });
            expect(res.status).toBe(400);
        });
    });

    describe('Bulgu — Direktörlük FK, Status/Severity Kısıtlaması, Otomatik Aylık Takip', () => {
        it('directorateId ile bulgu oluşturulunca relatedDepartment direktörlük adından türetilir', async () => {
            const directorate = await createTestDirectorate(prisma, 'Test Direktörlüğü FK');
            const res = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT', description: 'Direktörlük FK testi için yeterli uzunlukta açıklama',
                    directorateId: directorate.id, severity: 'HIGH',
                })
                .expect(201);

            expect(res.body.directorateId).toBe(directorate.id);
            expect(res.body.relatedDepartment).toBe('Test Direktörlüğü FK');
        });

        it('severity MEDIUM/LOW artık kabul edilmez → 400', async () => {
            const res = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT', description: 'Geçersiz severity testi için yeterli uzunlukta açıklama',
                    relatedDepartment: 'BT Ağ Yönetimi', severity: 'MEDIUM',
                });
            expect(res.status).toBe(400);
        });

        it('status yalnızca IN_PROGRESS/PARTIALLY_CLOSED/CLOSED kabul edilir — OPEN artık 400', async () => {
            const res = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT', description: 'Geçersiz status testi için yeterli uzunlukta açıklama',
                    relatedDepartment: 'BT Ağ Yönetimi', severity: 'HIGH', status: 'OPEN',
                });
            expect(res.status).toBe(400);
        });

        it('aksiyonsuz bulgu için takip üretilmez; takip çalışması aksiyon eklendiğinde aksiyona bağlı oluşur', async () => {
            // Güncel kural: takip çalışması bir aksiyona bağlı olmak zorundadır (createFollowUp
            // actionId ister). Eski "aksiyonsuz aylık takip" davranışı kaldırıldı.
            const testDate = new Date().toISOString().split('T')[0];
            const res = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT', description: 'Otomatik takip testi için yeterli uzunlukta açıklama',
                    relatedDepartment: 'BT Ağ Yönetimi', severity: 'HIGH', testDate,
                })
                .expect(201);
            expect(await prisma.findingFollowUp.count({ where: { findingId: res.body.id } })).toBe(0);

            const action = await addAction(res.body.id);
            const followUps = await prisma.findingFollowUp.findMany({ where: { findingId: res.body.id } });
            expect(followUps).toHaveLength(1);
            expect(followUps[0].actionId).toBe(action.id);
        });
        it('bulgu güncellemesi takip üretmez; her aksiyon için tek takip oluşur (mükerrer yok)', async () => {
            const testDate = new Date().toISOString().split('T')[0];
            const findingRes = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT', description: 'Mükerrer takip testi için yeterli uzunlukta açıklama',
                    relatedDepartment: 'BT Ağ Yönetimi', severity: 'HIGH', testDate,
                })
                .expect(201);
            const fId = findingRes.body.id;

            const a1 = await addAction(fId);
            await request(app.getHttpServer())
                .put(`/findings/${fId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ summary: 'Güncellenen özet' })
                .expect(200);
            const a2 = await addAction(fId);

            const followUps = await prisma.findingFollowUp.findMany({ where: { findingId: fId } });
            expect(followUps).toHaveLength(2);
            expect(followUps.map(f => f.actionId).sort()).toEqual([a1.id, a2.id].sort());
        });
        it('impact alanı UpdateFindingDto tarafından artık reddedilmez ("property impact should not exist" hatası çözüldü)', async () => {
            const { findingId } = await setupFinding({ severity: 'HIGH' });
            const res = await request(app.getHttpServer())
                .put(`/findings/${findingId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ impact: 'Güncellenmiş etki açıklaması.' });
            expect(res.status).toBe(200);
            expect(res.body.impact).toBe('Güncellenmiş etki açıklaması.');
        });

        it('targetResolutionDate istemciden güncellense bile yok sayılır ve yalnızca aksiyonlardan hesaplanır', async () => {
            const { findingId } = await setupFinding();
            const action = await addAction(findingId, { description: 'Backend authoritative test aksiyonu açıklaması' });

            const clientDate = '2099-01-01';
            const res = await request(app.getHttpServer())
                .put(`/findings/${findingId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ targetResolutionDate: clientDate });
            expect(res.status).toBe(200);

            // İstemcinin gönderdiği 2099 tarihi DEĞİL, aksiyonun gerçek dueDate'i yansımalı
            const expectedDate = new Date(action.dueDate).toISOString().split('T')[0];
            const actualDate = new Date(res.body.targetResolutionDate).toISOString().split('T')[0];
            expect(actualDate).toBe(expectedDate);
            expect(actualDate).not.toBe(clientDate);
        });

        it('bilinmeyen ekstra alan hâlâ 400 döner (forbidNonWhitelisted korunuyor)', async () => {
            const res = await request(app.getHttpServer())
                .post('/findings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    findingType: 'BT', description: 'Bilinmeyen alan testi için yeterli uzunlukta açıklama',
                    relatedDepartment: 'BT Ağ Yönetimi', severity: 'HIGH', hackerField: 'x',
                })
                .expect(400);
        });
    });
});
