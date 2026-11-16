import { MIGRATION_KEY, planPermissionMigration, TARGETED_GRANTS } from '../../../prisma/permission-migration.plan';
import { isKnownPermission } from './permission-catalog';
import { SYSTEM_ROLES } from '../../../prisma/system-roles';

describe('Hedefli izin geçişi planı', () => {
    it('yalnız katalogdaki ve seed varsayılanında bulunan izinleri hedefler (toplu seed eklemesi değil)', () => {
        expect(MIGRATION_KEY).toMatch(/^\d{4}-\d{2}-/);
        for (const g of TARGETED_GRANTS) {
            expect(isKnownPermission(g.permission)).toBe(true);
            expect(SYSTEM_ROLES.find(r => r.name === g.role)?.permissions).toContain(g.permission);
        }
        // Seed'in diğer varsayılanları (ör. ai:*, report:view) bu geçişte YOK.
        expect(TARGETED_GRANTS.some(g => g.permission.startsWith('ai:'))).toBe(false);
    });

    it('eksikleri ekler; joker/mevcut izinle kapsananı eklemez', () => {
        const plan = planPermissionMigration([
            { id: 'r1', name: 'RISK_CONTROL_MANAGER', permissions: ['control:*', 'finding:view'] },
            { id: 'r2', name: 'AUDITEE', permissions: ['finding:view', 'evidence:view'] },
        ], new Set());
        const rcm = plan.find(p => p.role === 'RISK_CONTROL_MANAGER')!;
        expect(rcm.add.map(a => a.permission)).toEqual(['scope:org', 'evidence:view', 'finding:delete', 'risk:directorate:change']);
        const auditee = plan.find(p => p.role === 'AUDITEE')!;
        expect(auditee.add.map(a => a.permission)).toEqual(['control:view']);
        expect(auditee.alreadyCovered).toEqual([{ permission: 'evidence:view', by: 'evidence:view' }]);
    });

    it('daha önce geçirilmiş role dokunmaz — yöneticinin sonradan kaldırdığı izin geri gelmez', () => {
        const plan = planPermissionMigration([{ id: 'r3', name: 'AUDITOR', permissions: ['finding:view'] }], new Set(['r3']));
        expect(plan[0].skippedBecauseMigrated).toBe(true);
        expect(plan[0].add).toEqual([]);
    });
});
