import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

const normalizeRole = (role: string): string => {
    const mapping: Record<string, string> = {
        'ADMIN': 'SYSTEM_ADMIN',
        'RISK_MANAGER': 'RISK_CONTROL_MANAGER',
        'CONTROL_OWNER': 'AUDITEE',
    };
    return mapping[role] || role;
};

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles) {
            return true;
        }

        const { user } = context.switchToHttp().getRequest();

        if (!user || !user.role) {
            throw new ForbiddenException('Access denied');
        }

        const userRoleNormalized = normalizeRole(user.role);
        const hasRole = requiredRoles.some(
            (role) => normalizeRole(role) === userRoleNormalized,
        );

        if (!hasRole) {
            throw new ForbiddenException(`Access denied. Required roles: ${requiredRoles.join(', ')}`);
        }

        return true;
    }
}
