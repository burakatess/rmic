import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditsService } from '../src/modules/audits/audits.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, createTestDirectorate, createTestControl, createTestControlTest, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Paket 3 — denetim izi bağlamı ve sayfalama.
 *  - HTTP olayları: actorType=USER + IP + User-Agent (merkezi, Prisma katmanında)
 *  - İstek dışı (cron): actorType=SYSTEM, IP yok
 *  - Başarısız giriş: LOGIN_FAILED, parola ve tam e-posta yok
 *  - TRUST_PROXY tanımsızken istemcinin X-Forwarded-For başlığı yok sayılır
 *  - Sunucu taraflı sayfalama/filtreler ve SIEM dışa aktarım filtre paritesi
 */
describe('E2E — Denetim izi bağlamı ve sayfalama', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let adminToken: string;
    let adminId: string;
    const http = () => request(app.getHttpServer());

    beforeAll(async () => {
        app = await createTestApp();
        // Sunucu bir kez dinlemeye alınır: supertest dinlemeyen sunucuda her istek için ayrı
        // listen açar ve eşzamanlı isteklerde bağlantı sıfırlanır.
        await app.listen(0, '127.0.0.1');
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roleIds = await seedRoles(prisma);
        adminId = (await createTestUser(prisma, roleIds['SYSTEM_ADMIN'], { email: 'audit-admin@e2e.local' })).id;
        adminToken = (await http().post('/auth/login').send({ email: 'audit-admin@e2e.local', password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
    });

    afterAll(async () => { await app.close(); });

    it('başarısız giriş LOGIN_FAILED olarak, USER aktörü + IP + UA ile yazılır; parola/e-posta açık yazılmaz; sahte XFF yok sayılır', async () => {
        await http().post('/auth/login')
            .set('User-Agent', 'e2e-agent/1.0')
            .set('X-Forwarded-For', '203.0.113.99')
            .send({ email: 'audit-admin@e2e.local', password: 'Yanlis-Parola-123' })
            .expect(401);

        const log = await prisma.auditLog.findFirst({ where: { action: 'LOGIN_FAILED' }, orderBy: { createdAt: 'desc' } });
        expect(log).toBeTruthy();
        expect(log!.actorType).toBe('USER');
        expect(log!.userAgent).toBe('e2e-agent/1.0');
        expect(log!.ipAddress).toBeTruthy();
        expect(log!.ipAddress).not.toBe('203.0.113.99'); // güvenilmeyen proxy başlığı
        expect(log!.entityId).toBe(adminId);
        expect(log!.newValue).toEqual({ reason: 'INVALID_PASSWORD', authSource: 'LOCAL', email: 'a***@e2e.local' });
        expect(JSON.stringify(log)).not.toContain('Yanlis-Parola-123');
    });

    it('başarılı giriş de aynı bağlamla yazılır', async () => {
        const log = await prisma.auditLog.findFirst({ where: { action: 'LOGIN', userId: adminId }, orderBy: { createdAt: 'desc' } });
        expect(log?.actorType).toBe('USER');
        expect(log?.ipAddress).toBeTruthy();
    });

    it('istek dışında (cron) üretilen takip SYSTEM aktörüyle denetim izine girer; IP yoktur', async () => {
        const dir = await createTestDirectorate(prisma);
        const ctrl = await createTestControl(prisma, { ownerId: adminId, directorateId: dir.id });
        const ct = await createTestControlTest(prisma, { controlId: ctrl.id, assigneeId: adminId });
        const fId = (await http().post('/findings').set('Authorization', `Bearer ${adminToken}`)
            .send({ description: 'Cron denetim izi testi için yeterince uzun bulgu metni', summary: 's', status: 'IN_PROGRESS', severity: 'HIGH', controlTestId: ct.id })
            .expect(201)).body.id;
        const pastDue = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
        const action = await prisma.action.create({
            data: { actionId: 'A-2026-9901-01', description: 'vadesi geçmiş', findingId: fId, ownerId: adminId, dueDate: new Date(pastDue), status: 'DEVAM_EDIYOR' },
        });

        // Servis doğrudan çağrılır = HTTP isteği yok (zamanlayıcı ile aynı bağlam).
        const res = await app.get(AuditsService).generateDueFollowUps('cron');
        expect(res.generatedCount).toBeGreaterThanOrEqual(1);

        const fu = await prisma.findingFollowUp.findFirst({ where: { actionId: action.id, status: 'BEKLIYOR' } });
        const log = await prisma.auditLog.findFirst({ where: { action: 'AUTO_GENERATE', entityId: fu!.id } });
        expect(log?.actorType).toBe('SYSTEM');
        expect(log?.userId).toBeNull();
        expect(log?.ipAddress).toBeNull();
    });

    describe('merkezi bağlamın kapsadığı yollar', () => {
        it('istek dışında doğrudan create ve createMany → SYSTEM; açık değer ezilmez', async () => {
            const a = await prisma.auditLog.create({ data: { action: 'CTX_DIRECT', entityType: 'Ctx', entityId: 'c1' } });
            expect(a.actorType).toBe('SYSTEM');
            await prisma.auditLog.createMany({ data: [
                { action: 'CTX_MANY', entityType: 'Ctx', entityId: 'm1' },
                { action: 'CTX_MANY', entityType: 'Ctx', entityId: 'm2', actorType: 'USER' },
            ] });
            const many = await prisma.auditLog.findMany({ where: { action: 'CTX_MANY' }, orderBy: { entityId: 'asc' } });
            expect(many.map(m => m.actorType)).toEqual(['SYSTEM', 'USER']);
        });

        it('interactive transaction içindeki audit de bağlam alır (HTTP: rol güncelleme → PERMISSION_CHANGE)', async () => {
            const role = await prisma.role.findFirstOrThrow({ where: { name: 'VIEWER' } });
            await http().put(`/admin/roles/${role.id}`).set('Authorization', `Bearer ${adminToken}`).set('User-Agent', 'tx-agent')
                .send({ permissions: ['finding:view', 'control:view'] }).expect(200);
            const log = await prisma.auditLog.findFirst({ where: { action: 'PERMISSION_CHANGE', entityId: role.id }, orderBy: { createdAt: 'desc' } });
            expect(log?.actorType).toBe('USER');
            expect(log?.userAgent).toBe('tx-agent');
            expect(log?.ipAddress).toBeTruthy();
            // istek dışı transaction → SYSTEM
            const sys = await prisma.$transaction(tx => tx.auditLog.create({ data: { action: 'CTX_TX', entityType: 'Ctx', entityId: 't1' } }));
            expect(sys.actorType).toBe('SYSTEM');
        });

        it('eşzamanlı iki HTTP isteğinin kullanıcı/UA bağlamı birbirine taşınmaz', async () => {
            const N = 12;
            await Promise.all(Array.from({ length: N }, (_, i) =>
                http().post('/auth/login').set('User-Agent', `paralel-${i}`)
                    .send({ email: `paralel${i}@yok.local`, password: 'Yanlis-Parola-1' }).expect(401)));
            const logs = await prisma.auditLog.findMany({ where: { action: 'LOGIN_FAILED', userAgent: { startsWith: 'paralel-' } } });
            expect(logs).toHaveLength(N);
            for (const l of logs) {
                const i = l.userAgent!.replace('paralel-', '');
                // her kaydın maskeli e-postası kendi isteğine ait olmalı
                expect((l.newValue as any).email).toBe(`p***@yok.local`);
                expect(l.actorType).toBe('USER');
                expect(l.ipAddress).toBeTruthy();
                expect(i).toMatch(/^\d+$/);
            }
            // Kullanıcıya bağlı olaylarla doğrulama: iki farklı kullanıcının eşzamanlı başarılı girişleri
            const roleIds = Object.fromEntries((await prisma.role.findMany()).map(r => [r.name, r.id]));
            const u1 = await createTestUser(prisma, roleIds['VIEWER'], { email: 'ctx-u1@e2e.local' });
            const u2 = await createTestUser(prisma, roleIds['VIEWER'], { email: 'ctx-u2@e2e.local' });
            await Promise.all([
                http().post('/auth/login').set('User-Agent', 'ua-u1').send({ email: 'ctx-u1@e2e.local', password: E2E_TEST_PASSWORD }).expect(200),
                http().post('/auth/login').set('User-Agent', 'ua-u2').send({ email: 'ctx-u2@e2e.local', password: E2E_TEST_PASSWORD }).expect(200),
            ]);
            const l1 = await prisma.auditLog.findFirst({ where: { action: 'LOGIN', userId: u1.id } });
            const l2 = await prisma.auditLog.findFirst({ where: { action: 'LOGIN', userId: u2.id } });
            expect(l1?.userAgent).toBe('ua-u1');
            expect(l2?.userAgent).toBe('ua-u2');
        });
    });

    describe('sayfalama ve filtreler', () => {
        beforeAll(async () => {
            const rows = Array.from({ length: 120 }, (_, i) => ({
                userId: adminId, action: 'UPDATE', entityType: 'PageTest', entityId: `pt-${i}`, actorType: 'USER',
                createdAt: new Date(Date.UTC(2026, 0, 10, 12, 0, i)),
            }));
            await prisma.auditLog.createMany({ data: rows });
            await prisma.auditLog.create({ data: { action: 'UPDATE', entityType: 'PageTest', entityId: 'pt-late', actorType: 'SYSTEM', createdAt: new Date(Date.UTC(2026, 0, 11, 20, 30)) } });
        });

        const list = (q: Record<string, string | number>) =>
            http().get('/admin/audit-logs').query(q).set('Authorization', `Bearer ${adminToken}`);

        it('toplam sayı ve sayfa döner; sayfalar çakışmaz ve tüm kayıtlar gezilebilir', async () => {
            const p1 = (await list({ entityType: 'PageTest', pageSize: 50, page: 1 }).expect(200)).body;
            const p3 = (await list({ entityType: 'PageTest', pageSize: 50, page: 3 }).expect(200)).body;
            expect(p1.pagination).toEqual({ total: 121, page: 1, pageSize: 50, totalPages: 3 });
            expect(p1.data).toHaveLength(50);
            expect(p3.data).toHaveLength(21);
            const ids = new Set([...p1.data, ...p3.data].map((r: any) => r.id));
            expect(ids.size).toBe(71);
        });

        it('aktör ve kayıt filtresi; tarih-yalnız bitiş o günü tamamen kapsar', async () => {
            expect((await list({ entityType: 'PageTest', actorType: 'SYSTEM' }).expect(200)).body.pagination.total).toBe(1);
            expect((await list({ entityType: 'PageTest', entityId: 'pt-7' }).expect(200)).body.data.map((r: any) => r.entityId)).toEqual(['pt-7']);
            expect((await list({ entityType: 'PageTest', startDate: '2026-01-11', endDate: '2026-01-11' }).expect(200)).body.pagination.total).toBe(1);
        });

        it('geçersiz sayfa boyutu 400', async () => {
            await list({ pageSize: 5000 }).expect(400);
        });

        it('SIEM dışa aktarımı liste ile aynı filtreyi kullanır', async () => {
            const res = await http().get('/admin/audit-logs/export')
                .query({ format: 'json', entityType: 'PageTest', actorType: 'SYSTEM' })
                .set('Authorization', `Bearer ${adminToken}`).expect(200);
            const lines = res.text.trim().split('\n').filter(Boolean);
            expect(lines).toHaveLength(1);
            expect(JSON.parse(lines[0])).toMatchObject({ entityId: 'pt-late', actorType: 'SYSTEM' });
        });
    });
});
