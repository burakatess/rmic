import request from 'supertest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Yerel + LDAP kimlik doğrulama — GERÇEK OpenLDAP'a karşı (test/ldap/setup-ldap-test.sh; LDAP 1389, LDAPS 1636).
 * E2E_LDAP_HOST tanımlı değilse atlanır (CI'da LDAP sunucusu yoksa).
 */
const LDAP_HOST = process.env.E2E_LDAP_HOST;
const d = LDAP_HOST ? describe : describe.skip;

d('E2E — LDAP bağlantıları ve LDAP kullanıcı girişi', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    let roles: Record<string, string>;
    let connId = '';
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const CA = (() => { try { return readFileSync(join(__dirname, 'ldap/certs/ca.crt'), 'utf8'); } catch { return ''; } })();
    const base = {
        name: 'Test Dizini (LDAPS)', host: LDAP_HOST, protocol: 'LDAPS', port: 1636, tlsRejectUnauthorized: true, caCertificate: CA,
        baseDn: 'dc=rmic,dc=test', bindDn: 'cn=admin,dc=rmic,dc=test', bindPassword: 'LdapAdmin!2026',
        userFilter: '(&(objectClass=inetOrgPerson)(|(uid={{username}})(mail={{username}})))', usernameAttribute: 'uid',
        emailAttribute: 'mail', firstNameAttribute: 'givenName', lastNameAttribute: 'sn', departmentAttribute: 'departmentNumber', timeoutMs: 5000,
    };
    const login = (email: string, password: string) => http().post('/auth/login').send({ email, password });

    beforeAll(async () => {
        process.env.SETTINGS_ENCRYPTION_KEY = 'c'.repeat(64);
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        roles = await seedRoles(prisma);
        for (const [key, role] of [['admin', 'SYSTEM_ADMIN'], ['manager', 'RISK_CONTROL_MANAGER']] as const) {
            await createTestUser(prisma, roles[role], { email: `ld-${key}@e2e.local`, firstName: key, lastName: 'Yerel' });
            tok[key] = (await login(`ld-${key}@e2e.local`, E2E_TEST_PASSWORD).expect(200)).body.accessToken;
        }
    });
    afterAll(async () => { await app.close(); });

    it('bağlantı: yalnız sistem yöneticisi; LDAPS kaydı şifreyi şifreli saklar ve döndürmez; test başarılı', async () => {
        await http().get('/admin/ldap-connections').set(as('manager')).expect(403);
        await http().post('/admin/ldap-connections').set(as('admin')).send({ ...base, startTls: true }).expect(400); // LDAPS + StartTLS olmaz
        await http().post('/admin/ldap-connections').set(as('admin')).send({ ...base, host: 'ldap://x:389' }).expect(400); // şema/port yazılmaz
        const c = (await http().post('/admin/ldap-connections').set(as('admin')).send(base).expect(201)).body;
        connId = c.id;
        expect(c).toMatchObject({ protocol: 'LDAPS', port: 1636, hasBindPassword: true });
        expect(c.bindPassword).toBeUndefined();
        expect(c.bindPasswordEnc).toBeUndefined();
        const row = await prisma.ldapConnection.findUniqueOrThrow({ where: { id: c.id } });
        expect(row.bindPasswordEnc).toMatch(/^v1:/);
        expect(row.bindPasswordEnc).not.toContain('LdapAdmin');
        const t = (await http().post(`/admin/ldap-connections/${c.id}/test`).set(as('admin')).expect(201)).body;
        expect(t).toMatchObject({ ok: true });
        expect(t.message).toContain('LDAPS');
    });

    it('kaydetmeden test: LDAP 389 ve StartTLS çalışır; protokol/port uyuşmazlığı ve yanlış servis şifresi okunur hata verir', async () => {
        const draft = (over: Record<string, unknown>) => http().post('/admin/ldap-connections/test').set(as('admin')).send({ ...base, ...over });
        expect((await draft({ protocol: 'LDAP', port: 1389, caCertificate: '' }).expect(201)).body.ok).toBe(true);
        expect((await draft({ protocol: 'LDAP', port: 1389, startTls: true }).expect(201)).body.ok).toBe(true);
        const mismatch = (await draft({ protocol: 'LDAPS', port: 1389 }).expect(201)).body;
        expect(mismatch.ok).toBe(false);
        expect(mismatch.message).toMatch(/TLS|Zaman aşımı/);
        const badPw = (await draft({ bindPassword: 'yanlis' }).expect(201)).body;
        expect(badPw).toMatchObject({ ok: false, message: expect.stringContaining('Kimlik bilgileri reddedildi') });
        // Kayıtlı bağlantının şifresiyle test (şifre formda boş).
        expect((await draft({ connectionId: connId, bindPassword: undefined }).expect(201)).body.ok).toBe(true);
    });

    it('dizinde arama ve LDAP kullanıcısı ekleme: bilgiler dizinden; e-postasız/olmayan/mükerrer reddedilir', async () => {
        const found = (await http().get(`/admin/ldap-connections/${connId}/search`).query({ q: 'dizin' }).set(as('admin')).expect(200)).body;
        expect(found.map((u: any) => u.username).sort()).toEqual(['ayse.ldap', 'mehmet.ldap']);
        expect(found.find((u: any) => u.username === 'ayse.ldap')).toMatchObject({ email: 'ayse.ldap@rmic.test', firstName: 'Ayşe', lastName: 'Dizin', department: 'Bilgi Güvenliği', alreadyExists: false });
        await http().get(`/admin/ldap-connections/${connId}/search`).query({ q: '*)(uid=*' }).set(as('admin')).expect(200); // filtre enjeksiyonu kaçışlanır

        const add = (username: string) => http().post('/admin/users/ldap').set(as('admin')).send({ connectionId: connId, username, roleId: roles.AUDITOR });
        const u = (await add('ayse.ldap').expect(201)).body;
        expect(u).toMatchObject({ email: 'ayse.ldap@rmic.test', authSource: 'LDAP', ldapUsername: 'ayse.ldap', firstName: 'Ayşe', department: 'Bilgi Güvenliği' });
        expect(u.passwordHash).toBeUndefined();
        await add('ayse.ldap').expect(409);
        await add('noemail.ldap').expect(400);
        await add('yok.boyle').expect(400);
        const again = (await http().get(`/admin/ldap-connections/${connId}/search`).query({ q: 'ayse' }).set(as('admin')).expect(200)).body;
        expect(again[0]).toMatchObject({ alreadyExists: true, existingUserId: u.id });
        const list = (await http().get('/admin/users').set(as('admin')).expect(200)).body;
        expect((list.data ?? list).find((x: any) => x.id === u.id)).toMatchObject({ authSource: 'LDAP', ldapConnection: { id: connId } });
    });

    it('giriş: LDAP kullanıcısı kullanıcı adı veya e-postayla LDAP şifresiyle girer; yanlış şifre 401; eklenmemiş LDAP kullanıcısı giremez', async () => {
        const ok = (await login('ayse.ldap', 'Dizin!2026').expect(200)).body;
        expect(ok.accessToken).toBeTruthy();
        await login('AYSE.LDAP@rmic.test', 'Dizin!2026').expect(200);
        await login('ayse.ldap', 'Yanlis!2026').expect(401);
        await login('mehmet.ldap', 'Dizin!2026').expect(401); // dizinde var ama uygulamaya eklenmedi
        const failed = await prisma.auditLog.findFirst({ where: { action: 'LOGIN_FAILED' }, orderBy: { createdAt: 'desc' }, skip: 1 });
        expect(failed?.newValue).toMatchObject({ reason: 'INVALID_PASSWORD', authSource: 'LDAP' });
        const lastLogin = await prisma.auditLog.findFirst({ where: { action: 'LOGIN' }, orderBy: { createdAt: 'desc' } });
        expect(lastLogin?.newValue).toMatchObject({ authSource: 'LDAP' });
        // Yerel kullanıcılar etkilenmez.
        await login('ld-manager@e2e.local', E2E_TEST_PASSWORD).expect(200);
    });

    it('LDAP kullanıcısının şifresi uygulamadan değiştirilemez/sıfırlanamaz; pasif bağlantı veya ulaşılamayan sunucu girişi engeller', async () => {
        const userTok = (await login('ayse.ldap', 'Dizin!2026').expect(200)).body.accessToken;
        const changed = await http().post('/auth/change-password').set({ Authorization: `Bearer ${userTok}` }).send({ currentPassword: 'Dizin!2026', newPassword: 'Yeni!Sifre2026' });
        expect(changed.status).toBe(400);
        const u = await prisma.user.findFirstOrThrow({ where: { ldapUsername: 'ayse.ldap' } });
        await http().post(`/admin/users/${u.id}/reset-password`).set(as('admin')).send({ newPassword: 'Yeni!Sifre2026' }).expect(400);

        await http().delete(`/admin/ldap-connections/${connId}`).set(as('admin')).expect(409); // bağlı kullanıcı var
        await http().put(`/admin/ldap-connections/${connId}`).set(as('admin')).send({ ...base, bindPassword: undefined, isActive: false }).expect(200);
        await login('ayse.ldap', 'Dizin!2026').expect(401);
        await http().put(`/admin/ldap-connections/${connId}`).set(as('admin')).send({ ...base, bindPassword: undefined, isActive: true, port: 1999 }).expect(200);
        await login('ayse.ldap', 'Dizin!2026').expect(401); // sunucuya ulaşılamıyor (yanıt yine genel)
        const failed = await prisma.auditLog.findFirst({ where: { action: 'LOGIN_FAILED' }, orderBy: { createdAt: 'desc' } });
        expect(failed?.newValue).toMatchObject({ reason: 'LDAP_UNAVAILABLE' });
        // Güncellemede şifre gönderilmedi → kayıtlı servis şifresi korunur; port düzelince yeniden çalışır.
        await http().put(`/admin/ldap-connections/${connId}`).set(as('admin')).send({ ...base, bindPassword: undefined, isActive: true }).expect(200);
        await login('ayse.ldap', 'Dizin!2026').expect(200);
        const audit = await prisma.auditLog.count({ where: { entityId: connId, action: { in: ['LDAP_CONNECTION_CREATE', 'LDAP_CONNECTION_UPDATE', 'LDAP_CONNECTION_TEST'] } } });
        expect(audit).toBeGreaterThanOrEqual(5);
    });
});
