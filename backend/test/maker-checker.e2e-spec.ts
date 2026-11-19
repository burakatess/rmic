import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import {
    resetDatabase, seedRoles, createTestUser, createTestDirectorate, createTestControl, createTestControlTest, E2E_TEST_PASSWORD,
} from './helpers/fixtures';

/**
 * Kontrolcü zinciri (kontrol → bulgu → aksiyon → takip) ve maker-checker:
 * aksiyon onay akışı, takip onayını geri alma (yan etkileriyle) ve onaylı silme.
 */
describe('E2E — Kontrolcü zinciri ve maker-checker', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role] of [['admin', 'SYSTEM_ADMIN'], ['maker', 'AUDITOR'], ['checker', 'RISK_CONTROL_MANAGER'], ['checker2', 'RISK_CONTROL_MANAGER']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `mc-${key}@e2e.local` });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `mc-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
    });
    afterAll(async () => { await app.close(); });

    async function newFinding(body: Record<string, unknown> = {}) {
        const dir = await createTestDirectorate(prisma);
        const control = await createTestControl(prisma, { ownerId: id.admin, directorateId: dir.id });
        // Kontrol noktası (dönem kontrolü → kontrol testi) kontrolcüleri: maker / checker.
        const ct = await createTestControlTest(prisma, { controlId: control.id, assigneeId: id.maker, secondControllerId: id.checker });
        const res = await http().post('/findings').set(as('admin')).send({
            findingType: 'BT', description: 'Maker-checker testi için yeterli uzunlukta bulgu açıklaması', summary: 'MC',
            relatedDepartment: 'BT', status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id, ...body,
        }).expect(201);
        return res.body.id as string;
    }
    const addAction = (fId: string, who = 'maker', extra: Record<string, unknown> = {}) =>
        http().post(`/findings/${fId}/actions`).set(as(who)).send({ description: 'Maker-checker aksiyon açıklaması yeterli uzunlukta', ownerId: id.maker, dueDate: future(30), ...extra });
    const actionOp = (fId: string, aId: string, op: string, who: string, body: Record<string, unknown> = {}) =>
        http().post(`/findings/${fId}/actions/${aId}/${op}`).set(as(who)).send(body);
    async function approvedAction(fId: string) {
        const a = (await addAction(fId).expect(201)).body;
        await actionOp(fId, a.id, 'submit', 'maker').expect(201);
        await actionOp(fId, a.id, 'approve', 'checker').expect(201);
        const fu = await prisma.findingFollowUp.findFirstOrThrow({ where: { actionId: a.id, status: { not: 'IPTAL' } } });
        return { actionId: a.id as string, followUpId: fu.id };
    }
    const putFu = (fId: string, fuId: string, who: string, body: Record<string, unknown>) =>
        http().put(`/findings/${fId}/follow-ups/${fuId}`).set(as(who)).send(body);
    async function approveFu(fId: string, fuId: string, body: Record<string, unknown>) {
        await putFu(fId, fuId, 'maker', { currentStatusDetail: 'Değerlendirme', ...body }).expect(200);
        await putFu(fId, fuId, 'maker', { status: 'TAMAMLANDI' }).expect(200);
        await putFu(fId, fuId, 'checker', { status: 'ONAYLANDI' }).expect(200);
    }

    describe('Kontrolcü zinciri', () => {
        it('bulgu kontrolcüleri varsayılan olarak kontrol noktasından gelir; değiştirilebilir; aynı kişi olamaz', async () => {
            const fId = await newFinding();
            expect(await prisma.finding.findUniqueOrThrow({ where: { id: fId } })).toMatchObject({ firstControllerId: id.maker, secondControllerId: id.checker });
            const custom = await newFinding({ firstControllerId: id.maker, secondControllerId: id.checker2 });
            expect((await prisma.finding.findUniqueOrThrow({ where: { id: custom } })).secondControllerId).toBe(id.checker2);
            const dir = await createTestDirectorate(prisma);
            const control = await createTestControl(prisma, { ownerId: id.admin, directorateId: dir.id });
            const ct = await createTestControlTest(prisma, { controlId: control.id, assigneeId: id.maker });
            await http().post('/findings').set(as('admin')).send({
                findingType: 'BT', description: 'Aynı kontrolcü denemesi için yeterli uzunlukta açıklama', summary: 'x', relatedDepartment: 'BT',
                status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id, firstControllerId: id.checker, secondControllerId: id.checker,
            }).expect(400);
            // İkinci kontrolcü onay yetkisi olmalı (AUDITOR değil).
            await http().put(`/findings/${fId}`).set(as('admin')).send({ secondControllerId: id.maker }).expect(400);
        });

        it('aksiyon bulgunun, takip aksiyonun kontrolcülerini devralır; aksiyon kontrolcüsü değiştirilebilir', async () => {
            const fId = await newFinding();
            const a = (await addAction(fId, 'maker', { secondControllerId: id.checker2 }).expect(201)).body;
            expect(a).toMatchObject({ firstControllerId: id.maker, secondControllerId: id.checker2, approvalState: 'TASLAK' });
            await actionOp(fId, a.id, 'submit', 'maker').expect(201);
            await actionOp(fId, a.id, 'approve', 'checker').expect(403); // atanmış ikinci kontrolcü checker2
            await actionOp(fId, a.id, 'approve', 'checker2').expect(201);
            const fu = await prisma.findingFollowUp.findFirstOrThrow({ where: { actionId: a.id } });
            expect(fu).toMatchObject({ assigneeId: id.maker, secondControllerId: id.checker2, status: 'BEKLIYOR' });
        });
    });

    describe('Aksiyon onay akışı', () => {
        it('taslak → düzenle → onaya gönder → reddet (gerekçe) → düzelt → onayla → takip oluşur', async () => {
            const fId = await newFinding();
            await addAction(fId, 'checker').expect(403); // aksiyon girişi bulgunun birinci kontrolcüsünün
            const a = (await addAction(fId).expect(201)).body;
            expect(await prisma.findingFollowUp.count({ where: { actionId: a.id } })).toBe(0);
            await http().put(`/findings/${fId}/actions/${a.id}`).set(as('maker')).send({ notes: 'ilk taslak' }).expect(200);
            await http().put(`/findings/${fId}/actions/${a.id}`).set(as('admin')).send({ notes: 'başkası' }).expect(403);
            await actionOp(fId, a.id, 'submit', 'maker').expect(201);
            await http().put(`/findings/${fId}/actions/${a.id}`).set(as('maker')).send({ notes: 'onayda' }).expect(409);
            await actionOp(fId, a.id, 'approve', 'maker').expect(403);
            await actionOp(fId, a.id, 'reject', 'checker', {}).expect(400);
            const rej = (await actionOp(fId, a.id, 'reject', 'checker', { reason: 'Hedef tarih gerçekçi değil' }).expect(201)).body;
            expect(rej).toMatchObject({ approvalState: 'REDDEDILDI', rejectionReason: 'Hedef tarih gerçekçi değil' });
            await http().put(`/findings/${fId}/actions/${a.id}`).set(as('maker')).send({ dueDate: future(45) }).expect(200);
            await actionOp(fId, a.id, 'submit', 'maker').expect(201);
            const ok = (await actionOp(fId, a.id, 'approve', 'checker').expect(201)).body;
            expect(ok.approvalState).toBe('ONAYLANDI');
            expect(ok.createdFollowUp.followUpId).toBeTruthy();
            const fu = await prisma.findingFollowUp.findUniqueOrThrow({ where: { id: ok.createdFollowUp.id } });
            expect(fu.plannedDate!.toISOString().split('T')[0]).toBe(future(45));
            await http().put(`/findings/${fId}/actions/${a.id}`).set(as('maker')).send({ notes: 'onaylı' }).expect(409);
        });

        it('onay geri alınınca başlamamış takip iptal olur, aksiyon taslağa döner; takipte işlem varsa geri alınamaz', async () => {
            const fId = await newFinding();
            const { actionId, followUpId } = await approvedAction(fId);
            await actionOp(fId, actionId, 'revert', 'checker', {}).expect(400);
            await actionOp(fId, actionId, 'revert', 'maker', { reason: 'x' }).expect(403);
            const rev = (await actionOp(fId, actionId, 'revert', 'checker', { reason: 'Sorumlu birim değişecek' }).expect(201)).body;
            expect(rev).toMatchObject({ approvalState: 'TASLAK', revertReason: 'Sorumlu birim değişecek' });
            expect((await prisma.findingFollowUp.findUniqueOrThrow({ where: { id: followUpId } })).status).toBe('IPTAL');
            await http().put(`/findings/${fId}/actions/${actionId}`).set(as('maker')).send({ notes: 'yeniden düzenlendi' }).expect(200);

            const second = await approvedAction(fId);
            await putFu(fId, second.followUpId, 'maker', { currentStatusDetail: 'Başladı', result: 'YETERSIZ' }).expect(200);
            const blocked = await actionOp(fId, second.actionId, 'revert', 'checker', { reason: 'x' }).expect(409);
            expect(blocked.body.message).toContain('takip çalışmasında işlem yapılmış');
        });
    });

    describe('Takip onayını geri alma', () => {
        it('YETERLI onayı geri alınınca aksiyon ve bulgu kapanışı geri döner; takip yeniden düzenlenip onaylanabilir', async () => {
            const fId = await newFinding();
            const { actionId, followUpId } = await approvedAction(fId);
            await approveFu(fId, followUpId, { result: 'YETERLI' });
            expect((await prisma.action.findUniqueOrThrow({ where: { id: actionId } })).status).toBe('KAPATILDI');
            expect((await prisma.finding.findUniqueOrThrow({ where: { id: fId } })).status).toBe('CLOSED');

            await http().post(`/findings/${fId}/follow-ups/${followUpId}/revert`).set(as('maker')).send({ reason: 'x' }).expect(403);
            const rev = (await http().post(`/findings/${fId}/follow-ups/${followUpId}/revert`).set(as('checker')).send({ reason: 'Kanıt eksik' }).expect(201)).body;
            expect(rev).toMatchObject({ status: 'DEVAM_EDIYOR', approvalStatus: null, revertReason: 'Kanıt eksik' });
            expect((await prisma.action.findUniqueOrThrow({ where: { id: actionId } })).status).toBe('BEKLIYOR');
            expect(await prisma.finding.findUniqueOrThrow({ where: { id: fId } })).toMatchObject({ status: 'IN_PROGRESS', closedDate: null });
            const logs = await prisma.findingStatusLog.findMany({ where: { findingId: fId } });
            expect(logs.some(l => l.text.includes('onayı geri alındı: Kanıt eksik'))).toBe(true);

            await approveFu(fId, followUpId, { currentStatusDetail: 'Ek kanıt alındı', result: 'YETERLI' });
            expect((await prisma.action.findUniqueOrThrow({ where: { id: actionId } })).status).toBe('KAPATILDI');
        });

        it('ERTELENDI onayı geri alınınca devam takibi silinir ve not geri alınır; devam takibinde işlem varsa engellenir', async () => {
            const fId = await newFinding();
            const { followUpId } = await approvedAction(fId);
            await approveFu(fId, followUpId, { currentStatusDetail: 'Ek süre', result: 'YETERSIZ', resolutionOutcome: 'ERTELENDI', newFollowUpDate: future(40) });
            const succ = await prisma.findingFollowUp.findFirstOrThrow({ where: { previousFollowUpId: followUpId } });
            expect((await prisma.findingFollowUp.findUniqueOrThrow({ where: { id: followUpId } })).currentStatusDetail).toContain(succ.followUpId);

            await http().post(`/findings/${fId}/follow-ups/${followUpId}/revert`).set(as('checker')).send({ reason: 'Tarih yanlış' }).expect(201);
            expect(await prisma.findingFollowUp.findUniqueOrThrow({ where: { id: succ.id } })).toMatchObject({ status: 'IPTAL', previousFollowUpId: null });
            expect((await prisma.findingFollowUp.findUniqueOrThrow({ where: { id: followUpId } })).currentStatusDetail).toBe('Ek süre');
            expect((await prisma.finding.findUniqueOrThrow({ where: { id: fId } })).resolutionStatus).toBe('DEVAM_EDIYOR');

            await approveFu(fId, followUpId, { currentStatusDetail: 'Ek süre', result: 'YETERSIZ', resolutionOutcome: 'ERTELENDI', newFollowUpDate: future(50) });
            const succ2 = await prisma.findingFollowUp.findFirstOrThrow({ where: { previousFollowUpId: followUpId } });
            await putFu(fId, succ2.id, 'maker', { currentStatusDetail: 'Devam takibinde çalışma', result: 'YETERLI' }).expect(200);
            const blocked = await http().post(`/findings/${fId}/follow-ups/${followUpId}/revert`).set(as('checker')).send({ reason: 'x' }).expect(409);
            expect(blocked.body.message).toContain(succ2.followUpId);
        });
    });

    describe('Onaylı silme', () => {
        it('takip silme: birinci kontrolcü talep eder, bekleyen talep düzenlemeyi kilitler, ret/onay ikinci kontrolcüde', async () => {
            const fId = await newFinding();
            const { followUpId } = await approvedAction(fId);
            await http().post(`/findings/${fId}/follow-ups/${followUpId}/delete-request`).set(as('checker')).send({ reason: 'x' }).expect(403);
            await http().post(`/findings/${fId}/follow-ups/${followUpId}/delete-request`).set(as('maker')).send({ reason: 'Mükerrer takip' }).expect(201);
            await putFu(fId, followUpId, 'maker', { currentStatusDetail: 'kilitli mi' }).expect(409);
            await http().post(`/findings/${fId}/follow-ups/${followUpId}/delete-reject`).set(as('checker')).send({ reason: 'Takip gerekli' }).expect(201);
            expect(await prisma.findingFollowUp.findUniqueOrThrow({ where: { id: followUpId } })).toMatchObject({ deletionRequestedAt: null, deletionRejectionReason: 'Takip gerekli' });
            await putFu(fId, followUpId, 'maker', { currentStatusDetail: 'düzenlenebilir' }).expect(200);
            await http().delete(`/findings/${fId}/follow-ups/${followUpId}`).set(as('maker')).send({ reason: 'Yine mükerrer' }).expect(200);
            await http().post(`/findings/${fId}/follow-ups/${followUpId}/delete-approve`).set(as('checker')).expect(201);
            expect(await prisma.findingFollowUp.findUniqueOrThrow({ where: { id: followUpId } })).toMatchObject({ status: 'IPTAL', deletedById: id.checker });
        });

        it('onaylı takip doğrudan silinemez; önce onayı geri alınmalı', async () => {
            const fId = await newFinding();
            const { followUpId } = await approvedAction(fId);
            await approveFu(fId, followUpId, { result: 'YETERSIZ' });
            const res = await http().post(`/findings/${fId}/follow-ups/${followUpId}/delete-request`).set(as('maker')).send({ reason: 'x' }).expect(409);
            expect(res.body.message).toContain('onayı geri');
        });
    });
    describe('Onay iş kutusu (Onaylarım) ve bildirimler', () => {
        it('bekleyen aksiyon onayı ve silme talepleri yalnız atanmış ikinci kontrolcünün kutusunda; karar sonrası düşer', async () => {
            const fId = await newFinding({ firstControllerId: id.maker, secondControllerId: id.checker2 });
            const before = (await http().get('/workflow-approvals/count').set(as('checker2')).expect(200)).body.count as number;
            const a = (await addAction(fId).expect(201)).body;
            await actionOp(fId, a.id, 'submit', 'maker').expect(201);

            const box = (await http().get('/workflow-approvals').set(as('checker2')).expect(200)).body;
            expect(box.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'ACTION_APPROVAL', recordId: a.id, finding: expect.objectContaining({ id: fId }) })]));
            expect((await http().get('/workflow-approvals/count').set(as('checker2')).expect(200)).body.count).toBe(before + 1);
            const other = (await http().get('/workflow-approvals').set(as('checker')).expect(200)).body;
            expect(other.items.some((i: any) => i.recordId === a.id)).toBe(false);

            const bell = (await http().get('/notifications').set(as('checker2')).expect(200)).body;
            expect(bell.some((n: any) => n.type === 'APPROVAL_PENDING' && n.id.includes(a.id))).toBe(true);

            // Ret → birinci kontrolcüye karar bildirimi; ikinci kontrolcünün kutusundan düşer.
            await actionOp(fId, a.id, 'reject', 'checker2', { reason: 'Kapsam eksik' }).expect(201);
            expect((await http().get('/workflow-approvals/count').set(as('checker2')).expect(200)).body.count).toBe(before);
            const makerBox = (await http().get('/workflow-approvals').set(as('maker')).expect(200)).body;
            expect(makerBox.decisions).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'ACTION_REJECTED', recordId: a.id, reason: 'Kapsam eksik' })]));
            const makerBell = (await http().get('/notifications').set(as('maker')).expect(200)).body;
            expect(makerBell.some((n: any) => n.type === 'APPROVAL_DECISION' && n.id.includes(a.id))).toBe(true);

            // /actions listesinden silme: gerekçesiz 400; gerekçeli talep ikinci kontrolcünün kutusuna düşer.
            await http().delete(`/actions/${a.id}`).set(as('maker')).send({}).expect(400);
            await http().delete(`/actions/${a.id}`).set(as('maker')).send({ reason: 'Mükerrer aksiyon' }).expect(200);
            const list = (await http().get('/actions').query({ awaitingMe: 'true' }).set(as('checker2')).expect(200)).body.data;
            expect(list.map((x: any) => x.id)).toContain(a.id);
            const box2 = (await http().get('/workflow-approvals').set(as('checker2')).expect(200)).body;
            expect(box2.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'ACTION_DELETION', recordId: a.id, reason: 'Mükerrer aksiyon' })]));
            await actionOp(fId, a.id, 'delete-approve', 'checker2').expect(201);
            expect((await http().get('/workflow-approvals/count').set(as('checker2')).expect(200)).body.count).toBe(before);
            const decided = (await http().get('/workflow-approvals').set(as('maker')).expect(200)).body.decisions;
            expect(decided).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'ACTION_DELETED', recordId: a.id })]));
        });

        it('aksiyon listesi onay durumu filtresi beyaz listeyle çalışır', async () => {
            const fId = await newFinding();
            const a = (await addAction(fId).expect(201)).body;
            const drafts = (await http().get('/actions').query({ approvalState: 'TASLAK', limit: 100 }).set(as('admin')).expect(200)).body.data;
            expect(drafts.every((x: any) => x.approvalState === 'TASLAK')).toBe(true);
            expect(drafts.map((x: any) => x.id)).toContain(a.id);
            // Bilinmeyen değer filtre olarak uygulanmaz (500 yerine yok sayılır).
            await http().get('/actions').query({ approvalState: 'DROP TABLE' }).set(as('admin')).expect(200);
        });
    });
});
