import { matchesPermission } from '@/lib/permission-match';

describe('matchesPermission (backend ile aynı semantik)', () => {
    it('tam eşleşme, kaynak joker ve tam joker', () => {
        expect(matchesPermission(['risk:view'], 'risk:view')).toBe(true);
        expect(matchesPermission(['risk:*'], 'risk:delete')).toBe(true);
        expect(matchesPermission(['risk:*'], 'risk:directorate:change')).toBe(true);
        expect(matchesPermission(['*'], 'finding:view')).toBe(true);
    });
    it('başka kaynağın jokeri veya boş liste yetki vermez', () => {
        expect(matchesPermission(['risk:*'], 'control:view')).toBe(false);
        expect(matchesPermission(['risk:sim:view'], 'risk:view')).toBe(false);
        expect(matchesPermission([], 'risk:view')).toBe(false);
        expect(matchesPermission(undefined, 'risk:view')).toBe(false);
    });
});
