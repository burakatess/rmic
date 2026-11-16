import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessScopeService } from '../../common/services/access-scope.service';

/**
 * Bulgu kimliğiyle (`:id`) açılan YAZMA uçları için kayıt kapsamı kapısı. @Roles yalnız
 * rolü doğrular; kapsam uygulaması açıkken kullanıcı bulguya TAM erişimli olmalıdır
 * (başka birimin bulgusu → 404, yalnız kendi iş kalemine atanmış → 403).
 *
 * `'follow-up'` modu: takibin kendisine atanmış kullanıcı (sorumlu/değerlendirici/ikinci
 * kontrolcü veya takibin aksiyon sahibi) bulgunun tamamına erişimi olmasa da kendi
 * takibinde işlem yapabilir — `:followUpId` takip kapsamından geçmelidir.
 */
export type FindingWriteScopeMode = 'full' | 'follow-up';
export const FINDING_WRITE_SCOPE_KEY = 'findingWriteScope';
export const FindingWriteScope = (mode: FindingWriteScopeMode = 'full') => SetMetadata(FINDING_WRITE_SCOPE_KEY, mode);

@Injectable()
export class FindingWriteScopeGuard implements CanActivate {
    constructor(private readonly reflector: Reflector, private readonly scope: AccessScopeService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const mode = this.reflector.get<FindingWriteScopeMode | undefined>(FINDING_WRITE_SCOPE_KEY, context.getHandler());
        if (!mode) return true;
        const req = context.switchToHttp().getRequest();
        const findingId: string | undefined = req.params?.id;
        if (!req.user || !findingId) return true;

        const ctx = await this.scope.context(req.user);
        if (!ctx.enforced) return true;
        const level = await this.scope.findingAccess(ctx, findingId);
        if (level === 'NONE') throw new NotFoundException('Bulgu bulunamadı');
        if (level === 'FULL') return true;
        if (mode === 'follow-up' && req.params?.followUpId) {
            await this.scope.assertFollowUpAccess(ctx, req.params.followUpId);
            return true;
        }
        throw new ForbiddenException('Bu bulguda yalnız size atanmış iş kalemlerinde işlem yapabilirsiniz.');
    }
}
