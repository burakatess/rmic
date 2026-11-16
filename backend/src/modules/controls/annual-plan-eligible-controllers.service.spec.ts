import { Test, TestingModule } from '@nestjs/testing';
import { AnnualPlanService } from './annual-plan.service';
import { PrismaService } from '../../prisma';
import { DirectorateScopeService } from '../../common/services/directorate-scope.service';
import { AccessScopeService } from '../../common/services/access-scope.service';
import { ControlScopeService } from './control-scope.service';
import { controllerIneligibility } from '../../common/services/controller-eligibility';

// Kontrolcü uygunluğu sabit rol listesiyle DEĞİL, ortak kuralla belirlenir:
// aktiflik + işlem izni (birinci: control:test / test:execute, ikinci: control:approve)
// + kontrolün birimi üzerinde kayıt kapsamı (kapsam uygulaması açıkken).
const user = (id: string, permissions: string[], dirs: string[] = []) => ({
    id, firstName: id, lastName: 'X', email: `${id}@x`, isActive: true,
    role: { permissions }, directorateMemberships: dirs.map(directorateId => ({ directorateId })),
});

const USERS = [
    user('auditor', ['control:view', 'control:test', 'scope:org']),          // merkezi iç kontrol
    user('rcm', ['control:*', 'scope:org']),                                 // yönetici
    user('admin', ['*']),
    user('iks', ['control:view', 'test:execute']),                          // eski IKS (uyumluluk)
    user('viewer', ['control:view'], ['dir-1']),                             // salt okunur
    user('unitTester', ['control:test'], ['dir-1']),                          // birim kontrolcüsü
    user('otherUnitTester', ['control:test'], ['dir-2']),
];

describe('AnnualPlanService.getEligibleControllers — ortak uygunluk kuralı', () => {
    let service: AnnualPlanService;
    let enforced = false;

    beforeEach(async () => {
        enforced = false;
        const prisma = {
            control: { findUnique: jest.fn().mockResolvedValue({ directorateId: 'dir-1' }) },
            user: { findMany: jest.fn().mockResolvedValue(USERS) },
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnnualPlanService,
                { provide: PrismaService, useValue: prisma },
                { provide: DirectorateScopeService, useValue: { resolveScope: jest.fn().mockResolvedValue({ appliedScope: 'UNIT', userId: 'u1', directorateIds: ['dir-1'] }) } },
                { provide: ControlScopeService, useValue: {} },
                { provide: AccessScopeService, useValue: { isEnforced: () => enforced } },
            ],
        }).compile();
        service = module.get(AnnualPlanService);
    });

    const ids = async (role: 'assignee' | 'secondController') =>
        (await service.getEligibleControllers(2026, 'u1', ['control:*'], role, 'c1', {})).data.map(u => u.id);

    it('birinci kontrolcü: test yürütme izni gerekir; AUDITOR ve RCM dışlanmaz; VIEWER dışlanır', async () => {
        expect(await ids('assignee')).toEqual(['auditor', 'rcm', 'admin', 'iks', 'unitTester', 'otherUnitTester']);
    });

    it('ikinci kontrolcü: onay izni (control:approve) gerekir; control:view yetmez', async () => {
        expect(await ids('secondController')).toEqual(['rcm', 'admin']);
    });

    it('kayıt kapsamı açıkken birim kontrolcüsü yalnız kendi biriminin kontrolünde uygun; kurum geneli kapsamlılar her birimde', async () => {
        enforced = true;
        expect(await ids('assignee')).toEqual(['auditor', 'rcm', 'admin', 'unitTester']);
    });
});

describe('controllerIneligibility', () => {
    it('pasif kullanıcı uygun değil', () => {
        expect(controllerIneligibility({ isActive: false, permissions: ['*'], directorateIds: [] }, 'assignee', 'd', false)).toBe('kullanıcı pasif');
    });
    it('kapsam açıkken direktörlüğü olmayan kontrolde yalnız kurum geneli kapsamlı uygun', () => {
        expect(controllerIneligibility({ isActive: true, permissions: ['control:test'], directorateIds: ['d'] }, 'assignee', null, true)).toMatch(/direktörlüğü yok/);
        expect(controllerIneligibility({ isActive: true, permissions: ['control:test', 'scope:org'], directorateIds: [] }, 'assignee', null, true)).toBeNull();
    });
});
