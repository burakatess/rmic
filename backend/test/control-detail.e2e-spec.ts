import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, createTestControl, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Kontrol detay ekranının beslendiği uçlar:
 * - GET /controls/:id → tüm bulgular (10 ile kesilmez), test sorumlusu/2. kontrolcü adları, yıl kapsamı kontrolcüleri,
 *   testlere bağlanan başka kontrol bulguları.
 * - GET /controls/:id/history → güncellemelerde alan farkı, kapsam ve risk eşleştirme olayları.
 * - Risk eşleştirme: FK doğrulaması + denetim izi; aktifleştir/pasifleştir: yok/aynı durum için okunur hata.
 */
describe('E2E — kontrol detayı', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const year = new Date().getFullYear();

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role] of [['admin', 'SYSTEM_ADMIN'], ['manager', 'RISK_CONTROL_MANAGER'], ['maker', 'AUDITOR']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `cd-${key}@e2e.local`, firstName: key, lastName: 'Kişi' });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `cd-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
    });
    afterAll(async () => { await app.close(); });

    it('detay: 10\'dan fazla bulgu, aksiyonlar, test kişileri, kapsam kontrolcüleri ve testlere bağlı başka kontrol bulguları', async () => {
        const c = await createTestControl(prisma, { ownerId: id.admin });
        const other = await createTestControl(prisma, { ownerId: id.admin });
        const scope = await prisma.controlYearScope.create({
            data: { controlId: c.id, year, code: `${year}.${c.controlId}`, frequency: 'MONTHLY', selectedMonths: [], addedById: id.admin, assigneeId: id.maker, secondControllerId: id.manager, controlVersion: 1 },
        });
        const test = await prisma.controlTest.create({
            data: { testNo: `${year}.CD-1`, controlId: c.id, scopeId: scope.id, year, plannedDate: new Date(Date.UTC(year, 11, 28)), status: 'BEKLIYOR', assigneeId: id.maker, secondControllerId: id.manager },
        });
        for (let i = 1; i <= 12; i++) {
            await prisma.finding.create({ data: { findingId: `B-CD-${String(i).padStart(4, '0')}`, controlId: c.id, description: `Bulgu ${i}`, impact: 'x', severity: 'MEDIUM', createdById: id.admin } as never });
        }
        const f1 = await prisma.finding.findUniqueOrThrow({ where: { findingId: 'B-CD-0001' } });
        await prisma.action.create({ data: { actionId: 'A-CD-0001', findingId: f1.id, description: 'Düzeltici aksiyon', dueDate: new Date(Date.UTC(year, 11, 31)), ownerId: id.maker } as never });
        const foreign = await prisma.finding.create({ data: { findingId: 'B-CD-X001', controlId: other.id, summary: 'Başka kontrol bulgusu', description: 'x', impact: 'x', severity: 'HIGH', createdById: id.admin } as never });
        await prisma.controlTestFindingLink.create({ data: { controlTestId: test.id, findingId: foreign.id, linkedById: id.maker } });
        // Kendi bulgusunun bağlantısı "diğer bulgular"da tekrar görünmez.
        await prisma.controlTestFindingLink.create({ data: { controlTestId: test.id, findingId: f1.id, linkedById: id.maker } });

        const body = (await http().get(`/controls/${c.id}`).set(as('maker')).expect(200)).body;
        expect(body.findings).toHaveLength(12);
        expect(body.findings.find((f: any) => f.id === f1.id).actions[0]).toMatchObject({ actionId: 'A-CD-0001', status: 'BEKLIYOR' });
        expect(body.tests[0]).toMatchObject({
            assignee: { id: id.maker, firstName: 'maker' },
            secondController: { id: id.manager, firstName: 'manager' },
            _count: { findingLinks: 2 },
        });
        expect(body.yearScopes[0]).toMatchObject({ assignee: { id: id.maker }, secondController: { id: id.manager } });
        expect(body.linkedFindings).toEqual([
            expect.objectContaining({ id: foreign.id, findingId: 'B-CD-X001', control: expect.objectContaining({ id: other.id }), viaTests: [{ id: test.id, testNo: test.testNo }] }),
        ]);
    });

    it('geçmiş: güncellemede yalnız değişen alanlar, risk eşleştirme ve pasifleştirme olayları kullanıcı adıyla', async () => {
        const c = await createTestControl(prisma, { ownerId: id.admin });
        await http().put(`/controls/${c.id}`).set(as('manager')).send({ name: 'Yeni ad', frequency: 'QUARTERLY' }).expect(200);

        const cat = await prisma.riskCategory.create({ data: { name: 'CD Kategori' } });
        const risk = await prisma.risk.create({
            data: { riskId: 'R-CD-1', name: 'Detay riski', description: 'Detay riski açıklaması', ownerId: id.admin, categoryId: cat.id, status: 'IDENTIFIED', inherentProbability: 2, inherentImpact: 3, inherentRiskScore: 6 },
        });
        await http().post(`/controls/${c.id}/map-risk`).set(as('manager')).send({ riskId: 'yok-boyle-risk' }).expect(400);
        await http().post(`/controls/${c.id}/map-risk`).set(as('manager')).send({ riskId: risk.id }).expect(201);
        await http().delete(`/controls/${c.id}/unmap-risk/${risk.id}`).set(as('manager')).expect(200);

        await http().patch(`/controls/${c.id}/activate`).set(as('manager')).expect(400); // zaten aktif
        await http().patch(`/controls/${c.id}/passivate`).set(as('maker')).expect(403); // rol yetkisi yok
        await http().patch(`/controls/${c.id}/passivate`).set(as('manager')).expect(200);
        await http().patch(`/controls/${c.id}/passivate`).set(as('manager')).expect(400); // zaten pasif
        await http().patch('/controls/yok-boyle-kontrol/passivate').set(as('manager')).expect(404);

        const hist = (await http().get(`/controls/${c.id}/history`).set(as('maker')).expect(200)).body as any[];
        expect(hist.map(h => h.action)).toEqual(['PASSIVATE', 'UNMAP_RISK', 'MAP_RISK', 'UPDATE']);
        expect(hist[0].by).toBe('manager Kişi');
        expect(hist[2].detail).toBe('R-CD-1 · Detay riski');
        const upd = hist[3];
        expect(upd.changes.map((x: any) => x.field).sort()).toEqual(['frequency', 'name']);
        expect(upd.changes.find((x: any) => x.field === 'name')).toMatchObject({ label: 'Kontrol adı', from: c.name, to: 'Yeni ad' });

        await http().get('/controls/yok-boyle-kontrol/history').set(as('maker')).expect(404);
    });
});
