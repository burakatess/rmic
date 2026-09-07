import { applyDecorators, SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const PERMISSIONS_MODE_KEY = 'requiredPermissionsMode';

/**
 * Endpoint'i izin (permissions[]) bazlı korur. `PermissionsGuard` bu metadatayı
 * gördüğünde `req.user.permissions` üzerinde eşleştirir (wildcard destekli).
 * Dekoratör YOKSA guard hiçbir kısıt uygulamaz (opt-in) — mevcut `@Roles`
 * kısıtları olduğu gibi kalır, yanlışlıkla genişlemez.
 *
 * `@RequirePermissions('report:view')`  → listedeki izinlerin HEPSİ gerekli
 */
export const RequirePermissions = (...permissions: string[]) =>
    applyDecorators(
        SetMetadata(PERMISSIONS_KEY, permissions),
        SetMetadata(PERMISSIONS_MODE_KEY, 'all'),
    );

/** İzinlerden HERHANGİ BİRİ yeterli. */
export const RequireAnyPermission = (...permissions: string[]) =>
    applyDecorators(
        SetMetadata(PERMISSIONS_KEY, permissions),
        SetMetadata(PERMISSIONS_MODE_KEY, 'any'),
    );
