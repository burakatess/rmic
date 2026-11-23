import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Bulgu yaşam döngüsü ile aksiyon onayı birbirinden bağımsızdır:
 * - Bulgu oluşturulunca onaysız Açık kalır (iş akışı: Açık → Kapanış Değerlendirmesinde → Kapatıldı).
 * - Aksiyon planı 2. kontrolcü onayına gider; onay bulguyu kapatmaz.
 * - Kapanış: 1. kontrolcü gönderir (açık aksiyon/takip varken gönderilemez), 2. kontrolcü/yönetici onaylar.
 * - Bulgu, aksiyon ve takip silme kararı yöneticidedir (talep eden karar veremez); hepsi tek kutuda.
 */
describe('E2E — bulgu yaşam döngüsü, aksiyon onayı ve yönetici onaylı silme', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const due = () => new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const wf = (who: string, type: string, eid: string, action: string, reason?: string) =>
        http().post(`/workflow/${type}/${eid}/transition`).set(as(who)).send({ action, ...(reason ? { reason } : {}) });
    const state = async (who: string, type: string, eid: string) => (await http().get(`/workflow/${type}/${eid}`).set(as(who)).expect(200)).body;

    async function newFinding() {
        const r = await http().post('/findings').set(as('maker')).send({
            description: 'Yaşam döngüsü testi için yeterince uzun bulgu metni', summary: 'Yaşam döngüsü bulgusu',
            severity: 'HIGH', firstControllerId: id.maker, secondControllerId: id.checker,
        }).expect(201);
        return r.body.id as string;
    }
    async function newAction(fId: string) {
        const r = await http().post(`/findings/${fId}/actions`).set(as('maker')).send({
            description: 'Yaşam döngüsü testi düzeltici aksiyonu', ownerId: id.maker, dueDate: due(),
            firstControllerId: id.maker, secondControllerId: id.checker,
        }).expect(201);
        return r.body.id as string;
    }

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role] of [['admin', 'SYSTEM_ADMIN'], ['checker', 'RISK_CONTROL_MANAGER'], ['manager2', 'RISK_CONTROL_MANAGER'], ['maker', 'AUDITOR']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `fl-${key}@e2e.local`, firstName: key, lastName: 'Kişi' });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `fl-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
    });
    afterAll(async () => { await app.close(); });

    it('bulgu onaysız Açık kalır; aksiyon onayı bulgudan bağımsız ve bulguyu kapatmaz', async () => {
        const fId = await newFinding();
        let s = await state('maker', 'FINDING', fId);
        expect(s.stage).toBe('DEVAM_EDIYOR');
        expect(s.stageLabel).toBe('Açık');
        expect(s.stages.map((x: any) => x.label)).toEqual(['Açık', 'Kapanış Değerlendirmesinde', 'Kapatıldı']);
        // Açık bulgu için onay eylemi yok; kapanışa gönderme 1. kontrolcünün.
        expect(s.actions.map((a: any) => a.action)).not.toContain('APPROVE');

        const aId = await newAction(fId);
        let a = await state('maker', 'ACTION', aId);
        expect(a.stageLabel).toBe('Taslak');
        expect(a.actions.map((x: any) => x.action)).toContain('COMPLETE');
        // Aşama atlanamaz: taslak doğrudan onaylanamaz.
        await wf('checker', 'ACTION', aId, 'APPROVE').expect(409);
        await wf('maker', 'ACTION', aId, 'COMPLETE').expect(201);
        a = await state('checker', 'ACTION', aId);
        expect(a.stageLabel).toBe('2. Kontrolcü Onayında');
        // İade gerekçe ister; iade edilen aksiyon taslağa döner, yeniden gönderilir.
        await wf('checker', 'ACTION', aId, 'RETURN').expect(400);
        await wf('checker', 'ACTION', aId, 'RETURN', 'Hedef tarih gerçekçi değil').expect(201);
        expect((await state('maker', 'ACTION', aId)).stage).toBe('DEVAM_EDIYOR');
        await wf('maker', 'ACTION', aId, 'COMPLETE').expect(201);
        await wf('maker', 'ACTION', aId, 'APPROVE').expect(403); // yapan onaylayamaz (yönetici değil)
        await wf('checker', 'ACTION', aId, 'APPROVE').expect(201);
        a = await state('maker', 'ACTION', aId);
        expect(a.stage).toBe('ONAYLANDI');
        expect(a.history.map((h: any) => h.action)).toEqual(expect.arrayContaining(['COMPLETE', 'RETURN', 'APPROVE']));
        expect(await prisma.findingFollowUp.count({ where: { actionId: aId } })).toBe(1);

        // Aksiyon onayı bulguyu kapatmaz; açık aksiyon varken kapanışa gönderilemez.
        s = await state('maker', 'FINDING', fId);
        expect(s.stage).toBe('DEVAM_EDIYOR');
        const blocked = await wf('maker', 'FINDING', fId, 'COMPLETE', 'Kapanış').expect(400);
        expect(blocked.body.message).toContain('Kapatılmamış aksiyon');
    });

    it('kapanış: gerekçe zorunlu, 2. kontrolcü gönderemez, gönderen onaylayamaz; iade açık bırakır; geri alma tek aşama', async () => {
        const fId = await newFinding();
        const aId = await newAction(fId);
        await prisma.action.update({ where: { id: aId }, data: { status: 'KAPATILDI', approvalState: 'ONAYLANDI' } });

        await wf('maker', 'FINDING', fId, 'COMPLETE').expect(400);
        await wf('checker', 'FINDING', fId, 'COMPLETE', 'x').expect(403);
        await wf('maker', 'FINDING', fId, 'APPROVE').expect(409); // Açık → Kapatıldı atlanamaz
        await wf('maker', 'FINDING', fId, 'COMPLETE', 'Tüm aksiyonlar kapatıldı').expect(201);
        expect((await prisma.finding.findUniqueOrThrow({ where: { id: fId } })).status).toBe('PENDING_REVIEW');
        await http().post(`/deletion-requests`).set(as('maker')).send({ entityType: 'FINDING', entityId: fId, reason: 'x' }).expect(409);

        await wf('checker', 'FINDING', fId, 'RETURN', 'Kanıt yetersiz').expect(201);
        let f = await prisma.finding.findUniqueOrThrow({ where: { id: fId } });
        expect(f.status).toBe('PARTIALLY_CLOSED');
        expect(f.closureReturnReason).toBe('Kanıt yetersiz');

        await wf('maker', 'FINDING', fId, 'COMPLETE', 'Ek kanıt eklendi').expect(201);
        await wf('checker', 'FINDING', fId, 'APPROVE').expect(201);
        f = await prisma.finding.findUniqueOrThrow({ where: { id: fId } });
        expect(f).toMatchObject({ status: 'CLOSED', resolutionStatus: 'KAPATILDI', closureDecidedById: id.checker });

        // Geri alma yalnız yönetici, tek aşama (Kapatıldı → Değerlendirmede).
        await wf('maker', 'FINDING', fId, 'REVERT', 'x').expect(403);
        await wf('manager2', 'FINDING', fId, 'REVERT', 'Yeni bilgi').expect(201);
        expect((await prisma.finding.findUniqueOrThrow({ where: { id: fId } })).status).toBe('PENDING_REVIEW');
        const hist = (await state('maker', 'FINDING', fId)).history.map((h: any) => `${h.action}:${h.fromLabel}>${h.toLabel}`);
        expect(hist[0]).toBe('REVERT:Kapatıldı>Kapanış Değerlendirmesinde');
        expect(hist).toContain('RETURN:Kapanış Değerlendirmesinde>Açık');
    });

    it('silme: bulgu/aksiyon/takip talepleri tek kutuda; karar yöneticide ve talep eden karar veremez', async () => {
        const fId = await newFinding();
        const aId = await newAction(fId);
        await wf('maker', 'ACTION', aId, 'COMPLETE').expect(201);
        await wf('checker', 'ACTION', aId, 'APPROVE').expect(201);
        const fu = await prisma.findingFollowUp.findFirstOrThrow({ where: { actionId: aId } });

        // Bulgu: iş akışı çubuğundan iptal = silme talebi.
        const r = await wf('maker', 'FINDING', fId, 'CANCEL', 'Mükerrer bulgu').expect(201);
        expect(r.body.deletionRequested).toBe(true);
        expect((await state('maker', 'FINDING', fId)).deletion.reason).toBe('Mükerrer bulgu');
        // Aksiyon silme talebi (1. kontrolcü) — ikinci kontrolcü artık karar vermez, yönetici verir.
        await http().post('/deletion-requests').set(as('maker')).send({ entityType: 'ACTION', entityId: aId, reason: 'Gereksiz aksiyon' }).expect(201);

        const box = (await http().get('/deletion-requests').set(as('manager2')).expect(200)).body as any[];
        expect(box.filter(x => [fId, aId].includes(x.id)).map((x: any) => [x.type, x.canDecide])).toEqual(expect.arrayContaining([['FINDING', true], ['ACTION', true]]));
        await http().post(`/deletion-requests/ACTION/${aId}/reject`).set(as('maker')).send({ reason: 'x' }).expect(403);
        await http().post(`/deletion-requests/ACTION/${aId}/reject`).set(as('manager2')).send({ reason: 'Aksiyon gerekli' }).expect(201);
        expect(await prisma.action.findUniqueOrThrow({ where: { id: aId } })).toMatchObject({ deletionRequestedAt: null, deletionDecidedById: id.manager2, deletedAt: null });

        await http().post(`/deletion-requests/FINDING/${fId}/approve`).set(as('maker')).expect(403);
        await http().post(`/deletion-requests/FINDING/${fId}/approve`).set(as('manager2')).expect(201);
        const f = await prisma.finding.findUniqueOrThrow({ where: { id: fId } });
        expect(f).toMatchObject({ workflowStatus: 'IPTAL', deletionDecidedById: id.manager2 });
        expect(f.deletedAt).not.toBeNull();
        expect((await prisma.findingFollowUp.findUniqueOrThrow({ where: { id: fu.id } })).status).toBe('IPTAL');
        expect((await state('maker', 'FINDING', fId)).history[0]).toMatchObject({ action: 'CANCEL', toLabel: 'İptal' });
        expect(await prisma.auditLog.count({ where: { entityId: fId, action: { in: ['DELETE_REQUEST', 'DELETE_APPROVE'] } } })).toBe(2);
    });

    it('Kanban aksiyon planlarını tür adlarıyla gösterir; silinen bulgu panoda yer almaz', async () => {
        const fId = await newFinding();
        const aId = await newAction(fId);
        const board = (await http().get('/workflow/board').query({ scope: 'MINE', type: 'ACTION,FINDING' }).set(as('maker')).expect(200)).body;
        const all = board.columns.flatMap((c: any) => c.items);
        expect(all.find((i: any) => i.entityId === aId)).toMatchObject({ entityType: 'ACTION', stageLabel: 'Taslak' });
        expect(all.find((i: any) => i.entityId === fId)).toMatchObject({ entityType: 'FINDING', stageLabel: 'Açık' });
        // Bulgu sütunu "Bekliyor" kullanmaz; Kanban'da Açık → Onaylandı atlanamaz.
        await http().post('/workflow/board/move').set(as('checker')).send({ entityType: 'FINDING', entityId: fId, toStage: 'ONAYLANDI' }).expect(409);
        await http().post('/workflow/board/move').set(as('maker')).send({ entityType: 'FINDING', entityId: fId, toStage: 'BEKLIYOR' }).expect(409);
    });
});
