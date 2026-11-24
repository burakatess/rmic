import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Manuel aksiyon planı (bulgudan bağımsız) ve takip çalışması:
 * - Oluşturma doğrulaması (başlık, iki farklı kontrolcü), taslak açılır, kod AM-YYYY-NNNN.
 * - Onay iş akışı bulgu kaynaklı aksiyonla aynı: onayda TEK takip oluşur (T-AM-…), bulgusuz.
 * - Aksiyon ↔ takip iki yönlü; takip detayı aksiyonun açıklamasını doğrudan verir.
 * - Takip değerlendirme/onay genel uçlarla; YETERLI onayı aksiyonu kapatır.
 * - Aynı aksiyona mükerrer açık takip açılamaz; kapsam dışı kullanıcı kaydı göremez.
 */
describe('E2E — manuel aksiyon planı ve takip çalışması', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const due = () => new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0];
    const wf = (who: string, eid: string, action: string, reason?: string) =>
        http().post(`/workflow/ACTION/${eid}/transition`).set(as(who)).send({ action, ...(reason ? { reason } : {}) });
    const body = (over: Record<string, unknown> = {}) => ({
        title: 'Yedekleme prosedürünün güncellenmesi', description: 'Yedekleme prosedürü 2026 gereksinimlerine göre güncellenecek ve onaylatılacak.',
        ownerId: id.maker, dueDate: due(), firstControllerId: id.maker, secondControllerId: id.checker, ...over,
    });

    beforeAll(async () => {
        process.env.RECORD_SCOPE_ENFORCEMENT = 'true'; // kapsam dışı kullanıcı testi için kayıt kapsamı açık
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role] of [['admin', 'SYSTEM_ADMIN'], ['checker', 'RISK_CONTROL_MANAGER'], ['maker', 'AUDITOR'], ['outsider', 'AUDITEE']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `ma-${key}@e2e.local`, firstName: key, lastName: 'Kişi' });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `ma-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
    });
    afterAll(async () => { delete process.env.RECORD_SCOPE_ENFORCEMENT; await app.close(); });

    it('oluşturma: başlık zorunlu, iki kontrolcü zorunlu ve farklı; taslak açılır, kod sunucuda üretilir, bulgu gerekmez', async () => {
        await http().post('/actions/manual').set(as('maker')).send(body({ title: '' })).expect(400);
        await http().post('/actions/manual').set(as('maker')).send(body({ secondControllerId: undefined })).expect(400);
        await http().post('/actions/manual').set(as('maker')).send(body({ secondControllerId: id.maker })).expect(400);
        await http().post('/actions/manual').set(as('maker')).send(body({ actionId: 'AM-9999-0001' })).expect(400); // kod istemciden alınmaz
        const a = (await http().post('/actions/manual').set(as('maker')).send(body({ status: 'DEVAM_EDIYOR' })).expect(201)).body;
        expect(a.actionId).toMatch(/^AM-\d{4}-\d{4}$/);
        expect(a).toMatchObject({ findingId: null, approvalState: 'TASLAK', status: 'DEVAM_EDIYOR', title: 'Yedekleme prosedürünün güncellenmesi' });
        // Envanterde listelenir; aksiyon detayı bulgusuz açılır.
        const list = (await http().get('/actions').query({ limit: '200' }).set(as('maker')).expect(200)).body;
        expect((list.data ?? list).some((x: any) => x.id === a.id)).toBe(true);
        expect((await http().get(`/actions/${a.id}`).set(as('maker')).expect(200)).body).toMatchObject({ finding: null, title: a.title });
        // Kapsam dışı kullanıcı göremez.
        await http().get(`/actions/${a.id}`).set(as('outsider')).expect(404);
        expect(await prisma.findingFollowUp.count({ where: { actionId: a.id } })).toBe(0); // takip onayla oluşur
    });

    it('onay iş akışı aynı: onayda tek takip oluşur (T-AM-…, bulgusuz); ilişki iki yönlü; takip detayı aksiyonu gösterir', async () => {
        const a = (await http().post('/actions/manual').set(as('maker')).send(body()).expect(201)).body;
        await wf('checker', a.id, 'APPROVE').expect(409); // taslak doğrudan onaylanamaz
        await wf('maker', a.id, 'COMPLETE').expect(201);
        await wf('checker', a.id, 'APPROVE').expect(201);
        const fus = await prisma.findingFollowUp.findMany({ where: { actionId: a.id } });
        expect(fus).toHaveLength(1);
        expect(fus[0]).toMatchObject({ findingId: null, status: 'BEKLIYOR', assigneeId: id.maker, secondControllerId: id.checker });
        expect(fus[0].followUpId).toBe(`T-${a.actionId}-01`);

        const action = (await http().get(`/actions/${a.id}`).set(as('maker')).expect(200)).body;
        expect(action.followUps.map((f: any) => f.id)).toEqual([fus[0].id]);
        const detail = (await http().get(`/follow-ups/${fus[0].id}`).set(as('maker')).expect(200)).body;
        expect(detail).toMatchObject({
            manual: true, finding: null,
            action: { id: a.id, actionId: a.actionId, title: a.title, description: a.description, approvalState: 'ONAYLANDI', owner: { id: id.maker } },
            assignee: { id: id.maker }, secondController: { id: id.checker },
        });
        expect(detail.capabilities.canEvaluate).toBe(true);
        await http().get(`/follow-ups/${fus[0].id}`).set(as('outsider')).expect(404);
        // İş akışı panosunda takip kendi detay ekranına bağlanır.
        const st = (await http().get(`/workflow/FOLLOW_UP/${fus[0].id}`).set(as('maker')).expect(200)).body;
        expect(st).toMatchObject({ href: `/follow-ups/${fus[0].id}`, title: a.title });
    });

    it('takip değerlendirme ve onayı genel uçlarla; YETERLI onayı manuel aksiyonu kapatır; yapan onaylayamaz', async () => {
        const a = (await http().post('/actions/manual').set(as('maker')).send(body()).expect(201)).body;
        await wf('maker', a.id, 'COMPLETE').expect(201);
        await wf('checker', a.id, 'APPROVE').expect(201);
        const fu = await prisma.findingFollowUp.findFirstOrThrow({ where: { actionId: a.id } });

        await http().put(`/follow-ups/${fu.id}`).set(as('maker')).send({ result: 'YETERLI', currentStatusDetail: 'Prosedür güncellendi ve yayımlandı.' }).expect(200);
        await http().put(`/follow-ups/${fu.id}`).set(as('maker')).send({ status: 'TAMAMLANDI' }).expect(200);
        await http().put(`/follow-ups/${fu.id}`).set(as('maker')).send({ status: 'ONAYLANDI' }).expect(403);
        await http().put(`/follow-ups/${fu.id}`).set(as('checker')).send({ status: 'ONAYLANDI' }).expect(200);

        expect((await prisma.findingFollowUp.findUniqueOrThrow({ where: { id: fu.id } })).status).toBe('ONAYLANDI');
        expect((await prisma.action.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('KAPATILDI');
        const hist = await prisma.findingStatusHistory.findMany({ where: { actionId: a.id } });
        expect(hist.every(h => h.findingId === null)).toBe(true);
        expect(hist.some(h => h.operation === 'ACTION_CLOSED')).toBe(true);
    });

    it('mükerrer takip engeli: aksiyonun açık takibi varken yenisi açılamaz (bulgu kaynaklı aksiyon için de)', async () => {
        // Kayıt kapsamı açık: bulgu kaynaklı kısım kurum geneli yetkili sistem yöneticisiyle kurulur.
        const f = (await http().post('/findings').set(as('admin')).send({
            description: 'Mükerrer takip testi için yeterince uzun bulgu metni', summary: 'Mükerrer takip', severity: 'HIGH',
            firstControllerId: id.admin, secondControllerId: id.checker,
        }).expect(201)).body;
        const act = (await http().post(`/findings/${f.id}/actions`).set(as('admin')).send({
            description: 'Mükerrer takip aksiyonu', ownerId: id.admin, dueDate: due(), firstControllerId: id.admin, secondControllerId: id.checker,
        }).expect(201)).body;
        await wf('admin', act.id, 'COMPLETE').expect(201);
        await wf('checker', act.id, 'APPROVE').expect(201);
        expect(await prisma.findingFollowUp.count({ where: { actionId: act.id } })).toBe(1);
        const dup = await http().post(`/findings/${f.id}/actions/${act.id}/follow-ups`).set(as('admin')).send({ notes: 'ikinci' }).expect(409);
        expect(dup.body.message).toContain('mükerrer');
        await http().post(`/findings/${f.id}/follow-ups`).set(as('admin')).send({ actionId: act.id, currentStatusDetail: 'ikinci' }).expect(409);
        expect(await prisma.findingFollowUp.count({ where: { actionId: act.id } })).toBe(1);
    });

    it('manuel aksiyon silme talebi yönetici onaylı; silinen aksiyonun takibi de iptal', async () => {
        const a = (await http().post('/actions/manual').set(as('maker')).send(body()).expect(201)).body;
        await wf('maker', a.id, 'COMPLETE').expect(201);
        await wf('checker', a.id, 'APPROVE').expect(201);
        await wf('maker', a.id, 'CANCEL', 'Kapsam değişti').expect(201);
        await http().post(`/deletion-requests/ACTION/${a.id}/approve`).set(as('maker')).expect(403);
        await http().post(`/deletion-requests/ACTION/${a.id}/approve`).set(as('admin')).expect(201);
        expect((await prisma.action.findUniqueOrThrow({ where: { id: a.id } })).deletedAt).not.toBeNull();
        expect((await prisma.findingFollowUp.findFirstOrThrow({ where: { actionId: a.id } })).status).toBe('IPTAL');
    });
});
