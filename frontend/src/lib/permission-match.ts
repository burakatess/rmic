/**
 * İzin eşleştirme — backend `src/common/util/permission-match.ts` ile AYNI semantik:
 *  - `*`            → tüm izinler
 *  - `<kaynak>:*`   → o kaynağın tüm eylemleri (ör. `risk:*` ⊇ `risk:delete`)
 *  - tam eşleşme    → `report:export` === `report:export`
 * Arayüz yalnız tam eşleşmeye bakıyordu; `risk:*` yetkili Risk Kontrol Yöneticisi Risk Yönetimi
 * menüsünü ve düğmelerini göremiyordu (backend izin veriyordu).
 */
export function matchesPermission(userPermissions: readonly string[] | null | undefined, required: string): boolean {
    if (!required) return true;
    if (!Array.isArray(userPermissions) || userPermissions.length === 0) return false;
    if (userPermissions.includes('*')) return true;
    if (userPermissions.includes(required)) return true;
    const resource = required.split(':')[0];
    return userPermissions.includes(`${resource}:*`);
}
