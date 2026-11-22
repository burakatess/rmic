import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * AI ve rapor erişimi ROL ADINA değil İZNE bağlı: sistem rolleri eskisi gibi çalışır, özel roller
 * izinle erişir/engellenir. (Önceden IKS_MANAGER/AUDITOR/... sabit listeleri özel rolleri dışarıda bırakıyordu.)
 */
describe('E2E — izin tabanlı AI ve rapor erişimi', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        const mk = async (key: string, roleId: string) => {
            await createTestUser(prisma, roleId, { email: `pb-${key}@e2e.local` });
            tok[key] = (await http().post('/auth/login').send({ email: `pb-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        };
        // Özel roller: hiçbiri sistem rol adı taşımıyor.
        const custom = async (name: string, permissions: string[]) => (await prisma.role.create({ data: { name, permissions } })).id;
        await mk('auditor', roles.AUDITOR);
        await mk('iks', roles.IKS_MANAGER);
        await mk('viewer', roles.VIEWER);
        await mk('askOnly', await custom('SORGU_OKUYUCU', ['finding:view', 'ai:query']));
        await mk('evalOnly', await custom('DEGERLENDIRICI', ['finding:view', 'ai:run']));
        await mk('reporter', await custom('RAPORCU', ['report:view', 'finding:view']));
        await mk('nothing', await custom('YETKISIZ', ['finding:view']));
    });
    afterAll(async () => { await app.close(); });

    // Sağlayıcı çevrimdışı olduğundan yetkili çağrı 200 değil hata dönebilir; ayırt edici olan 403 olup olmaması.
    const notForbidden = (status: number) => expect(status).not.toBe(403);

    it('doğal dil sorgu: ai:query olan (sistem veya özel rol) 403 almaz; olmayan 403', async () => {
        notForbidden((await http().post('/ai/query').set(as('askOnly')).send({ question: 'Kaç açık bulgu var?' })).status);
        notForbidden((await http().post('/ai/query').set(as('iks')).send({ question: 'Kaç açık bulgu var?' })).status);
        await http().post('/ai/query').set(as('viewer')).send({ question: 'Kaç açık bulgu var?' }).expect(403);
        await http().post('/ai/query').set(as('evalOnly')).send({ question: 'Kaç açık bulgu var?' }).expect(403);
    });

    it('kontrol & kanıt değerlendirme: ai:run olan özel rol erişir (eskiden yalnız dört rol adı); olmayan 403', async () => {
        const list = (who: string) => http().get('/ai/eval-sessions').set(as(who));
        expect((await list('evalOnly')).status).toBe(200);
        expect((await list('auditor')).status).toBe(200);
        expect((await list('iks')).status).toBe(200); // IKS_MANAGER: izin geçişiyle eski erişimi korur
        await list('askOnly').expect(403);
        await list('nothing').expect(403);
    });

    it('raporlar: report:view olan özel rol dar kapsamlı rapora erişir; kurum geneli rapor ayrıca report:org ister', async () => {
        expect((await http().get('/reports/my-work').set(as('reporter'))).status).not.toBe(403);
        await http().get('/reports/dashboard').set(as('reporter')).expect(403); // report:org yok
        await http().get('/reports/my-work').set(as('nothing')).expect(403);
        await http().get('/reports/my-work').set(as('viewer')).expect(403);
    });
});
