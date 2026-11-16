import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * İzin kataloğu ve rol yönetimi — gerçek HTTP:
 *  - Rol ekranının kullandığı uçtan verilen izin SONRAKİ istekte etkili; kaldırılan izin
 *    SONRAKİ istekte erişimi keser (aynı token).
 *  - Katalogda olmayan YENİ anahtar reddedilir; rolde zaten bulunan eski anahtar sessizce
 *    silinmez.
 *  - Katalog uç noktası tek kaynaktır.
 */
describe('E2E — İzin kataloğu ve rol yönetimi', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let adminToken: string;
    let viewerToken: string;
    let viewerRoleId: string;
    const http = () => request(app.getHttpServer());

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roleIds = await seedRoles(prisma);
        viewerRoleId = roleIds['VIEWER'];
        await createTestUser(prisma, roleIds['SYSTEM_ADMIN'], { email: 'perm-admin@e2e.local' });
        await createTestUser(prisma, viewerRoleId, { email: 'perm-viewer@e2e.local' });
        const login = async (email: string) => (await http().post('/auth/login').send({ email, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        adminToken = await login('perm-admin@e2e.local');
        viewerToken = await login('perm-viewer@e2e.local');
    });

    afterAll(async () => { await app.close(); });

    const putRole = (permissions: string[]) =>
        http().put(`/admin/roles/${viewerRoleId}`).set('Authorization', `Bearer ${adminToken}`).send({ permissions });

    it('katalog uç noktası grupları, izinleri ve eski anahtar eşlemesini döner (yalnız yönetici)', async () => {
        const res = await http().get('/admin/permissions').set('Authorization', `Bearer ${adminToken}`).expect(200);
        expect(res.body.permissions.map((p: any) => p.key)).toEqual(expect.arrayContaining(['finding:view', 'scope:org', 'control:approve']));
        expect(res.body.legacy['finding:read']).toEqual(expect.objectContaining({ target: 'finding:view', equivalent: true }));
        await http().get('/admin/permissions').set('Authorization', `Bearer ${viewerToken}`).expect(403);
    });

    // Yalnız izinle korunan uç (GET /dashboard/summary — dashboard:view). Not: /reports/* uçları
    // ayrıca rol listesiyle korunur; orada izin tek başına yetmez (çift katman).
    it('verilen izin sonraki istekte etkili; kaldırılınca sonraki istekte 403 (aynı token)', async () => {
        await http().get('/dashboard/summary').set('Authorization', `Bearer ${viewerToken}`).expect(403);
        const base = ['finding:view', 'control:view', 'action:view'];
        await putRole([...base, 'dashboard:view']).expect(200);
        await http().get('/dashboard/summary').set('Authorization', `Bearer ${viewerToken}`).expect(200);
        await putRole(base).expect(200);
        await http().get('/dashboard/summary').set('Authorization', `Bearer ${viewerToken}`).expect(403);
        const log = await prisma.auditLog.findFirst({ where: { action: 'PERMISSION_CHANGE', entityId: viewerRoleId }, orderBy: { createdAt: 'desc' } });
        expect(log?.newValue).toEqual(expect.objectContaining({ permissions: base }));
    });

    it('katalogda olmayan YENİ anahtar 400; joker karakter (kaynak:*) kabul', async () => {
        const res = await putRole(['finding:view', 'finding:read']).expect(400);
        expect(res.body.message).toContain('finding:read');
        await putRole(['finding:*', 'control:view']).expect(200);
        await putRole(['admin:*']).expect(400);
    });

    it('rolde zaten bulunan eski anahtar korunabilir (sessizce silinmez) ama yenisi eklenemez', async () => {
        await prisma.role.update({ where: { id: viewerRoleId }, data: { permissions: ['finding:view', 'finding:read'] } });
        await putRole(['finding:view', 'finding:read', 'control:view']).expect(200);
        await putRole(['finding:view', 'finding:read', 'control:read']).expect(400);
        await putRole(['finding:view']).expect(200); // yönetici eskisini bilinçli kaldırır
    });

    it('rol adı güncelleme ucundan değiştirilemez (kodda rol adına bağlı kurallar korunur)', async () => {
        await http().put(`/admin/roles/${viewerRoleId}`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'HACKED' }).expect(400);
    });
});
