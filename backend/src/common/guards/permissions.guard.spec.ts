import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY, PERMISSIONS_MODE_KEY } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function ctx(user: unknown): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
        getHandler: () => ({}),
        getClass: () => ({}),
    } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
    let reflector: Reflector;
    let guard: PermissionsGuard;

    beforeEach(() => {
        reflector = new Reflector();
        guard = new PermissionsGuard(reflector);
    });

    it('metadata yoksa geçiş serbest (opt-in)', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
        expect(guard.canActivate(ctx({ permissions: [] }))).toBe(true);
    });

    it('@Public route için geçer', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
            key === IS_PUBLIC_KEY ? true : undefined,
        );
        expect(guard.canActivate(ctx(undefined))).toBe(true);
    });

    it('gerekli izne sahip kullanıcı geçer', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
            if (key === PERMISSIONS_KEY) return ['report:view'];
            if (key === PERMISSIONS_MODE_KEY) return 'all';
            return undefined;
        });
        expect(guard.canActivate(ctx({ permissions: ['report:view', 'finding:view'] }))).toBe(true);
    });

    it('gerekli izin yoksa ForbiddenException', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
            if (key === PERMISSIONS_KEY) return ['report:view', 'report:org'];
            if (key === PERMISSIONS_MODE_KEY) return 'all';
            return undefined;
        });
        expect(() => guard.canActivate(ctx({ permissions: ['report:view'] }))).toThrow(ForbiddenException);
    });

    it('* izni her şeyi geçer', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
            if (key === PERMISSIONS_KEY) return ['report:org', 'report:export'];
            if (key === PERMISSIONS_MODE_KEY) return 'all';
            return undefined;
        });
        expect(guard.canActivate(ctx({ permissions: ['*'] }))).toBe(true);
    });
});
