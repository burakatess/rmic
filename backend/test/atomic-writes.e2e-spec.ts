import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-app';
import { resetDatabase, seedRoles, createTestUser } from './helpers/fixtures';
import { DirectoratesService } from '../src/modules/directorates/directorates.service';
import { RiskActionsService } from '../src/modules/risk-actions/risk-actions.service';
import { RiskEntryService } from '../src/modules/risk-entry/risk-entry.service';
import { GmysService } from '../src/modules/gmys/gmys.service';
import { RisksService } from '../src/modules/risks/risks.service';

/**
 * Atomiklik: ana kayıt ile denetim kaydı TEK işlemde yazılır. Denetim kaydı yazılamazsa
 * (burada: olmayan kullanıcıya bağlı AuditLog → yabancı anahtar ihlali) ana kayıt da geri alınır.
 * Önceden denetim hatası yutuluyor ya da ana kayıt denetimsiz kalıyordu.
 */
describe('E2E — ana kayıt + denetim kaydı atomikliği', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let realUser: string;
    const GHOST = 'olmayan-kullanici';
    const svc = <T>(t: new (...a: never[]) => T): T => app.get(t, { strict: false });

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        await resetDatabase(prisma);
        const roles = await seedRoles(prisma);
        realUser = (await createTestUser(prisma, roles.SYSTEM_ADMIN, { email: 'atomic@e2e.local' })).id;
    });
    afterAll(async () => { await app.close(); });

    it('denetim kaydı yazılamazsa oluşturma geri alınır (direktörlük, risk aksiyonu, risk kaydı, GMY)', async () => {
        await expect(svc(DirectoratesService).create({ name: 'Atomik Direktörlük' }, GHOST)).rejects.toBeDefined();
        expect(await prisma.directorate.count({ where: { name: 'Atomik Direktörlük' } })).toBe(0);

        await expect(svc(RiskActionsService).create({ aksiyonTanimi: 'Atomik risk aksiyonu' }, GHOST)).rejects.toBeDefined();
        expect(await prisma.riskAction.count({ where: { aksiyonTanimi: 'Atomik risk aksiyonu' } })).toBe(0);

        await expect(svc(RiskEntryService).create({ riskTanimi: 'Atomik risk kaydı' }, GHOST)).rejects.toBeDefined();
        expect(await prisma.riskEntry.count({ where: { riskTanimi: 'Atomik risk kaydı' } })).toBe(0);

        await expect(svc(GmysService).create({ name: 'Atomik GMY' } as never, GHOST)).rejects.toBeDefined();
        expect(await prisma.gmy.count({ where: { name: 'Atomik GMY' } })).toBe(0);
    });

    it('geçerli kullanıcıyla kayıt ve denetim kaydı birlikte yazılır (olumlu kontrol)', async () => {
        const d = await svc(DirectoratesService).create({ name: 'Atomik Direktörlük OK' }, realUser);
        expect(await prisma.auditLog.count({ where: { entityType: 'Directorate', entityId: d.id, action: 'CREATE', userId: realUser } })).toBe(1);
    });

    it('denetim kaydı yazılamazsa güncelleme geri alınır', async () => {
        const dirs = svc(DirectoratesService);
        const d = await dirs.create({ name: 'Atomik Güncelleme' }, realUser);
        await expect(dirs.update(d.id, { name: 'Atomik Güncelleme Yeni' }, GHOST)).rejects.toBeDefined();
        expect((await prisma.directorate.findUniqueOrThrow({ where: { id: d.id } })).name).toBe('Atomik Güncelleme');

        const entries = svc(RiskEntryService);
        const e = await entries.create({ riskTanimi: 'Atomik güncellenecek risk', olasilik: 2 }, realUser);
        await expect(entries.update(e.id, { olasilik: 5 }, GHOST)).rejects.toBeDefined();
        const after = await prisma.riskEntry.findUniqueOrThrow({ where: { id: e.id } });
        expect(after.olasilik).toBe(2);
        expect(after.version).toBe(e.version);
    });

    it('risk değerlendirmesi: denetim yazılamazsa değerlendirme kaydı, risk güncellemesi ve tarihçe birlikte geri alınır', async () => {
        const cat = await prisma.riskCategory.create({ data: { name: 'Atomik Kategori' } });
        const risk = await prisma.risk.create({
            data: { riskId: 'R-ATOMIK-1', name: 'Atomik risk', description: 'Atomik risk açıklaması yeterli uzunlukta', ownerId: realUser, categoryId: cat.id, status: 'IDENTIFIED', inherentProbability: 1, inherentImpact: 1, inherentRiskScore: 1 },
        });
        const risks = svc(RisksService);
        await expect(risks.assess(risk.id, { probability: 4, impact: 4 } as never, GHOST)).rejects.toBeDefined();
        expect(await prisma.riskAssessment.count({ where: { riskId: risk.id } })).toBe(0);
        expect(await prisma.riskHistory.count({ where: { riskId: risk.id } })).toBe(0);
        const unchanged = await prisma.risk.findUniqueOrThrow({ where: { id: risk.id } });
        expect(unchanged).toMatchObject({ status: 'IDENTIFIED', inherentProbability: 1, version: risk.version });

        // Olumlu: geçerli kullanıcıyla dördü birlikte yazılır.
        await risks.assess(risk.id, { probability: 4, impact: 4 } as never, realUser);
        expect(await prisma.riskAssessment.count({ where: { riskId: risk.id } })).toBe(1);
        expect(await prisma.riskHistory.count({ where: { riskId: risk.id } })).toBe(1);
        expect((await prisma.risk.findUniqueOrThrow({ where: { id: risk.id } })).status).toBe('ASSESSED');
    });

    it('risk silme: bağlı kayıtlarla birlikte tek işlemde (denetim yazılamazsa hiçbiri silinmez)', async () => {
        const cat = await prisma.riskCategory.findFirstOrThrow({ where: { name: 'Atomik Kategori' } });
        const risk = await prisma.risk.create({
            data: { riskId: 'R-ATOMIK-2', name: 'Silinecek risk', description: 'Silinecek risk açıklaması yeterli uzunlukta', ownerId: realUser, categoryId: cat.id, status: 'IDENTIFIED', inherentProbability: 1, inherentImpact: 1, inherentRiskScore: 1 },
        });
        await prisma.riskAssessment.create({ data: { riskId: risk.id, assessor: realUser, probability: 2, impact: 2, inherentScore: 4, mitigatingControlIds: [] } });
        const risks = svc(RisksService);
        await expect(risks.delete(risk.id, GHOST)).rejects.toBeDefined();
        expect(await prisma.risk.count({ where: { id: risk.id } })).toBe(1);
        expect(await prisma.riskAssessment.count({ where: { riskId: risk.id } })).toBe(1);

        await risks.delete(risk.id, realUser);
        expect(await prisma.risk.count({ where: { id: risk.id } })).toBe(0);
        expect(await prisma.riskAssessment.count({ where: { riskId: risk.id } })).toBe(0);
    });
});
