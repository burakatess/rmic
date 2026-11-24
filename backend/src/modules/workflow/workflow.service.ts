import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { AccessScopeService, controlTestWhere, findingFullWhere, followUpWhere, type AccessActor, type AccessContext } from '../../common/services/access-scope.service';
import { matchesPermission } from '../../common/util/permission-match';
import { isFollowUpOverdue, isTestOverdue } from '../../common/util/metric-definitions';
import { ControlsService } from '../controls/controls.service';
import { AuditsService } from '../audits/audits.service';
import {
    ACTION_LABELS, STAGES, STAGE_LABELS, actionForMove, findingStage, followUpStage, logTransition, nextStage,
    periodControlReady, periodControlStage, testStage,
    type Stage, type WorkflowAction, type WorkflowEntityType,
} from '../../common/workflow/workflow-stages';

export const MANAGER_ROLES = new Set(['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER']);
const EXEC_ROLES = new Set(['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR']);
const ENTITY_TYPES: WorkflowEntityType[] = ['CONTROL_TEST', 'FOLLOW_UP', 'FINDING', 'PERIOD_CONTROL'];
export const ENTITY_LABELS: Record<WorkflowEntityType, string> = {
    CONTROL_TEST: 'Kontrol Testi', FOLLOW_UP: 'Takip Çalışması', FINDING: 'Bulgu', PERIOD_CONTROL: 'Dönem Kontrolü',
};

type Person = { id: string; name: string } | null;
export interface WorkflowSnapshot {
    entityType: WorkflowEntityType; entityId: string; code: string; title: string; href: string;
    stage: Stage; rawStatus: string; assignee: Person; checker: Person; submittedBy: Person;
    plannedDate: Date | null; updatedAt: Date;
    /** Kart rozetleri (eski Akış Sağlığı sinyalleri): gecikme, yeni kontrol sürümü, silme talebi. */
    flags?: Array<'GECIKMIS' | 'YENI_SURUM' | 'SILME_TALEBI'>;
}
export interface ActionHint { action: WorkflowAction; label: string; needsReason: boolean; formHref?: string }

const nm = (u?: { id: string; firstName: string | null; lastName: string | null } | null): Person =>
    (u ? { id: u.id, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || '—' } : null);
const userSel = { select: { id: true, firstName: true, lastName: true } } as const;

/**
 * Ortak iş akışı motoru: dört kayıt türü için aşama, izinli eylemler, geçiş ve Kanban panosu.
 * Geçişler mevcut alan servislerine devredilir (iş kuralları tek yerde kalır); kurallar
 * (komşu aşama, rol, yapan ≠ onaylayan) burada ve servislerde backend'de doğrulanır.
 */
@Injectable()
export class WorkflowService {
    constructor(
        private prisma: PrismaService,
        private scope: AccessScopeService,
        private controls: ControlsService,
        private audits: AuditsService,
    ) { }

    private role(actor: AccessActor) { return String(actor.role ?? ''); }
    private perms(ctx: AccessContext) { return ctx.permissions; }
    private requireRole(actor: AccessActor, roles: Set<string>, msg: string) {
        if (!roles.has(this.role(actor))) throw new ForbiddenException(msg);
    }
    private requireReason(action: WorkflowAction, reason?: string) {
        if (['RETURN', 'REVERT', 'CANCEL'].includes(action) && !reason?.trim()) {
            throw new BadRequestException(`${ACTION_LABELS[action]} için gerekçe zorunludur.`);
        }
    }

    // ── Okuma ────────────────────────────────────────────────────────────────

    private async loadOne(type: WorkflowEntityType, id: string, ctx: AccessContext): Promise<WorkflowSnapshot & { extra: any }> {
        switch (type) {
            case 'CONTROL_TEST': {
                await this.scope.assertControlTestAccess(ctx, id);
                const t = await this.prisma.controlTest.findUnique({ where: { id }, include: { control: { select: { controlId: true, name: true } } } });
                if (!t || t.deletedAt) throw new NotFoundException('Kontrol testi bulunamadı');
                const [a, c] = await this.users([t.assigneeId, t.secondControllerId]);
                return {
                    entityType: type, entityId: id, code: t.testNo, title: t.control.name, href: `/controls/testing/${id}`,
                    stage: testStage(t.status), rawStatus: t.status, assignee: a, checker: c, submittedBy: t.status === 'TAMAMLANDI' ? a : null,
                    plannedDate: t.plannedDate, updatedAt: t.updatedAt, extra: t,
                };
            }
            case 'FOLLOW_UP': {
                const scopeW = followUpWhere(ctx);
                const f = await this.prisma.findingFollowUp.findFirst({ where: { AND: [{ id }, scopeW ?? {}] }, include: { finding: { select: { id: true, findingId: true, summary: true } } } });
                if (!f || f.deletedAt) throw new NotFoundException('Takip çalışması bulunamadı');
                const [a, c, ev] = await this.users([f.assigneeId, f.secondControllerId, f.evaluatorId]);
                return {
                    entityType: type, entityId: id, code: f.followUpId, title: f.finding.summary || f.finding.findingId, href: `/findings/${f.finding.id}?followUpId=${id}`,
                    stage: followUpStage(f.status), rawStatus: f.status, assignee: a, checker: c, submittedBy: f.status === 'TAMAMLANDI' ? ev : null,
                    plannedDate: f.plannedDate, updatedAt: f.updatedAt, extra: f,
                };
            }
            case 'FINDING': {
                const fw = findingFullWhere(ctx);
                const f = await this.prisma.finding.findFirst({ where: { AND: [{ id }, fw ?? {}] } });
                if (!f) throw new NotFoundException('Bulgu bulunamadı');
                const [a, c] = await this.users([f.firstControllerId ?? f.assigneeId, f.secondControllerId]);
                return {
                    entityType: type, entityId: id, code: f.findingId, title: f.summary || f.description.slice(0, 120), href: `/findings/${id}`,
                    stage: findingStage(f.workflowStatus), rawStatus: f.workflowStatus, assignee: a, checker: c, submittedBy: null,
                    plannedDate: f.targetResolutionDate, updatedAt: f.updatedAt, extra: f,
                };
            }
            case 'PERIOD_CONTROL': {
                const s = await this.prisma.controlYearScope.findUnique({
                    where: { id }, include: { control: { select: { controlId: true, name: true } }, tasks: { select: { status: true, deletedAt: true } } },
                });
                if (!s) throw new NotFoundException('Dönem kontrolü bulunamadı');
                // Kayıt kapsamı etkinse: dönemin kontrolcüsü olmayan ve hiçbir testine erişimi olmayan kullanıcı göremez.
                const tw = controlTestWhere(ctx);
                if (tw && s.assigneeId !== ctx.userId && s.secondControllerId !== ctx.userId
                    && !(await this.prisma.controlTest.count({ where: { AND: [{ scopeId: id }, tw] } }))) {
                    throw new NotFoundException('Dönem kontrolü bulunamadı');
                }
                const [a, c, sb] = await this.users([s.assigneeId, s.secondControllerId, s.reviewSubmittedById]);
                return {
                    entityType: type, entityId: id, code: s.code ?? `${s.year}.${s.control.controlId}`, title: s.snapshotName || s.control.name, href: `/controls/agenda/${id}`,
                    stage: periodControlStage(s, s.tasks), rawStatus: s.status, assignee: a, checker: c, submittedBy: s.reviewSubmittedAt ? sb : null,
                    plannedDate: null, updatedAt: s.updatedAt, extra: s,
                };
            }
        }
    }

    private async users(ids: Array<string | null | undefined>): Promise<Person[]> {
        const uniq = [...new Set(ids.filter((x): x is string => !!x))];
        const rows = uniq.length ? await this.prisma.user.findMany({ where: { id: { in: uniq } }, ...userSel }) : [];
        const by = new Map(rows.map(u => [u.id, nm(u)]));
        return ids.map(i => (i ? by.get(i) ?? null : null));
    }

    /** Arayüz için izinli eylemler (ipucu). Backend her geçişte yeniden doğrular. */
    private hints(s: WorkflowSnapshot & { extra: any }, actor: AccessActor, ctx: AccessContext): ActionHint[] {
        const role = this.role(actor);
        const manager = MANAGER_ROLES.has(role);
        const isAssignee = s.assignee?.id === actor.id;
        const isChecker = s.checker?.id === actor.id;
        const out: ActionHint[] = [];
        const add = (action: WorkflowAction, formHref?: string) => {
            if (nextStage(action, s.stage)) out.push({ action, label: ACTION_LABELS[action], needsReason: ['RETURN', 'REVERT', 'CANCEL'].includes(action), formHref });
        };
        switch (s.entityType) {
            case 'CONTROL_TEST': {
                const exec = matchesPermission(this.perms(ctx), 'control:test') || matchesPermission(this.perms(ctx), 'test:execute');
                const approve = matchesPermission(this.perms(ctx), 'control:approve');
                if (exec && !isChecker) { add('START'); add('COMPLETE', s.href); }
                if (approve && !isAssignee && (isChecker || role === 'SYSTEM_ADMIN')) { add('APPROVE'); add('RETURN'); }
                if (manager) add('REVERT');
                if (manager && (s.stage !== 'ONAYLANDI' || role === 'SYSTEM_ADMIN')) add('CANCEL');
                break;
            }
            case 'FOLLOW_UP': {
                if (EXEC_ROLES.has(role) && !isChecker) { add('START'); add('COMPLETE', s.href); }
                if (EXEC_ROLES.has(role) && isChecker && s.submittedBy?.id !== actor.id) { add('APPROVE'); add('RETURN'); }
                if (manager && isChecker && s.stage === 'ONAYLANDI') add('REVERT');
                if (EXEC_ROLES.has(role)) add('CANCEL');
                break;
            }
            case 'FINDING': {
                if (EXEC_ROLES.has(role)) { add('START'); add('COMPLETE', s.href); }
                if (manager) { add('APPROVE'); add('RETURN'); add('CANCEL'); }
                break;
            }
            case 'PERIOD_CONTROL': {
                if ((isAssignee || manager) && !isChecker && periodControlReady(s.extra.tasks)) add('COMPLETE');
                if ((isChecker || role === 'SYSTEM_ADMIN') && s.extra.reviewSubmittedById !== actor.id) { add('APPROVE'); add('RETURN'); }
                if (manager && (s.stage === 'ONAYLANDI' || s.stage === 'TAMAMLANDI')) add('REVERT');
                if (manager || isAssignee) add('CANCEL');
                break;
            }
        }
        return out;
    }

    async getState(type: WorkflowEntityType, id: string, actor: AccessActor) {
        this.assertType(type);
        const ctx = await this.scope.context(actor);
        const snap = await this.loadOne(type, id, ctx);
        const history = await this.prisma.workflowTransition.findMany({ where: { entityType: type, entityId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
        const people = await this.users(history.map(h => h.userId));
        const { extra, ...rest } = snap;
        return {
            ...rest,
            stageLabel: STAGE_LABELS[snap.stage],
            stages: STAGES.map(st => ({ key: st, label: STAGE_LABELS[st] })),
            actions: this.hints(snap, actor, ctx),
            deletion: extra?.deletionRequestedAt ? { requestedAt: extra.deletionRequestedAt, reason: extra.deletionReason, requestedBy: (await this.users([extra.deletionRequestedById]))[0] } : null,
            history: history.map((h, i) => ({
                id: h.id, action: h.action, actionLabel: ACTION_LABELS[h.action as WorkflowAction] ?? h.action,
                from: h.fromStage, to: h.toStage, fromLabel: STAGE_LABELS[h.fromStage as Stage] ?? h.fromStage, toLabel: STAGE_LABELS[h.toStage as Stage] ?? h.toStage,
                reason: h.reason, at: h.createdAt, by: people[i],
            })),
        };
    }

    private assertType(type: string): asserts type is WorkflowEntityType {
        if (!ENTITY_TYPES.includes(type as WorkflowEntityType)) throw new BadRequestException('Geçersiz iş akışı kayıt türü.');
    }

    // ── Geçiş ────────────────────────────────────────────────────────────────

    async transition(type: WorkflowEntityType, id: string, action: WorkflowAction, reason: string | undefined, actor: AccessActor) {
        this.assertType(type);
        const ctx = await this.scope.context(actor);
        const snap = await this.loadOne(type, id, ctx);
        const target = nextStage(action, snap.stage);
        if (!target) {
            throw new ConflictException(`'${ACTION_LABELS[action]}' bu aşamada yapılamaz (mevcut: ${STAGE_LABELS[snap.stage]}). Aşamalar atlanamaz.`);
        }
        this.requireReason(action, reason);
        const r = reason?.trim();

        switch (type) {
            case 'CONTROL_TEST': return this.testTransition(snap, action, r, actor, ctx);
            case 'FOLLOW_UP': return this.followUpTransition(snap, action, r, actor);
            case 'FINDING': return this.findingTransition(snap, action, r, actor, ctx);
            case 'PERIOD_CONTROL': return this.periodTransition(snap, action, r, actor);
        }
    }

    /** Kanban sürükle-bırak: hedef aşamaya karşılık gelen TEK komşu eylem; atlama reddedilir. */
    async move(type: WorkflowEntityType, id: string, toStage: Stage, reason: string | undefined, actor: AccessActor) {
        this.assertType(type);
        const ctx = await this.scope.context(actor);
        const snap = await this.loadOne(type, id, ctx);
        if (snap.stage === toStage) return { unchanged: true };
        const action = actionForMove(snap.stage, toStage);
        if (!action) {
            throw new ConflictException(`${STAGE_LABELS[snap.stage]} → ${STAGE_LABELS[toStage]} geçişi yapılamaz: aşamalar sırayla ilerler, 2. kontrolcü onayı atlanamaz.`);
        }
        return { action, result: await this.transition(type, id, action, reason, actor) };
    }

    private formRequired(snap: WorkflowSnapshot, what: string): never {
        throw new BadRequestException({ code: 'WORKFLOW_FORM_REQUIRED', message: `${what} kayıt ekranındaki form ile tamamlanır (zorunlu alanlar var).`, href: snap.href });
    }

    private async testTransition(snap: WorkflowSnapshot, action: WorkflowAction, reason: string | undefined, actor: AccessActor, ctx: AccessContext) {
        const p = this.perms(ctx);
        const exec = matchesPermission(p, 'control:test') || matchesPermission(p, 'test:execute');
        const approve = matchesPermission(p, 'control:approve');
        switch (action) {
            case 'START': if (!exec) throw new ForbiddenException('Test yürütme yetkiniz yok.'); return this.controls.startTest(snap.entityId, actor.id);
            case 'COMPLETE': return this.formRequired(snap, 'Kontrol testi, değerlendirme ve kanıt ile');
            case 'APPROVE': if (!approve) throw new ForbiddenException('Test onaylama yetkiniz yok.'); return this.controls.approveTest(snap.entityId, actor.id);
            case 'RETURN': if (!approve) throw new ForbiddenException('Test iade yetkiniz yok.'); return this.controls.returnTest(snap.entityId, reason!, actor.id);
            case 'REVERT': this.requireRole(actor, MANAGER_ROLES, 'Geri alma yalnız yönetici rolündedir.'); return this.controls.revertTestStage(snap.entityId, reason!, actor.id);
            case 'CANCEL':
                this.requireRole(actor, MANAGER_ROLES, 'İptal yalnız yönetici rolündedir.');
                if (snap.stage === 'ONAYLANDI' && this.role(actor) !== 'SYSTEM_ADMIN') throw new ForbiddenException('Onaylanmış testi yalnız sistem yöneticisi iptal edebilir.');
                return this.controls.cancelTest(snap.entityId, reason!, actor.id);
            default: throw new ConflictException('Bu eylem kontrol testinde desteklenmiyor.');
        }
    }

    private async followUpTransition(snap: WorkflowSnapshot & { extra: any }, action: WorkflowAction, reason: string | undefined, actor: AccessActor) {
        const findingId = snap.extra.findingId as string;
        if (action !== 'REVERT') this.requireRole(actor, EXEC_ROLES, 'Takip çalışmasında bu işlem için yetkiniz yok.');
        switch (action) {
            case 'START': return this.audits.updateFollowUp(findingId, snap.entityId, { status: 'DEVAM_EDIYOR' }, actor.id, this.role(actor));
            case 'COMPLETE': return this.formRequired(snap, 'Takip çalışması, değerlendirme sonucu ile');
            case 'APPROVE': return this.audits.updateFollowUp(findingId, snap.entityId, { approvalStatus: 'ONAYLANDI' }, actor.id, this.role(actor));
            case 'RETURN': return this.audits.updateFollowUp(findingId, snap.entityId, { approvalStatus: 'REDDEDILDI', explanation: reason }, actor.id, this.role(actor));
            case 'REVERT':
                this.requireRole(actor, MANAGER_ROLES, 'Geri alma yalnız yönetici rolündedir.');
                if (snap.stage !== 'ONAYLANDI') throw new ConflictException('Takip çalışmasında yalnız onay geri alınabilir; tamamlanmış değerlendirme 2. kontrolcü tarafından iade edilir.');
                return this.audits.revertFollowUp(findingId, snap.entityId, reason!, actor.id);
            case 'CANCEL': return { deletionRequested: true, result: await this.audits.requestFollowUpDeletion(findingId, snap.entityId, reason!, actor.id) };
            default: throw new ConflictException('Bu eylem takip çalışmasında desteklenmiyor.');
        }
    }

    private async findingTransition(snap: WorkflowSnapshot, action: WorkflowAction, reason: string | undefined, actor: AccessActor, ctx: AccessContext) {
        if ((await this.scope.findingAccess(ctx, snap.entityId)) !== 'FULL') throw new ForbiddenException('Bu bulgu üzerinde işlem yetkiniz yok.');
        switch (action) {
            case 'START': this.requireRole(actor, EXEC_ROLES, 'Bulguyu mutabakata gönderme yetkiniz yok.'); return this.audits.mutabakataGonder(snap.entityId, actor.id);
            case 'COMPLETE': return this.formRequired(snap, 'Bulgu, birim cevabı ile');
            case 'APPROVE': this.requireRole(actor, MANAGER_ROLES, 'Bulgu onayı yalnız yönetici rolündedir.'); return this.audits.mutabakatOnayla(snap.entityId, {}, actor.id);
            case 'RETURN': this.requireRole(actor, MANAGER_ROLES, 'Bulgu iadesi yalnız yönetici rolündedir.'); return this.audits.mutabakatGeriGonder(snap.entityId, reason!, actor.id);
            case 'CANCEL': this.requireRole(actor, MANAGER_ROLES, 'Bulgu iptali yalnız yönetici rolündedir.'); return this.audits.iptalEt(snap.entityId, reason!, actor.id);
            default: throw new ConflictException('Bulguda bu eylem desteklenmiyor (onaylı bulgu kapatma/yeniden açma ile yönetilir).');
        }
    }

    /** Dönem Kontrolü onay akışı (yeni). Bekliyor/Devam Ediyor testlerden türetilir. */
    private async periodTransition(snap: WorkflowSnapshot & { extra: any }, action: WorkflowAction, reason: string | undefined, actor: AccessActor) {
        const s = snap.extra;
        const role = this.role(actor);
        const manager = MANAGER_ROLES.has(role);
        const now = new Date();
        const write = async (where: Prisma.ControlYearScopeWhereInput, data: Prisma.ControlYearScopeUpdateManyMutationInput, to: Stage, auditAction: string) =>
            this.prisma.$transaction(async (tx) => {
                const res = await tx.controlYearScope.updateMany({ where: { id: s.id, status: 'ACTIVE', ...where }, data });
                if (res.count !== 1) throw new ConflictException('Dönem kontrolü bu sırada değişti; sayfayı yenileyin.');
                await logTransition(tx, { entityType: 'PERIOD_CONTROL', entityId: s.id, action, from: snap.stage, to, userId: actor.id, reason });
                await tx.auditLog.create({ data: { userId: actor.id, action: auditAction, entityType: 'ControlYearScope', entityId: s.id, newValue: { from: snap.stage, to, reason: reason ?? null } } });
                return tx.controlYearScope.findUniqueOrThrow({ where: { id: s.id } });
            });
        switch (action) {
            case 'START': throw new ConflictException('Dönem kontrolü, testlerinden biri başlatıldığında kendiliğinden Devam Ediyor olur.');
            case 'COMPLETE': {
                if (!(s.assigneeId === actor.id || manager)) throw new ForbiddenException('Dönem kontrolünü yalnız birinci kontrolcü (veya yönetici) tamamlar.');
                if (s.secondControllerId === actor.id) throw new ForbiddenException('İkinci kontrolcü dönem kontrolünü tamamlayamaz.');
                if (!s.secondControllerId) throw new BadRequestException('Dönem kontrolünün 2. kontrolcüsü atanmamış; tamamlanıp onaya iletilemez.');
                if (!periodControlReady(s.tasks)) throw new BadRequestException('Tüm testler onaylanmadan dönem kontrolü tamamlanamaz.');
                return write({ reviewSubmittedAt: null }, { reviewSubmittedAt: now, reviewSubmittedById: actor.id, reviewReturnedAt: null, reviewReturnReason: null }, 'TAMAMLANDI', 'PERIOD_CONTROL_COMPLETE');
            }
            case 'APPROVE': case 'RETURN': {
                if (!(s.secondControllerId === actor.id || role === 'SYSTEM_ADMIN')) throw new ForbiddenException('Bu dönem kontrolünü yalnız atanmış 2. kontrolcü onaylar/iade eder.');
                if (s.reviewSubmittedById === actor.id || s.assigneeId === actor.id) throw new ForbiddenException('Tamamlayan kişi kendi çalışmasını onaylayamaz/iade edemez.');
                if (action === 'APPROVE') return write({ reviewSubmittedAt: { not: null }, reviewApprovedAt: null }, { reviewApprovedAt: now, reviewApprovedById: actor.id }, 'ONAYLANDI', 'PERIOD_CONTROL_APPROVE');
                return write({ reviewSubmittedAt: { not: null }, reviewApprovedAt: null }, { reviewSubmittedAt: null, reviewSubmittedById: null, reviewReturnedAt: now, reviewReturnReason: reason }, 'DEVAM_EDIYOR', 'PERIOD_CONTROL_RETURN');
            }
            case 'REVERT': {
                if (!manager) throw new ForbiddenException('Geri alma yalnız yönetici rolündedir.');
                if (snap.stage === 'ONAYLANDI') return write({ reviewApprovedAt: { not: null } }, { reviewApprovedAt: null, reviewApprovedById: null }, 'TAMAMLANDI', 'PERIOD_CONTROL_REVERT');
                if (snap.stage === 'TAMAMLANDI') return write({ reviewSubmittedAt: { not: null }, reviewApprovedAt: null }, { reviewSubmittedAt: null, reviewSubmittedById: null }, 'DEVAM_EDIYOR', 'PERIOD_CONTROL_REVERT');
                throw new ConflictException('Dönem kontrolünün Devam Ediyor/Bekliyor aşaması testlerden türetilir; geri alınacak onay yok.');
            }
            case 'CANCEL': throw new ConflictException('Dönem kontrolünün iptali silme talebi ile yapılır (yönetici onayı gerekir).');
            default: throw new ConflictException('Bu eylem dönem kontrolünde desteklenmiyor.');
        }
    }

    // ── Kanban panosu ────────────────────────────────────────────────────────

    async board(actor: AccessActor, q: { type?: string; assigneeId?: string; stage?: string; from?: string; to?: string; scope?: string; year?: number }) {
        const ctx = await this.scope.context(actor);
        const manager = MANAGER_ROLES.has(this.role(actor));
        const mine = q.scope !== 'ORG' || !manager; // kurum geneli yalnız yönetici
        const types = (q.type ? q.type.split(',') : ENTITY_TYPES).filter((t): t is WorkflowEntityType => ENTITY_TYPES.includes(t as WorkflowEntityType));
        const from = q.from ? new Date(q.from) : null;
        const to = q.to ? new Date(q.to) : null;
        const dateIn = (d: Date | null) => (!from || (d && d >= from)) && (!to || (d && d <= to));
        const year = q.year ?? new Date().getFullYear();
        const me = actor.id;
        const items: WorkflowSnapshot[] = [];

        if (types.includes('CONTROL_TEST')) {
            const tw = controlTestWhere(ctx);
            const rows = await this.prisma.controlTest.findMany({
                where: { AND: [{ deletedAt: null, OR: [{ year }, { year: null, plannedDate: { gte: new Date(Date.UTC(year, 0, 1) - 3 * 3600000), lt: new Date(Date.UTC(year + 1, 0, 1) - 3 * 3600000) } }] }, tw ?? {}, mine ? { OR: [{ assigneeId: me }, { secondControllerId: me }] } : {}] },
                include: { control: { select: { name: true } } }, orderBy: { plannedDate: 'asc' }, take: 2000,
            });
            const people = await this.peopleMap(rows.flatMap(r => [r.assigneeId, r.secondControllerId]));
            for (const r of rows) items.push({
                entityType: 'CONTROL_TEST', entityId: r.id, code: r.testNo, title: r.control.name, href: `/controls/testing/${r.id}`,
                stage: testStage(r.status), rawStatus: r.status, assignee: people(r.assigneeId), checker: people(r.secondControllerId), submittedBy: null, plannedDate: r.plannedDate, updatedAt: r.updatedAt,
                flags: [...(isTestOverdue(r) ? ['GECIKMIS' as const] : []), ...(r.deletionRequestedAt ? ['SILME_TALEBI' as const] : [])],
            });
        }
        if (types.includes('FOLLOW_UP')) {
            const fw = followUpWhere(ctx);
            const rows = await this.prisma.findingFollowUp.findMany({
                where: { AND: [{ deletedAt: null }, fw ?? {}, mine ? { OR: [{ assigneeId: me }, { secondControllerId: me }] } : {}] },
                include: { finding: { select: { id: true, findingId: true, summary: true } } }, orderBy: { plannedDate: 'asc' }, take: 2000,
            });
            const people = await this.peopleMap(rows.flatMap(r => [r.assigneeId, r.secondControllerId]));
            for (const r of rows) items.push({
                entityType: 'FOLLOW_UP', entityId: r.id, code: r.followUpId, title: r.finding.summary || r.finding.findingId, href: `/findings/${r.finding.id}?followUpId=${r.id}`,
                stage: followUpStage(r.status), rawStatus: r.status, assignee: people(r.assigneeId), checker: people(r.secondControllerId), submittedBy: null, plannedDate: r.plannedDate, updatedAt: r.updatedAt,
                flags: [...(isFollowUpOverdue(r) ? ['GECIKMIS' as const] : []), ...(r.deletionRequestedAt ? ['SILME_TALEBI' as const] : [])],
            });
        }
        if (types.includes('FINDING')) {
            const fw = findingFullWhere(ctx);
            const rows = await this.prisma.finding.findMany({
                where: { AND: [fw ?? {}, mine ? { OR: [{ assigneeId: me }, { firstControllerId: me }, { secondControllerId: me }] } : {}] },
                orderBy: { createdAt: 'desc' }, take: 2000,
            });
            const people = await this.peopleMap(rows.flatMap(r => [r.firstControllerId ?? r.assigneeId, r.secondControllerId]));
            for (const r of rows) items.push({
                entityType: 'FINDING', entityId: r.id, code: r.findingId, title: r.summary || r.description.slice(0, 120), href: `/findings/${r.id}`,
                stage: findingStage(r.workflowStatus), rawStatus: r.workflowStatus, assignee: people(r.firstControllerId ?? r.assigneeId), checker: people(r.secondControllerId), submittedBy: null, plannedDate: r.targetResolutionDate, updatedAt: r.updatedAt,
            });
        }
        if (types.includes('PERIOD_CONTROL')) {
            const rows = await this.prisma.controlYearScope.findMany({
                where: { AND: [{ year, status: 'ACTIVE' }, mine ? { OR: [{ assigneeId: me }, { secondControllerId: me }] } : {}] },
                include: { control: { select: { controlId: true, name: true, version: true } }, tasks: { select: { status: true, deletedAt: true } } }, take: 2000,
            });
            const people = await this.peopleMap(rows.flatMap(r => [r.assigneeId, r.secondControllerId]));
            for (const r of rows) items.push({
                entityType: 'PERIOD_CONTROL', entityId: r.id, code: r.code ?? `${r.year}.${r.control.controlId}`, title: r.snapshotName || r.control.name, href: `/controls/agenda/${r.id}`,
                stage: periodControlStage(r, r.tasks), rawStatus: r.status, assignee: people(r.assigneeId), checker: people(r.secondControllerId), submittedBy: null, plannedDate: null, updatedAt: r.updatedAt,
                flags: [...(r.control.version > (r.controlVersion ?? 1) ? ['YENI_SURUM' as const] : []), ...(r.deletionRequestedAt ? ['SILME_TALEBI' as const] : [])],
            });
        }

        const filtered = items.filter(i => i.stage !== 'IPTAL'
            && (!q.assigneeId || i.assignee?.id === q.assigneeId || i.checker?.id === q.assigneeId)
            && (!q.stage || i.stage === q.stage)
            && dateIn(i.plannedDate ?? i.updatedAt));
        const columns = STAGES.map(st => {
            const list = filtered.filter(i => i.stage === st);
            return { stage: st, label: STAGE_LABELS[st], total: list.length, items: list.slice(0, 200) };
        });
        return { columns, scope: mine ? 'MINE' : 'ORG', canOrg: manager, year };
    }

    private async peopleMap(ids: Array<string | null | undefined>) {
        const uniq = [...new Set(ids.filter((x): x is string => !!x))];
        const rows = uniq.length ? await this.prisma.user.findMany({ where: { id: { in: uniq } }, ...userSel }) : [];
        const by = new Map(rows.map(u => [u.id, nm(u)]));
        return (id: string | null | undefined) => (id ? by.get(id) ?? null : null);
    }
}
