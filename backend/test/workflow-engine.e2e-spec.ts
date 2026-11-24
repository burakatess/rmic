import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, createTestControl, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Ortak iş akışı: Bekliyor → Devam Ediyor → Tamamlandı (2. kontrolcüye iletildi) → Onaylandı.
 * Aşama atlanamaz, yapan ≠ onaylayan, geri alma/iptal yönetici rolünde, her geçiş geçmişe yazılır.
 * Yönetici onaylı silme (test, dönem kontrolü) ve kontrol testi ↔ bulgu çoklu ilişkisi.
 */
describe('E2E — ortak iş akışı motoru, onaylı silme, bulgu ilişkilendirme', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const year = new Date().getFullYear();
    let seq = 0;

    const state = async (who: string, type: string, eid: string) => (await http().get(`/workflow/${type}/${eid}`).set(as(who)).expect(200)).body;
    const act = (who: string, type: string, eid: string, action: string, reason?: string) =>
        http().post(`/workflow/${type}/${eid}/transition`).set(as(who)).send({ action, ...(reason ? { reason } : {}) });

    async function scopeWithTests(n: number) {
        const c = await createTestControl(prisma, { ownerId: id.admin });
        const scope = await prisma.controlYearScope.create({
            data: { controlId: c.id, year, code: `${year}.${c.controlId}`, frequency: 'MONTHLY', selectedMonths: [], addedById: id.admin, assigneeId: id.maker, secondControllerId: id.checker, controlVersion: 1 },
        });
        const tests = [];
        for (let i = 0; i < n; i++) {
            tests.push(await prisma.controlTest.create({
                data: { testNo: `${year}.WF-${++seq}`, controlId: c.id, scopeId: scope.id, year, plannedDate: new Date(Date.UTC(year, 11, 28)), status: 'BEKLIYOR', assigneeId: id.maker, secondControllerId: id.checker },
            }));
        }
        return { control: c, scope, tests };
    }
    async function runToApproved(testId: string) {
        await act('maker', 'CONTROL_TEST', testId, 'START').expect(201);
        await http().patch(`/controls/tests/${testId}/complete`).set(as('maker')).send({ findingStatus: 'BULGUSU_YOK', resultText: 'Sapma tespit edilmedi.' }).expect(200);
        await http().post('/workflow/board/move').set(as('checker')).send({ entityType: 'CONTROL_TEST', entityId: testId, toStage: 'ONAYLANDI' }).expect(201);
    }

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role] of [['admin', 'SYSTEM_ADMIN'], ['manager', 'RISK_CONTROL_MANAGER'], ['checker', 'RISK_CONTROL_MANAGER'], ['maker', 'AUDITOR']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `wf-${key}@e2e.local`, firstName: key, lastName: 'Test' });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `wf-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
    });
    afterAll(async () => { await app.close(); });

    it('kontrol testi: sıralı ilerler, aşama atlanamaz, yapan onaylayamaz; her geçiş kullanıcı ve zamanla geçmişte', async () => {
        const { tests: [t] } = await scopeWithTests(1);
        let s = await state('maker', 'CONTROL_TEST', t.id);
        expect(s.stage).toBe('BEKLIYOR');
        expect(s.actions.map((a: any) => a.action)).toContain('START');

        // Bekliyor → Tamamlandı / Onaylandı atlanamaz.
        await http().post('/workflow/board/move').set(as('maker')).send({ entityType: 'CONTROL_TEST', entityId: t.id, toStage: 'TAMAMLANDI' }).expect(409);
        await http().post('/workflow/board/move').set(as('checker')).send({ entityType: 'CONTROL_TEST', entityId: t.id, toStage: 'ONAYLANDI' }).expect(409);
        await act('maker', 'CONTROL_TEST', t.id, 'APPROVE').expect(409);

        await act('maker', 'CONTROL_TEST', t.id, 'START').expect(201);
        // Tamamlama zorunlu alanlı form ister (değerlendirme + sonuç).
        const form = await act('maker', 'CONTROL_TEST', t.id, 'COMPLETE').expect(400);
        expect(form.body.code ?? form.body.message?.code).toBeDefined();
        await http().patch(`/controls/tests/${t.id}/complete`).set(as('maker')).send({ findingStatus: 'BULGUSU_YOK', resultText: 'Sapma tespit edilmedi.' }).expect(200);
        s = await state('maker', 'CONTROL_TEST', t.id);
        expect(s.stage).toBe('TAMAMLANDI');

        // Yapan kendi çalışmasını onaylayamaz; 2. kontrolcü onaylar.
        expect((await act('maker', 'CONTROL_TEST', t.id, 'APPROVE')).status).toBeGreaterThanOrEqual(400);
        await act('checker', 'CONTROL_TEST', t.id, 'APPROVE').expect(201);
        s = await state('checker', 'CONTROL_TEST', t.id);
        expect(s.stage).toBe('ONAYLANDI');
        expect(s.history.map((h: any) => `${h.from}>${h.to}`)).toEqual(['TAMAMLANDI>ONAYLANDI', 'DEVAM_EDIYOR>TAMAMLANDI', 'BEKLIYOR>DEVAM_EDIYOR']);
        expect(s.history[0].by.id).toBe(id.checker);
        expect(s.history[2].by.id).toBe(id.maker);

        // Geri alma: yalnız yönetici, gerekçe zorunlu.
        await act('maker', 'CONTROL_TEST', t.id, 'REVERT', 'yanlış onay').expect(403);
        await act('manager', 'CONTROL_TEST', t.id, 'REVERT').expect(400);
        await act('manager', 'CONTROL_TEST', t.id, 'REVERT', 'Kanıt yeniden incelenecek').expect(201);
        expect((await state('manager', 'CONTROL_TEST', t.id)).stage).toBe('TAMAMLANDI');
        // İade: gerekçeyle Devam Ediyor'a; denetim izinde.
        await act('checker', 'CONTROL_TEST', t.id, 'RETURN', 'Kanıt eksik').expect(201);
        expect((await state('maker', 'CONTROL_TEST', t.id)).stage).toBe('DEVAM_EDIYOR');
        expect(await prisma.auditLog.count({ where: { entityId: t.id, action: { in: ['REVERT_TEST_STAGE', 'RETURN_TEST', 'APPROVE_TEST'] } } })).toBe(3);
        // İptal: yönetici + gerekçe.
        await act('maker', 'CONTROL_TEST', t.id, 'CANCEL', 'gereksiz').expect(403);
        await act('manager', 'CONTROL_TEST', t.id, 'CANCEL', 'Mükerrer test').expect(201);
        expect((await prisma.controlTest.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('IPTAL');
    });

    it('kontrol testi silme: talep kaydı silmez; talep eden onaylayamaz; yönetici onayında yalnız o test silinir', async () => {
        const { control, tests: [t1, t2] } = await scopeWithTests(2);
        await http().post('/deletion-requests').set(as('maker')).send({ entityType: 'CONTROL_TEST', entityId: t1.id }).expect(400); // gerekçe zorunlu
        await http().post('/deletion-requests').set(as('maker')).send({ entityType: 'CONTROL_TEST', entityId: t1.id, reason: 'Yanlış dönem için açıldı' }).expect(201);
        let row = await prisma.controlTest.findUniqueOrThrow({ where: { id: t1.id } });
        expect(row).toMatchObject({ status: 'BEKLIYOR', deletedAt: null, deletionRequestedById: id.maker });
        await http().post('/deletion-requests').set(as('maker')).send({ entityType: 'CONTROL_TEST', entityId: t1.id, reason: 'tekrar' }).expect(409);

        await http().post(`/deletion-requests/CONTROL_TEST/${t1.id}/approve`).set(as('maker')).expect(403); // yönetici değil
        const pending = (await http().get('/deletion-requests').set(as('manager')).expect(200)).body;
        expect(pending.find((p: any) => p.id === t1.id)).toMatchObject({ canDecide: true, requestedBy: { id: id.maker } });
        await http().post(`/deletion-requests/CONTROL_TEST/${t1.id}/approve`).set(as('manager')).expect(201);

        row = await prisma.controlTest.findUniqueOrThrow({ where: { id: t1.id } });
        expect(row).toMatchObject({ status: 'IPTAL', deletedById: id.manager, deletionDecidedById: id.manager });
        expect(row.deletedAt).not.toBeNull();
        // Ana kontrol ve diğer test etkilenmez; silinen test listelerde görünmez.
        expect(await prisma.control.count({ where: { id: control.id } })).toBe(1);
        expect((await prisma.controlTest.findUniqueOrThrow({ where: { id: t2.id } })).status).toBe('BEKLIYOR');
        const list = (await http().get('/controls/tests').query({ limit: '500' }).set(as('admin')).expect(200)).body.data as any[];
        expect(list.some(x => x.id === t1.id)).toBe(false);
        expect(list.some(x => x.id === t2.id)).toBe(true);
        expect(await prisma.auditLog.count({ where: { entityId: t1.id, action: { in: ['DELETE_REQUEST', 'DELETE_APPROVE'] } } })).toBe(2);

        // Kendi talebini yönetici de onaylayamaz; ret gerekçeli ve kayıt korunur.
        await http().post('/deletion-requests').set(as('manager')).send({ entityType: 'CONTROL_TEST', entityId: t2.id, reason: 'Kontrol ediliyor' }).expect(201);
        await http().post(`/deletion-requests/CONTROL_TEST/${t2.id}/approve`).set(as('manager')).expect(403);
        await http().post(`/deletion-requests/CONTROL_TEST/${t2.id}/reject`).set(as('checker')).send({}).expect(400);
        await http().post(`/deletion-requests/CONTROL_TEST/${t2.id}/reject`).set(as('checker')).send({ reason: 'Test gerekli' }).expect(201);
        expect(await prisma.controlTest.findUniqueOrThrow({ where: { id: t2.id } })).toMatchObject({ deletionRequestedAt: null, deletionRejectionReason: 'Test gerekli', deletedAt: null });
    });

    it('dönem kontrolü silme: doğrudan silme uç noktası talep oluşturur; yönetici onayıyla kapsam kaldırılır, onaylı testler korunur', async () => {
        const { control, scope, tests: [t] } = await scopeWithTests(1);
        await runToApproved(t.id);
        const r = await http().delete(`/controls/${control.id}/scope/${year}`).set(as('maker')).send({ reason: 'Kontrol bu yıl uygulanmayacak' }).expect(200);
        expect(r.body.requested).toBe(true);
        expect((await prisma.controlYearScope.findUniqueOrThrow({ where: { id: scope.id } })).status).toBe('ACTIVE');
        await http().post(`/deletion-requests/PERIOD_CONTROL/${scope.id}/approve`).set(as('manager')).expect(201);
        const after = await prisma.controlYearScope.findUniqueOrThrow({ where: { id: scope.id } });
        expect(after).toMatchObject({ status: 'REMOVED', deletionDecidedById: id.manager });
        expect((await prisma.controlTest.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('ONAYLANDI');
    });

    it('dönem kontrolü akışı: testler onaylanmadan tamamlanamaz; 1. kontrolcü tamamlar, kendisi onaylayamaz, 2. kontrolcü onaylar', async () => {
        const { scope, tests: [a, b] } = await scopeWithTests(2);
        await runToApproved(a.id);
        expect((await state('maker', 'PERIOD_CONTROL', scope.id)).stage).toBe('DEVAM_EDIYOR');
        await act('maker', 'PERIOD_CONTROL', scope.id, 'COMPLETE').expect(400);
        await runToApproved(b.id);
        await act('maker', 'PERIOD_CONTROL', scope.id, 'COMPLETE').expect(201);
        expect((await state('maker', 'PERIOD_CONTROL', scope.id)).stage).toBe('TAMAMLANDI');
        await act('maker', 'PERIOD_CONTROL', scope.id, 'APPROVE').expect(403);
        await act('checker', 'PERIOD_CONTROL', scope.id, 'RETURN', 'Özet eksik').expect(201);
        await act('maker', 'PERIOD_CONTROL', scope.id, 'COMPLETE').expect(201);
        await act('checker', 'PERIOD_CONTROL', scope.id, 'APPROVE').expect(201);
        const s = await state('checker', 'PERIOD_CONTROL', scope.id);
        expect(s.stage).toBe('ONAYLANDI');
        expect(s.history.map((h: any) => h.action)).toEqual(['APPROVE', 'COMPLETE', 'RETURN', 'COMPLETE']);
    });

    it('kontrol testi ↔ bulgu: başka kontrolden bulgu da seçilir, çoklu bağlanır, iki yönlü görünür; 2. kontrolcü ve onaylı test değiştiremez', async () => {
        const { tests: [t] } = await scopeWithTests(1);
        const other = await createTestControl(prisma, { ownerId: id.admin });
        const mk = (fid: string, controlId: string) => prisma.finding.create({ data: { findingId: fid, controlId, description: `${fid} açıklaması`, summary: `${fid} başlığı`, impact: 'x', severity: 'HIGH', workflowStatus: 'MUTABAKAT_YAPILDI', resolutionStatus: 'DEVAM_EDIYOR', status: 'IN_PROGRESS', createdById: id.admin } as never });
        const fSame = await mk('B-9999-0101', t.controlId);
        const fOther = await mk('B-9999-0102', other.id);

        const cands = (await http().get(`/controls/tests/${t.id}/finding-candidates`).set(as('maker')).expect(200)).body as any[];
        expect(cands.find(c => c.id === fSame.id)?.relation).toBe('SAME_CONTROL');
        expect(cands.find(c => c.id === fOther.id)?.relation).toBe('OTHER_CONTROL');

        await http().put(`/controls/tests/${t.id}/finding-links`).set(as('checker')).send({ findingIds: [fSame.id] }).expect(403);
        await http().put(`/controls/tests/${t.id}/finding-links`).set(as('maker')).send({ findingIds: [fSame.id, fOther.id] }).expect(200);
        const links = (await http().get(`/controls/tests/${t.id}/finding-links`).set(as('maker')).expect(200)).body as any[];
        expect(links.map(l => l.finding.findingId).sort()).toEqual(['B-9999-0101', 'B-9999-0102']);
        const fd = (await http().get(`/findings/${fOther.id}`).set(as('admin')).expect(200)).body;
        expect(fd.testLinks.map((l: any) => l.controlTest.testNo)).toEqual([t.testNo]);

        await runToApproved(t.id);
        await http().put(`/controls/tests/${t.id}/finding-links`).set(as('maker')).send({ findingIds: [] }).expect(409);
    });

    it('Kanban panosu: sütunlar ve sayılar; sorumluya göre süzme; yalnız yönetici kurum genelini görür', async () => {
        const board = (await http().get('/workflow/board').query({ type: 'CONTROL_TEST' }).set(as('maker')).expect(200)).body;
        expect(board.columns.map((c: any) => c.stage)).toEqual(['BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'ONAYLANDI']);
        const total = board.columns.reduce((n: number, c: any) => n + c.total, 0);
        expect(total).toBeGreaterThan(0);
        expect(board.scope).toBe('MINE');
        expect((await http().get('/workflow/board').query({ scope: 'ORG' }).set(as('maker')).expect(200)).body.scope).toBe('MINE');
        expect((await http().get('/workflow/board').query({ scope: 'ORG' }).set(as('manager')).expect(200)).body.scope).toBe('ORG');
        const filtered = (await http().get('/workflow/board').query({ scope: 'ORG', assigneeId: id.checker }).set(as('manager')).expect(200)).body;
        for (const col of filtered.columns) for (const it of col.items) expect([it.assignee?.id, it.checker?.id]).toContain(id.checker);
    });
});
