import { matchesPermission, hasAllPermissions, hasAnyPermission } from './permission-match';

describe('permission-match', () => {
    it('tam eşleşme', () => {
        expect(matchesPermission(['report:view'], 'report:view')).toBe(true);
        expect(matchesPermission(['report:view'], 'report:export')).toBe(false);
    });

    it('* tüm izinleri kapsar', () => {
        expect(matchesPermission(['*'], 'anything:here')).toBe(true);
    });

    it('kaynak wildcard (action:*) o kaynağın eylemlerini kapsar', () => {
        expect(matchesPermission(['action:*'], 'action:update')).toBe(true);
        expect(matchesPermission(['action:*'], 'finding:update')).toBe(false);
    });

    it('boş / geçersiz izin listesi reddedilir', () => {
        expect(matchesPermission([], 'report:view')).toBe(false);
        expect(matchesPermission(undefined as any, 'report:view')).toBe(false);
    });

    it('hasAllPermissions — hepsi gerekli', () => {
        expect(hasAllPermissions(['report:view', 'report:org'], ['report:view', 'report:org'])).toBe(true);
        expect(hasAllPermissions(['report:view'], ['report:view', 'report:org'])).toBe(false);
        expect(hasAllPermissions(['*'], ['report:view', 'report:org'])).toBe(true);
    });

    it('hasAnyPermission — biri yeterli', () => {
        expect(hasAnyPermission(['report:view'], ['report:org', 'report:view'])).toBe(true);
        expect(hasAnyPermission(['finding:view'], ['report:org', 'report:view'])).toBe(false);
    });
});
