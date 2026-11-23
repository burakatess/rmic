import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Akış Sağlığı: sinyaller kaynak kayıtlardan sorgu anında türetilir; kapsam kullanıcıya göre daralır;
 * onaysız/silinmiş aksiyonlar yanlış sinyal üretmez; sorun kaynakta çözülünce kendiliğinden kaybolur.
 */
describe('E2E — Akış Sağlığı sinyalleri, kapsam ve sayfalama', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const day = 86400000;
    const past = () => new Date(Date.now() - 3 * day);
    let seq = 0;

    const items = async (who: string, scope: 'MINE' | 'ORG', q: Record<string, string> = {}) =>
        (await http().get('/workflow-health/items').query({ scope, pageSize: '200', ...q }).set(as(who)).expect(200)).body as { data: any[]; pagination: any };
    const codes = (res: { data: any[] }, entityId?: string) => res.data.filter(i => !entityId || i.entityId === entityId).map(i => i.code).sort();

    async function finding(extra: Record<string, unknown> = {}) {
        seq++;
        return prisma.finding.create({
            data: {
                findingId: `B-9999-${String(seq).padStart(4, '0')}`, description: 'Sağlık sinyali testi bulgusu', impact: 'Etki', severity: 'HIGH',
                workflowStatus: 'MUTABAKAT_YAPILDI', resolutionStatus: 'DEVAM_EDIYOR', status: 'IN_PROGRESS',
                firstControllerId: id.maker, secondControllerId: id.checker, createdById: id.admin, ...extra,
            } as never,
        });
    }
    async function action(findingId: string, extra: Record<string, unknown> = {}) {
        seq++;
        return prisma.action.create({
            data: {
                actionId: `A-9999-${String(seq).padStart(4, '0')}-01`, description: 'Sağlık sinyali testi aksiyonu', findingId, ownerId: id.maker,
                dueDate: past(), status: 'BEKLIYOR', approvalState: 'ONAYLANDI', firstControllerId: id.maker, secondControllerId: id.checker, ...extra,
            } as never,
        });
    }

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role] of [['admin', 'SYSTEM_ADMIN'], ['maker', 'AUDITOR'], ['checker', 'RISK_CONTROL_MANAGER'], ['other', 'AUDITOR']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `wh-${key}@e2e.local` });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `wh-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
    });
    afterAll(async () => { await app.close(); });

    it('aksiyonsuz bulgu: birinci/ikinci kontrolcüde görünür, ilgisiz kullanıcıda görünmez; aksiyon eklenince kendiliğinden kaybolur', async () => {
        const f = await finding();
        for (const who of ['maker', 'checker']) expect(codes(await items(who, 'MINE'), f.id)).toEqual(['FINDING_WITHOUT_ACTION']);
        expect(codes(await items('other', 'MINE'), f.id)).toEqual([]);
        expect(codes(await items('admin', 'ORG'), f.id)).toEqual(['FINDING_WITHOUT_ACTION']);

        await action(f.id, { dueDate: new Date(Date.now() + 30 * day) });
        expect(codes(await items('maker', 'MINE'), f.id)).toEqual([]); // kaynakta çözüldü → sinyal yok (elle işlem yok)
    });

    it('silinmiş/iptal aksiyon "aksiyonu var" sayılmaz ve gecikme sinyali üretmez', async () => {
        const f = await finding();
        const dead = await action(f.id, { status: 'IPTAL', deletedAt: new Date() });
        const res = await items('maker', 'MINE');
        expect(codes(res, f.id)).toEqual(['FINDING_WITHOUT_ACTION']);
        expect(codes(res, dead.id)).toEqual([]);
    });

    it('onaysız (taslak / reddedilmiş) aksiyon gecikmiş sayılmaz; onaylı ve süresi geçmiş aksiyon sayılır', async () => {
        const f = await finding();
        const draft = await action(f.id, { approvalState: 'TASLAK' });
        const rejected = await action(f.id, { approvalState: 'REDDEDILDI' });
        const live = await action(f.id);
        const res = await items('maker', 'MINE');
        expect(codes(res, draft.id)).toEqual([]);
        expect(codes(res, rejected.id)).toEqual([]);
        expect(codes(res, live.id)).toEqual(['ACTION_OVERDUE']);
        // Kontrolcü zinciri: ikinci kontrolcü de görür; ilgisiz kullanıcı görmez.
        expect(codes(await items('checker', 'MINE'), live.id)).toEqual(['ACTION_OVERDUE']);
        expect(codes(await items('other', 'MINE'), live.id)).toEqual([]);
    });

    it('ikinci kontrolcü onayı bekleyen aksiyon: ACTION_APPROVAL_PENDING (uyarı) ve Onay Bekleyen sayacı', async () => {
        const f = await finding();
        const pending = await action(f.id, { approvalState: 'ONAY_BEKLIYOR', dueDate: new Date(Date.now() + 30 * day) });
        const res = await items('checker', 'MINE');
        expect(res.data.filter(i => i.entityId === pending.id)).toEqual([expect.objectContaining({ code: 'ACTION_APPROVAL_PENDING', severity: 'WARNING', nextAction: 'AKSIYONU_ONAYLA' })]);
        const before = (await http().get('/workflow-health/summary').query({ scope: 'MINE' }).set(as('checker')).expect(200)).body;
        expect(before.pendingApproval).toBeGreaterThanOrEqual(1);
        expect(before.byCode.ACTION_APPROVAL_PENDING).toBeGreaterThanOrEqual(1);
        await prisma.action.update({ where: { id: pending.id }, data: { approvalState: 'ONAYLANDI' } });
        expect(codes(await items('checker', 'MINE'), pending.id)).toEqual([]); // onaylanınca kaybolur
    });

    it('takip onayı bekleyen: silinmiş takip sinyal üretmez', async () => {
        const f = await finding();
        const a = await action(f.id, { status: 'TAMAMLANDI', dueDate: new Date(Date.now() + 30 * day) });
        const fu = await prisma.findingFollowUp.create({
            data: { followUpId: `T-9999-${++seq}`, findingId: f.id, actionId: a.id, status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR', evaluatorId: id.maker, assigneeId: id.maker, secondControllerId: id.checker } as never,
        });
        expect(codes(await items('checker', 'MINE'), fu.id)).toEqual(['FOLLOWUP_APPROVAL_PENDING']);
        await prisma.findingFollowUp.update({ where: { id: fu.id }, data: { status: 'IPTAL', deletedAt: new Date() } });
        expect(codes(await items('checker', 'MINE'), fu.id)).toEqual([]);
    });

    it('sayfalama: toplam sabit, sayfalar çakışmaz, tüm sayfalar toplamı verir; geçersiz sayfa boyutu 400', async () => {
        for (let i = 0; i < 6; i++) await finding(); // 6 aksiyonsuz bulgu → en az 6 sinyal
        const all = await items('admin', 'ORG');
        const total = all.pagination.total;
        expect(total).toBeGreaterThan(3);
        const seen: string[] = [];
        for (let page = 1; page <= Math.ceil(total / 3); page++) {
            const res = (await http().get('/workflow-health/items').query({ scope: 'ORG', pageSize: '3', page: String(page) }).set(as('admin')).expect(200)).body;
            expect(res.pagination).toMatchObject({ total, page, pageSize: 3 });
            seen.push(...res.data.map((i: any) => `${i.code}:${i.entityId}`));
        }
        expect(seen).toHaveLength(total);
        expect(new Set(seen).size).toBe(total);
        await http().get('/workflow-health/items').query({ pageSize: '500' }).set(as('admin')).expect(400);
    });

    it('yetki: control:view olmayan kullanıcı 403', async () => {
        const roles = await prisma.role.create({ data: { name: 'SAGLIK_YETKISIZ', permissions: ['finding:view'] } });
        await createTestUser(prisma, roles.id, { email: 'wh-noperm@e2e.local' });
        const t = (await http().post('/auth/login').send({ email: 'wh-noperm@e2e.local', password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        await http().get('/workflow-health/summary').set({ Authorization: `Bearer ${t}` }).expect(403);
    });
});
