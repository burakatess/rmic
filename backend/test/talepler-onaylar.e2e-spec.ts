import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, createTestControl, createTestControlTest, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Talepler & Onaylar:
 * - Onaya gönderilen her kayıtta kimin onayında olduğu görünür (atanmış 2. kontrolcü / onaylayabilecek yöneticiler).
 * - Gönderen kişi, karar verilmeden önce onay talebini (test, aksiyon, takip, bulgu kapanışı) ve silme talebini geri çekebilir.
 * - "Taleplerim" (GET /workflow-approvals/mine) gönderilen ve karar bekleyen talepleri onaylayıcılarıyla listeler.
 */
describe('E2E — Talepler & Onaylar: kimin onayında, geri çekme, taleplerim', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];
    const wf = (who: string, type: string, eid: string, action: string, reason?: string) =>
        http().post(`/workflow/${type}/${eid}/transition`).set(as(who)).send({ action, ...(reason ? { reason } : {}) });
    const mine = async (who: string) => (await http().get('/workflow-approvals/mine').set(as(who)).expect(200)).body.items as any[];
    const inbox = async (who: string) => (await http().get('/workflow-approvals').set(as(who)).expect(200)).body.items as any[];

    async function findingWithAction() {
        const f = await http().post('/findings').set(as('maker')).send({
            description: 'Talepler ve onaylar testi için yeterince uzun bulgu metni', summary: 'Talep bulgusu',
            severity: 'HIGH', firstControllerId: id.maker, secondControllerId: id.checker,
        }).expect(201);
        const a = await http().post(`/findings/${f.body.id}/actions`).set(as('maker')).send({
            description: 'Talepler ve onaylar testi düzeltici aksiyonu', ownerId: id.maker, dueDate: day(30),
            firstControllerId: id.maker, secondControllerId: id.checker,
        }).expect(201);
        return { fId: f.body.id as string, aId: a.body.id as string };
    }

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role, first] of [['admin', 'SYSTEM_ADMIN', 'Sistem'], ['checker', 'RISK_CONTROL_MANAGER', 'Ahmet'], ['manager2', 'RISK_CONTROL_MANAGER', 'Fatma'], ['maker', 'AUDITOR', 'Mehmet'], ['other', 'AUDITOR', 'Ali']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `to-${key}@e2e.local`, firstName: first, lastName: key });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `to-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
    });
    afterAll(async () => { await app.close(); });

    it('aksiyon: onayda kimin onayında görünür; gönderen geri çeker → taslak, onaylayıcının kutusundan düşer; başkası/karar sonrası geri çekemez', async () => {
        const { aId } = await findingWithAction();
        await wf('maker', 'ACTION', aId, 'COMPLETE').expect(201);

        const state = (await http().get(`/workflow/ACTION/${aId}`).set(as('maker')).expect(200)).body;
        expect(state.approval.approvers).toEqual([expect.objectContaining({ id: id.checker })]);
        expect(state.actions.map((a: any) => a.action)).toContain('WITHDRAW');
        const my = (await mine('maker')).find(i => i.recordId === aId);
        expect(my).toMatchObject({ kind: 'ACTION_APPROVAL', approvers: [expect.objectContaining({ id: id.checker })], withdraw: { via: 'WORKFLOW', entityType: 'ACTION' } });
        expect((await inbox('checker')).some(i => i.recordId === aId)).toBe(true);

        await wf('other', 'ACTION', aId, 'WITHDRAW').expect((r) => expect([403, 404]).toContain(r.status));
        await wf('maker', 'ACTION', aId, 'WITHDRAW', 'Hedef tarihi düzelteceğim').expect(201);
        expect((await prisma.action.findUniqueOrThrow({ where: { id: aId } })).approvalState).toBe('TASLAK');
        expect((await inbox('checker')).some(i => i.recordId === aId)).toBe(false);
        expect((await mine('maker')).some(i => i.recordId === aId)).toBe(false);
        const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: aId, action: 'ACTION_WITHDRAW' } });
        expect((log.newValue as any).note).toBe('Hedef tarihi düzelteceğim');
        const hist = (await http().get(`/workflow/ACTION/${aId}`).set(as('maker')).expect(200)).body.history;
        expect(hist[0]).toMatchObject({ action: 'WITHDRAW', actionLabel: 'Onaydan geri çek' });

        // Karar verildikten sonra geri çekilemez.
        await wf('maker', 'ACTION', aId, 'COMPLETE').expect(201);
        await wf('checker', 'ACTION', aId, 'APPROVE').expect(201);
        await wf('maker', 'ACTION', aId, 'WITHDRAW').expect(409);
    });

    it('takip ve bulgu kapanışı geri çekilir; değerlendirme korunur, bulgu açık kalır', async () => {
        const { fId, aId } = await findingWithAction();
        await wf('maker', 'ACTION', aId, 'COMPLETE').expect(201);
        await wf('checker', 'ACTION', aId, 'APPROVE').expect(201);
        const fu = await prisma.findingFollowUp.findFirstOrThrow({ where: { actionId: aId } });
        await http().put(`/follow-ups/${fu.id}`).set(as('maker')).send({ result: 'YETERLI', currentStatusDetail: 'Tamam' }).expect(200);
        await http().put(`/follow-ups/${fu.id}`).set(as('maker')).send({ status: 'TAMAMLANDI' }).expect(200);
        expect((await mine('maker')).find(i => i.recordId === fu.id)).toMatchObject({ kind: 'FOLLOWUP_APPROVAL', approvers: [expect.objectContaining({ id: id.checker })] });
        await wf('maker', 'FOLLOW_UP', fu.id, 'WITHDRAW').expect(201);
        const fuAfter = await prisma.findingFollowUp.findUniqueOrThrow({ where: { id: fu.id } });
        expect(fuAfter).toMatchObject({ status: 'DEVAM_EDIYOR', approvalStatus: null, result: 'YETERLI' });
        expect((await inbox('checker')).some(i => i.recordId === fu.id)).toBe(false);

        // Kapanış talebi
        await http().put(`/follow-ups/${fu.id}`).set(as('maker')).send({ status: 'TAMAMLANDI' }).expect(200);
        await http().put(`/follow-ups/${fu.id}`).set(as('checker')).send({ status: 'ONAYLANDI' }).expect(200);
        await wf('maker', 'FINDING', fId, 'COMPLETE', 'Kapanış önerisi').expect(201);
        const st = (await http().get(`/workflow/FINDING/${fId}`).set(as('maker')).expect(200)).body;
        expect(st.approval.approvers).toEqual([expect.objectContaining({ id: id.checker })]);
        expect(st.approval.alsoManagers.map((m: any) => m.id)).toEqual(expect.arrayContaining([id.manager2, id.admin]));
        expect((await mine('maker')).find(i => i.recordId === fId)).toMatchObject({ kind: 'FINDING_CLOSURE' });
        await wf('checker', 'FINDING', fId, 'WITHDRAW').expect(403);
        await wf('maker', 'FINDING', fId, 'WITHDRAW').expect(201);
        expect(await prisma.finding.findUniqueOrThrow({ where: { id: fId } })).toMatchObject({ status: 'PARTIALLY_CLOSED', resolutionStatus: 'KAPANISA_HAZIR', closureSubmittedById: null });
        expect((await inbox('checker')).some(i => i.recordId === fId)).toBe(false);
    });

    it('kontrol testi: testi gönderen geri çeker → Devam Ediyor; 2. kontrolcü geri çekemez', async () => {
        const c = await createTestControl(prisma, { ownerId: id.admin });
        const t = await createTestControlTest(prisma, { controlId: c.id, assigneeId: id.maker, secondControllerId: id.checker, status: 'TAMAMLANDI' });
        await prisma.controlTest.update({ where: { id: t.id }, data: { findingStatus: 'BULGUSU_YOK' } });
        expect((await mine('maker')).find(i => i.recordId === t.id)).toMatchObject({ kind: 'TEST_APPROVAL', approvers: [expect.objectContaining({ id: id.checker })] });
        await wf('checker', 'CONTROL_TEST', t.id, 'WITHDRAW').expect((r) => expect([403, 409]).toContain(r.status));
        await wf('maker', 'CONTROL_TEST', t.id, 'WITHDRAW').expect(201);
        expect((await prisma.controlTest.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('DEVAM_EDIYOR');
        expect(await prisma.auditLog.count({ where: { entityId: t.id, action: 'TEST_WITHDRAW' } })).toBe(1);
    });

    it('silme talebi: karar verebilecek yöneticiler (talep eden hariç) görünür; yalnız talep eden geri çeker, kayıt olduğu gibi kalır', async () => {
        const { aId } = await findingWithAction();
        const approvers = (await http().get('/deletion-requests/approvers').set(as('maker')).expect(200)).body as any[];
        expect(approvers.map(a => a.id).sort()).toEqual([id.admin, id.checker, id.manager2].sort());
        expect((await http().get('/deletion-requests/approvers').set(as('checker')).expect(200)).body.some((a: any) => a.id === id.checker)).toBe(false);

        await http().post('/deletion-requests').set(as('maker')).send({ entityType: 'ACTION', entityId: aId, reason: 'Mükerrer aksiyon' }).expect(201);
        const req = (await mine('maker')).find(i => i.recordId === aId && i.kind === 'DELETION');
        expect(req).toMatchObject({ recordType: 'ACTION', reason: 'Mükerrer aksiyon', withdraw: { via: 'DELETION', type: 'ACTION' } });
        expect(req.approvers.map((a: any) => a.id).sort()).toEqual([id.admin, id.checker, id.manager2].sort());
        const state = (await http().get(`/workflow/ACTION/${aId}`).set(as('maker')).expect(200)).body;
        expect(state.deletion).toMatchObject({ canWithdraw: true, reason: 'Mükerrer aksiyon' });
        expect((await http().get('/deletion-requests').set(as('checker')).expect(200)).body.find((r: any) => r.id === aId)).toMatchObject({ canDecide: true, canWithdraw: false });

        await http().post(`/deletion-requests/ACTION/${aId}/withdraw`).set(as('checker')).send({}).expect(403);
        await http().post(`/deletion-requests/ACTION/${aId}/withdraw`).set(as('maker')).send({ reason: 'Yanlış kayıt seçmişim' }).expect(201);
        const a = await prisma.action.findUniqueOrThrow({ where: { id: aId } });
        expect(a).toMatchObject({ deletionRequestedAt: null, deletionRequestedById: null, deletedAt: null });
        expect((await http().get('/deletion-requests').set(as('checker')).expect(200)).body.some((r: any) => r.id === aId)).toBe(false);
        const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: aId, action: 'DELETE_WITHDRAW' } });
        expect(log.oldValue).toMatchObject({ reason: 'Mükerrer aksiyon' });
        await http().post(`/deletion-requests/ACTION/${aId}/withdraw`).set(as('maker')).send({}).expect(409);
    });
});
