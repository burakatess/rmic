import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY, PERMISSIONS_MODE_KEY } from '../decorators/permissions.decorator';
import { hasAllPermissions, hasAnyPermission } from '../util/permission-match';

/**
 * Merkezi izin guard'ı — GLOBAL, ama OPT-IN: yalnızca `@RequirePermissions(...)` /
 * `@RequireAnyPermission(...)` taşıyan handler/class'lara kısıt uygular. Metadata
 * yoksa geçiş serbest (mevcut `@Roles` davranışı korunur, kapsam genişlemez).
 *
 * `req.user.permissions` her istekte JwtStrategy tarafından DB'den (role.permissions)
 * yeniden okunur — izin kaldırıldığında SONRAKİ istek reddedilir.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) return true;

        const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!required || required.length === 0) return true;

        const mode = this.reflector.getAllAndOverride<'all' | 'any'>(PERMISSIONS_MODE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]) ?? 'all';

        const req = context.switchToHttp().getRequest<{ user?: { permissions?: unknown } }>();
        const rawPerms = req.user?.permissions;
        const perms: string[] = Array.isArray(rawPerms) ? (rawPerms as string[]) : [];

        const ok = mode === 'any'
            ? hasAnyPermission(perms, required)
            : hasAllPermissions(perms, required);

        if (!ok) {
            throw new ForbiddenException(
                `Bu işlem için yetkiniz yok. Gerekli izin: ${required.join(mode === 'any' ? ' | ' : ', ')}`,
            );
        }
        return true;
    }
}
