import { planRoleSeed } from '../../../prisma/seed-system.plan';

describe('planRoleSeed — sistem seed rol izinlerini ezmez', () => {
    const defaults = [
        { name: 'SYSTEM_ADMIN', permissions: ['*'] },
        { name: 'AUDITOR', permissions: ['finding:view', 'finding:create', 'ai:run'] },
        { name: 'VIEWER', permissions: ['finding:view'] },
    ];

    it('eksik rolleri varsayılan izinlerle oluşturur', () => {
        const plan = planRoleSeed(defaults, [], false);
        expect(plan.toCreate.map(r => r.name)).toEqual(['SYSTEM_ADMIN', 'AUDITOR', 'VIEWER']);
    });

    it('yöneticinin kaldırdığı izni geri eklemez (sync kapalı)', () => {
        const plan = planRoleSeed(defaults, [
            { name: 'SYSTEM_ADMIN', permissions: ['*'] },
            { name: 'AUDITOR', permissions: ['finding:view'] }, // yönetici finding:create ve ai:run'ı kaldırmış
            { name: 'VIEWER', permissions: ['finding:view', 'report:view'] }, // yönetici izin eklemiş
        ], false);

        expect(plan.toCreate).toEqual([]);
        expect(plan.toMerge).toEqual({});
        expect(plan.missingDefaults).toEqual({ AUDITOR: ['finding:create', 'ai:run'] });
    });

    it('sync açıkken yalnız eksikleri ekler, yöneticinin eklediği izni kaldırmaz', () => {
        const plan = planRoleSeed(defaults, [
            { name: 'AUDITOR', permissions: ['finding:view', 'custom:perm'] },
        ], true);

        expect(plan.toMerge.AUDITOR).toEqual(['finding:view', 'custom:perm', 'finding:create', 'ai:run']);
        expect(plan.toCreate.map(r => r.name)).toEqual(['SYSTEM_ADMIN', 'VIEWER']);
    });

    it("'*' izni olan rol için eksik izin raporlamaz", () => {
        const plan = planRoleSeed(defaults, [{ name: 'AUDITOR', permissions: ['*'] }], true);
        expect(plan.missingDefaults).toEqual({});
    });

    it('bozuk permissions değerini boş liste sayar', () => {
        const plan = planRoleSeed([{ name: 'VIEWER', permissions: ['finding:view'] }], [{ name: 'VIEWER', permissions: null }], false);
        expect(plan.missingDefaults).toEqual({ VIEWER: ['finding:view'] });
    });
});
