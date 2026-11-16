import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, createTestDirectorate, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * İlgili GMY ve Risk Sorumlusu: veritabanında tanımlı kayıtlardan seçilir.
 * Risk ekranının gönderdiği alan seti DTO'dan geçmeli (eski "property X should not exist" hatası).
 */
describe('E2E — GMY tanımları ve risk atamaları', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const ids: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role, first, last] of [
            ['admin', 'SYSTEM_ADMIN', 'Sistem', 'Admin'], ['manager', 'RISK_CONTROL_MANAGER', 'Ayşe', 'Sorumlu'], ['auditee', 'AUDITEE', 'Birim', 'Kullanıcı'],
        ] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `gmy-${key}@e2e.local`, firstName: first, lastName: last });
            ids[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `gmy-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
        ids.dir = (await createTestDirectorate(prisma, 'GMY Test Direktörlüğü')).id;
        ids.cat = (await prisma.riskCategory.create({ data: { name: 'GMY Test Kategori' } })).id;
        ids.inactiveUser = (await prisma.user.update({ where: { id: (await createTestUser(prisma, roles['AUDITEE'], { email: 'gmy-pasif@e2e.local' })).id }, data: { isActive: false } })).id;
    });

    afterAll(async () => { await app.close(); });

    it('GMY yalnız sistem yöneticisince tanımlanır; liste tüm kullanıcılara açık; aynı ad 409', async () => {
        await http().post('/gmys').set(as('manager')).send({ name: 'Yetkisiz GMY' }).expect(403);
        const created = await http().post('/gmys').set(as('admin')).send({ name: 'Teknoloji GMY', code: 'GMY-T', responsibleUserId: ids.manager }).expect(201);
        ids.gmy = created.body.id;
        expect(created.body.responsibleUser).toEqual(expect.objectContaining({ id: ids.manager }));
        await http().post('/gmys').set(as('admin')).send({ name: 'Teknoloji GMY' }).expect(409);
        await http().post('/gmys').set(as('admin')).send({ name: 'X', responsibleUserId: ids.inactiveUser }).expect(400);
        const list = await http().get('/gmys').set(as('auditee')).expect(200);
        expect(list.body.map((g: any) => g.name)).toContain('Teknoloji GMY');
        const log = await prisma.auditLog.findFirst({ where: { entityType: 'Gmy', entityId: ids.gmy, action: 'CREATE' } });
        expect(log).not.toBeNull();
    });

    it('risk ekranının alan setiyle oluşturma geçer; GMY ve sorumlu adları sunucuda türetilir', async () => {
        const payload = {
            name: 'GMY atamalı risk', description: 'açıklama', ozet: 'özet', surec: 'Süreç', altSurec: 'Alt süreç',
            flagForIT: true, riskIsleme: 'AZALT', gizlilikEtkisi: 3, butunlukEtkisi: 4, erisilebilirlikEtkisi: 2, olasilik: 4,
            categoryId: ids.cat, ownerId: ids.manager, inherentProbability: 4, inherentImpact: 3,
            directorateId: ids.dir, isOrgWide: false, gmyId: ids.gmy, riskSorumlusuId: ids.manager,
        };
        const res = await http().post('/risks').set(as('admin')).send(payload).expect(201);
        ids.risk = res.body.id;
        expect(res.body).toMatchObject({ gmyId: ids.gmy, ilgiliGmy: 'Teknoloji GMY', riskSorumlusuId: ids.manager, riskSorumlusu: 'Ayşe Sorumlu', etki: 2.95, dogalRiskPuani: 11.8 });
    });

    it('serbest metin GMY/sorumlu ve istemci hesaplı puan reddedilir; tanımsız/pasif kayıt 400', async () => {
        const base = { name: 'R', description: 'd', categoryId: ids.cat, inherentProbability: 1, inherentImpact: 1, directorateId: ids.dir };
        for (const extra of [{ ilgiliGmy: 'Serbest' }, { riskSorumlusu: 'Serbest Kişi' }, { dogalRiskPuani: 25 }]) {
            await http().post('/risks').set(as('admin')).send({ ...base, ...extra }).expect(400);
        }
        await http().post('/risks').set(as('admin')).send({ ...base, gmyId: 'yok' }).expect(400);
        await http().post('/risks').set(as('admin')).send({ ...base, riskSorumlusuId: ids.inactiveUser }).expect(400);
    });

    it('GMY adı değişince riskteki gösterim adı güncellenir; düzenlemede null seçimi kaldırır', async () => {
        await http().put(`/gmys/${ids.gmy}`).set(as('admin')).send({ name: 'Bilgi Teknolojileri GMY' }).expect(200);
        expect((await prisma.risk.findUniqueOrThrow({ where: { id: ids.risk } })).ilgiliGmy).toBe('Bilgi Teknolojileri GMY');
        await http().put(`/risks/${ids.risk}`).set(as('admin')).send({ gmyId: null, riskSorumlusuId: null }).expect(200);
        const r = await prisma.risk.findUniqueOrThrow({ where: { id: ids.risk } });
        expect(r).toMatchObject({ gmyId: null, ilgiliGmy: null, riskSorumlusuId: null, riskSorumlusu: null });
    });

    it('pasif GMY listede görünmez ve yeni riskte seçilemez', async () => {
        await http().put(`/gmys/${ids.gmy}`).set(as('admin')).send({ isActive: false }).expect(200);
        const list = await http().get('/gmys').set(as('manager')).expect(200);
        expect(list.body.map((g: any) => g.id)).not.toContain(ids.gmy);
        await http().post('/risks').set(as('admin')).send({ name: 'R2', description: 'd', categoryId: ids.cat, inherentProbability: 1, inherentImpact: 1, directorateId: ids.dir, gmyId: ids.gmy }).expect(400);
    });
});
