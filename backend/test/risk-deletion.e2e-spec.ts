import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, createTestControl, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Risk Yönetimi silme süreci (Risk Envanteri, Kontrol Alanı, Aksiyon Tablosu):
 * - Doğrudan silme yok; silme talebi yönetici onayına gider, talep eden karar veremez, geri çekebilir.
 * - Onayda kayıt "Silindi" işaretlenir (fiziksel silme yok) ve listelerden düşer.
 * - Bağlı bulgu/aksiyonu olan risk ve riske bağlı kontrol/aksiyon için talep açılmaz.
 * - Talepler "Silme Talepleri" ve "Taleplerim" ekranlarında görünür.
 */
describe('E2E — Risk Yönetimi silme talepleri', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    let categoryId = '';
    let seq = 0;
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const ask = (who: string, entityType: string, entityId: string, reason = 'Mükerrer kayıt') =>
        http().post('/deletion-requests').set(as(who)).send({ entityType, entityId, reason });

    const newRisk = () => prisma.risk.create({
        data: {
            riskId: `R-DEL-${++seq}`, name: `Silinecek risk ${seq}`, description: 'Risk silme testi açıklaması', ownerId: id.admin, categoryId,
            status: 'IDENTIFIED', isOrgWide: true, inherentProbability: 2, inherentImpact: 2, inherentRiskScore: 4,
        },
    });
    const newRiskControl = () => prisma.riskControl.create({ data: { kontrolId: `RC-DEL-${++seq}`, kontrolTanimi: 'Silinecek risk kontrolü' } });
    const newRiskAction = () => prisma.riskAction.create({ data: { aksiyonId: `RA-DEL-${++seq}`, aksiyonTanimi: 'Silinecek risk aksiyonu' } });

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role] of [['admin', 'SYSTEM_ADMIN'], ['manager', 'RISK_CONTROL_MANAGER'], ['manager2', 'RISK_CONTROL_MANAGER'], ['auditor', 'AUDITOR']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `rd-${key}@e2e.local`, firstName: key, lastName: 'Test' });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `rd-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
        categoryId = (await prisma.riskCategory.create({ data: { name: 'Risk Silme Kategori' } })).id;
    });
    afterAll(async () => { await app.close(); });

    it('doğrudan silme uçları kaldırıldı', async () => {
        const r = await newRisk();
        const c = await newRiskControl();
        const a = await newRiskAction();
        await http().delete(`/risks/${r.id}`).set(as('admin')).expect(404);
        await http().delete(`/risk-controls/${c.id}`).set(as('admin')).expect(404);
        await http().delete(`/risk-actions/${a.id}`).set(as('admin')).expect(404);
        expect(await prisma.risk.count({ where: { id: r.id, deletedAt: null } })).toBe(1);
    });

    it('risk: talep → talep eden karar veremez → başka yönetici onaylar; eşleştirmeler kaldırılır, kayıt korunur ve listeden düşer', async () => {
        const r = await newRisk();
        const ctrl = await createTestControl(prisma, { ownerId: id.admin });
        await prisma.controlRiskMapping.create({ data: { controlId: ctrl.id, riskId: r.id } });
        const rc = await newRiskControl();
        await prisma.riskControlRisk.create({ data: { riskControlId: rc.id, riskId: r.id } });

        await ask('auditor', 'RISK', r.id).expect(403);
        await ask('manager', 'RISK', r.id).expect(201);
        await ask('manager', 'RISK', r.id).expect(409);

        const mine = (await http().get('/workflow-approvals/mine').set(as('manager')).expect(200)).body.items as any[];
        expect(mine.find(i => i.recordId === r.id)).toMatchObject({ kind: 'DELETION', recordType: 'RISK', code: r.riskId, withdraw: { via: 'DELETION', type: 'RISK' } });
        const pending = (await http().get('/deletion-requests').set(as('manager2')).expect(200)).body as any[];
        expect(pending.find(p => p.id === r.id)).toMatchObject({ type: 'RISK', canDecide: true });
        expect((await http().get('/deletion-requests').set(as('manager')).expect(200)).body.find((p: any) => p.id === r.id)).toMatchObject({ canDecide: false, canWithdraw: true });

        await http().post(`/deletion-requests/RISK/${r.id}/approve`).set(as('manager')).send({}).expect(403);
        await http().post(`/deletion-requests/RISK/${r.id}/approve`).set(as('manager2')).send({}).expect(201);

        const after = await prisma.risk.findUniqueOrThrow({ where: { id: r.id } });
        expect(after.deletedAt).not.toBeNull();
        expect(after.deletedById).toBe(id.manager2);
        expect(await prisma.controlRiskMapping.count({ where: { riskId: r.id } })).toBe(0);
        expect(await prisma.riskControlRisk.count({ where: { riskId: r.id } })).toBe(0);
        const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: r.id, action: 'DELETE_APPROVE', entityType: 'Risk' } });
        expect((log.newValue as any).controlMappings).toEqual([expect.objectContaining({ controlId: ctrl.id })]);

        const list = (await http().get('/risks?limit=100').set(as('admin')).expect(200)).body.data as any[];
        expect(list.some(x => x.id === r.id)).toBe(false);
        await http().get(`/risks/${r.id}`).set(as('admin')).expect(404);

        const decisions = (await http().get('/workflow-approvals/mine').set(as('manager')).expect(200)).body.decisions as any[];
        expect(decisions.find(d => d.recordId === r.id)).toMatchObject({ kind: 'RISK_DELETED' });
    });

    it('risk: bağlı bulgusu olan risk için talep açılmaz', async () => {
        const r = await newRisk();
        const f = await http().post('/findings').set(as('admin')).send({
            description: 'Risk silme engeli için yeterince uzun bulgu metni', summary: 'Engel bulgusu', severity: 'HIGH',
        }).expect(201);
        await prisma.finding.update({ where: { id: f.body.id }, data: { linkedRisks: { connect: { id: r.id } } } });
        const res = await ask('manager', 'RISK', r.id).expect(409);
        expect(res.body.message).toContain('bağlı bulgu');
    });

    it('Kontrol Alanı: riske bağlı kontrol için talep açılmaz; bağsız kontrol reddedilir, gerekçe kaydedilir, kayıt kalır', async () => {
        const r = await newRisk();
        const linked = await newRiskControl();
        await prisma.riskControlRisk.create({ data: { riskControlId: linked.id, riskId: r.id } });
        expect((await ask('manager', 'RISK_CONTROL', linked.id).expect(409)).body.message).toContain('risk bağlantısı');

        const c = await newRiskControl();
        await ask('manager', 'RISK_CONTROL', c.id).expect(201);
        await http().post(`/deletion-requests/RISK_CONTROL/${c.id}/reject`).set(as('admin')).send({}).expect(400);
        await http().post(`/deletion-requests/RISK_CONTROL/${c.id}/reject`).set(as('admin')).send({ reason: 'Kontrol hâlâ kullanılıyor' }).expect(201);
        expect(await prisma.riskControl.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ deletedAt: null, deletionRequestedAt: null, deletionRejectionReason: 'Kontrol hâlâ kullanılıyor' });
        const decisions = (await http().get('/workflow-approvals/mine').set(as('manager')).expect(200)).body.decisions as any[];
        expect(decisions.find(d => d.recordId === c.id)).toMatchObject({ kind: 'RISK_DELETE_REJECTED', reason: 'Kontrol hâlâ kullanılıyor' });
    });

    it('Aksiyon Tablosu: talep eden geri çeker; onaylanan aksiyon listeden düşer', async () => {
        const a = await newRiskAction();
        await ask('manager', 'RISK_ACTION', a.id).expect(201);
        await http().post(`/deletion-requests/RISK_ACTION/${a.id}/withdraw`).set(as('admin')).send({}).expect(403);
        await http().post(`/deletion-requests/RISK_ACTION/${a.id}/withdraw`).set(as('manager')).send({ reason: 'Vazgeçtim' }).expect(201);
        expect(await prisma.riskAction.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ deletionRequestedAt: null, deletedAt: null });
        expect(await prisma.auditLog.count({ where: { entityId: a.id, action: 'DELETE_WITHDRAW', entityType: 'RiskAction' } })).toBe(1);

        await ask('manager', 'RISK_ACTION', a.id).expect(201);
        await http().post(`/deletion-requests/RISK_ACTION/${a.id}/approve`).set(as('admin')).send({}).expect(201);
        const list = (await http().get('/risk-actions?limit=200').set(as('admin')).expect(200)).body.data as any[];
        expect(list.some(x => x.id === a.id)).toBe(false);
        expect(await prisma.riskAction.count({ where: { id: a.id } })).toBe(1);
    });
});
