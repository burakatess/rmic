import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, createTestDirectorate, createTestControl, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Dönem Kontrolleri: kapsam seçici (İşlerim / Birimim / Tümü) ve referans ayı olmayan
 * periyodik kontrollerin sabit test takvimi (2026-11 kararları).
 */
describe('E2E — Dönem Kontrolleri kapsamı ve eski kontrol ayları', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const id: Record<string, string> = {};
    const YEAR = 2031;
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const list = (who: string, q: Record<string, string> = {}) =>
        http().get('/controls/scope/period-controls').query({ year: String(YEAR), pageSize: '100', ...q }).set(as(who)).expect(200);

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const [key, role] of [['admin', 'SYSTEM_ADMIN'], ['aud', 'AUDITOR'], ['mgr', 'RISK_CONTROL_MANAGER']] as const) {
            const u = await createTestUser(prisma, roles[role], { email: `pc-${key}@e2e.local` });
            id[key] = u.id;
            tok[key] = (await http().post('/auth/login').send({ email: `pc-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
        const dir = await createTestDirectorate(prisma);
        id.dir = dir.id;
        // Eski kontrol: çeyreklik, referans ayı yok, kontrolde eski aylar Mart/Eylül.
        const legacy = await createTestControl(prisma, { ownerId: id.admin, directorateId: dir.id });
        await prisma.control.update({ where: { id: legacy.id }, data: { frequency: 'QUARTERLY', selectedMonths: ['Mart', 'Eylül'] } });
        await http().post(`/controls/${legacy.id}/scope`).set(as('admin'))
            .send({ years: [YEAR], assigneeId: id.aud, secondControllerId: id.mgr, includePastPeriods: true }).expect(201);
        id.legacy = legacy.id;
        // Başkasına atanmış ikinci kontrol (İşlerim'de görünmemeli).
        const other = await createTestControl(prisma, { ownerId: id.admin, directorateId: dir.id });
        await prisma.control.update({ where: { id: other.id }, data: { frequency: 'SEMI_ANNUAL', selectedMonths: [] } });
        await http().post(`/controls/${other.id}/scope`).set(as('admin'))
            .send({ years: [YEAR], assigneeId: id.admin, secondControllerId: id.mgr, includePastPeriods: true }).expect(201);
        id.other = other.id;
    });
    afterAll(async () => { await app.close(); });

    it('referans ayı olmayan çeyreklik kontrol sabit takvim aylarını alır; ay filtresi testlerle eşleşir', async () => {
        const scope = await prisma.controlYearScope.findUniqueOrThrow({ where: { controlId_year: { controlId: id.legacy, year: YEAR } } });
        expect(scope.selectedMonths).toEqual(['Mart', 'Haziran', 'Eylül', 'Aralık']);
        const half = await prisma.controlYearScope.findUniqueOrThrow({ where: { controlId_year: { controlId: id.other, year: YEAR } } });
        expect(half.selectedMonths).toEqual(['Haziran', 'Aralık']);

        const june = (await list('admin', { scope: 'ORG', month: '6' })).body.data.map((r: any) => r.controlId ?? r.control?.id);
        const sept = (await list('admin', { scope: 'ORG', month: '9' })).body.data.map((r: any) => r.controlId ?? r.control?.id);
        const jan = (await list('admin', { scope: 'ORG', month: '1' })).body.data.map((r: any) => r.controlId ?? r.control?.id);
        expect(june).toEqual(expect.arrayContaining([id.legacy, id.other]));
        expect(sept).toContain(id.legacy);
        expect(sept).not.toContain(id.other);
        expect(jan).not.toContain(id.legacy);
    });

    it('kapsam: İşlerim yalnız atanan/ikinci kontrolcü; Tümü yetkiliye açık, yetkisize İşlerim uygulanır', async () => {
        const mineAud = await list('aud');
        expect(mineAud.body.appliedScope).toBe('MINE');
        expect(mineAud.body.data).toHaveLength(1);

        const orgAud = await list('aud', { scope: 'ORG' });
        expect(orgAud.body.appliedScope).toBe('MINE'); // AUDITOR'da report:org yok — genişlemez
        expect(orgAud.body.data).toHaveLength(1);

        const orgAdmin = await list('admin', { scope: 'ORG' });
        expect(orgAdmin.body.appliedScope).toBe('ORG');
        expect(orgAdmin.body.data.length).toBeGreaterThanOrEqual(2);

        // Kurum genelinde birim filtresi yalnız daraltır; tek değer de kabul edilir.
        const otherDir = await createTestDirectorate(prisma);
        const narrowed = await list('admin', { scope: 'ORG', directorateId: otherDir.id });
        expect(narrowed.body.data).toHaveLength(0);
        const same = await list('admin', { scope: 'ORG', directorateId: id.dir });
        expect(same.body.data.length).toBeGreaterThanOrEqual(2);
    });
});
