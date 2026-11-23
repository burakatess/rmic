import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser, E2E_TEST_PASSWORD } from './helpers/fixtures';

/**
 * Yıllık plan onay yaşam döngüsü: gönder → (kendi planını onaylayamaz) → başka yönetici onaylar / değişiklik ister.
 * Karar geçmişi denetim izinden gelir, notlarla ve yeniden eskiye sıralıdır.
 */
describe('E2E — Yıllık plan yaşam döngüsü ve karar geçmişi', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const tok: Record<string, string> = {};
    const http = () => request(app.getHttpServer());
    const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
    const YEAR = 2031;

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        for (const key of ['planner', 'approver']) {
            await createTestUser(prisma, roles.RISK_CONTROL_MANAGER, { email: `plan-${key}@e2e.local`, firstName: key === 'planner' ? 'Kemal' : 'Ayşe', lastName: 'Yönetici' });
            tok[key] = (await http().post('/auth/login').send({ email: `plan-${key}@e2e.local`, password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
        }
        await createTestUser(prisma, roles.AUDITOR, { email: 'plan-aud@e2e.local' });
        tok.aud = (await http().post('/auth/login').send({ email: 'plan-aud@e2e.local', password: E2E_TEST_PASSWORD }).expect(200)).body.accessToken;
    });
    afterAll(async () => { await app.close(); });

    const ws = async (who: string) => (await http().get(`/controls/annual-plan/${YEAR}/workspace`).set(as(who)).expect(200)).body;

    it('geçmiş boşken boş liste; yetkisiz rol 403', async () => {
        expect((await http().get(`/controls/annual-plan/${YEAR}/history`).set(as('planner')).expect(200)).body).toEqual([]);
        await http().get(`/controls/annual-plan/${YEAR}/history`).set(as('aud')).expect(403);
    });

    it('gönder → kendi planını onaylayamaz → başkası değişiklik ister (gerekçe zorunlu) → yeniden gönder → onaylar; geçmiş notlarla sıralı', async () => {
        let w = await ws('planner');
        await http().post(`/controls/annual-plan/${YEAR}/submit`).set(as('planner')).send({ expectedRevision: w.draftRevision, note: 'Yıllık plan hazır' }).expect(201);
        w = await ws('planner');
        expect(w.draftStatus).toBe('PENDING_APPROVAL');
        expect(w.capabilities.canApprove).toBe(false);
        // Kimin onaylayacağı açık: gönderen hariç yetkili yöneticiler (burada yalnız Ayşe).
        expect(w.pendingApproval.submittedBy.name).toBe('Kemal Yönetici');
        expect(w.pendingApproval.approvers.map((u: { name: string }) => u.name)).toEqual(['Ayşe Yönetici']);

        await http().post(`/controls/annual-plan/${YEAR}/approve`).set(as('planner')).send({ expectedRevision: w.draftRevision }).expect(403);
        await http().post(`/controls/annual-plan/${YEAR}/request-changes`).set(as('approver')).send({ expectedRevision: w.draftRevision, note: '   ' }).expect(400);
        await http().post(`/controls/annual-plan/${YEAR}/request-changes`).set(as('approver')).send({ expectedRevision: w.draftRevision, note: 'Takvim eksik' }).expect(201);
        expect((await ws('planner')).draftStatus).toBe('CHANGES_REQUESTED');

        w = await ws('planner');
        await http().post(`/controls/annual-plan/${YEAR}/submit`).set(as('planner')).send({ expectedRevision: w.draftRevision }).expect(201);
        w = await ws('approver');
        expect(w.capabilities.canApprove).toBe(true);
        await http().post(`/controls/annual-plan/${YEAR}/approve`).set(as('approver')).send({ expectedRevision: w.draftRevision, note: 'Uygun' }).expect(201);
        const approved = await ws('approver');
        expect(approved.draftStatus).toBe('APPROVED');
        expect(approved.pendingApproval).toBeNull(); // onaylanınca bekleyen yok

        const hist = (await http().get(`/controls/annual-plan/${YEAR}/history`).set(as('planner')).expect(200)).body as Array<{ action: string; note: string | null; by: { name: string } | null }>;
        expect(hist.map(h => h.action)).toEqual(['ANNUAL_PLAN_APPROVE', 'ANNUAL_PLAN_SUBMIT', 'ANNUAL_PLAN_REQUEST_CHANGES', 'ANNUAL_PLAN_SUBMIT']);
        expect(hist.map(h => h.note)).toEqual(['Uygun', null, 'Takvim eksik', 'Yıllık plan hazır']);
        expect(hist[0].by?.name).toBe('Ayşe Yönetici');
        expect(hist[3].by?.name).toBe('Kemal Yönetici');
    });
});
