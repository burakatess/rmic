import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Girdi doğrulaması: önceden `@Body() any` / satır içi tiple alınan uçlar artık DTO'dan geçer
 * (bilinmeyen alan, geçersiz enum, eksik zorunlu alan → 400) ve servisler tarih dönüşümü,
 * kısmi güncelleme, kimlik ve denetim kaydını doğru yapar.
 */
describe('E2E — DTO doğrulaması (eski serbest gövdeli uçlar)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role] of [['admin', 'SYSTEM_ADMIN'], ['mgr', 'RISK_CONTROL_MANAGER'], ['aud', 'AUDITOR']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `dto-${key}@e2e.local`, firstName: key === 'admin' ? 'Ada' : 'Kim', lastName: 'Test' });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `dto-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
        id.roleAud = roles.AUDITOR;
    });
    afterAll(async () => { await app.close(); });

    it('risk aksiyonu: tarih-yalnız değer kaydedilir; bilinmeyen alan, geçersiz durum ve olmayan risk 400; denetim kaydı yazılır', async () => {
        const created = await http().post('/risk-actions').set(as('mgr'))
            .send({ aksiyonTanimi: 'Yedekleme testleri düzenli yapılacak', hedeflenenTamamlanmaTarihi: '2027-03-31', riskIds: [] }).expect(201);
        expect(created.body.aksiyonId).toMatch(/^RA-\d{4}-\d{4}$/);
        expect(new Date(created.body.hedeflenenTamamlanmaTarihi).toISOString().slice(0, 10)).toBe('2027-03-31');
        await http().post('/risk-actions').set(as('mgr')).send({ aksiyonTanimi: 'x', aksiyonId: 'RA-HACK' }).expect(400);
        await http().put(`/risk-actions/${created.body.id}`).set(as('mgr')).send({ status: 'BILINMEYEN' }).expect(400);
        await http().put(`/risk-actions/${created.body.id}`).set(as('mgr')).send({ riskIds: ['yok-boyle-risk'] }).expect(400);
        await http().put(`/risk-actions/${created.body.id}`).set(as('mgr')).send({ status: 'DEVAM_EDIYOR', mutabakatTarihi: '' }).expect(200);
        expect(await prisma.auditLog.count({ where: { entityType: 'RiskAction', entityId: created.body.id } })).toBe(2);
    });

    it('risk kaydı: kısmi güncelleme gönderilmeyen alanı silmez; skorlar birleşik veriden hesaplanır', async () => {
        const e = (await http().post('/risk-entries').set(as('mgr')).send({ riskTanimi: 'Kritik sistem kesintisi', olasilik: 4, finansalEtki: 5, mutabakatTarihi: '2026-06-01' }).expect(201)).body;
        await http().post('/risk-entries').set(as('mgr')).send({ riskTanimi: 'x', olasilik: 9 }).expect(400);
        const u = (await http().put(`/risk-entries/${e.id}`).set(as('mgr')).send({ surec: 'BT Operasyon' }).expect(200)).body;
        expect(u.mutabakatTarihi).toBe(e.mutabakatTarihi);
        expect(u.dogalRiskPuani).toBe(e.dogalRiskPuani);
        expect(u.version).toBe(e.version + 1);
        await http().get('/risk-entries/yok').set(as('mgr')).expect(404);
    });

    it('denetim planı: geçersiz dönem türü 400; plan kodu istemciden alınmaz; olmayan plana yürütme 400', async () => {
        const base = { name: 'BT Denetimi', year: 2027, periodType: 'ANNUAL', objectives: 'Amaç', scope: 'Kapsam' };
        await http().post('/audit-plans').set(as('aud')).send({ ...base, periodType: 'MONTHLY' }).expect(400);
        await http().post('/audit-plans').set(as('aud')).send({ ...base, planId: 'AP-HACK' }).expect(400);
        const plan = (await http().post('/audit-plans').set(as('aud')).send({ ...base, plannedStartDate: null, rationale: 'RISK_BASED' }).expect(201)).body;
        expect(plan.planId).toBe('AP-2027-001');
        await http().put(`/audit-plans/${plan.id}`).set(as('aud')).send({ totalFindings: 5 }).expect(400);
        await http().post('/audit-executions').set(as('aud')).send({ auditPlanId: 'yok', startDate: '2027-01-10', auditor: 'Kim' }).expect(400);
        const ex = (await http().post('/audit-executions').set(as('aud')).send({ auditPlanId: plan.id, startDate: '2027-01-10', auditor: 'Kim' }).expect(201)).body;
        expect(ex.executionId).toBe('AE-2027-001');
    });

    it('direktörlük: aynı ad 400 (500 değil); güncelleme denetim kaydına girer', async () => {
        const d = (await http().post('/directorates').set(as('mgr')).send({ name: 'Bilgi Teknolojileri DTO' }).expect(201)).body;
        await http().post('/directorates').set(as('mgr')).send({ name: 'Bilgi Teknolojileri DTO' }).expect(400);
        await http().put(`/directorates/${d.id}`).set(as('mgr')).send({ gmy: 'Operasyon GMY' }).expect(200);
        await http().put('/directorates/yok').set(as('mgr')).send({ gmy: 'x' }).expect(404);
        expect(await prisma.auditLog.count({ where: { entityType: 'Directorate', entityId: d.id } })).toBe(2);
    });

    it('yönetici: kısa şifre ve geçersiz e-posta 400; seçenek düzenlemede kategori/değer değiştirilemez', async () => {
        await http().post(`/admin/users/${id.aud}/reset-password`).set(as('admin')).send({ newPassword: '' }).expect(400);
        await http().post(`/admin/users/${id.aud}/reset-password`).set(as('admin')).send({ newPassword: 'kisa' }).expect(400);
        await http().post('/admin/users').set(as('admin')).send({ email: 'gecersiz', password: 'UzunSifre123', firstName: 'A', lastName: 'B', roleId: id.roleAud }).expect(400);
        const opt = (await http().post('/admin/options').set(as('admin')).send({ category: 'dto_test', value: 'A', label: 'A', isActive: true }).expect(201)).body;
        await http().put(`/admin/options/${opt.id}`).set(as('admin')).send({ category: 'baska', label: 'B' }).expect(400);
        await http().put(`/admin/options/${opt.id}`).set(as('admin')).send({ label: 'B' }).expect(200);
        await http().put('/admin/siem-config').set(as('admin')).send({ format: 'CEF', syslogHost: 'siem.local', syslogPort: 514, enabled: true, extra: 1 }).expect(400);
        await http().put('/admin/siem-config').set(as('admin')).send({ format: 'CEF', syslogHost: 'siem.local', syslogPort: 514, enabled: true }).expect(200);
    });

    it('risk yönetimi kontrol testi: testi yapan oturumdaki kullanıcıdır; istemciden "tester" kabul edilmez', async () => {
        const c = (await http().post('/risk-management-controls').set(as('mgr')).send({ name: 'Erişim gözden geçirme', effectiveness: 4 }).expect(201)).body;
        expect(c.ownerId).toBe(id.mgr);
        await http().post(`/risk-management-controls/${c.id}/tests`).set(as('aud')).send({ result: 'EFFECTIVE', tester: 'baskasi' }).expect(400);
        const t = (await http().post(`/risk-management-controls/${c.id}/tests`).set(as('aud')).send({ result: 'EFFECTIVE', testDate: '2027-02-01' }).expect(201)).body;
        expect(t.tester).toBe(id.aud);
        await http().put(`/risk-management-controls/${c.id}/map-risk/x/applicability`).set(as('mgr')).send({ applicabilityScore: 9 }).expect(400);
    });
    it('bulgu oluşturma: closedDate / workflowStatus / resolutionStatus istemciden kabul edilmez (400); yeni bulgu TASLAK ve açık başlar', async () => {
        const base = { description: 'DTO sınırı için bulgu açıklaması', severity: 'HIGH' };
        for (const extra of [{ closedDate: '2026-01-01' }, { workflowStatus: 'IPTAL' }, { resolutionStatus: 'KAPATILDI' }]) {
            await http().post('/findings').set(as('admin')).send({ ...base, ...extra }).expect(400);
        }
        const res = await http().post('/findings').set(as('admin')).send(base);
        expect(res.status).toBeLessThan(300);
        const f = await prisma.finding.findUniqueOrThrow({ where: { id: res.body.id } });
        expect(f).toMatchObject({ workflowStatus: 'TASLAK', resolutionStatus: 'DEVAM_EDIYOR', closedDate: null });
    });
});
