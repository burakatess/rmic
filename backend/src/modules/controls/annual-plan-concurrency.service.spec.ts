import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AnnualPlanService } from './annual-plan.service';
import { PrismaService } from '../../prisma';
import { DirectorateScopeService } from '../../common/services/directorate-scope.service';
import { ControlScopeService } from './control-scope.service';

// Madde 13/24: "Aynı taslağın eşzamanlı düzenlenmesinde son kaydeden önceki
// değişiklikleri sessizce ezmemeli" — revision tabanlı iyimser eşzamanlılık.
describe('AnnualPlanService — taslak eşzamanlılık (revision)', () => {
    let service: AnnualPlanService;
    let prisma: Record<string, any>;
    let scopeService: Record<string, any>;

    beforeEach(async () => {
        prisma = {
            annualPlanDraft: { findUnique: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
            annualPlanDraftItem: { findMany: jest.fn(), findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
            control: { count: jest.fn() },
        };
        prisma.$transaction = jest.fn((fn: any) => fn(prisma));
        scopeService = {
            resolveScope: jest.fn().mockResolvedValue({ appliedScope: 'ORG', userId: 'u1', directorateIds: null }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnnualPlanService,
                { provide: PrismaService, useValue: prisma },
                { provide: DirectorateScopeService, useValue: scopeService },
                { provide: ControlScopeService, useValue: {} },
            ],
        }).compile();
        service = module.get(AnnualPlanService);
    });

    afterEach(() => jest.clearAllMocks());

    it('expectedRevision güncel değilse 409 ConflictException fırlatır ve hiçbir satır yazılmaz', async () => {
        const draft = { id: 'd1', year: 2026, revision: 5, status: 'OPEN' };
        prisma.annualPlanDraft.findUnique.mockResolvedValue(draft);
        // updateMany count:0 = "revision eşleşmedi" (başka biri araya girdi)
        prisma.annualPlanDraft.updateMany = jest.fn().mockResolvedValue({ count: 0 });

        await expect(
            service.saveDraftItems(2026, 'u2', ['control:*'], {
                expectedRevision: 3, // eski/yanlış revizyon
                items: [{ controlId: 'c1', inScope: true }],
            } as any, {}),
        ).rejects.toThrow(ConflictException);

        expect(prisma.annualPlanDraftItem.upsert).not.toHaveBeenCalled();
    });

    it('expectedRevision doğruysa revizyon artar ve satırlar yazılır', async () => {
        const draft = { id: 'd1', year: 2026, revision: 3, status: 'OPEN' };
        prisma.annualPlanDraft.findUnique.mockResolvedValue(draft);
        prisma.annualPlanDraft.updateMany = jest.fn().mockResolvedValue({ count: 1 });
        prisma.annualPlanDraft.findUniqueOrThrow.mockResolvedValue({ ...draft, revision: 4, items: [] });

        const result = await service.saveDraftItems(2026, 'u1', ['control:*'], {
            expectedRevision: 3,
            items: [{ controlId: 'c1', inScope: true }],
        } as any, {});

        expect(prisma.annualPlanDraft.updateMany).toHaveBeenCalledWith({
            where: { id: 'd1', revision: 3 },
            data: expect.objectContaining({ revision: { increment: 1 } }),
        });
        expect(prisma.annualPlanDraftItem.upsert).toHaveBeenCalledTimes(1);
        expect(result.revision).toBe(4);
    });

    // Regresyon: Kontrolcü Atamaları sekmesi yalnızca assigneeId/secondControllerId
    // gönderir — bu, Kapsam-Takvim sekmesinin daha önce kaydettiği referenceMonth/
    // frequency'yi SESSİZCE SIFIRLAMAMALI (izole DB'de canlı test sırasında
    // bulunan gerçek bug — madde 4'ün "aynı taslak üzerinde iki görünüm" şartı).
    it('yalnızca atama alanlarını gönderen kayıt, önceden kaydedilmiş referenceMonth/frequency\'yi korur', async () => {
        const draft = { id: 'd1', year: 2026, revision: 1, status: 'OPEN' };
        prisma.annualPlanDraft.findUnique.mockResolvedValue(draft);
        prisma.annualPlanDraft.updateMany = jest.fn().mockResolvedValue({ count: 1 });
        prisma.annualPlanDraft.findUniqueOrThrow.mockResolvedValue({ ...draft, revision: 2, items: [] });
        prisma.annualPlanDraftItem.findUnique.mockResolvedValue({
            draftId: 'd1', controlId: 'c1', inScope: true, frequency: 'QUARTERLY', referenceMonth: 8,
            selectedMonths: ['Şubat', 'Mayıs', 'Ağustos', 'Kasım'], controlDate: null, reason: null,
            assigneeId: null, secondControllerId: null,
        });
        const validateAssignment = jest.fn().mockResolvedValue(undefined);
        (service as any).controlScopeService = { validateAssignment };

        await service.saveDraftItems(2026, 'u1', ['control:*'], {
            expectedRevision: 1,
            items: [{ controlId: 'c1', inScope: true, assigneeId: 'user-a', secondControllerId: 'user-b' }],
        } as any, {});

        const upsertArgs = prisma.annualPlanDraftItem.upsert.mock.calls[0][0];
        expect(upsertArgs.update.frequency).toBe('QUARTERLY');
        expect(upsertArgs.update.referenceMonth).toBe(8);
        expect(upsertArgs.update.selectedMonths).toEqual(['Şubat', 'Mayıs', 'Ağustos', 'Kasım']);
        expect(upsertArgs.update.assigneeId).toBe('user-a');
        expect(upsertArgs.update.secondControllerId).toBe('user-b');
    });

    it('yalnızca takvim alanlarını gönderen kayıt, önceden kaydedilmiş atamaları korur', async () => {
        const draft = { id: 'd1', year: 2026, revision: 1, status: 'OPEN' };
        prisma.annualPlanDraft.findUnique.mockResolvedValue(draft);
        prisma.annualPlanDraft.updateMany = jest.fn().mockResolvedValue({ count: 1 });
        prisma.annualPlanDraft.findUniqueOrThrow.mockResolvedValue({ ...draft, revision: 2, items: [] });
        prisma.annualPlanDraftItem.findUnique.mockResolvedValue({
            draftId: 'd1', controlId: 'c1', inScope: true, frequency: 'QUARTERLY', referenceMonth: 3,
            selectedMonths: ['Mart', 'Haziran', 'Eylül', 'Aralık'], controlDate: null, reason: null,
            assigneeId: 'user-a', secondControllerId: 'user-b',
        });

        await service.saveDraftItems(2026, 'u1', ['control:*'], {
            expectedRevision: 1,
            items: [{ controlId: 'c1', inScope: true, referenceMonth: 8, frequency: 'QUARTERLY' as any }],
        } as any, {});

        const upsertArgs = prisma.annualPlanDraftItem.upsert.mock.calls[0][0];
        expect(upsertArgs.update.referenceMonth).toBe(8);
        expect(upsertArgs.update.selectedMonths).toEqual(['Şubat', 'Mayıs', 'Ağustos', 'Kasım']);
        expect(upsertArgs.update.assigneeId).toBe('user-a');
        expect(upsertArgs.update.secondControllerId).toBe('user-b');
    });
});
