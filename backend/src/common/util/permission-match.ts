/**
 * İzin eşleştirme — FE (`AuthProvider.hasPermission`) ile AYNI semantiği taşır:
 *  - `*`            → tüm izinler
 *  - `<kaynak>:*`   → o kaynağın tüm eylemleri (ör. `action:*` ⊇ `action:update`)
 *  - tam eşleşme    → `report:export` === `report:export`
 *
 * Yeni izin eklerken bu dosya ile `frontend/src/lib/permission-match.ts` birlikte
 * güncellenmeli (ikisi de aynı testlerden geçer).
 */
export function matchesPermission(userPermissions: readonly string[], required: string): boolean {
    if (!required) return true;
    if (!Array.isArray(userPermissions) || userPermissions.length === 0) return false;
    if (userPermissions.includes('*')) return true;
    if (userPermissions.includes(required)) return true;

    const resource = required.split(':')[0];
    return userPermissions.includes(`${resource}:*`);
}

/** Kullanıcı verilen izinlerin HEPSİNE sahip mi? */
export function hasAllPermissions(userPermissions: readonly string[], required: readonly string[]): boolean {
    return required.every((p) => matchesPermission(userPermissions, p));
}

/** Kullanıcı verilen izinlerden HERHANGİ BİRİNE sahip mi? */
export function hasAnyPermission(userPermissions: readonly string[], required: readonly string[]): boolean {
    return required.some((p) => matchesPermission(userPermissions, p));
}
