import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, createTestControlTest, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Kontrol Envanteri — yönetici onaylı kontrol silme (kullanıcı kararı 2026-11):
 * - Talebi kontrol oluşturabilen roller açar (SYSTEM_ADMIN, RCM, AUDITOR); karar yöneticide, talep eden karar veremez.
 * - Yalnız geçmişi olmayan kontrol silinir: başlamış/tamamlanmış test, bulgu veya aksiyon varsa talep reddedilir.
 * - Onayda başlamamış testler iptal, dönem kontrolü kaldırılır, plan taslağı ve risk eşleştirmeleri temizlenir;
 *   kontrol "Silindi" (deletedAt) olur, envanterden ve aramadan düşer, düzenlenemez; kayıt ve kod korunur.
 */
describe('E2E — kontrol silme (yönetici onaylı)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    let n = 0;
    const newControl = async (who = 'auditor') => (await http().post('/controls').set(as(who)).send({
        controlId: `BTK.${8800 + ++n}`, name: `Silme testi kontrolü ${n}`, description: 'Tanım', frequency: 'QUARTERLY',
    }).expect(201)).body as { id: string; controlId: string };
    const requestDel = (who: string, cid: string, reason = 'Yanlışlıkla oluşturuldu') =>
        http().post('/deletion-requests').set(as(who)).send({ entityType: 'CONTROL', entityId: cid, reason });

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role] of [['admin', 'SYSTEM_ADMIN'], ['manager', 'RISK_CONTROL_MANAGER'], ['manager2', 'RISK_CONTROL_MANAGER'], ['auditor', 'AUDITOR'], ['auditee', 'AUDITEE']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `cd-${key}@e2e.local`, firstName: key, lastName: 'Kişi' });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `cd-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
    });
    afterAll(async () => { await app.close(); });

    it('geçmişsiz kontrol: denetçi talep eder, kendisi/başka denetçi karar veremez; yönetici onaylar → bağlı kayıtlar temizlenir, kontrol listeden düşer', async () => {
        const c = await newControl();
        const cat = await prisma.riskCategory.create({ data: { name: `Silme testi kategorisi ${n}` } });
        const risk = await prisma.risk.create({
            data: { riskId: `R-CD-${n}`, name: 'Silme testi riski', description: 'Silme testi riski açıklaması', ownerId: id.admin, categoryId: cat.id, status: 'IDENTIFIED', inherentProbability: 2, inherentImpact: 3, inherentRiskScore: 6 } as any,
        });
        await prisma.controlRiskMapping.create({ data: { controlId: c.id, riskId: risk.id } });
        const scope = await prisma.controlYearScope.create({ data: { controlId: c.id, year: 2030, status: 'ACTIVE', frequency: 'QUARTERLY', addedById: id.admin } as any });
        const pendingTest = await createTestControlTest(prisma, { controlId: c.id, status: 'BEKLIYOR' });
        await prisma.controlTest.update({ where: { id: pendingTest.id }, data: { scopeId: scope.id } });

        await requestDel('auditee', c.id).expect(403);
        await requestDel('auditor', c.id, '').expect(400);
        const r = await requestDel('auditor', c.id).expect(201);
        expect(r.body.requested).toBe(true);
        await requestDel('manager', c.id).expect(409); // zaten bekleyen talep var

        // Bekleyen talep kutuda; talep eden karar veremez, denetçi karar veremez.
        const box = (await http().get('/deletion-requests').set(as('manager')).expect(200)).body as any[];
        expect(box.find(x => x.type === 'CONTROL' && x.id === c.id)).toMatchObject({ code: c.controlId, canDecide: true, href: `/controls/${c.id}` });
        await http().post(`/deletion-requests/CONTROL/${c.id}/approve`).set(as('auditor')).expect(403);

        await http().post(`/deletion-requests/CONTROL/${c.id}/approve`).set(as('manager')).expect(201);
        const after = await prisma.control.findUniqueOrThrow({ where: { id: c.id } });
        expect(after.deletedAt).not.toBeNull();
        expect(after.deletionDecidedById).toBe(id.manager);
        expect((await prisma.controlTest.findUniqueOrThrow({ where: { id: pendingTest.id } })).status).toBe('IPTAL');
        expect((await prisma.controlYearScope.findUniqueOrThrow({ where: { id: scope.id } })).status).toBe('REMOVED');
        expect(await prisma.controlRiskMapping.count({ where: { controlId: c.id } })).toBe(0);
        const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: c.id, action: 'DELETE_APPROVE' } });
        expect((audit.oldValue as any).riskMappings).toEqual([expect.objectContaining({ riskId: risk.id })]);

        // Envanterden ve aramadan düşer; detay "Silindi" bilgisiyle açılır; düzenleme/pasifleştirme reddedilir.
        const list = (await http().get('/controls?limit=200').set(as('admin')).expect(200)).body;
        expect((list.data ?? list).some((x: any) => x.id === c.id)).toBe(false);
        const detail = (await http().get(`/controls/${c.id}`).set(as('admin')).expect(200)).body;
        expect(detail.deletedAt).toBeTruthy();
        await http().put(`/controls/${c.id}`).set(as('admin')).send({ name: 'değişti' }).expect(400);
        await http().patch(`/controls/${c.id}/passivate`).set(as('admin')).expect(400);
        // Kod tekrar kullanılamaz (kayıt korunur).
        await http().post('/controls').set(as('admin')).send({ controlId: c.controlId, name: 'x', frequency: 'QUARTERLY' }).expect(409);
    });

    it('geçmişi olan kontrol (başlamış test / bulgu) silinemez; pasifleştirme önerilir. Onay anında kullanılmaya başlanmışsa da reddedilir', async () => {
        const started = await newControl();
        await createTestControlTest(prisma, { controlId: started.id, status: 'DEVAM_EDIYOR' });
        const r = await requestDel('auditor', started.id).expect(409);
        expect(r.body.message).toContain('pasifleştirin');

        const withFinding = await newControl();
        await prisma.finding.create({ data: { findingId: `B-CD-${n}`, description: 'Silme testi bulgusu', impact: 'etki', severity: 'HIGH', controlId: withFinding.id } as any });
        expect((await requestDel('auditor', withFinding.id).expect(409)).body.message).toContain('1 bulgu');

        // Talep geçmişsizken açıldı, onaydan önce test başladı → onay reddedilir.
        const race = await newControl();
        await requestDel('auditor', race.id).expect(201);
        await createTestControlTest(prisma, { controlId: race.id, status: 'TAMAMLANDI' });
        await http().post(`/deletion-requests/CONTROL/${race.id}/approve`).set(as('manager')).expect(409);
        expect((await prisma.control.findUniqueOrThrow({ where: { id: race.id } })).deletedAt).toBeNull();
    });

    it('ret: gerekçe zorunlu, talep eden reddedemez; kontrol mevcut haliyle kalır ve yeniden talep açılabilir', async () => {
        const c = await newControl('manager');
        await requestDel('manager', c.id).expect(201);
        await http().post(`/deletion-requests/CONTROL/${c.id}/reject`).set(as('manager')).send({ reason: 'x' }).expect(403);
        await http().post(`/deletion-requests/CONTROL/${c.id}/reject`).set(as('manager2')).send({}).expect(400);
        await http().post(`/deletion-requests/CONTROL/${c.id}/reject`).set(as('manager2')).send({ reason: 'Kontrol 2031 planında kullanılacak' }).expect(201);
        const row = await prisma.control.findUniqueOrThrow({ where: { id: c.id } });
        expect(row).toMatchObject({ deletedAt: null, deletionRequestedAt: null, deletionRejectionReason: 'Kontrol 2031 planında kullanılacak' });
        await requestDel('auditor', c.id).expect(201);
    });
});
