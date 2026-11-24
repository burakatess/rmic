import { ForbiddenException, Global, Injectable, Module, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { matchesPermission } from '../util/permission-match';

/**
 * Merkezi KAYIT KAPSAMI politikası (Paket 2).
 *
 * İşlem izni (ör. finding:update, report:export) ile kayıt kapsamı AYRI kavramlardır:
 * bu servis yalnız "kullanıcı hangi kayıtları görebilir" sorusunu yanıtlar. Yazma,
 * onay, silme, export izinleri controller/servis tarafında ayrıca denetlenir.
 *
 * Kapsam üç kaynaktan gelir:
 *  - Kurum geneli : `scope:org` (tüm modüller) veya `scope:org:<modül>` izni.
 *                   `report:org` bir RAPOR iznidir, kayıt kapsamı VERMEZ.
 *  - Yetkili birim: kullanıcının DirectorateMembership kayıtları. Üyelik yalnız
 *                   kapsam belirler; yönetici/onay yetkisi vermez.
 *  - Doğrudan atama: kayıttaki açık atama alanları (assignee, owner, evaluator…).
 *
 * Kaydın kapsamı KAYDIN KENDİ direktörlüğünden türetilir; sorumlunun güncel birimi
 * kullanılmaz (tarihsel organizasyon bilgisi değişmez). Direktörlüğü olmayan kayıt
 * yalnız kurum geneli kapsamlı kullanıcılara ve doğrudan atananlara görünür —
 * eksik bilgi hiçbir zaman kurum geneli erişime düşmez.
 *
 * RECORD_SCOPE_ENFORCEMENT=true değilse servis herkese kurum geneli kapsam döner
 * (mevcut davranış). Rol izinleri senkronize edilmeden açılmamalıdır; bkz.
 * `prisma/access-scope-dry-run.ts`.
 */

export type ScopeModule = 'finding' | 'action' | 'followUp' | 'controlTest' | 'risk' | 'control';

export interface AccessActor {
    id: string;
    permissions?: unknown;
    role?: string | null;
}

export interface AccessContext {
    userId: string;
    permissions: string[];
    enforced: boolean;
    directorateIds: string[];
    orgModules: ReadonlySet<ScopeModule>;
}

const ALL_MODULES: ScopeModule[] = ['finding', 'action', 'followUp', 'controlTest', 'risk', 'control'];

export function hasOrgScope(permissions: readonly string[], module: ScopeModule): boolean {
    // `matchesPermission('scope:org:risk')` `scope:*` ve `*`'ı da kapsar; ayrıca genel
    // `scope:org` tüm modüller için kurum geneli kapsam verir.
    return matchesPermission(permissions, 'scope:org') || matchesPermission(permissions, `scope:org:${module}`);
}

export function buildAccessContext(
    actor: AccessActor,
    directorateIds: string[],
    enforced: boolean,
): AccessContext {
    const permissions = Array.isArray(actor.permissions)
        ? actor.permissions.filter((p): p is string => typeof p === 'string')
        : [];
    const orgModules = new Set<ScopeModule>(
        enforced ? ALL_MODULES.filter(m => hasOrgScope(permissions, m)) : ALL_MODULES,
    );
    return { userId: actor.id, permissions, enforced, directorateIds, orgModules };
}

const isOrg = (ctx: AccessContext, module: ScopeModule) => ctx.orgModules.has(module);
const inUnits = (ctx: AccessContext) => ({ in: ctx.directorateIds });

// ── Prisma WHERE parçaları (null = kısıt yok) ────────────────────────────────

/** Bulguya TAM erişim: birim (TASLAK hariç — birim taslağı göremez) veya bulguya atanan. */
export function findingFullWhere(ctx: AccessContext): Prisma.FindingWhereInput | null {
    if (isOrg(ctx, 'finding')) return null;
    return {
        OR: [
            { directorateId: inUnits(ctx), workflowStatus: { not: 'TASLAK' } },
            { assigneeId: ctx.userId },
            // Maker-checker: bulgunun 1./2. kontrolcüsü onaylayacağı/değerlendireceği kaydı görmelidir
            // (ör. kapanış değerlendirmesi); kapsam açıkken aksi halde iş kilitlenir.
            { firstControllerId: ctx.userId },
            { secondControllerId: ctx.userId },
        ],
    };
}

/**
 * Aksiyon: bağlı bulgunun kapsamı veya aksiyonun sorumlusu. Manuel aksiyon planında (bulgusuz)
 * aksiyonun birimi veya 1./2. kontrolcüsü.
 */
export function actionWhere(ctx: AccessContext): Prisma.ActionWhereInput | null {
    if (isOrg(ctx, 'action')) return null;
    const full = findingFullWhere({ ...ctx, orgModules: new Set() })!;
    return {
        OR: [
            { finding: full },
            { ownerId: ctx.userId },
            // Aksiyonun 1./2. kontrolcüsü (onaya gönderen / onaylayan) her durumda görür.
            { firstControllerId: ctx.userId },
            { secondControllerId: ctx.userId },
            // Manuel aksiyon planı (bulgusuz): aksiyonun birimi.
            { findingId: null, directorateId: inUnits(ctx) },
        ],
    };
}

/** Takip: bağlı bulgu kapsamı, kendi aksiyonunun takipleri veya doğrudan görev atamaları. */
export function followUpWhere(ctx: AccessContext): Prisma.FindingFollowUpWhereInput | null {
    if (isOrg(ctx, 'followUp')) return null;
    const full = findingFullWhere({ ...ctx, orgModules: new Set() })!;
    return {
        OR: [
            { finding: full },
            { action: { ownerId: ctx.userId } },
            // Manuel aksiyon planının takibi: aksiyonun birimi/kontrolcüleri.
            { findingId: null, action: { OR: [{ directorateId: inUnits(ctx) }, { firstControllerId: ctx.userId }, { secondControllerId: ctx.userId }] } },
            { assigneeId: ctx.userId },
            { evaluatorId: ctx.userId },
            { secondControllerId: ctx.userId },
        ],
    };
}

/** Kontrol testi: testin direktörlüğü (yoksa kontrolün), veya test atamaları. */
export function controlTestWhere(ctx: AccessContext): Prisma.ControlTestWhereInput | null {
    if (isOrg(ctx, 'controlTest')) return null;
    return {
        OR: [
            { directorateId: inUnits(ctx) },
            { directorateId: null, control: { directorateId: inUnits(ctx) } },
            { assigneeId: ctx.userId },
            { secondControllerId: ctx.userId },
        ],
    };
}

/**
 * Risk: riskin kendi direktörlüğü (yetkili birim) veya doğrudan sahibi. Direktörlüğü boş
 * (eşlenmemiş ya da isOrgWide) risk birim kullanıcılarına AÇILMAZ — yalnız kurum geneli
 * kapsamlılar ve sahibi görür.
 */
export function riskWhere(ctx: AccessContext): Prisma.RiskWhereInput | null {
    if (isOrg(ctx, 'risk')) return null;
    return { OR: [{ directorateId: inUnits(ctx) }, { ownerId: ctx.userId }] };
}

export function and<T extends object>(base: T | undefined, scope: T | null): T {
    if (!scope) return (base ?? {}) as T;
    if (!base || Object.keys(base).length === 0) return scope;
    return { AND: [base, scope] } as unknown as T;
}

@Injectable()
export class AccessScopeService {
    constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) { }

    isEnforced(): boolean {
        return this.config.get<string>('RECORD_SCOPE_ENFORCEMENT') === 'true';
    }

    async context(actor: AccessActor): Promise<AccessContext> {
        const enforced = this.isEnforced();
        if (!enforced) return buildAccessContext(actor, [], false);
        const memberships = await this.prisma.directorateMembership.findMany({
            where: { userId: actor.id },
            select: { directorateId: true },
        });
        return buildAccessContext(actor, memberships.map(m => m.directorateId), true);
    }

    /**
     * Bulgu detayı için erişim seviyesi:
     *  - FULL    : kapsam içinde (org / birim / bulguya atanmış)
     *  - PARTIAL : yalnız bulgunun bir aksiyonuna/takibine atanmış — yalnız kendi işi görünür
     *  - NONE    : erişim yok (varlığı da açıklanmaz → 404)
     */
    async findingAccess(ctx: AccessContext, findingId: string): Promise<'FULL' | 'PARTIAL' | 'NONE'> {
        const full = findingFullWhere(ctx);
        if (!full) return 'FULL';
        const fullHit = await this.prisma.finding.count({ where: { AND: [{ id: findingId }, full] } });
        if (fullHit > 0) return 'FULL';
        const partial = await this.prisma.finding.count({
            where: {
                id: findingId,
                OR: [
                    { actions: { some: { ownerId: ctx.userId } } },
                    { followUps: { some: { OR: [{ assigneeId: ctx.userId }, { evaluatorId: ctx.userId }, { secondControllerId: ctx.userId }] } } },
                ],
            },
        });
        return partial > 0 ? 'PARTIAL' : 'NONE';
    }

    /** Kapsam dışı kayıtta 404 (varlık bilgisi sızdırılmaz). */
    async assertActionAccess(ctx: AccessContext, actionId: string): Promise<void> {
        const scope = actionWhere(ctx);
        if (!scope) return;
        const hit = await this.prisma.action.count({ where: { AND: [{ id: actionId }, scope] } });
        if (!hit) throw new NotFoundException('Aksiyon bulunamadı');
    }

    async assertFollowUpAccess(ctx: AccessContext, followUpId: string): Promise<void> {
        const scope = followUpWhere(ctx);
        if (!scope) return;
        const hit = await this.prisma.findingFollowUp.count({ where: { AND: [{ id: followUpId }, scope] } });
        if (!hit) throw new NotFoundException('Takip çalışması bulunamadı');
    }

    async assertControlTestAccess(ctx: AccessContext, testId: string): Promise<void> {
        const scope = controlTestWhere(ctx);
        if (!scope) return;
        const hit = await this.prisma.controlTest.count({ where: { AND: [{ id: testId }, scope] } });
        if (!hit) throw new NotFoundException('Test bulunamadı');
    }

    async assertRiskAccess(ctx: AccessContext, riskId: string): Promise<void> {
        const scope = riskWhere(ctx);
        if (!scope) return;
        const hit = await this.prisma.risk.count({ where: { AND: [{ id: riskId }, scope] } });
        if (!hit) throw new NotFoundException('Risk bulunamadı');
    }

    /**
     * Kapsam uygulaması açıkken modül görüntüleme izni (ör. Kontrol Havuzu için
     * control:view) zorunludur. Kapalıyken mevcut davranış korunur.
     */
    assertViewPermission(ctx: AccessContext, permission: string, message: string): void {
        if (!ctx.enforced) return;
        if (!matchesPermission(ctx.permissions, permission)) throw new ForbiddenException(message);
    }

    /** Kanıt indirme ayrı bir izindir; salt okunur rolden türetilmez. */
    assertEvidencePermission(ctx: AccessContext): void {
        if (!ctx.enforced) return;
        if (!matchesPermission(ctx.permissions, 'evidence:view')) {
            throw new ForbiddenException('Kanıt görüntüleme/indirme yetkiniz yok.');
        }
    }
}

@Global()
@Module({
    providers: [AccessScopeService],
    exports: [AccessScopeService],
})
export class AccessScopeModule { }
