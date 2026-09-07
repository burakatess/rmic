import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import {
    resetDatabase, seedRoles, createTestUser, createTestDirectorate,
    createTestControl, createTestControlTest, E2E_TEST_PASSWORD,
} from './helpers/fixtures';

/**
 * Güvenlik / yetkilendirme / workflow-bütünlüğü e2e testleri (gerçek test DB).
 * Kapsam: izin kaldırma, anonim vs yetkisiz, rapor kapsamı, workflow atlatma,
 * onaylı kapanış, eşzamanlı takip onayı.
 */
describe('E2E — Güvenlik ve Workflow Bütünlüğü', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let roleIds: Record<string, string>;

    let adminToken: string, adminId: string;
    let managerToken: string, managerId: string;
    let iksToken: string, iksId: string;
    let auditeeToken: string, auditeeId: string;
    let otherAuditeeToken: string, otherAuditeeId: string;

    const login = async (email: string) =>
        (await request(app.getHttpServer()).post('/auth/login').send({ email, password: E2E_TEST_PASSWORD }).expect(200))
            .body.accessToken;

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        roleIds = await seedRoles(prisma);

        adminId = (await createTestUser(prisma, roleIds['SYSTEM_ADMIN'], { email: 'sec-admin@e2e.local' })).id;
        managerId = (await createTestUser(prisma, roleIds['RISK_CONTROL_MANAGER'], { email: 'sec-mgr@e2e.local' })).id;
        iksId = (await createTestUser(prisma, roleIds['IKS_MANAGER'], { email: 'sec-iks@e2e.local' })).id;
        auditeeId = (await createTestUser(prisma, roleIds['AUDITEE'], { email: 'sec-auditee@e2e.local' })).id;
        otherAuditeeId = (await createTestUser(prisma, roleIds['AUDITEE'], { email: 'sec-auditee2@e2e.local' })).id;

        adminToken = await login('sec-admin@e2e.local');
        managerToken = await login('sec-mgr@e2e.local');
        iksToken = await login('sec-iks@e2e.local');
        auditeeToken = await login('sec-auditee@e2e.local');
        otherAuditeeToken = await login('sec-auditee2@e2e.local');
    });

    afterAll(async () => { await app.close(); });

    // ─── Madde 1: Merkezi PermissionsGuard ────────────────────────────────
    describe('İzin bazlı erişim', () => {
        it('anonim istek 401 (403 değil)', async () => {
            await request(app.getHttpServer()).get('/reports/dashboard').expect(401);
        });

        it('report:org olan kullanıcı kurum geneli raporu görür', async () => {
            await request(app.getHttpServer())
                .get('/reports/dashboard').set('Authorization', `Bearer ${managerToken}`).expect(200);
        });

        it('report:org OLMAYAN kullanıcı kurum geneli raporda 403', async () => {
            await request(app.getHttpServer())
                .get('/reports/dashboard').set('Authorization', `Bearer ${iksToken}`).expect(403);
        });

        it('izin DB\'den kaldırılınca SONRAKİ istek reddedilir (aynı token)', async () => {
            // manager önce görebiliyor
            await request(app.getHttpServer())
                .get('/reports/executive-summary').set('Authorization', `Bearer ${managerToken}`).expect(200);

            const role = await prisma.role.findUnique({ where: { name: 'RISK_CONTROL_MANAGER' } });
            const stripped = (role!.permissions as string[]).filter((p) => p !== 'report:org');
            await prisma.role.update({ where: { name: 'RISK_CONTROL_MANAGER' }, data: { permissions: stripped } });
            try {
                await request(app.getHttpServer())
                    .get('/reports/executive-summary').set('Authorization', `Bearer ${managerToken}`).expect(403);
            } finally {
                await prisma.role.update({ where: { name: 'RISK_CONTROL_MANAGER' }, data: { permissions: role!.permissions } });
            }
        });

        it('AUDITEE dar kapsamlı raporu görür ama kurum geneli raporda 403', async () => {
            await request(app.getHttpServer())
                .get('/reports/bulgu-takip').set('Authorization', `Bearer ${auditeeToken}`).expect(200);
            await request(app.getHttpServer())
                .get('/reports/dashboard').set('Authorization', `Bearer ${auditeeToken}`).expect(403);
            await request(app.getHttpServer())
                .get('/reports/monthly/word').set('Authorization', `Bearer ${auditeeToken}`).expect(403);
        });

        it('AUDITOR varsayılanı: dar kapsamlı raporlar 200, kurum geneli 403 (report:org rolden gelmez)', async () => {
            const audId = (await createTestUser(prisma, roleIds['AUDITOR'], { email: 'sec-aud@e2e.local' })).id; void audId;
            const audTok = await login('sec-aud@e2e.local');
            await request(app.getHttpServer()).get('/reports/bulgu-takip').set('Authorization', `Bearer ${audTok}`).expect(200);
            await request(app.getHttpServer()).get('/reports/executive-summary').set('Authorization', `Bearer ${audTok}`).expect(403);
        });
    });

    // ─── Madde 4: Rapor kapsamı ──────────────────────────────────────────
    describe('bulgu-takip kapsamı', () => {
        it('report:org olmayan kullanıcı yalnızca kendine atanmış bulguları görür; directorateId genişletmez', async () => {
            const dir = await createTestDirectorate(prisma);
            const ctrl = await createTestControl(prisma, { ownerId: adminId, directorateId: dir.id });
            const ct = await createTestControlTest(prisma, { controlId: ctrl.id, assigneeId: adminId });

            // iks kullanıcısına atanmış bulgu
            const mine = await request(app.getHttpServer()).post('/findings').set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'IKS kullanıcısına atanmış yeterince uzun bulgu metni', summary: 'benim',
                    status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id, assigneeId: iksId }).expect(201);
            // başka kullanıcıya atanmış bulgu
            await request(app.getHttpServer()).post('/findings').set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Başka kullanıcıya atanmış yeterince uzun bulgu metni', summary: 'başkası',
                    status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id, assigneeId: adminId }).expect(201);

            const res = await request(app.getHttpServer())
                .get(`/reports/bulgu-takip?directorateId=${dir.id}`)
                .set('Authorization', `Bearer ${iksToken}`).expect(200);

            const ids: string[] = JSON.stringify(res.body).match(/"id":"[^"]+"/g) || [];
            expect(JSON.stringify(res.body)).toContain(mine.body.id);
            expect(JSON.stringify(res.body)).not.toContain('başkası');
            void ids;
        });
    });

    // ─── Madde 3: Generic update ile workflow atlatma ─────────────────────
    describe('updateFinding — durum geçişi genel PUT ile engellenir', () => {
        let findingId: string;
        beforeAll(async () => {
            const dir = await createTestDirectorate(prisma);
            const ctrl = await createTestControl(prisma, { ownerId: adminId, directorateId: dir.id });
            const ct = await createTestControlTest(prisma, { controlId: ctrl.id, assigneeId: adminId });
            findingId = (await request(app.getHttpServer()).post('/findings').set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Genel güncelleme testi için yeterince uzun bulgu metni', summary: 's',
                    status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id }).expect(201)).body.id;
        });

        it('workflowStatus genel PUT ile → 400', async () => {
            await request(app.getHttpServer()).put(`/findings/${findingId}`).set('Authorization', `Bearer ${managerToken}`)
                .send({ workflowStatus: 'MUTABAKAT_YAPILDI' }).expect(400);
        });
        it('resolutionStatus genel PUT ile → 400', async () => {
            await request(app.getHttpServer()).put(`/findings/${findingId}`).set('Authorization', `Bearer ${managerToken}`)
                .send({ resolutionStatus: 'KAPATILDI' }).expect(400);
        });
        it('status=CLOSED genel PUT ile → 400', async () => {
            await request(app.getHttpServer()).put(`/findings/${findingId}`).set('Authorization', `Bearer ${managerToken}`)
                .send({ status: 'CLOSED' }).expect(400);
        });
        it('ara statü (PARTIALLY_CLOSED) genel PUT ile geçer', async () => {
            await request(app.getHttpServer()).put(`/findings/${findingId}`).set('Authorization', `Bearer ${managerToken}`)
                .send({ status: 'PARTIALLY_CLOSED' }).expect(200);
        });
    });

    // ─── Madde 3: Onaylı kapanış ─────────────────────────────────────────
    describe('closeFinding', () => {
        it('açık aksiyon varken kapatılamaz; tüm aksiyonlar KAPATILDI + gerekçe ile kapanır', async () => {
            const dir = await createTestDirectorate(prisma);
            const ctrl = await createTestControl(prisma, { ownerId: adminId, directorateId: dir.id });
            const ct = await createTestControlTest(prisma, { controlId: ctrl.id, assigneeId: adminId });
            const fId = (await request(app.getHttpServer()).post('/findings').set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Kapanış testi için yeterince uzun bulgu metni', summary: 's',
                    status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id }).expect(201)).body.id;

            const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
            const action = (await request(app.getHttpServer()).post(`/findings/${fId}/actions`).set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Kapanış testi aksiyonu yeterince uzun açıklama', ownerId: adminId, dueDate }).expect(201)).body;

            // Aksiyon TAMAMLANDI ama KAPATILDI değil → kapanış reddedilir
            await request(app.getHttpServer()).put(`/findings/${fId}/actions/${action.id}`).set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'TAMAMLANDI' }).expect(200);
            await request(app.getHttpServer()).post(`/findings/${fId}/workflow/kapat`).set('Authorization', `Bearer ${managerToken}`)
                .send({ reason: 'test' }).expect(400);

            // Aksiyon KAPATILDI → kapanış geçer, closedDate sunucuda üretilir
            await request(app.getHttpServer()).put(`/findings/${fId}/actions/${action.id}`).set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'KAPATILDI' }).expect(200);
            const closed = await request(app.getHttpServer()).post(`/findings/${fId}/workflow/kapat`).set('Authorization', `Bearer ${managerToken}`)
                .send({ reason: 'tüm aksiyonlar tamam' }).expect(201);
            expect(closed.body.status).toBe('CLOSED');
            expect(closed.body.closedDate).toBeTruthy();
        });

        it('sıfır aksiyonlu bulgu kapatılamaz', async () => {
            const dir = await createTestDirectorate(prisma);
            const ctrl = await createTestControl(prisma, { ownerId: adminId, directorateId: dir.id });
            const ct = await createTestControlTest(prisma, { controlId: ctrl.id, assigneeId: adminId });
            const fId = (await request(app.getHttpServer()).post('/findings').set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Sıfır aksiyonlu kapanış testi yeterince uzun metin', summary: 's',
                    status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id }).expect(201)).body.id;
            await request(app.getHttpServer()).post(`/findings/${fId}/workflow/kapat`).set('Authorization', `Bearer ${managerToken}`)
                .send({ reason: 'x' }).expect(400);
        });
    });

    // ─── Madde 5/6: Eşzamanlı takip onayı tek sonuç üretir ───────────────
    describe('eşzamanlı takip onayı', () => {
        async function setupApprovableFollowUp() {
            const dir = await createTestDirectorate(prisma);
            const ctrl = await createTestControl(prisma, { ownerId: adminId, directorateId: dir.id });
            const ct = await createTestControlTest(prisma, { controlId: ctrl.id, assigneeId: adminId });
            const fId = (await request(app.getHttpServer()).post('/findings').set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Onay akışı testi için yeterince uzun bulgu metni', summary: 's',
                    status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id }).expect(201)).body.id;
            const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
            const action = (await request(app.getHttpServer()).post(`/findings/${fId}/actions`).set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Onay akışı aksiyonu yeterince uzun açıklama', ownerId: adminId, dueDate }).expect(201)).body;
            const fu = (await request(app.getHttpServer()).get(`/findings/${fId}/follow-ups`).set('Authorization', `Bearer ${adminToken}`).expect(200))
                .body.find((f: any) => f.actionId === action.id);
            // admin: değerlendirme = YETERLI (evaluator=admin)
            await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fu.id}`).set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'TAMAMLANDI', result: 'YETERLI' }).expect(200);
            // ikinci kontrolcü ayrı, gerekçeli işlemle atanır
            await request(app.getHttpServer()).post(`/findings/${fId}/follow-ups/${fu.id}/second-controller`).set('Authorization', `Bearer ${adminToken}`)
                .send({ secondControllerId: managerId, reason: 'e2e' }).expect(201);
            return { fId, fuId: fu.id };
        }

        it('paralel iki onay isteği tek aksiyon-kapanışı üretir', async () => {
            const { fId, fuId } = await setupApprovableFollowUp();
            const [r1, r2] = await Promise.all([
                request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fuId}`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'ONAYLANDI' }),
                request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fuId}`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'ONAYLANDI' }),
            ]);
            expect([r1.status, r2.status].every((s) => s === 200)).toBe(true);

            const closedActions = await prisma.action.findMany({ where: { findingId: fId, status: 'KAPATILDI' } });
            expect(closedActions).toHaveLength(1);
            const trail = await prisma.findingStatusHistory.findMany({ where: { findingId: fId, operation: 'ACTION_CLOSED' } });
            expect(trail.length).toBeLessThanOrEqual(1);
        });

        it('atanmış ikinci kontrolcü dışında biri (evaluator dahil) onaylayamaz', async () => {
            const { fId, fuId } = await setupApprovableFollowUp();
            // admin evaluator idi → onaylayamaz (hem self hem second-controller değil)
            await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fuId}`).set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'ONAYLANDI' }).expect(403);
        });

        it('tekrarlanan başarılı onay isteği ikinci kez yan etki üretmez (idempotent)', async () => {
            const { fId, fuId } = await setupApprovableFollowUp();
            await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fuId}`).set('Authorization', `Bearer ${managerToken}`)
                .send({ status: 'ONAYLANDI' }).expect(200);
            const second = await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fuId}`).set('Authorization', `Bearer ${managerToken}`)
                .send({ status: 'ONAYLANDI' }).expect(200);
            expect(second.body.approvalStatus).toBe('ONAYLANDI');
            const trail = await prisma.findingStatusHistory.findMany({ where: { findingId: fId, operation: 'ACTION_CLOSED' } });
            expect(trail).toHaveLength(1);
        });

        it('onaylı takipte result değiştirip yeniden onaylama → reddedilir', async () => {
            const { fId, fuId } = await setupApprovableFollowUp();
            await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fuId}`).set('Authorization', `Bearer ${managerToken}`)
                .send({ status: 'ONAYLANDI' }).expect(200);
            await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fuId}`).set('Authorization', `Bearer ${adminToken}`)
                .send({ result: 'YETERSIZ' }).expect(400);
        });

        it('transaction: aksiyon yazımından sonra hata → onay/aksiyon/takip/bulgu/log tümü rollback; retry başarılı', async () => {
            const dir = await createTestDirectorate(prisma);
            const ctrl = await createTestControl(prisma, { ownerId: adminId, directorateId: dir.id });
            const ct = await createTestControlTest(prisma, { controlId: ctrl.id, assigneeId: adminId });
            const fId = (await request(app.getHttpServer()).post('/findings').set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Rollback testi için yeterince uzun bulgu metni', summary: 's',
                    status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id }).expect(201)).body.id;
            const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
            const action = (await request(app.getHttpServer()).post(`/findings/${fId}/actions`).set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Rollback testi aksiyonu yeterince uzun açıklama', ownerId: adminId, dueDate }).expect(201)).body;
            const fu = (await request(app.getHttpServer()).get(`/findings/${fId}/follow-ups`).set('Authorization', `Bearer ${adminToken}`).expect(200))
                .body.find((f: any) => f.actionId === action.id);
            await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fu.id}`).set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'TAMAMLANDI', result: 'YENI_AKSIYON_GEREKLI',
                    newAction: { description: 'Geçici — geçersiz tarihle rollback', ownerId: adminId, dueDate } }).expect(200);
            await request(app.getHttpServer()).post(`/findings/${fId}/follow-ups/${fu.id}/second-controller`).set('Authorization', `Bearer ${adminToken}`)
                .send({ secondControllerId: managerId, reason: 'e2e' }).expect(201);

            // Onayda newAction.dueDate GEÇERSİZ → createAction tx içinde patlar → tüm zincir rollback
            await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fu.id}`).set('Authorization', `Bearer ${managerToken}`)
                .send({ status: 'ONAYLANDI', newAction: { description: 'x', ownerId: adminId, dueDate: 'GECERSIZ-TARIH' } })
                .expect((r) => { if (r.status < 400) throw new Error(`beklenen hata, alınan ${r.status}`); });

            const fuAfter = await prisma.findingFollowUp.findUnique({ where: { id: fu.id } });
            expect(fuAfter?.approvalStatus).not.toBe('ONAYLANDI');
            expect(fuAfter?.status).not.toBe('ONAYLANDI');
            expect(await prisma.action.count({ where: { findingId: fId } })).toBe(1); // yalnız orijinal
            expect(await prisma.findingStatusHistory.count({ where: { findingId: fId, operation: 'FOLLOWUP_COMPLETED' } })).toBe(0);

            // Retry — geçerli tarihle → başarı
            const goodDate = new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0];
            await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fu.id}`).set('Authorization', `Bearer ${managerToken}`)
                .send({ status: 'ONAYLANDI', newAction: { description: 'Gerçek yeni aksiyon açıklaması', ownerId: adminId, dueDate: goodDate } })
                .expect(200);
            expect(await prisma.action.count({ where: { findingId: fId } })).toBe(2);
        });

        it('paralel iki YENI_AKSIYON_GEREKLI onayı → tek yeni aksiyon', async () => {
            const dir = await createTestDirectorate(prisma);
            const ctrl = await createTestControl(prisma, { ownerId: adminId, directorateId: dir.id });
            const ct = await createTestControlTest(prisma, { controlId: ctrl.id, assigneeId: adminId });
            const fId = (await request(app.getHttpServer()).post('/findings').set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Paralel yeni aksiyon testi yeterince uzun bulgu metni', summary: 's',
                    status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id }).expect(201)).body.id;
            const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
            const action = (await request(app.getHttpServer()).post(`/findings/${fId}/actions`).set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Paralel yeni aksiyon aksiyonu yeterince uzun açıklama', ownerId: adminId, dueDate }).expect(201)).body;
            const fu = (await request(app.getHttpServer()).get(`/findings/${fId}/follow-ups`).set('Authorization', `Bearer ${adminToken}`).expect(200))
                .body.find((f: any) => f.actionId === action.id);
            await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fu.id}`).set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'TAMAMLANDI', result: 'YENI_AKSIYON_GEREKLI',
                    newAction: { description: 'y', ownerId: adminId, dueDate } }).expect(200);
            await request(app.getHttpServer()).post(`/findings/${fId}/follow-ups/${fu.id}/second-controller`).set('Authorization', `Bearer ${adminToken}`)
                .send({ secondControllerId: managerId, reason: 'e2e' }).expect(201);

            const na = { description: 'Paralel yeni düzeltici aksiyon açıklaması', ownerId: adminId, dueDate };
            const [a, b] = await Promise.all([
                request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fu.id}`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'ONAYLANDI', newAction: na }),
                request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fu.id}`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'ONAYLANDI', newAction: na }),
            ]);
            expect([a.status, b.status].every((s) => s === 200)).toBe(true);
            expect(await prisma.action.count({ where: { findingId: fId } })).toBe(2); // orijinal + 1 yeni
        });

        describe('audit kapsamı (Madde 6)', () => {
            it('rol izin değişikliği PERMISSION_CHANGE olarak, aynı transaction\'da loglanır', async () => {
                const role = await prisma.role.findUnique({ where: { name: 'VIEWER' } });
                await request(app.getHttpServer()).put(`/admin/roles/${role!.id}`).set('Authorization', `Bearer ${adminToken}`)
                    .send({ permissions: [...(role!.permissions as string[]), 'report:view'] }).expect(200);
                const log = await prisma.auditLog.findFirst({
                    where: { entityType: 'Role', entityId: role!.id, action: 'PERMISSION_CHANGE' },
                    orderBy: { createdAt: 'desc' },
                });
                expect(log).toBeTruthy();
                expect((log!.oldValue as any).permissions).not.toContain('report:view');
                expect((log!.newValue as any).permissions).toContain('report:view');
                // geri al
                await prisma.role.update({ where: { id: role!.id }, data: { permissions: role!.permissions } });
            });

            it('kullanıcı rol değişikliği ROLE_CHANGE olarak loglanır', async () => {
                const u = await createTestUser(prisma, roleIds['VIEWER'], { email: 'sec-rolechg@e2e.local' });
                await request(app.getHttpServer()).put(`/admin/users/${u.id}`).set('Authorization', `Bearer ${adminToken}`)
                    .send({ roleId: roleIds['AUDITEE'] }).expect(200);
                const log = await prisma.auditLog.findFirst({
                    where: { entityType: 'User', entityId: u.id, action: 'ROLE_CHANGE' },
                });
                expect(log).toBeTruthy();
                expect((log!.oldValue as any).roleName).toBe('VIEWER');
                expect((log!.newValue as any).roleName).toBe('AUDITEE');
            });

            it('kullanıcı aktiflik değişikliği USER_ACTIVATION_CHANGE olarak loglanır', async () => {
                const u = await createTestUser(prisma, roleIds['VIEWER'], { email: 'sec-actchg@e2e.local' });
                await request(app.getHttpServer()).put(`/admin/users/${u.id}`).set('Authorization', `Bearer ${adminToken}`)
                    .send({ isActive: false }).expect(200);
                const log = await prisma.auditLog.findFirst({
                    where: { entityType: 'User', entityId: u.id, action: 'USER_ACTIVATION_CHANGE' },
                });
                expect(log).toBeTruthy();
            });

            it('audit kayıtları normal API üzerinden değiştirilemez/silinemez (yazma endpoint yok)', async () => {
                const anyLog = await prisma.auditLog.findFirst();
                await request(app.getHttpServer()).put(`/admin/audit-logs/${anyLog!.id}`).set('Authorization', `Bearer ${adminToken}`).send({ action: 'HACK' }).expect(404);
                await request(app.getHttpServer()).delete(`/admin/audit-logs/${anyLog!.id}`).set('Authorization', `Bearer ${adminToken}`).expect(404);
            });
        });

        describe('ikinci kontrolcü ataması (Madde 4)', () => {
            it('gerekçe zorunlu', async () => {
                const { fId, fuId } = await setupApprovableFollowUpNoSC();
                await request(app.getHttpServer()).post(`/findings/${fId}/follow-ups/${fuId}/second-controller`).set('Authorization', `Bearer ${managerToken}`)
                    .send({ secondControllerId: managerId }).expect(400);
            });
            it('yetkisiz rol atayamaz', async () => {
                const { fId, fuId } = await setupApprovableFollowUpNoSC();
                await request(app.getHttpServer()).post(`/findings/${fId}/follow-ups/${fuId}/second-controller`).set('Authorization', `Bearer ${iksToken}`)
                    .send({ secondControllerId: managerId, reason: 'x' }).expect(403);
            });
            it('değerlendiren kişi ikinci kontrolcü atanamaz', async () => {
                const { fId, fuId } = await setupApprovableFollowUpNoSC(); // evaluator = admin
                await request(app.getHttpServer()).post(`/findings/${fId}/follow-ups/${fuId}/second-controller`).set('Authorization', `Bearer ${managerToken}`)
                    .send({ secondControllerId: adminId, reason: 'x' }).expect(400);
            });
            it('atama loglanır (eski/yeni + gerekçe)', async () => {
                const { fId, fuId } = await setupApprovableFollowUpNoSC();
                await request(app.getHttpServer()).post(`/findings/${fId}/follow-ups/${fuId}/second-controller`).set('Authorization', `Bearer ${managerToken}`)
                    .send({ secondControllerId: managerId, reason: 'ilk atama' }).expect(201);
                const trail = await prisma.findingStatusHistory.findMany({ where: { findingId: fId, operation: 'SECOND_CONTROLLER_ASSIGNED' } });
                expect(trail).toHaveLength(1);
                expect(trail[0].newValue).toBe(managerId);
            });
        });

        async function setupApprovableFollowUpNoSC() {
            const dir = await createTestDirectorate(prisma);
            const ctrl = await createTestControl(prisma, { ownerId: adminId, directorateId: dir.id });
            const ct = await createTestControlTest(prisma, { controlId: ctrl.id, assigneeId: adminId });
            const fId = (await request(app.getHttpServer()).post('/findings').set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'SC atama testi için yeterince uzun bulgu metni', summary: 's',
                    status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id }).expect(201)).body.id;
            const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
            const action = (await request(app.getHttpServer()).post(`/findings/${fId}/actions`).set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'SC atama aksiyonu yeterince uzun açıklama', ownerId: adminId, dueDate }).expect(201)).body;
            const fu = (await request(app.getHttpServer()).get(`/findings/${fId}/follow-ups`).set('Authorization', `Bearer ${adminToken}`).expect(200))
                .body.find((f: any) => f.actionId === action.id);
            await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fu.id}`).set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'TAMAMLANDI', result: 'YETERLI' }).expect(200);
            return { fId, fuId: fu.id };
        }

        it('generate-due-followups: paralel çağrılar mükerrer takip üretmez (advisory lock)', async () => {
            const dir = await createTestDirectorate(prisma);
            const ctrl = await createTestControl(prisma, { ownerId: adminId, directorateId: dir.id });
            const ct = await createTestControlTest(prisma, { controlId: ctrl.id, assigneeId: adminId });
            const fId = (await request(app.getHttpServer()).post('/findings').set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Cron idempotency testi için yeterince uzun bulgu metni', summary: 's',
                    status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id }).expect(201)).body.id;
            const pastDue = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0];
            const action = (await request(app.getHttpServer()).post(`/findings/${fId}/actions`).set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Süresi geçmiş aksiyon yeterince uzun açıklama', ownerId: adminId, dueDate: pastDue }).expect(201)).body;
            // Auto-oluşan takibi sil ki "açık takip yok" koşulu sağlansın
            const autoFu = (await request(app.getHttpServer()).get(`/findings/${fId}/follow-ups`).set('Authorization', `Bearer ${adminToken}`).expect(200))
                .body.find((f: any) => f.actionId === action.id);
            if (autoFu) {
                await prisma.findingStatusHistory.updateMany({ where: { followUpId: autoFu.id }, data: { followUpId: null } });
                await prisma.findingFollowUp.delete({ where: { id: autoFu.id } });
            }

            await Promise.all([
                request(app.getHttpServer()).post('/findings/generate-due-followups').set('Authorization', `Bearer ${managerToken}`),
                request(app.getHttpServer()).post('/findings/generate-due-followups').set('Authorization', `Bearer ${managerToken}`),
                request(app.getHttpServer()).post('/findings/generate-due-followups').set('Authorization', `Bearer ${managerToken}`),
            ]);

            const fus = await prisma.findingFollowUp.findMany({ where: { actionId: action.id } });
            expect(fus.length).toBe(1);
        });

        it('generate-due-followups: AYRI bağlantı (başka instance) kilidi tutarken çağrı ATLANIR', async () => {
            // "Başka bir uygulama instance'ı" simülasyonu — ayrı fiziksel bağlantıda,
            // açık transaction içinde advisory xact lock tut.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { Client } = require('pg');
            const client = new Client({ connectionString: process.env.DATABASE_URL });
            await client.connect();
            await client.query('BEGIN');
            const held = await client.query('SELECT pg_try_advisory_xact_lock(748120345) AS locked');
            expect(held.rows[0].locked).toBe(true);
            try {
                const res = await request(app.getHttpServer())
                    .post('/findings/generate-due-followups')
                    .set('Authorization', `Bearer ${managerToken}`)
                    .expect(201);
                expect(res.body.skipped).toBe(true);
                expect(res.body.generatedCount).toBe(0);
            } finally {
                await client.query('ROLLBACK'); // kilit otomatik bırakılır
                await client.end();
            }
        });

        it('ikinci kontrolcü atanmamış takip onaylanamaz', async () => {
            const dir = await createTestDirectorate(prisma);
            const ctrl = await createTestControl(prisma, { ownerId: adminId, directorateId: dir.id });
            const ct = await createTestControlTest(prisma, { controlId: ctrl.id, assigneeId: adminId });
            const fId = (await request(app.getHttpServer()).post('/findings').set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'İkinci kontrolcüsüz onay testi yeterince uzun bulgu metni', summary: 's',
                    status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id }).expect(201)).body.id;
            const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
            const action = (await request(app.getHttpServer()).post(`/findings/${fId}/actions`).set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'İkinci kontrolcüsüz onay aksiyonu yeterince uzun açıklama', ownerId: adminId, dueDate }).expect(201)).body;
            const fu = (await request(app.getHttpServer()).get(`/findings/${fId}/follow-ups`).set('Authorization', `Bearer ${adminToken}`).expect(200))
                .body.find((f: any) => f.actionId === action.id);
            await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fu.id}`).set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'TAMAMLANDI', result: 'YETERLI' }).expect(200);
            await request(app.getHttpServer()).put(`/findings/${fId}/follow-ups/${fu.id}`).set('Authorization', `Bearer ${managerToken}`)
                .send({ status: 'ONAYLANDI' }).expect(403);
        });
    });
});
