import { Test, TestingModule } from '@nestjs/testing';
import { AnnualPlanService } from './annual-plan.service';
import { PrismaService } from '../../prisma';
import { DirectorateScopeService } from '../../common/services/directorate-scope.service';
import { ControlScopeService } from './control-scope.service';

// Madde 18: "Önceki Yıldan Kopyala" — kapsam/takvim/atama BAĞIMSIZ üç anahtar,
// atamalar varsayılan KAPALI, kopyalanan kullanıcılar yeniden doğrulanır.
describe('AnnualPlanService.copyFromYear — üç bağımsız kopyalama anahtarı', () => {
    let service: AnnualPlanService;
    let prisma: Record<string, any>;

    const sourceScope = {
        id: 's1', controlId: 'c1', year: 2025, status: 'ACTIVE',
        frequency: 'QUARTERLY', referenceMonth: 8, selectedMonths: ['Şubat', 'Mayıs', 'Ağustos', 'Kasım'],
        controlDate: null, assigneeId: 'user-a', secondControllerId: 'user-b',
        control: { id: 'c1', status: 'ACTIVE', frequency: 'MONTHLY' },
    };

    beforeEach(async () => {
        prisma = {
            annualPlanDraft: {
                findUnique: jest.fn().mockResolvedValue({ id: 'd1', year: 2026, revision: 0, status: 'OPEN' }),
                create: jest.fn(),
                findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve({ id: 'd1', year: 2026, revision: 1, items: [] })),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            annualPlanDraftItem: {
                findMany: jest.fn().mockResolvedValue([]),
                findUnique: jest.fn().mockResolvedValue(null),
                upsert: jest.fn(),
            },
            controlYearScope: { findMany: jest.fn().mockResolvedValue([sourceScope]) },
            user: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
        };
        prisma.$transaction = jest.fn((fn: any) => fn(prisma));

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnnualPlanService,
                { provide: PrismaService, useValue: prisma },
                { provide: DirectorateScopeService, useValue: { resolveScope: jest.fn().mockResolvedValue({ appliedScope: 'ORG', userId: 'u1', directorateIds: null }) } },
                { provide: ControlScopeService, useValue: { validateAssignment: jest.fn().mockResolvedValue(undefined) } },
            ],
        }).compile();
        service = module.get(AnnualPlanService);
    });

    afterEach(() => jest.clearAllMocks());

    it('copyScope=false ise hiçbir şey kopyalanmaz, controlYearScope hiç sorgulanmaz', async () => {
        const result = await service.copyFromYear(2026, 2025, 'u1', ['control:*'], {}, { copyScope: false });
        expect(result.seeded).toBe(0);
        expect(prisma.controlYearScope.findMany).not.toHaveBeenCalled();
        expect(prisma.annualPlanDraftItem.upsert).not.toHaveBeenCalled();
    });

    it('varsayılan (hiçbir seçenek verilmezse) kapsam+takvim kopyalanır, atama KOPYALANMAZ', async () => {
        await service.copyFromYear(2026, 2025, 'u1', ['control:*'], {});
        const upsertArgs = prisma.annualPlanDraftItem.upsert.mock.calls[0][0];
        expect(upsertArgs.create.frequency).toBe('QUARTERLY');
        expect(upsertArgs.create.referenceMonth).toBe(8);
        expect(upsertArgs.create.assigneeId).toBeNull();
        expect(upsertArgs.create.secondControllerId).toBeNull();
    });

    it('copyCalendar=false ise kaynak scope\'un takvimi DEĞİL, kontrolün kendi varsayılan sıklığı kullanılır', async () => {
        await service.copyFromYear(2026, 2025, 'u1', ['control:*'], {}, { copyCalendar: false });
        const upsertArgs = prisma.annualPlanDraftItem.upsert.mock.calls[0][0];
        expect(upsertArgs.create.frequency).toBe('MONTHLY'); // control.frequency, scope.frequency (QUARTERLY) değil
        expect(upsertArgs.create.referenceMonth).toBeNull();
    });

    it('copyAssignments=true ise aktif kullanıcılar kopyalanır', async () => {
        await service.copyFromYear(2026, 2025, 'u1', ['control:*'], {}, { copyAssignments: true });
        const upsertArgs = prisma.annualPlanDraftItem.upsert.mock.calls[0][0];
        expect(upsertArgs.create.assigneeId).toBe('user-a');
        expect(upsertArgs.create.secondControllerId).toBe('user-b');
    });

    it('copyAssignments=true ama kullanıcı pasifse o alan sessizce düşürülür, hata verilmez', async () => {
        prisma.user.findUnique = jest.fn()
            .mockResolvedValueOnce({ isActive: false }) // assignee pasif
            .mockResolvedValueOnce({ isActive: true }); // secondController aktif

        const result = await service.copyFromYear(2026, 2025, 'u1', ['control:*'], {}, { copyAssignments: true });

        const upsertArgs = prisma.annualPlanDraftItem.upsert.mock.calls[0][0];
        expect(upsertArgs.create.assigneeId).toBeNull();
        expect(upsertArgs.create.secondControllerId).toBe('user-b');
        expect(result.assignmentsDroppedInactive).toBe(1);
    });

    it('zaten taslakta olan kontrol atlanır (üzerine yazılmaz)', async () => {
        prisma.annualPlanDraftItem.findMany = jest.fn().mockResolvedValue([{ controlId: 'c1' }]);
        const result = await service.copyFromYear(2026, 2025, 'u1', ['control:*'], {});
        expect(result.seeded).toBe(0);
        expect(result.skippedAlreadyInDraft).toBe(1);
        expect(prisma.annualPlanDraftItem.upsert).not.toHaveBeenCalled();
    });
});
