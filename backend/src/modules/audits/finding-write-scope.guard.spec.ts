import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FindingWriteScopeGuard } from './finding-write-scope.guard';

describe('FindingWriteScopeGuard — bulgu yazma uçlarında kayıt kapsamı', () => {
    const make = (mode: string | undefined, params: Record<string, string>, scope: Record<string, jest.Mock>) => {
        const reflector = { get: jest.fn().mockReturnValue(mode) } as unknown as Reflector;
        const guard = new FindingWriteScopeGuard(reflector, scope as any);
        const ctx = { getHandler: () => null, switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1' }, params }) }) } as any;
        return () => guard.canActivate(ctx);
    };
    const scope = (enforced: boolean, level: string) => ({
        context: jest.fn().mockResolvedValue({ enforced }),
        findingAccess: jest.fn().mockResolvedValue(level),
        assertFollowUpAccess: jest.fn().mockResolvedValue(undefined),
    });

    it('kapsam uygulaması kapalıyken mevcut davranış (yalnız @Roles)', async () => {
        const s = scope(false, 'NONE');
        await expect(make('full', { id: 'f1' }, s)()).resolves.toBe(true);
        expect(s.findingAccess).not.toHaveBeenCalled();
    });

    it('kapsam dışı bulgu → 404 (varlık açıklanmaz)', async () => {
        await expect(make('full', { id: 'f1' }, scope(true, 'NONE'))()).rejects.toThrow(NotFoundException);
    });

    it('yalnız kendi iş kalemine atanmış kullanıcı bulgu düzeyi yazamaz → 403', async () => {
        await expect(make('full', { id: 'f1' }, scope(true, 'PARTIAL'))()).rejects.toThrow(ForbiddenException);
    });

    it('takip modu: atanmış takipte işlem yapılabilir, takip kapsamı ayrıca doğrulanır', async () => {
        const s = scope(true, 'PARTIAL');
        await expect(make('follow-up', { id: 'f1', followUpId: 'fu1' }, s)()).resolves.toBe(true);
        expect(s.assertFollowUpAccess).toHaveBeenCalledWith({ enforced: true }, 'fu1');
        s.assertFollowUpAccess.mockRejectedValueOnce(new NotFoundException());
        await expect(make('follow-up', { id: 'f1', followUpId: 'fu2' }, s)()).rejects.toThrow(NotFoundException);
    });

    it('metadata yoksa (okuma uçları) dokunmaz', async () => {
        const s = scope(true, 'NONE');
        await expect(make(undefined, { id: 'f1' }, s)()).resolves.toBe(true);
    });
});
