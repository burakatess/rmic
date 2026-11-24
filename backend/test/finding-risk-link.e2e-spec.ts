import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Bulgu ↔ risk eşleştirmesi: mevcut Risk Envanteri kayıtlarıyla çoktan çoğa; geçersiz risk 400,
 * mükerrer eşleştirme 409, olmayan eşleştirmeyi kaldırma 404; eşleştirme risk detayında da görünür;
 * ekleme/kaldırma denetim izi ve bulgu tarihçesine risk koduyla yazılır; yeni risk kaydı oluşmaz.
 */
describe('E2E — bulgu ↔ risk eşleştirmesi', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let token = '';
    let userId = '';
    const http = () => request(app.getHttpServer());
    const as = () => ({ Authorization: `Bearer ${token}` });

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        const u = await createTestUser(prisma, roles.SYSTEM_ADMIN, { email: 'frl-admin@e2e.local', firstName: 'Risk', lastName: 'Yönetici' });
        userId = u.id;
        token = (await http().post('/auth/login').send({ email: 'frl-admin@e2e.local', password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
    });
    afterAll(async () => { await app.close(); });

    it('çoklu eşleştirme, mükerrer/geçersiz engeli, iki yönlü görünüm ve denetim izi', async () => {
        const cat = await prisma.riskCategory.create({ data: { name: 'Eşleştirme Kategori' } });
        const mk = (code: string, name: string) => prisma.risk.create({
            data: { riskId: code, name, description: `${name} tanımı`, ownerId: userId, categoryId: cat.id, status: 'IDENTIFIED', inherentProbability: 3, inherentImpact: 3, inherentRiskScore: 9 },
        });
        const r1 = await mk('R-EL-1', 'Yetkisiz erişim riski');
        const r2 = await mk('R-EL-2', 'Veri kaybı riski');
        const riskCount = await prisma.risk.count();
        const f = (await http().post('/findings').set(as()).send({ description: 'Risk eşleştirme testi için yeterince uzun bulgu metni', summary: 'Eşleştirme bulgusu', severity: 'HIGH' }).expect(201)).body;

        await http().post(`/findings/${f.id}/link-risk`).set(as()).send({ riskId: 'yok-boyle-risk' }).expect(400);
        await http().post(`/findings/${f.id}/link-risk`).set(as()).send({ riskId: r1.id }).expect(201);
        await http().post(`/findings/${f.id}/link-risk`).set(as()).send({ riskId: r2.id }).expect(201);
        const dup = await http().post(`/findings/${f.id}/link-risk`).set(as()).send({ riskId: r1.id }).expect(409);
        expect(dup.body.message).toContain('R-EL-1');

        const detail = (await http().get(`/findings/${f.id}`).set(as()).expect(200)).body;
        expect(detail.linkedRisks.map((r: any) => r.riskId).sort()).toEqual(['R-EL-1', 'R-EL-2']);
        expect(detail.linkedRisks.find((r: any) => r.id === r1.id).description).toBe('Yetkisiz erişim riski tanımı');
        // Risk detayında da görünür (iki yönlü).
        const risk = (await http().get(`/risks/${r1.id}`).set(as()).expect(200)).body;
        expect(risk.linkedFindings.map((x: any) => x.id)).toEqual([f.id]);
        expect(await prisma.risk.count()).toBe(riskCount); // yeni risk kaydı oluşmaz

        await http().delete(`/findings/${f.id}/unlink-risk/${r2.id}`).set(as()).expect(200);
        await http().delete(`/findings/${f.id}/unlink-risk/${r2.id}`).set(as()).expect(404);
        expect((await http().get(`/findings/${f.id}`).set(as()).expect(200)).body.linkedRisks.map((r: any) => r.riskId)).toEqual(['R-EL-1']);

        const audit = await prisma.auditLog.findMany({ where: { entityId: f.id, action: { in: ['FINDING_RISK_LINK', 'FINDING_RISK_UNLINK'] } }, orderBy: { createdAt: 'asc' } });
        expect(audit.map(a => a.action)).toEqual(['FINDING_RISK_LINK', 'FINDING_RISK_LINK', 'FINDING_RISK_UNLINK']);
        expect((audit[2].oldValue as any).riskCode).toBe('R-EL-2');
        const hist = await prisma.findingStatusHistory.findMany({ where: { findingId: f.id, operation: { in: ['RISK_LINKED', 'RISK_UNLINKED'] } } });
        expect(hist).toHaveLength(3);
    });
});
