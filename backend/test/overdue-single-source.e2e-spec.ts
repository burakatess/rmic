import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, createTestDirectorate, createTestControl, createTestControlTest, E2E_TEST_PASSWORD } from './helpers/fixtures';
import {
    isActionOverdue, isFindingOverdue, isFollowUpOverdue, isTestOverdue,
    overdueActionWhere, overdueFindingWhere, overdueFollowUpWhere, overdueTestWhere, overdueThreshold,
} from '../src/common/util/metric-definitions';
import { projectActionStatus, projectFindingTiming, projectFollowUpStatus, projectTestStatus } from '../src/common/workflow/workflow-projection';

/**
 * Gecikme kuralı TEK KAYNAK: aynı kayıt için (a) JS koşulu, (b) Prisma where, (c) projeksiyon `timingStatus`,
 * (d) liste ucunun `overdue=true` süzgeci ve `summary.overdueCount` AYNI sonucu verir — sınır durumlarda:
 * termini bugün olan gecikmiş DEĞİLDİR (önceden liste "gecikmiş", pano "gecikmemiş" diyordu).
 */
describe('E2E — gecikme kuralı: JS koşulu = veritabanı sorgusu = projeksiyon = liste ucu', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let token: string;
    let adminId: string;
    const http = () => request(app.getHttpServer());
    const now = new Date();
    // Ekran/DTO tarihleri 'YYYY-AA-GG' → UTC gece yarısı; İstanbul takvim gününün başı eşiktir.
    const istDay = (offset: number) => new Date(overdueThreshold(now).getTime() + offset * 86400000 + 3 * 3600000);
    const YESTERDAY = istDay(-1), TODAY = istDay(0), TOMORROW = istDay(1);
    let seq = 0;
    const ids: Record<string, string> = {};

    async function mkFinding(extra: Record<string, unknown> = {}) {
        seq++;
        return prisma.finding.create({
            data: { findingId: `B-8888-${String(seq).padStart(4, '0')}`, description: 'Gecikme testi bulgusu', impact: 'Etki', severity: 'LOW', workflowStatus: 'MUTABAKAT_YAPILDI', resolutionStatus: 'DEVAM_EDIYOR', status: 'IN_PROGRESS', createdById: adminId, ...extra } as never,
        });
    }

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        adminId = (await createTestUser(prisma, roles.SYSTEM_ADMIN, { email: 'od-admin@e2e.local' })).id;
        token = (await http().post('/auth/login').send({ email: 'od-admin@e2e.local', password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
    });
    afterAll(async () => { await app.close(); });
    const auth = () => ({ Authorization: `Bearer ${token}` });

    /** Satır kümesi için dört kaynağın sonucunu karşılaştırır; beklenen gecikmiş kimlik kümesini döner. */
    async function parity<T extends { id: string }>(opts: {
        label: string; rows: T[]; js: (r: T) => boolean; where: object; findIds: (where: object) => Promise<string[]>; projection: (r: T) => string | undefined; expectOverdue: string[];
    }) {
        const jsSet = opts.rows.filter(opts.js).map(r => r.id).sort();
        const dbSet = (await opts.findIds(opts.where)).sort();
        const projSet = opts.rows.filter(r => opts.projection(r) === 'GECIKMIS').map(r => r.id).sort();
        const expected = opts.expectOverdue.map(k => ids[k]).sort();
        expect({ label: opts.label, js: jsSet }).toEqual({ label: opts.label, js: expected });
        expect({ label: opts.label, db: dbSet }).toEqual({ label: opts.label, db: expected });
        expect({ label: opts.label, projection: projSet }).toEqual({ label: opts.label, projection: expected });
        return expected;
    }

    it('aksiyon: dün/bugün/tamamlanmış/iptal/taslak sınırları — dört kaynak aynı kümeyi verir; liste süzgeci ve sayaç aynı', async () => {
        const f = await mkFinding();
        const mk = async (key: string, extra: Record<string, unknown>) => {
            seq++;
            const a = await prisma.action.create({ data: { actionId: `A-8888-${String(seq).padStart(4, '0')}-01`, description: 'Gecikme testi aksiyonu', findingId: f.id, ownerId: adminId, dueDate: YESTERDAY, status: 'BEKLIYOR', approvalState: 'ONAYLANDI', ...extra } as never });
            ids[key] = a.id;
        };
        await mk('a-yesterday', {});
        await mk('a-progress', { status: 'DEVAM_EDIYOR' });
        await mk('a-today', { dueDate: TODAY });
        await mk('a-tomorrow', { dueDate: TOMORROW });
        await mk('a-done', { status: 'TAMAMLANDI' });
        await mk('a-closed', { status: 'KAPATILDI' });
        await mk('a-cancelled', { status: 'IPTAL', deletedAt: new Date() });
        await mk('a-draft', { approvalState: 'TASLAK' });
        await mk('a-waiting', { approvalState: 'ONAY_BEKLIYOR' });
        const rows = await prisma.action.findMany({ where: { findingId: f.id } });
        const expectOverdue = ['a-yesterday', 'a-progress'];
        await parity({
            label: 'action', rows, js: r => isActionOverdue(r, now), where: overdueActionWhere(now),
            findIds: async w => (await prisma.action.findMany({ where: { AND: [{ findingId: f.id }, w] }, select: { id: true } })).map(r => r.id),
            projection: r => projectActionStatus(r.status, r.dueDate, now, r.approvalState).timingStatus, expectOverdue,
        });
        // Liste ucu: süzgeç ve KPI sayacı aynı kaynak
        const list = (await http().get('/actions').query({ findingId: f.id, overdue: 'true', limit: '50' }).set(auth()).expect(200)).body;
        expect(list.data.map((r: { id: string }) => r.id).sort()).toEqual(expectOverdue.map(k => ids[k]).sort());
        const all = (await http().get('/actions').query({ findingId: f.id, limit: '3' }).set(auth()).expect(200)).body;
        expect(all.summary.overdueCount).toBe(2); // yalnız açık sayfa (3 satır) değil, tüm sonuç
        expect(all.data.every((r: { timingStatus: string; isOverdue: boolean }) => r.isOverdue === (r.timingStatus === 'GECIKMIS'))).toBe(true);
        const today = all.data.find((r: { id: string }) => r.id === ids['a-today']) ?? (await http().get(`/actions/${ids['a-today']}`).set(auth()).expect(200)).body;
        expect(today.timingStatus).not.toBe('GECIKMIS'); // termini bugün olan gecikmiş değil
    });

    it('kontrol testi: açık statüler gecikmiş; onay bekleyen/onaylı değil — kaynaklar ve liste aynı', async () => {
        const dir = await createTestDirectorate(prisma);
        const control = await createTestControl(prisma, { ownerId: adminId, directorateId: dir.id });
        const mk = async (key: string, status: string, plannedDate: Date) => {
            const t = await createTestControlTest(prisma, { controlId: control.id, status });
            await prisma.controlTest.update({ where: { id: t.id }, data: { plannedDate } });
            ids[key] = t.id;
        };
        await mk('t-wait', 'BEKLIYOR', YESTERDAY);
        await mk('t-prog', 'DEVAM_EDIYOR', YESTERDAY);
        await mk('t-back', 'GERI_GONDERILDI', YESTERDAY);
        await mk('t-done', 'TAMAMLANDI', YESTERDAY);
        await mk('t-approved', 'ONAYLANDI', YESTERDAY);
        await mk('t-today', 'BEKLIYOR', TODAY);
        const rows = await prisma.controlTest.findMany({ where: { controlId: control.id } });
        await parity({
            label: 'test', rows, js: r => isTestOverdue(r, now), where: overdueTestWhere(now),
            findIds: async w => (await prisma.controlTest.findMany({ where: { AND: [{ controlId: control.id }, w] }, select: { id: true } })).map(r => r.id),
            projection: r => projectTestStatus(r.status, r.plannedDate, now).timingStatus, expectOverdue: ['t-wait', 't-prog', 't-back'],
        });
        const res = (await http().get('/controls/tests').query({ controlId: control.id, overdue: 'true', limit: '50', includeOutOfScope: 'true' }).set(auth()).expect(200)).body;
        expect(res.data.map((r: { id: string }) => r.id).sort()).toEqual(['t-wait', 't-prog', 't-back'].map(k => ids[k]).sort());
        expect(res.summary.overdueCount).toBe(3);
        expect(res.data.every((r: { timingStatus: string }) => r.timingStatus === 'GECIKMIS')).toBe(true);
    });

    it('takip çalışması: yalnız açık ve silinmemiş gecikmiş; tamamlanan/silinen/bugünkü değil', async () => {
        const f = await mkFinding();
        const mk = async (key: string, extra: Record<string, unknown>) => {
            seq++;
            const fu = await prisma.findingFollowUp.create({ data: { followUpId: `T-8888-${seq}`, findingId: f.id, status: 'BEKLIYOR', plannedDate: YESTERDAY, ...extra } as never });
            ids[key] = fu.id;
        };
        await mk('f-wait', {});
        await mk('f-prog', { status: 'DEVAM_EDIYOR' });
        await mk('f-done', { status: 'TAMAMLANDI', approvalStatus: 'BEKLIYOR' });
        await mk('f-deleted', { status: 'IPTAL', deletedAt: new Date() });
        await mk('f-today', { plannedDate: TODAY });
        const rows = await prisma.findingFollowUp.findMany({ where: { findingId: f.id } });
        await parity({
            label: 'followup', rows, js: r => isFollowUpOverdue(r, now), where: overdueFollowUpWhere(now),
            findIds: async w => (await prisma.findingFollowUp.findMany({ where: { AND: [{ findingId: f.id }, w] }, select: { id: true } })).map(r => r.id),
            projection: r => projectFollowUpStatus(r.status, r.approvalStatus, r.plannedDate, now, r.deletedAt).timingStatus, expectOverdue: ['f-wait', 'f-prog'],
        });
        const res = (await http().get('/follow-ups').query({ overdue: 'true', limit: '50' }).set(auth()).expect(200)).body;
        expect(res.data.filter((r: { id: string }) => [ids['f-wait'], ids['f-prog']].includes(r.id))).toHaveLength(2);
        expect(res.data.some((r: { id: string }) => [ids['f-done'], ids['f-deleted'], ids['f-today']].includes(r.id))).toBe(false);
        expect(res.summary.overdueCount).toBeGreaterThanOrEqual(2);
    });

    it('bulgu: kapalı (KAPATILDI) ve iptal bulgu gecikmiş sayılmaz (eski ekran kapalı bulguyu gecikmiş gösteriyordu); yaklaşan ayrı', async () => {
        const mk = async (key: string, extra: Record<string, unknown>) => { ids[key] = (await mkFinding({ targetResolutionDate: YESTERDAY, ...extra })).id; };
        await mk('b-open', {});
        await mk('b-closed', { resolutionStatus: 'KAPATILDI' });
        await mk('b-legacy-closed', { status: 'CLOSED' });
        await mk('b-cancelled', { workflowStatus: 'IPTAL' });
        await mk('b-today', { targetResolutionDate: TODAY });
        await mk('b-soon', { targetResolutionDate: istDay(5) });
        await mk('b-far', { targetResolutionDate: istDay(60) });
        const keys = ['b-open', 'b-closed', 'b-legacy-closed', 'b-cancelled', 'b-today', 'b-soon', 'b-far'].map(k => ids[k]);
        const rows = await prisma.finding.findMany({ where: { id: { in: keys } } });
        await parity({
            label: 'finding', rows, js: r => isFindingOverdue(r, now), where: overdueFindingWhere(now),
            findIds: async w => (await prisma.finding.findMany({ where: { AND: [{ id: { in: keys } }, w] }, select: { id: true } })).map(r => r.id),
            projection: r => projectFindingTiming(r, now).timingStatus, expectOverdue: ['b-open'],
        });
        expect(projectFindingTiming(rows.find(r => r.id === ids['b-soon'])!, now).timingStatus).toBe('YAKLASIYOR');
        expect(projectFindingTiming(rows.find(r => r.id === ids['b-far'])!, now).timingStatus).toBe('ZAMANINDA');
        const od = (await http().get('/findings').query({ delayStatus: 'OVERDUE', limit: '100' }).set(auth()).expect(200)).body;
        const odIds = od.data.map((r: { id: string }) => r.id);
        expect(odIds).toContain(ids['b-open']);
        for (const k of ['b-closed', 'b-legacy-closed', 'b-cancelled', 'b-today']) expect(odIds).not.toContain(ids[k]);
        expect(od.summary.overdueCount).toBe(od.pagination.total);
    });
});
