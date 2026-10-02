import { Test, TestingModule } from '@nestjs/testing';
import { AnnualPlanService } from './annual-plan.service';
import { PrismaService } from '../../prisma';
import { DirectorateScopeService } from '../../common/services/directorate-scope.service';
import { ControlScopeService } from './control-scope.service';

// İç Kontrol çalışanları (IKS_EMPLOYEE/IKS_MANAGER) ve sistem yöneticisi
// (SYSTEM_ADMIN) kontrolcü atama listesinde birim (UNIT) daraltmasından
// ETKİLENMEMELİ — bu roller kurum genelinde kontrol sorumluluğu taşır.
describe('AnnualPlanService.getEligibleControllers — UNIT kapsamında İç Kontrol/admin istisnası', () => {
    let service: AnnualPlanService;
    let prisma: Record<string, any>;

    beforeEach(async () => {
        prisma = {
            control: { findUnique: jest.fn().mockResolvedValue({ directorateId: 'dir-1' }) },
            user: { findMany: jest.fn().mockResolvedValue([]) },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnnualPlanService,
                { provide: PrismaService, useValue: prisma },
                {
                    provide: DirectorateScopeService,
                    useValue: { resolveScope: jest.fn().mockResolvedValue({ appliedScope: 'UNIT', userId: 'u1', directorateIds: ['dir-1'] }) },
                },
                { provide: ControlScopeService, useValue: {} },
            ],
        }).compile();
        service = module.get(AnnualPlanService);
    });

    afterEach(() => jest.clearAllMocks());

    it('UNIT kapsamında where.OR, birim üyeliği İLE İç Kontrol/admin rollerini birlikte içerir', async () => {
        await service.getEligibleControllers(2026, 'u1', ['control:*'], 'assignee', 'c1', {});

        const whereArg = prisma.user.findMany.mock.calls[0][0].where;
        expect(whereArg.isActive).toBe(true);
        expect(whereArg.OR).toEqual([
            { directorateMemberships: { some: { directorateId: { in: ['dir-1'] } } } },
            { role: { name: { in: ['IKS_EMPLOYEE', 'IKS_MANAGER', 'SYSTEM_ADMIN'] } } },
        ]);
    });

    it('ORG kapsamında ekstra bir where.OR eklenmez (zaten tüm aktif kullanıcılar dahil)', async () => {
        (service as any).scopeService.resolveScope = jest.fn().mockResolvedValue({ appliedScope: 'ORG', userId: 'u1', directorateIds: null });
        await service.getEligibleControllers(2026, 'u1', ['control:*'], 'assignee', undefined, {});

        const whereArg = prisma.user.findMany.mock.calls[0][0].where;
        expect(whereArg.OR).toBeUndefined();
        expect(whereArg.isActive).toBe(true);
    });

    it('farklı birimden bir IKS_MANAGER kullanıcı secondController listesinde de yer alır (control:view yetkisiyle geçer)', async () => {
        prisma.user.findMany = jest.fn().mockResolvedValue([
            { id: 'iks-1', firstName: 'İç', lastName: 'Kontrolcü', email: 'iks@rmic.com', role: { name: 'IKS_MANAGER', permissions: ['control:view', 'finding:view'] } },
        ]);

        const result = await service.getEligibleControllers(2026, 'u1', ['control:*'], 'secondController', 'c1', {});

        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('iks-1');
    });
});
