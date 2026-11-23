import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AccessScopeService, type AccessActor } from '../../common/services/access-scope.service';
import { matchesPermission } from '../../common/util/permission-match';
import { ControlsService } from '../controls/controls.service';
import { ControlScopeService } from '../controls/control-scope.service';
import { logTransition, periodControlStage, testStage } from '../../common/workflow/workflow-stages';
import { MANAGER_ROLES } from './workflow.service';

export type DeletionEntity = 'CONTROL_TEST' | 'PERIOD_CONTROL';

/**
 * Yönetici onaylı silme (Kontrol Testi, Dönem Kontrolü).
 * - Talep kaydı silmez; kayıt onaya kadar olduğu gibi kalır.
 * - Yalnız yönetici rolündeki, talep edenden FARKLI kişi onaylar/reddeder.
 * - Onayda fiziksel silme yok: test → IPTAL + deletedAt (ana kontrol ve diğer testler etkilenmez);
 *   dönem kontrolü → kapsam kaldırılır (REMOVED), onaylı testler tarihçe için korunur.
 * - Talep, karar, karar veren ve zamanlar kayıtta ve denetim izinde tutulur.
 */
@Injectable()
export class DeletionRequestsService {
    constructor(
        private prisma: PrismaService,
        private scope: AccessScopeService,
        private controls: ControlsService,
        private scopes: ControlScopeService,
    ) { }

    private isManager(actor: AccessActor) { return MANAGER_ROLES.has(String(actor.role ?? '')); }

    private async load(type: DeletionEntity, id: string) {
        if (type === 'CONTROL_TEST') {
            const t = await this.prisma.controlTest.findUnique({ where: { id }, include: { control: { select: { controlId: true, name: true } } } });
            if (!t || t.deletedAt) throw new NotFoundException('Kontrol testi bulunamadı');
            return { kind: type, row: t as any, code: t.testNo, title: t.control.name };
        }
        const s = await this.prisma.controlYearScope.findUnique({ where: { id }, include: { control: { select: { id: true, controlId: true, name: true } }, tasks: { select: { id: true, status: true, deletedAt: true } } } });
        if (!s || s.status !== 'ACTIVE') throw new NotFoundException('Dönem kontrolü bulunamadı');
        return { kind: type, row: s as any, code: s.code ?? `${s.year}.${s.control.controlId}`, title: s.snapshotName || s.control.name };
    }

    async request(type: DeletionEntity, id: string, reason: string, actor: AccessActor) {
        if (!reason?.trim()) throw new BadRequestException('Silme gerekçesi zorunludur.');
        const ctx = await this.scope.context(actor);
        if (!(this.isManager(actor) || matchesPermission(ctx.permissions, 'control:test') || matchesPermission(ctx.permissions, 'test:execute'))) {
            throw new ForbiddenException('Silme talebi oluşturma yetkiniz yok.');
        }
        if (type === 'CONTROL_TEST') await this.scope.assertControlTestAccess(ctx, id);
        const { row } = await this.load(type, id);
        if (row.deletionRequestedAt) throw new ConflictException('Bu kayıt için zaten bekleyen bir silme talebi var.');
        if (type === 'PERIOD_CONTROL') return this.scopes.requestScopeDeletion(id, reason, actor.id);
        const data = { deletionRequestedById: actor.id, deletionRequestedAt: new Date(), deletionReason: reason.trim(), deletionRejectionReason: null, deletionDecidedById: null, deletionDecidedAt: null };
        return this.prisma.$transaction(async (tx) => {
            const res = type === 'CONTROL_TEST'
                ? await tx.controlTest.updateMany({ where: { id, deletionRequestedAt: null, deletedAt: null }, data })
                : await tx.controlYearScope.updateMany({ where: { id, deletionRequestedAt: null, status: 'ACTIVE' }, data });
            if (res.count !== 1) throw new ConflictException('Kayıt bu sırada değişti; sayfayı yenileyin.');
            await tx.auditLog.create({ data: { userId: actor.id, action: 'DELETE_REQUEST', entityType: type === 'CONTROL_TEST' ? 'ControlTest' : 'ControlYearScope', entityId: id, newValue: { reason: reason.trim() } } });
            return { requested: true, message: 'Silme talebi yönetici onayına gönderildi; onaylanana kadar kayıt mevcut haliyle kalır.' };
        });
    }

    private assertDecider(row: any, actor: AccessActor) {
        if (!this.isManager(actor)) throw new ForbiddenException('Silme taleplerini yalnız yönetici rolü onaylar veya reddeder.');
        if (!row.deletionRequestedAt) throw new ConflictException('Bu kayıt için bekleyen silme talebi yok.');
        if (row.deletionRequestedById === actor.id) throw new ForbiddenException('Kendi silme talebinizi onaylayamaz veya reddedemezsiniz.');
    }

    async approve(type: DeletionEntity, id: string, actor: AccessActor) {
        const { row } = await this.load(type, id);
        this.assertDecider(row, actor);
        const now = new Date();
        const reason = `Silme onaylandı: ${row.deletionReason ?? ''}`.trim();
        if (type === 'CONTROL_TEST') {
            return this.prisma.$transaction(async (tx) => {
                const res = await tx.controlTest.updateMany({
                    where: { id, deletedAt: null, deletionRequestedAt: { not: null } },
                    data: {
                        status: 'IPTAL', deletedAt: now, deletedById: actor.id, deletionDecidedById: actor.id, deletionDecidedAt: now,
                        cancelledAt: row.cancelledAt ?? now, cancelledById: row.cancelledById ?? actor.id, cancelReason: row.cancelReason ?? reason,
                    },
                });
                if (res.count !== 1) throw new ConflictException('Kayıt bu sırada değişti; sayfayı yenileyin.');
                // Yalnız bu test etkilenir; onaylıysa kontrol özeti kalan testlerden yeniden hesaplanır.
                if (row.status === 'ONAYLANDI') await this.controls.recalculateControlSummaryPublic(row.controlId, tx);
                await logTransition(tx, { entityType: 'CONTROL_TEST', entityId: id, action: 'CANCEL', from: testStage(row.status), to: 'IPTAL', userId: actor.id, reason });
                await tx.auditLog.create({ data: { userId: actor.id, action: 'DELETE_APPROVE', entityType: 'ControlTest', entityId: id, oldValue: { status: row.status }, newValue: { requestedBy: row.deletionRequestedById, requestedAt: row.deletionRequestedAt, reason: row.deletionReason } } });
                return { deleted: true };
            });
        }
        return this.prisma.$transaction(async (tx) => {
            const claim = await tx.controlYearScope.updateMany({
                where: { id, status: 'ACTIVE', deletionRequestedAt: { not: null }, deletionDecidedAt: null },
                data: { deletionDecidedById: actor.id, deletionDecidedAt: now },
            });
            if (claim.count !== 1) throw new ConflictException('Kayıt bu sırada değişti; sayfayı yenileyin.');
            // Devam eden testler de kapsam dışı bırakılır (onaylanan silme kararı bütün dönemi kapsar).
            const ongoing = (row.tasks as Array<{ id: string; status: string }>).filter(t => t.status === 'DEVAM_EDIYOR').map(t => ({ taskId: t.id, action: 'CANCEL' as const }));
            const out: any = await this.scopes.removeScope(row.control.id, row.year, { reason, decisions: ongoing }, actor.id, tx);
            if (out?.requiresDecision) throw new ConflictException('Dönem kontrolü kaldırılamadı: devam eden testler için karar gerekiyor.');
            await logTransition(tx, { entityType: 'PERIOD_CONTROL', entityId: id, action: 'CANCEL', from: periodControlStage(row, row.tasks), to: 'IPTAL', userId: actor.id, reason });
            await tx.auditLog.create({ data: { userId: actor.id, action: 'DELETE_APPROVE', entityType: 'ControlYearScope', entityId: id, newValue: { requestedBy: row.deletionRequestedById, requestedAt: row.deletionRequestedAt, reason: row.deletionReason } } });
            return { deleted: true };
        });
    }

    async reject(type: DeletionEntity, id: string, reason: string, actor: AccessActor) {
        if (!reason?.trim()) throw new BadRequestException('Ret gerekçesi zorunludur.');
        const { row } = await this.load(type, id);
        this.assertDecider(row, actor);
        const data = { deletionRequestedAt: null, deletionRequestedById: null, deletionRejectionReason: reason.trim(), deletionDecidedById: actor.id, deletionDecidedAt: new Date() };
        return this.prisma.$transaction(async (tx) => {
            const res = type === 'CONTROL_TEST'
                ? await tx.controlTest.updateMany({ where: { id, deletionRequestedAt: { not: null } }, data })
                : await tx.controlYearScope.updateMany({ where: { id, deletionRequestedAt: { not: null } }, data });
            if (res.count !== 1) throw new ConflictException('Kayıt bu sırada değişti; sayfayı yenileyin.');
            await tx.auditLog.create({ data: { userId: actor.id, action: 'DELETE_REJECT', entityType: type === 'CONTROL_TEST' ? 'ControlTest' : 'ControlYearScope', entityId: id, newValue: { requestedBy: row.deletionRequestedById, requestReason: row.deletionReason, rejectionReason: reason.trim() } } });
            return { rejected: true };
        });
    }

    /** Bekleyen silme talepleri: yönetici için (kendi talepleri hariç karar verebileceği kayıtlar işaretli). */
    async pending(actor: AccessActor) {
        const [tests, scopes] = await Promise.all([
            this.prisma.controlTest.findMany({ where: { deletionRequestedAt: { not: null }, deletedAt: null }, include: { control: { select: { controlId: true, name: true } } }, orderBy: { deletionRequestedAt: 'asc' } }),
            this.prisma.controlYearScope.findMany({ where: { deletionRequestedAt: { not: null }, status: 'ACTIVE' }, include: { control: { select: { controlId: true, name: true } } }, orderBy: { deletionRequestedAt: 'asc' } }),
        ]);
        const ids = [...new Set([...tests, ...scopes].map(r => r.deletionRequestedById).filter((x): x is string => !!x))];
        const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
        const by = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
        const manager = this.isManager(actor);
        const row = (type: DeletionEntity, r: any, code: string, title: string, href: string) => ({
            type, id: r.id, code, title, href, reason: r.deletionReason, requestedAt: r.deletionRequestedAt,
            requestedBy: r.deletionRequestedById ? { id: r.deletionRequestedById, name: by.get(r.deletionRequestedById) ?? '—' } : null,
            canDecide: manager && r.deletionRequestedById !== actor.id,
        });
        return [
            ...tests.map(t => row('CONTROL_TEST', t, t.testNo, t.control.name, `/controls/testing/${t.id}`)),
            ...scopes.map(s => row('PERIOD_CONTROL', s, s.code ?? `${s.year}.${s.control.controlId}`, s.snapshotName || s.control.name, `/controls/agenda/${s.id}`)),
        ].filter(r => manager || r.requestedBy?.id === actor.id);
    }
}
