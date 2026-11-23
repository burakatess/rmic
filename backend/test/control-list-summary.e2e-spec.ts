import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, createTestControl, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Envanter listesi özeti: bu yılın test uyumu (tamamlanan/planlanan), gecikmiş test sayısı,
 * sıradaki açık test ve açık bulgu sayısı — gecikme kuralı tek kaynaktan (bugün gecikmiş değil).
 */
describe('E2E — kontrol envanteri liste özeti', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let token: string;
    const http = () => request(app.getHttpServer());
    const year = new Date().getFullYear();
    // Yılın ortası: "gelecek/geçmiş" kararı gün sınırına değil, belirgin farklara dayanır.
    const inYear = (month: number, d = 15) => new Date(Date.UTC(year, month, d, 9));

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        const admin = await createTestUser(prisma, roles.SYSTEM_ADMIN, { email: 'list-sum@e2e.local' });
        token = (await http().post('/auth/login').send({ email: 'list-sum@e2e.local', password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        const c = await createTestControl(prisma, { ownerId: admin.id });
        let n = 0;
        const test = (status: string, plannedDate: Date) => prisma.controlTest.create({ data: { testNo: `${year}.KBT-LS${++n}`, controlId: c.id, plannedDate, status: status as never } });
        await test('ONAYLANDI', inYear(0));
        await test('TAMAMLANDI', inYear(1));
        await test('IPTAL', inYear(2));            // iptal: planlanana sayılmaz
        // Yıl sınırlarına dayalı sabit tarihler: yılın ilk günü (gecikmiş sayılır; 1 Ocak'ın kendisi hariç) ve son günü (gelecek).
        await test('BEKLIYOR', new Date(Date.UTC(year, 0, 1, 9)));   // açık, geçmiş → gecikmiş
        await test('BEKLIYOR', new Date(Date.UTC(year, 11, 31, 9))); // açık, gelecek
        await prisma.finding.create({ data: { findingId: 'B-9999-0001', controlId: c.id, description: 'Açık bulgu', impact: 'x', severity: 'HIGH', workflowStatus: 'TASLAK', resolutionStatus: 'DEVAM_EDIYOR', status: 'IN_PROGRESS', createdById: admin.id } as never });
        await prisma.finding.create({ data: { findingId: 'B-9999-0002', controlId: c.id, description: 'Kapalı bulgu', impact: 'x', severity: 'HIGH', workflowStatus: 'MUTABAKAT_YAPILDI', resolutionStatus: 'KAPATILDI', status: 'CLOSED', createdById: admin.id } as never });
    });
    afterAll(async () => { await app.close(); });

    it('test uyumu, gecikme, sıradaki test ve açık bulgu sayısı doğru; iptal ve kapalı kayıtlar sayılmaz', async () => {
        const res = (await http().get('/controls').set({ Authorization: `Bearer ${token}` }).expect(200)).body.data as any[];
        const c = res[0];
        const jan1 = new Date().getUTCMonth() === 0 && new Date().getUTCDate() <= 1; // 1 Ocak'ta "yılın ilk günü" henüz gecikmiş değil
        expect(c.testSummary).toMatchObject({ year, planned: 4, completed: 2, overdue: jan1 ? 0 : 1 });
        // sıradaki açık test = en erken açık test (yılın ilk günü)
        expect(new Date(c.testSummary.nextPlannedDate).toISOString().slice(0, 10)).toBe(`${year}-01-01`);
        expect(c.openFindingCount).toBe(1);
    });
});
