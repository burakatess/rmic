import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, createTestControl, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Yıllık plan — yıl bazlı kapsam ve takvim (kullanıcı kararı 2026-11):
 * - Sıklık ve uygulama ayları her yıl için ayrıdır: 6 aylık bir kontrol 2031'de Ocak–Temmuz,
 *   2032'de Mart–Eylül planlanıp uygulanabilir; bir yıl diğerini etkilemez.
 * - Kapsam matrisi: sayfa yılı değişmeden başka yılların kapsam durumu okunur ve o yılın taslağına yazılır.
 */
describe('E2E — Yıllık plan: yıl bazlı kapsam ve takvim', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const base = '/controls/annual-plan';
    const ws = async (year: number, q = '') => (await http().get(`${base}/${year}/workspace?scope=ORG${q}`).set(as('planner')).expect(200)).body;

    async function planYear(year: number, controlId: string, referenceMonth: number) {
        const w = await ws(year);
        await http().post(`${base}/${year}/draft/items?scope=ORG`).set(as('planner')).send({
            expectedRevision: w.draftRevision,
            items: [{ controlId, inScope: true, frequency: 'SEMI_ANNUAL', referenceMonth, assigneeId: id.first, secondControllerId: id.second }],
        }).expect(201);
        let w2 = await ws(year);
        await http().post(`${base}/${year}/submit`).set(as('planner')).send({ expectedRevision: w2.draftRevision }).expect(201);
        w2 = await ws(year);
        await http().post(`${base}/${year}/approve`).set(as('approver')).send({ expectedRevision: w2.draftRevision }).expect(201);
        w2 = await ws(year);
        const res = await http().post(`${base}/${year}/apply`).set(as('planner')).send({ expectedRevision: w2.draftRevision }).expect(201);
        expect(res.body.applied).toBe(true);
    }

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role] of [['planner', 'RISK_CONTROL_MANAGER'], ['approver', 'RISK_CONTROL_MANAGER'], ['first', 'AUDITOR'], ['second', 'RISK_CONTROL_MANAGER']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `my-${key}@e2e.local`, firstName: key, lastName: 'Plan' });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `my-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
    });
    afterAll(async () => { await app.close(); });

    it('6 aylık kontrol: 2031 Ocak–Temmuz, 2032 Mart–Eylül; her yılın takvimi ve testleri ayrı', async () => {
        const c = await createTestControl(prisma, { ownerId: id.planner });
        await prisma.control.update({ where: { id: c.id }, data: { frequency: 'SEMI_ANNUAL' } });

        await planYear(2031, c.id, 1);
        await planYear(2032, c.id, 3);

        const s31 = await prisma.controlYearScope.findFirstOrThrow({ where: { controlId: c.id, year: 2031 } });
        const s32 = await prisma.controlYearScope.findFirstOrThrow({ where: { controlId: c.id, year: 2032 } });
        expect(s31).toMatchObject({ referenceMonth: 1, selectedMonths: ['Ocak', 'Temmuz'] });
        expect(s32).toMatchObject({ referenceMonth: 3, selectedMonths: ['Mart', 'Eylül'] });

        const row31 = (await ws(2031, `&search=${c.controlId}`)).data[0];
        const row32 = (await ws(2032, `&search=${c.controlId}`)).data[0];
        expect(row31).toMatchObject({ effectiveReferenceMonth: 1, effectiveSelectedMonths: ['Ocak', 'Temmuz'] });
        expect(row32).toMatchObject({ effectiveReferenceMonth: 3, effectiveSelectedMonths: ['Mart', 'Eylül'] });

        // Aylık iş yükü grafiği de yıla özel ayları sayar.
        expect((await ws(2031)).workload.byMonth.map((n: number, i: number) => (n ? i : -1)).filter((i: number) => i >= 0)).toEqual([0, 6]);
        expect((await ws(2032)).workload.byMonth.map((n: number, i: number) => (n ? i : -1)).filter((i: number) => i >= 0)).toEqual([2, 8]);

        const tests32 = await prisma.controlTest.findMany({ where: { scopeId: s32.id, deletedAt: null }, select: { periodKey: true }, orderBy: { periodKey: 'asc' } });
        expect(tests32.map(t => t.periodKey)).toEqual(['M03', 'M09']);
    });

    it('kapsam matrisi: diğer yılların durumu okunur; başka yıla işaretleme o yılın taslağına yazılır, sayfa yılı etkilenmez', async () => {
        const c = await createTestControl(prisma, { ownerId: id.planner });
        let m = (await http().get(`${base}/scope-matrix?scope=ORG&years=2033&years=2034&controlIds=${c.id}`).set(as('planner')).expect(200)).body;
        expect(m.years).toEqual([
            expect.objectContaining({ year: 2033, draftRevision: 0, editable: true }),
            expect.objectContaining({ year: 2034, draftRevision: 0, editable: true }),
        ]);
        expect(m.cells[c.id]).toEqual({ 2033: { inScope: false, pendingAction: 'NONE' }, 2034: { inScope: false, pendingAction: 'NONE' } });
        expect(await prisma.annualPlanDraft.count({ where: { year: { in: [2033, 2034] } } })).toBe(0); // salt okuma

        await http().post(`${base}/2034/draft/items?scope=ORG`).set(as('planner')).send({ expectedRevision: 0, items: [{ controlId: c.id, inScope: true, assigneeId: id.first, secondControllerId: id.second }] }).expect(201);
        m = (await http().get(`${base}/scope-matrix?scope=ORG&years=2033&years=2034&controlIds=${c.id}`).set(as('planner')).expect(200)).body;
        expect(m.cells[c.id][2034]).toEqual({ inScope: true, pendingAction: 'ADD' });
        expect(m.cells[c.id][2033].inScope).toBe(false);
        expect(m.years.find((y: any) => y.year === 2034).draftRevision).toBe(1);

        // Onay bekleyen yıl düzenlenemez olarak işaretlenir.
        const w = await ws(2034);
        await http().post(`${base}/2034/submit`).set(as('planner')).send({ expectedRevision: w.draftRevision }).expect(201);
        m = (await http().get(`${base}/scope-matrix?scope=ORG&years=2034&controlIds=${c.id}`).set(as('planner')).expect(200)).body;
        expect(m.years[0]).toMatchObject({ draftStatus: 'PENDING_APPROVAL', editable: false });

        await http().get(`${base}/scope-matrix?scope=ORG&years=2034&controlIds=${c.id}`).set(as('first')).expect(403);
    });
});
