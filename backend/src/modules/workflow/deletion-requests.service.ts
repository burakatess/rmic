import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AccessScopeService, type AccessActor } from '../../common/services/access-scope.service';
import { matchesPermission } from '../../common/util/permission-match';
import { ControlsService } from '../controls/controls.service';
import { ControlScopeService } from '../controls/control-scope.service';
import { AuditsService } from '../audits/audits.service';
import { findingStage, logTransition, periodControlStage, testStage } from '../../common/workflow/workflow-stages';
import { EXEC_ROLES, MANAGER_ROLES } from './workflow-roles';

export type DeletionEntity = 'CONTROL' | 'CONTROL_TEST' | 'PERIOD_CONTROL' | 'FINDING' | 'ACTION' | 'FOLLOW_UP' | RiskDeletionEntity;
/** Risk Yönetimi kayıtları: Risk Envanteri (risk), Kontrol Alanı (risk kontrolü), Aksiyon Tablosu (risk aksiyonu). */
export type RiskDeletionEntity = 'RISK' | 'RISK_CONTROL' | 'RISK_ACTION';
const RISK_TYPES = new Set<DeletionEntity>(['RISK', 'RISK_CONTROL', 'RISK_ACTION']);
const isRiskType = (t: DeletionEntity): t is RiskDeletionEntity => RISK_TYPES.has(t);
const RISK_MODEL: Record<RiskDeletionEntity, 'risk' | 'riskControl' | 'riskAction'> = { RISK: 'risk', RISK_CONTROL: 'riskControl', RISK_ACTION: 'riskAction' };
const RISK_ENTITY: Record<RiskDeletionEntity, string> = { RISK: 'Risk', RISK_CONTROL: 'RiskControl', RISK_ACTION: 'RiskAction' };
const RISK_NOUN: Record<RiskDeletionEntity, string> = { RISK: 'Risk', RISK_CONTROL: 'Kontrol', RISK_ACTION: 'Aksiyon' };

/**
 * Risk Yönetimi silme engelleri. Silme onaylı ve geri izlenebilirdir (deletedAt); iş geçmişi taşıyan
 * bağlar varken kayıt silinmez:
 * - Risk: bağlı (silinmemiş) bulgu veya aksiyon varsa silinmez — önce eşleştirmeler kaldırılır.
 *   Kontrol/regülasyon/süreç/sistem/Kontrol Alanı/Aksiyon Tablosu bağları onayda kaldırılır (denetim izine yazılır).
 * - Kontrol Alanı kaydı: riske veya aksiyona bağlıysa silinmez (önceki doğrudan silme kuralıyla aynı).
 * - Aksiyon Tablosu kaydı: riske bağlıysa silinmez.
 */
export async function riskDeletionBlockers(type: RiskDeletionEntity, id: string, db: PrismaLikeRisk): Promise<string[]> {
    const out: string[] = [];
    if (type === 'RISK') {
        const [findings, actions] = await Promise.all([
            db.finding.count({ where: { deletedAt: null, OR: [{ riskId: id }, { linkedRisks: { some: { id } } }] } }),
            db.action.count({ where: { riskId: id, deletedAt: null } }),
        ]);
        if (findings) out.push(`${findings} bağlı bulgu`);
        if (actions) out.push(`${actions} bağlı aksiyon`);
    } else if (type === 'RISK_CONTROL') {
        const [risks, actions] = await Promise.all([
            db.riskControlRisk.count({ where: { riskControlId: id } }),
            db.riskAction.count({ where: { riskControlId: id, deletedAt: null } }),
        ]);
        if (risks) out.push(`${risks} risk bağlantısı`);
        if (actions) out.push(`${actions} bağlı aksiyon`);
    } else {
        const risks = await db.riskActionRisk.count({ where: { riskActionId: id } });
        if (risks) out.push(`${risks} risk bağlantısı`);
    }
    return out;
}
type PrismaLikeRisk = Pick<PrismaService, 'finding' | 'action' | 'riskControlRisk' | 'riskAction' | 'riskActionRisk'>;

type Db = Pick<PrismaService, 'controlTest' | 'finding' | 'action'>;

/**
 * Kontrol silme engelleri (kullanıcı kararı 2026-11): yalnız geçmişi olmayan kontrol silinebilir.
 * Başlamış/tamamlanmış/onaylı test, bulgu veya aksiyon varsa silinmez — kontrol pasifleştirilir.
 * Başlamamış (BEKLIYOR) testler ve iptal/kapsam dışı testler engel değildir.
 */
export async function controlDeletionBlockers(controlId: string, db: Db): Promise<string[]> {
    const [tests, findings, actions] = await Promise.all([
        db.controlTest.count({ where: { controlId, deletedAt: null, status: { notIn: ['BEKLIYOR', 'IPTAL', 'KAPSAM_DISI'] } } }),
        db.finding.count({ where: { controlId, deletedAt: null } }),
        db.action.count({ where: { controlId, deletedAt: null } }),
    ]);
    const out: string[] = [];
    if (tests) out.push(`${tests} başlamış/tamamlanmış test`);
    if (findings) out.push(`${findings} bulgu`);
    if (actions) out.push(`${actions} aksiyon`);
    return out;
}

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
        private audits: AuditsService,
    ) { }

    private isManager(actor: AccessActor) { return MANAGER_ROLES.has(String(actor.role ?? '')); }

    /** Silme talebine (ve yönetici kararlı onaylara) karar verebilecek kişiler: aktif yöneticiler, talep eden hariç. */
    async approversFor(excludeUserId?: string | null): Promise<Array<{ id: string; name: string; role: string }>> {
        const rows = await this.prisma.user.findMany({
            where: { isActive: true, role: { name: { in: [...MANAGER_ROLES] } }, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
            select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });
        return rows.map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), role: u.role?.name ?? '' }));
    }

    /**
     * Talep eden kişi, karar verilmeden önce silme talebini geri çeker; kayıt mevcut haliyle kalır.
     * Not isteğe bağlıdır; geri çekme denetim izine yazılır.
     */
    async withdraw(type: DeletionEntity, id: string, actor: AccessActor, note?: string) {
        const { row } = await this.load(type, id);
        if (!row.deletionRequestedAt) throw new ConflictException('Bu kayıt için bekleyen silme talebi yok.');
        if (row.deletionRequestedById !== actor.id) throw new ForbiddenException('Silme talebini yalnız talebi açan kişi geri çekebilir.');
        const where = { id, deletionRequestedAt: { not: null }, deletionRequestedById: actor.id, deletedAt: null } as const;
        const data = { deletionRequestedAt: null, deletionRequestedById: null, deletionReason: null };
        const entity: Record<DeletionEntity, string> = { CONTROL: 'Control', CONTROL_TEST: 'ControlTest', PERIOD_CONTROL: 'ControlYearScope', FINDING: 'Finding', ACTION: 'Action', FOLLOW_UP: 'FindingFollowUp', ...RISK_ENTITY };
        return this.prisma.$transaction(async (tx) => {
            const res = isRiskType(type) ? await (tx[RISK_MODEL[type]] as any).updateMany({ where, data })
                : type === 'CONTROL' ? await tx.control.updateMany({ where, data })
                : type === 'CONTROL_TEST' ? await tx.controlTest.updateMany({ where, data })
                : type === 'FINDING' ? await tx.finding.updateMany({ where, data })
                : type === 'ACTION' ? await tx.action.updateMany({ where, data })
                : type === 'FOLLOW_UP' ? await tx.findingFollowUp.updateMany({ where, data })
                : await tx.controlYearScope.updateMany({ where: { id, deletionRequestedAt: { not: null }, deletionRequestedById: actor.id, status: 'ACTIVE' }, data });
            if (res.count !== 1) throw new ConflictException('Talep bu sırada sonuçlanmış olabilir; sayfayı yenileyin.');
            await tx.auditLog.create({ data: { userId: actor.id, action: 'DELETE_WITHDRAW', entityType: entity[type], entityId: id, oldValue: { reason: row.deletionReason, requestedAt: row.deletionRequestedAt }, newValue: { note: note?.trim() || null } } });
            return { withdrawn: true };
        });
    }

    private async load(type: DeletionEntity, id: string) {
        if (type === 'RISK') {
            const r = await this.prisma.risk.findUnique({ where: { id } });
            if (!r || r.deletedAt) throw new NotFoundException('Risk bulunamadı');
            return { kind: type, row: r as any, code: r.riskId, title: r.name };
        }
        if (type === 'RISK_CONTROL') {
            const c = await this.prisma.riskControl.findUnique({ where: { id } });
            if (!c || c.deletedAt) throw new NotFoundException('Kontrol bulunamadı');
            return { kind: type, row: c as any, code: c.kontrolId, title: c.kontrolTanimi.slice(0, 120) };
        }
        if (type === 'RISK_ACTION') {
            const a = await this.prisma.riskAction.findUnique({ where: { id } });
            if (!a || a.deletedAt) throw new NotFoundException('Aksiyon bulunamadı');
            return { kind: type, row: a as any, code: a.aksiyonId, title: a.aksiyonTanimi.slice(0, 120) };
        }
        if (type === 'CONTROL') {
            const c = await this.prisma.control.findUnique({ where: { id } });
            if (!c || c.deletedAt) throw new NotFoundException('Kontrol bulunamadı');
            return { kind: type, row: c as any, code: c.controlId, title: c.name };
        }
        if (type === 'FINDING') {
            const f = await this.prisma.finding.findUnique({ where: { id } });
            if (!f || f.deletedAt || f.workflowStatus === 'IPTAL') throw new NotFoundException('Bulgu bulunamadı');
            return { kind: type, row: f as any, code: f.findingId, title: f.summary || f.description.slice(0, 120) };
        }
        if (type === 'ACTION') {
            const a = await this.prisma.action.findUnique({ where: { id } });
            if (!a || a.deletedAt) throw new NotFoundException('Aksiyon bulunamadı');
            return { kind: type, row: a as any, code: a.actionId, title: a.description.slice(0, 120) };
        }
        if (type === 'FOLLOW_UP') {
            const f = await this.prisma.findingFollowUp.findUnique({ where: { id } });
            if (!f || f.deletedAt) throw new NotFoundException('Takip çalışması bulunamadı');
            return { kind: type, row: f as any, code: f.followUpId, title: f.notes?.slice(0, 120) || f.followUpId };
        }
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
        // Aksiyon / takip: talep kendi kurallarıyla (1. kontrolcü) açılır; karar yöneticidedir.
        if (type === 'ACTION' || type === 'FOLLOW_UP') {
            const { row } = await this.load(type, id);
            if (row.findingId && (await this.scope.findingAccess(ctx, row.findingId)) !== 'FULL') throw new ForbiddenException('Bu kayıt üzerinde işlem yetkiniz yok.');
            return type === 'ACTION'
                ? this.audits.requestActionDeletion(row.findingId, id, reason, actor.id)
                : this.audits.requestFollowUpDeletion(row.findingId, id, reason, actor.id);
        }
        if (type === 'FINDING') {
            if (!EXEC_ROLES.has(String(actor.role ?? ''))) throw new ForbiddenException('Bulgu silme talebi oluşturma yetkiniz yok.');
            if ((await this.scope.findingAccess(ctx, id)) !== 'FULL') throw new ForbiddenException('Bu bulgu üzerinde işlem yetkiniz yok.');
            return this.audits.requestFindingDeletion(id, reason, actor.id);
        }
        if (type === 'CONTROL') return this.requestControlDeletion(id, reason, actor);
        if (isRiskType(type)) return this.requestRiskDeletion(type, id, reason, actor);
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
        if (type === 'ACTION') return this.audits.decideActionDeletion(row.findingId, id, true, undefined, actor.id);
        if (type === 'FOLLOW_UP') return this.audits.decideFollowUpDeletion(row.findingId, id, true, undefined, actor.id);
        if (type === 'CONTROL') return this.approveControlDeletion(row, actor, now, reason);
        if (isRiskType(type)) return this.approveRiskDeletion(type, row, actor, now);
        if (type === 'FINDING') {
            return this.prisma.$transaction(async (tx) => {
                const claim = await tx.finding.updateMany({
                    where: { id, deletedAt: null, deletionRequestedAt: { not: null }, deletionDecidedAt: null },
                    data: { deletedAt: now, deletedById: actor.id, deletionDecidedById: actor.id, deletionDecidedAt: now },
                });
                if (claim.count !== 1) throw new ConflictException('Kayıt bu sırada değişti; sayfayı yenileyin.');
                // İptal: bulgu IPTAL, açık aksiyon/takipler IPTAL (kayıtlar korunur) — aynı işlemde.
                await this.audits.iptalEt(id, reason, actor.id, tx);
                await logTransition(tx, { entityType: 'FINDING', entityId: id, action: 'CANCEL', from: findingStage({ ...row, deletedAt: null }), to: 'IPTAL', userId: actor.id, reason });
                await tx.auditLog.create({ data: { userId: actor.id, action: 'DELETE_APPROVE', entityType: 'Finding', entityId: id, newValue: { requestedBy: row.deletionRequestedById, requestedAt: row.deletionRequestedAt, reason: row.deletionReason } } });
                return { deleted: true };
            });
        }
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
        if (type === 'ACTION') return this.audits.decideActionDeletion(row.findingId, id, false, reason, actor.id);
        if (type === 'FOLLOW_UP') return this.audits.decideFollowUpDeletion(row.findingId, id, false, reason, actor.id);
        const data = { deletionRequestedAt: null, deletionRequestedById: null, deletionRejectionReason: reason.trim(), deletionDecidedById: actor.id, deletionDecidedAt: new Date() };
        if (isRiskType(type)) {
            return this.prisma.$transaction(async (tx) => {
                const res = await (tx[RISK_MODEL[type]] as any).updateMany({ where: { id, deletionRequestedAt: { not: null }, deletedAt: null }, data });
                if (res.count !== 1) throw new ConflictException('Kayıt bu sırada değişti; sayfayı yenileyin.');
                await tx.auditLog.create({ data: { userId: actor.id, action: 'DELETE_REJECT', entityType: RISK_ENTITY[type], entityId: id, newValue: { requestedBy: row.deletionRequestedById, requestReason: row.deletionReason, rejectionReason: reason.trim() } } });
                return { rejected: true };
            });
        }
        if (type === 'FINDING') {
            return this.prisma.$transaction(async (tx) => {
                const res = await tx.finding.updateMany({ where: { id, deletionRequestedAt: { not: null }, deletedAt: null }, data });
                if (res.count !== 1) throw new ConflictException('Kayıt bu sırada değişti; sayfayı yenileyin.');
                await tx.findingStatusHistory.create({ data: { findingId: id, evaluator: actor.id, changeType: 'WORKFLOW_CHANGE', explanation: `Silme talebi reddedildi: ${reason.trim()}` } });
                await tx.auditLog.create({ data: { userId: actor.id, action: 'DELETE_REJECT', entityType: 'Finding', entityId: id, newValue: { requestedBy: row.deletionRequestedById, requestReason: row.deletionReason, rejectionReason: reason.trim() } } });
                return { rejected: true };
            });
        }
        return this.prisma.$transaction(async (tx) => {
            const res = type === 'CONTROL'
                ? await tx.control.updateMany({ where: { id, deletionRequestedAt: { not: null }, deletedAt: null }, data })
                : type === 'CONTROL_TEST'
                ? await tx.controlTest.updateMany({ where: { id, deletionRequestedAt: { not: null } }, data })
                : await tx.controlYearScope.updateMany({ where: { id, deletionRequestedAt: { not: null } }, data });
            if (res.count !== 1) throw new ConflictException('Kayıt bu sırada değişti; sayfayı yenileyin.');
            await tx.auditLog.create({ data: { userId: actor.id, action: 'DELETE_REJECT', entityType: type === 'CONTROL' ? 'Control' : type === 'CONTROL_TEST' ? 'ControlTest' : 'ControlYearScope', entityId: id, newValue: { requestedBy: row.deletionRequestedById, requestReason: row.deletionReason, rejectionReason: reason.trim() } } });
            return { rejected: true };
        });
    }

    /**
     * Risk Yönetimi silme talebi: yalnız yönetici rolleri (risk kaydı ekleyip düzenleyebilenler) açar;
     * karar talep eden dışındaki bir yöneticidedir. Engel varsa talep açılmaz.
     */
    private async requestRiskDeletion(type: RiskDeletionEntity, id: string, reason: string, actor: AccessActor) {
        if (!this.isManager(actor)) throw new ForbiddenException('Risk Yönetimi kayıtları için silme talebi oluşturma yetkiniz yok.');
        const { row } = await this.load(type, id);
        if (type === 'RISK') await this.scope.assertRiskAccess(await this.scope.context(actor), id);
        if (row.deletionRequestedAt) throw new ConflictException(`Bu ${RISK_NOUN[type].toLowerCase()} için zaten bekleyen bir silme talebi var.`);
        const blockers = await riskDeletionBlockers(type, id, this.prisma);
        if (blockers.length) {
            throw new ConflictException(`${RISK_NOUN[type]} silinemez: ${blockers.join(', ')} var. Önce bağlantıları kaldırın.`);
        }
        return this.prisma.$transaction(async (tx) => {
            const res = await (tx[RISK_MODEL[type]] as any).updateMany({
                where: { id, deletionRequestedAt: null, deletedAt: null },
                data: { deletionRequestedById: actor.id, deletionRequestedAt: new Date(), deletionReason: reason.trim(), deletionRejectionReason: null, deletionDecidedById: null, deletionDecidedAt: null },
            });
            if (res.count !== 1) throw new ConflictException('Kayıt bu sırada değişti; sayfayı yenileyin.');
            await tx.auditLog.create({ data: { userId: actor.id, action: 'DELETE_REQUEST', entityType: RISK_ENTITY[type], entityId: id, newValue: { reason: reason.trim() } } });
            return { requested: true, message: 'Silme talebi yönetici onayına gönderildi; onaylanana kadar kayıt mevcut haliyle kalır.' };
        });
    }

    /** Onay: kayıt "Silindi" işaretlenir (fiziksel silme yok). Riskte kaldırılan eşleştirmeler denetim izine yazılır. */
    private async approveRiskDeletion(type: RiskDeletionEntity, row: any, actor: AccessActor, now: Date) {
        const id = row.id as string;
        return this.prisma.$transaction(async (tx) => {
            // Engeller onay anında yeniden denetlenir (talepten sonra bağ eklenmiş olabilir).
            const blockers = await riskDeletionBlockers(type, id, tx as any);
            if (blockers.length) throw new ConflictException(`${RISK_NOUN[type]} silinemez: ${blockers.join(', ')} var. Önce bağlantıları kaldırın veya talebi reddedin.`);
            const claim = await (tx[RISK_MODEL[type]] as any).updateMany({
                where: { id, deletedAt: null, deletionRequestedAt: { not: null }, deletionDecidedAt: null },
                data: { deletedAt: now, deletedById: actor.id, deletionDecidedById: actor.id, deletionDecidedAt: now },
            });
            if (claim.count !== 1) throw new ConflictException('Kayıt bu sırada değişti; sayfayı yenileyin.');
            let removed: Record<string, unknown> = {};
            if (type === 'RISK') {
                const [controls, regulations, processes, systems] = await Promise.all([
                    tx.controlRiskMapping.findMany({ where: { riskId: id }, select: { controlId: true, mappingType: true } }),
                    tx.riskRegulation.findMany({ where: { riskId: id }, select: { articleId: true } }),
                    tx.processRisk.findMany({ where: { riskId: id }, select: { processId: true } }),
                    tx.systemRisk.findMany({ where: { riskId: id }, select: { systemId: true } }),
                ]);
                await tx.controlRiskMapping.deleteMany({ where: { riskId: id } });
                await tx.riskRegulation.deleteMany({ where: { riskId: id } });
                await tx.processRisk.deleteMany({ where: { riskId: id } });
                await tx.systemRisk.deleteMany({ where: { riskId: id } });
                const rc = await tx.riskControlRisk.deleteMany({ where: { riskId: id } });
                const ra = await tx.riskActionRisk.deleteMany({ where: { riskId: id } });
                removed = { controlMappings: controls, regulations, processes, systems, riskControlLinks: rc.count, riskActionLinks: ra.count };
            }
            await tx.auditLog.create({
                data: {
                    userId: actor.id, action: 'DELETE_APPROVE', entityType: RISK_ENTITY[type], entityId: id,
                    oldValue: row,
                    newValue: { requestedBy: row.deletionRequestedById, requestedAt: row.deletionRequestedAt, reason: row.deletionReason, ...removed } as any,
                },
            });
            return { deleted: true };
        });
    }

    /** Kontrol silme talebi: kontrol oluşturabilen roller açar; geçmişi olan kontrol için talep açılmaz. */
    private async requestControlDeletion(id: string, reason: string, actor: AccessActor) {
        if (!EXEC_ROLES.has(String(actor.role ?? ''))) throw new ForbiddenException('Kontrol silme talebi oluşturma yetkiniz yok.');
        const { row } = await this.load('CONTROL', id);
        if (row.deletionRequestedAt) throw new ConflictException('Bu kontrol için zaten bekleyen bir silme talebi var.');
        const blockers = await controlDeletionBlockers(id, this.prisma);
        if (blockers.length) {
            throw new ConflictException(`Kontrol silinemez: ${blockers.join(', ')} var. Geçmişi olan kontrol silinmez; bunun yerine pasifleştirin.`);
        }
        return this.prisma.$transaction(async (tx) => {
            const res = await tx.control.updateMany({
                where: { id, deletionRequestedAt: null, deletedAt: null },
                data: { deletionRequestedById: actor.id, deletionRequestedAt: new Date(), deletionReason: reason.trim(), deletionRejectionReason: null, deletionDecidedById: null, deletionDecidedAt: null },
            });
            if (res.count !== 1) throw new ConflictException('Kayıt bu sırada değişti; sayfayı yenileyin.');
            await tx.auditLog.create({ data: { userId: actor.id, action: 'DELETE_REQUEST', entityType: 'Control', entityId: id, newValue: { reason: reason.trim() } } });
            return { requested: true, message: 'Silme talebi yönetici onayına gönderildi; onaylanana kadar kontrol mevcut haliyle kalır.' };
        });
    }

    /**
     * Kontrol silme onayı (tek işlem): engeller yeniden denetlenir; başlamamış testler iptal edilir,
     * aktif dönem kontrolleri kaldırılır, plan taslağı kalemleri ve risk/kaynak eşleştirmeleri temizlenir;
     * kontrol "Silindi" olarak işaretlenir (fiziksel silme yok, kod tekrar kullanılmaz).
     */
    private async approveControlDeletion(row: any, actor: AccessActor, now: Date, reason: string) {
        const id = row.id as string;
        return this.prisma.$transaction(async (tx) => {
            const blockers = await controlDeletionBlockers(id, tx);
            if (blockers.length) throw new ConflictException(`Kontrol bu sırada kullanılmaya başlandı (${blockers.join(', ')}); silinemez. Talebi reddedin ve pasifleştirin.`);
            const claim = await tx.control.updateMany({
                where: { id, deletedAt: null, deletionRequestedAt: { not: null }, deletionDecidedAt: null },
                data: { deletedAt: now, deletedById: actor.id, deletionDecidedById: actor.id, deletionDecidedAt: now },
            });
            if (claim.count !== 1) throw new ConflictException('Kayıt bu sırada değişti; sayfayı yenileyin.');
            const cancelled = await tx.controlTest.updateMany({
                where: { controlId: id, deletedAt: null, status: 'BEKLIYOR' },
                data: { status: 'IPTAL', deletedAt: now, deletedById: actor.id, cancelledAt: now, cancelledById: actor.id, cancelReason: `Kontrol silindi: ${row.deletionReason ?? ''}`.trim() },
            });
            const scopes = await tx.controlYearScope.updateMany({
                where: { controlId: id, status: 'ACTIVE' },
                data: { status: 'REMOVED', removedAt: now, removedById: actor.id, removalReason: `Kontrol silindi: ${row.deletionReason ?? ''}`.trim() },
            });
            const draftItems = await tx.annualPlanDraftItem.deleteMany({ where: { controlId: id } });
            const riskMappings = await tx.controlRiskMapping.findMany({ where: { controlId: id }, select: { riskId: true, mappingType: true } });
            await tx.controlRiskMapping.deleteMany({ where: { controlId: id } });
            const sourceMappings = await tx.sourceMapping.deleteMany({ where: { controlId: id } });
            await tx.auditLog.create({
                data: {
                    userId: actor.id, action: 'DELETE_APPROVE', entityType: 'Control', entityId: id,
                    oldValue: { controlId: row.controlId, name: row.name, status: row.status, riskMappings },
                    newValue: {
                        requestedBy: row.deletionRequestedById, requestedAt: row.deletionRequestedAt, reason: row.deletionReason, note: reason,
                        cancelledTests: cancelled.count, removedScopes: scopes.count, removedDraftItems: draftItems.count, removedSourceMappings: sourceMappings.count,
                    },
                },
            });
            return { deleted: true };
        });
    }

    /** Bekleyen silme talepleri: yönetici için (kendi talepleri hariç karar verebileceği kayıtlar işaretli). */
    async pending(actor: AccessActor) {
        const pend = { deletionRequestedAt: { not: null }, deletedAt: null } as const;
        const [controls, tests, scopes, findings, actions, followUps, risks, riskControls, riskActions] = await Promise.all([
            this.prisma.control.findMany({ where: pend, orderBy: { deletionRequestedAt: 'asc' } }),
            this.prisma.controlTest.findMany({ where: pend, include: { control: { select: { controlId: true, name: true } } }, orderBy: { deletionRequestedAt: 'asc' } }),
            this.prisma.controlYearScope.findMany({ where: { deletionRequestedAt: { not: null }, status: 'ACTIVE' }, include: { control: { select: { controlId: true, name: true } } }, orderBy: { deletionRequestedAt: 'asc' } }),
            this.prisma.finding.findMany({ where: pend, orderBy: { deletionRequestedAt: 'asc' } }),
            this.prisma.action.findMany({ where: pend, orderBy: { deletionRequestedAt: 'asc' } }),
            this.prisma.findingFollowUp.findMany({ where: pend, orderBy: { deletionRequestedAt: 'asc' } }),
            this.prisma.risk.findMany({ where: pend, orderBy: { deletionRequestedAt: 'asc' } }),
            this.prisma.riskControl.findMany({ where: pend, orderBy: { deletionRequestedAt: 'asc' } }),
            this.prisma.riskAction.findMany({ where: pend, orderBy: { deletionRequestedAt: 'asc' } }),
        ]);
        const ids = [...new Set([...controls, ...tests, ...scopes, ...findings, ...actions, ...followUps, ...risks, ...riskControls, ...riskActions].map(r => r.deletionRequestedById).filter((x): x is string => !!x))];
        const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
        const by = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
        const manager = this.isManager(actor);
        const allManagers = await this.approversFor(null);
        const row = (type: DeletionEntity, r: any, code: string, title: string, href: string) => ({
            type, id: r.id, code, title, href, reason: r.deletionReason, requestedAt: r.deletionRequestedAt,
            requestedBy: r.deletionRequestedById ? { id: r.deletionRequestedById, name: by.get(r.deletionRequestedById) ?? '—' } : null,
            canDecide: manager && r.deletionRequestedById !== actor.id,
            canWithdraw: r.deletionRequestedById === actor.id,
            approvers: allManagers.filter(m => m.id !== r.deletionRequestedById),
        });
        return [
            ...controls.map(c => row('CONTROL', c, c.controlId, c.name, `/controls/${c.id}`)),
            ...tests.map(t => row('CONTROL_TEST', t, t.testNo, t.control.name, `/controls/testing/${t.id}`)),
            ...scopes.map(s => row('PERIOD_CONTROL', s, s.code ?? `${s.year}.${s.control.controlId}`, s.snapshotName || s.control.name, `/controls/agenda/${s.id}`)),
            ...findings.map(f => row('FINDING', f, f.findingId, f.summary || f.description.slice(0, 120), `/findings/${f.id}`)),
            ...actions.map(a => row('ACTION', a, a.actionId, a.description.slice(0, 120), `/actions/${a.id}`)),
            ...followUps.map(f => row('FOLLOW_UP', f, f.followUpId, f.notes?.slice(0, 120) || 'Takip çalışması', `/follow-ups/${f.id}`)),
            ...risks.map(r => row('RISK', r, r.riskId, r.name, `/risks/${r.id}`)),
            ...riskControls.map(c => row('RISK_CONTROL', c, c.kontrolId, c.kontrolTanimi.slice(0, 120), `/risks/controls?highlight=${c.id}`)),
            ...riskActions.map(a => row('RISK_ACTION', a, a.aksiyonId, a.aksiyonTanimi.slice(0, 120), `/risks/actions?highlight=${a.id}`)),
        ].filter(r => manager || r.requestedBy?.id === actor.id);
    }
}
