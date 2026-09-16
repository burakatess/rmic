import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { ControlDashboardService } from '../controls/control-dashboard.service';
import { ControlsService } from '../controls/controls.service';
import { matchesPermission } from '../../common/util/permission-match';
import {
    CLOSED_ACTION_STATUSES, OPEN_TEST_STATUSES, OPEN_FOLLOWUP_STATUSES,
} from '../../common/util/metric-definitions';
import { daysFromNowRangeIstanbul, startOfDayIstanbul } from '../../common/util/date-scope.util';
import { DirectorateScopeService, ResolvedDirectorateScope } from '../../common/services/directorate-scope.service';
import type { DashboardWorkTab } from './dto/dashboard-query.dto';

// Bulgu mutabakat onayını verebilecek roller — audits.service.ts::FOLLOWUP_APPROVER_ROLES
// ve mutabakatOnayla controller @Roles ile AYNI (Madde 8 — tek tanım her yerde tekrarlanır,
// ayrı bir modülde olduğu için burada da eşdeğer sabit tutuluyor).
const RECONCILIATION_APPROVER_ROLES = new Set(['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER']);
const normalizeRole = (r?: string): string => ({ ADMIN: 'SYSTEM_ADMIN', RISK_MANAGER: 'RISK_CONTROL_MANAGER' }[r ?? ''] ?? r ?? '');

// Kapsanan iş öğesi türü listesi — tek yerden yönetilen tür sayısı bu kadar
// (yeni bir tür eklenirse ModuleAccess + tüm switch'ler genişletilmeli).
interface ModuleAccess { tests: boolean; actions: boolean; followUps: boolean; findings: boolean; }

function resolveModuleAccess(perms: string[]): ModuleAccess {
    return {
        tests: matchesPermission(perms, 'control:view') || matchesPermission(perms, 'test:execute'),
        actions: matchesPermission(perms, 'action:view'),
        followUps: matchesPermission(perms, 'finding:view'),
        findings: matchesPermission(perms, 'finding:view'),
    };
}

// NOT: ControlTest.directorateId — scopeId'den BAĞIMSIZ, kontrol kaydı
// üzerinden doğrudan doldurulan gerçek bir FK'dir (ControlYearScope'a değil).
// Birim kapsamı bilerek scopeId ÜZERİNDEN DEĞİL bu alan üzerinden çözülür —
// böylece scopeId=NULL olan AD_HOC/eşleştirilemeyen testler de Birimim
// kapsamında (kurum geneline açılmadan) doğru görünür (Madde 1).
function testScopeWhere(scope: ResolvedDirectorateScope) {
    if (scope.appliedScope === 'MINE') return { OR: [{ assigneeId: scope.userId }, { secondControllerId: scope.userId }] };
    if (scope.appliedScope === 'UNIT') return { directorateId: { in: scope.directorateIds! } };
    return {};
}
function actionScopeWhere(scope: ResolvedDirectorateScope) {
    if (scope.appliedScope === 'MINE') return { ownerId: scope.userId };
    if (scope.appliedScope === 'UNIT') return { directorateId: { in: scope.directorateIds! } };
    return {};
}
function followUpScopeWhere(scope: ResolvedDirectorateScope) {
    if (scope.appliedScope === 'MINE') {
        return { OR: [{ finding: { assigneeId: scope.userId } }, { action: { ownerId: scope.userId } }, { secondControllerId: scope.userId }] };
    }
    if (scope.appliedScope === 'UNIT') return { directorateId: { in: scope.directorateIds! } };
    return {};
}
function findingScopeWhere(scope: ResolvedDirectorateScope) {
    if (scope.appliedScope === 'MINE') return { assigneeId: scope.userId };
    if (scope.appliedScope === 'UNIT') return { directorateId: { in: scope.directorateIds! } };
    return {};
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

export interface WorkItemRow {
    id: string;
    type: 'TEST' | 'ACTION' | 'FOLLOWUP' | 'RECONCILIATION';
    ref: string;
    title: string;
    dueDate: string | null;
    severity: string | null;
    carriedOver: boolean;
    expectedAction: { label: string; href: string };
    sortScore: number;
    /** Henüz isme çözülmemiş sorumlu kullanıcı id'si (ControlTest/FollowUp: FK değil, düz string). */
    assigneeId?: string | null;
    /** İlişkisel FK üzerinden zaten çözülmüş sorumlu adı (ör. Action.owner). */
    assigneeName?: string | null;
    /** Yalnızca TEST: scopeId=NULL (AD_HOC veya eşleştirilemeyen legacy kayıt) —
     * iş listesinden DÜŞÜRÜLMEZ, yalnızca "Plansız / Ad Hoc" olarak işaretlenir
     * ve yıllık plan tamamlanma paydasına dahil edilmez (Madde 1). */
    isAdHoc?: boolean;
}

// Bir iş türünde makul tekil kullanıcı/birim iş yükü çok büyük olmaz — çapraz
// tablo birleşik sayfalama tek SQL ile yapılamadığından (ayrı tablolar), her
// tür için sınırlı (capped) ve sıralanmış bir aday küme çekilir, gerçek
// TOPLAM sayı ayrı count() ile hesaplanır (asla yanlış olmaz), sayfalama
// birleştirilmiş listede Node tarafında uygulanır. Bkz. plan "Cross-table
// work items pagination".
const PER_TYPE_CAP = 300;

@Injectable()
export class DashboardService {
    constructor(
        private prisma: PrismaService,
        private scopeService: DirectorateScopeService,
        private controlDashboard: ControlDashboardService,
        private controlsService: ControlsService,
    ) { }

    async getScopeOptions(userId: string, permissions: string[]) {
        return this.scopeService.getScopeOptions(userId, permissions);
    }

    private async resolve(userId: string, permissions: string[], q: { scope?: any; directorateId?: string[] }) {
        return this.scopeService.resolveScope(userId, permissions, q);
    }

    // ─── Özet KPI'lar ───────────────────────────────────────────────────────

    async getSummary(userId: string, permissions: string[], userRole: string, q: { scope?: any; directorateId?: string[] }) {
        const scope = await this.resolve(userId, permissions, q);
        const access = resolveModuleAccess(permissions);
        const now = new Date();
        const overdueThreshold = startOfDayIstanbul(now);
        const { start: weekStart, end: weekEnd } = daysFromNowRangeIstanbul(7);

        const [overdueTests, overdueActions, overdueFollowUps, dueTests, dueActions, dueFollowUps, criticalHighFindings, approvals] = await Promise.all([
            access.tests ? this.prisma.controlTest.count({ where: { ...testScopeWhere(scope), status: { in: [...OPEN_TEST_STATUSES] }, plannedDate: { lt: overdueThreshold } } }) : Promise.resolve(null),
            access.actions ? this.prisma.action.count({ where: { ...actionScopeWhere(scope), status: { notIn: [...CLOSED_ACTION_STATUSES] }, dueDate: { lt: overdueThreshold } } }) : Promise.resolve(null),
            access.followUps ? this.prisma.findingFollowUp.count({ where: { ...followUpScopeWhere(scope), status: { in: [...OPEN_FOLLOWUP_STATUSES] }, plannedDate: { lt: overdueThreshold } } }) : Promise.resolve(null),
            access.tests ? this.prisma.controlTest.count({ where: { ...testScopeWhere(scope), status: { in: [...OPEN_TEST_STATUSES] }, plannedDate: { gte: weekStart, lte: weekEnd } } }) : Promise.resolve(null),
            access.actions ? this.prisma.action.count({ where: { ...actionScopeWhere(scope), status: { notIn: [...CLOSED_ACTION_STATUSES] }, dueDate: { gte: weekStart, lte: weekEnd } } }) : Promise.resolve(null),
            access.followUps ? this.prisma.findingFollowUp.count({ where: { ...followUpScopeWhere(scope), status: { in: [...OPEN_FOLLOWUP_STATUSES] }, plannedDate: { gte: weekStart, lte: weekEnd } } }) : Promise.resolve(null),
            access.findings ? this.prisma.finding.count({ where: { ...findingScopeWhere(scope), severity: { in: ['CRITICAL', 'HIGH'] }, status: { not: 'CLOSED' } } }) : Promise.resolve(null),
            this.getPendingApprovals(userId, permissions, userRole),
        ]);

        const overdueTotal = access.tests || access.actions || access.followUps
            ? (overdueTests ?? 0) + (overdueActions ?? 0) + (overdueFollowUps ?? 0)
            : null;
        const dueThisWeekTotal = access.tests || access.actions || access.followUps
            ? (dueTests ?? 0) + (dueActions ?? 0) + (dueFollowUps ?? 0)
            : null;

        return {
            scope: { applied: scope.appliedScope, directorateIds: scope.directorateIds },
            overdue: overdueTotal === null ? null : { total: overdueTotal, tests: overdueTests, actions: overdueActions, followUps: overdueFollowUps },
            pendingApproval: { total: approvals.total, reason: null as string | null },
            dueThisWeek: dueThisWeekTotal === null ? null : { total: dueThisWeekTotal, from: weekStart, to: weekEnd },
            criticalHighFindings: access.findings ? { total: criticalHighFindings } : { total: null, reason: 'finding:view yetkiniz yok' },
        };
    }

    // ─── Onay Bekleyenler ───────────────────────────────────────────────────

    async getPendingApprovals(userId: string, permissions: string[], userRole: string) {
        void permissions;
        const isReconciliationApprover = RECONCILIATION_APPROVER_ROLES.has(normalizeRole(userRole));

        const [testApprovals, followUpApprovals, reconciliationCandidates] = await Promise.all([
            this.controlsService.getMyPendingApprovals(userId, {}),
            this.prisma.findingFollowUp.count({
                where: { secondControllerId: userId, approvalStatus: 'BEKLIYOR', result: { not: null } },
            }),
            // Onaylama yetkisi ROL'e bağlı (audits.controller.ts::mutabakatOnayla
            // @Roles ile AYNI) — yetkisiz kullanıcıya sıfır göster (görüntüleme
            // izni onay yetkisi anlamına gelmez, Madde 8).
            isReconciliationApprover
                ? this.prisma.finding.findMany({
                    where: { workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' },
                    select: {
                        id: true,
                        statusHistory: {
                            where: { workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' },
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                            select: { evaluator: true },
                        },
                    },
                    take: 500,
                })
                : Promise.resolve([] as { id: string; statusHistory: { evaluator: string | null }[] }[]),
        ]);

        // Kendi gönderdiği mutabakatı onaylayamaz (Madde 8, audits.service.ts::mutabakatOnayla
        // ile AYNI kural) — onay kuyruğunda da göstermiyoruz.
        const reconciliationApprovals = reconciliationCandidates.filter(f => f.statusHistory[0]?.evaluator !== userId).length;

        const testCount = testApprovals.data.length;
        return {
            total: testCount + followUpApprovals + reconciliationApprovals,
            byType: {
                controlTest: { count: testCount, href: '/approvals' },
                followUp: { count: followUpApprovals, href: '/follow-ups' },
                reconciliation: { count: reconciliationApprovals, href: '/findings' },
            },
        };
    }

    // ─── Öncelikli İşler (iş listesi) ───────────────────────────────────────

    async getWorkItems(userId: string, permissions: string[], userRole: string, q: {
        scope?: any; directorateId?: string[]; tab?: DashboardWorkTab; page?: number; pageSize?: number;
        year?: number; month?: number; includeCarryover?: boolean;
    }) {
        const scope = await this.resolve(userId, permissions, q);
        const access = resolveModuleAccess(permissions);
        const tab = q.tab ?? 'ALL';
        const page = q.page ?? 1;
        const pageSize = q.pageSize ?? 20;
        const periodStart = this.resolvePeriodStart(q.year, q.month);
        const includeCarryover = q.includeCarryover ?? true;
        const isApprover = RECONCILIATION_APPROVER_ROLES.has(normalizeRole(userRole));

        const wantTests = access.tests && (tab === 'ALL' || tab === 'TESTS');
        const wantActions = access.actions && (tab === 'ALL' || tab === 'ACTIONS');
        const wantFollowUps = access.followUps && (tab === 'ALL' || tab === 'FOLLOWUPS');
        const wantReconciliation = access.findings && tab === 'RECONCILIATION';

        const [testRows, testTotal, actionRows, actionTotal, followUpRows, followUpTotal, reconRows, reconTotal] = await Promise.all([
            wantTests ? this.fetchTests(scope, periodStart, includeCarryover) : Promise.resolve([]),
            wantTests ? this.prisma.controlTest.count({
                where: {
                    ...testScopeWhere(scope), status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'] },
                    ...(includeCarryover ? {} : { plannedDate: { gte: periodStart } }),
                },
            }) : Promise.resolve(0),
            wantActions ? this.fetchActions(scope, periodStart, includeCarryover) : Promise.resolve([]),
            wantActions ? this.prisma.action.count({
                where: {
                    ...actionScopeWhere(scope), status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'YETERSIZ'] },
                    ...(includeCarryover ? {} : { dueDate: { gte: periodStart } }),
                },
            }) : Promise.resolve(0),
            wantFollowUps ? this.fetchFollowUps(scope, periodStart, includeCarryover) : Promise.resolve([]),
            wantFollowUps ? this.prisma.findingFollowUp.count({
                where: {
                    ...followUpScopeWhere(scope), status: { in: [...OPEN_FOLLOWUP_STATUSES] },
                    ...(includeCarryover ? {} : { plannedDate: { gte: periodStart } }),
                },
            }) : Promise.resolve(0),
            wantReconciliation ? this.fetchReconciliation(scope, isApprover) : Promise.resolve([]),
            wantReconciliation ? this.prisma.finding.count({ where: { ...this.reconciliationScopeWhere(scope, isApprover), workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' } }) : Promise.resolve(0),
        ]);

        const merged = [...testRows, ...actionRows, ...followUpRows, ...reconRows].sort((a, b) => b.sortScore - a.sortScore);
        const totalCount = tab === 'ALL'
            ? testTotal + actionTotal + followUpTotal
            : tab === 'TESTS' ? testTotal : tab === 'ACTIONS' ? actionTotal : tab === 'FOLLOWUPS' ? followUpTotal : reconTotal;

        const pageItems = merged.slice((page - 1) * pageSize, page * pageSize);

        // ControlTest/FollowUp.assigneeId ilişkisel FK değil (düz string) — tek ek
        // sorgu ile toplu isim çözümü (N+1 değil, yalnızca bu sayfadaki satırlar için).
        const idsToResolve = [...new Set(pageItems.filter(i => i.assigneeId && !i.assigneeName).map(i => i.assigneeId as string))];
        const nameMap = idsToResolve.length > 0
            ? new Map((await this.prisma.user.findMany({
                where: { id: { in: idsToResolve } },
                select: { id: true, firstName: true, lastName: true },
            })).map(u => [u.id, `${u.firstName} ${u.lastName}`]))
            : new Map<string, string>();

        const data = pageItems.map(({ assigneeId, sortScore: _sortScore, ...rest }) => ({
            ...rest,
            assigneeName: rest.assigneeName ?? (assigneeId ? nameMap.get(assigneeId) ?? null : null),
        }));

        return {
            scope: { applied: scope.appliedScope, directorateIds: scope.directorateIds },
            page, pageSize, totalCount,
            fetchedCount: merged.length,
            capped: merged.length >= PER_TYPE_CAP,
            data,
        };
    }

    private resolvePeriodStart(year?: number, month?: number): Date {
        const now = new Date();
        const y = year ?? now.getFullYear();
        const m = month ? month - 1 : 0; // ay verilmediyse yıl başından itibaren devreden dahil
        return new Date(y, m, 1);
    }

    private async fetchTests(scope: ResolvedDirectorateScope, periodStart: Date, includeCarryover: boolean): Promise<WorkItemRow[]> {
        const now = new Date();
        const rows = await this.prisma.controlTest.findMany({
            where: {
                ...testScopeWhere(scope),
                status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'] },
                ...(includeCarryover ? {} : { plannedDate: { gte: periodStart } }),
            },
            select: {
                id: true, testNo: true, status: true, plannedDate: true, year: true, assigneeId: true, scopeId: true,
                control: { select: { controlId: true, name: true } },
            },
            orderBy: { plannedDate: 'asc' },
            take: PER_TYPE_CAP,
        });

        return rows.map(r => {
            const overdue = r.plannedDate < startOfDayIstanbul(now);
            const label = r.status === 'GERI_GONDERILDI' ? 'Revizyonu tamamla'
                : r.status === 'DEVAM_EDIYOR' ? 'Testi değerlendir'
                    : 'Testi başlat';
            return {
                id: r.id, type: 'TEST' as const, ref: r.testNo,
                title: `${r.control.controlId} · ${r.control.name}`,
                dueDate: r.plannedDate.toISOString(),
                severity: null,
                carriedOver: r.plannedDate < periodStart,
                expectedAction: { label, href: `/controls/testing/${r.id}` },
                sortScore: this.score({ overdue, revision: r.status === 'GERI_GONDERILDI', severity: null, dueDate: r.plannedDate }),
                assigneeId: r.assigneeId,
                isAdHoc: r.scopeId === null,
            };
        });
    }

    private async fetchActions(scope: ResolvedDirectorateScope, periodStart: Date, includeCarryover: boolean): Promise<WorkItemRow[]> {
        const now = new Date();
        const rows = await this.prisma.action.findMany({
            where: {
                ...actionScopeWhere(scope),
                status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'YETERSIZ'] },
                ...(includeCarryover ? {} : { dueDate: { gte: periodStart } }),
            },
            select: {
                id: true, actionId: true, description: true, status: true, dueDate: true,
                finding: { select: { severity: true } },
                owner: { select: { firstName: true, lastName: true } },
            },
            orderBy: { dueDate: 'asc' },
            take: PER_TYPE_CAP,
        });

        return rows.map(r => {
            const overdue = r.dueDate < startOfDayIstanbul(now);
            const label = r.status === 'YETERSIZ' ? 'Kanıtı incele' : 'İlerlemeyi güncelle';
            return {
                id: r.id, type: 'ACTION' as const, ref: r.actionId,
                title: r.description,
                dueDate: r.dueDate.toISOString(),
                severity: r.finding?.severity ?? null,
                carriedOver: r.dueDate < periodStart,
                expectedAction: { label, href: `/actions/${r.id}` },
                sortScore: this.score({ overdue, revision: r.status === 'YETERSIZ', severity: r.finding?.severity ?? null, dueDate: r.dueDate }),
                assigneeName: r.owner ? `${r.owner.firstName} ${r.owner.lastName}` : null,
            };
        });
    }

    private async fetchFollowUps(scope: ResolvedDirectorateScope, periodStart: Date, includeCarryover: boolean): Promise<WorkItemRow[]> {
        const now = new Date();
        const rows = await this.prisma.findingFollowUp.findMany({
            where: {
                ...followUpScopeWhere(scope),
                status: { in: [...OPEN_FOLLOWUP_STATUSES] },
                ...(includeCarryover ? {} : { plannedDate: { gte: periodStart } }),
            },
            select: {
                id: true, followUpId: true, status: true, plannedDate: true,
                finding: { select: { summary: true, severity: true, assigneeId: true } },
                action: { select: { ownerId: true } },
            },
            orderBy: { plannedDate: 'asc' },
            take: PER_TYPE_CAP,
        });

        return rows.map(r => {
            const due = r.plannedDate ?? now;
            const overdue = due < startOfDayIstanbul(now);
            return {
                id: r.id, type: 'FOLLOWUP' as const, ref: r.followUpId,
                title: r.finding?.summary ?? r.followUpId,
                dueDate: r.plannedDate ? r.plannedDate.toISOString() : null,
                severity: r.finding?.severity ?? null,
                carriedOver: !!r.plannedDate && r.plannedDate < periodStart,
                expectedAction: { label: 'Takibi değerlendir', href: '/follow-ups' },
                sortScore: this.score({ overdue, revision: false, severity: r.finding?.severity ?? null, dueDate: due }),
                assigneeId: r.finding?.assigneeId ?? r.action?.ownerId ?? null,
            };
        });
    }

    private reconciliationScopeWhere(scope: ResolvedDirectorateScope, isApprover: boolean) {
        if (scope.appliedScope === 'UNIT') return { directorateId: { in: scope.directorateIds! } };
        if (scope.appliedScope === 'MINE' && !isApprover) return { assigneeId: scope.userId };
        return {};
    }

    private async fetchReconciliation(scope: ResolvedDirectorateScope, isApprover: boolean): Promise<WorkItemRow[]> {
        const rows = await this.prisma.finding.findMany({
            where: { ...this.reconciliationScopeWhere(scope, isApprover), workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' },
            select: { id: true, findingId: true, summary: true, severity: true, updatedAt: true },
            orderBy: { updatedAt: 'asc' },
            take: PER_TYPE_CAP,
        });
        return rows.map(r => ({
            id: r.id, type: 'RECONCILIATION' as const, ref: r.findingId,
            title: r.summary ?? r.findingId,
            dueDate: null,
            severity: r.severity,
            carriedOver: false,
            expectedAction: { label: 'Mutabakatı incele', href: `/findings/${r.id}` },
            sortScore: this.score({ overdue: false, revision: false, severity: r.severity, dueDate: r.updatedAt }),
        }));
    }

    private score(input: { overdue: boolean; revision: boolean; severity: string | null; dueDate: Date }): number {
        // Deterministik sıralama: revizyon/gecikmiş > önem > yakın tarih.
        let s = 0;
        if (input.revision) s += 1_000_000;
        if (input.overdue) s += 500_000;
        s += (SEVERITY_RANK[input.severity ?? ''] ?? 0) * 10_000;
        // Yakın tarih daha yüksek skor alsın — uzak gelecek tarihler negatif katkı.
        const daysAway = (input.dueDate.getTime() - Date.now()) / 86_400_000;
        s += Math.max(0, 3650 - daysAway);
        return s;
    }

    // ─── Kritik Konular ─────────────────────────────────────────────────────

    async getCriticalIssues(userId: string, permissions: string[], q: { scope?: any; directorateId?: string[] }) {
        const scope = await this.resolve(userId, permissions, q);
        const access = resolveModuleAccess(permissions);
        const now = new Date();
        const fWhere = findingScopeWhere(scope);
        const aWhere = actionScopeWhere(scope);

        const issues: { key: string; label: string; count: number; severity: 'critical' | 'high' | 'medium'; href: string }[] = [];

        if (access.findings) {
            const [noActionFindings, noOwnerOrDate] = await Promise.all([
                this.prisma.finding.count({ where: { ...fWhere, status: { not: 'CLOSED' }, actions: { none: {} } } }),
                this.prisma.finding.count({ where: { ...fWhere, status: { not: 'CLOSED' }, OR: [{ assigneeId: null }, { targetResolutionDate: null }] } }),
            ]);
            issues.push({ key: 'NO_ACTION_PLAN', label: 'bulguda aksiyon planı eksik', count: noActionFindings, severity: 'high', href: '/findings' });
            issues.push({ key: 'MISSING_OWNER_OR_DATE', label: 'açık bulguda sorumlu veya hedef tarih eksik', count: noOwnerOrDate, severity: 'medium', href: '/findings' });
        }

        if (access.actions) {
            const pendingClosureVerification = await this.prisma.action.count({
                where: { ...aWhere, status: 'TAMAMLANDI' },
            });
            issues.push({ key: 'CLOSURE_VERIFICATION_PENDING', label: 'aksiyonda kapanış doğrulaması bekliyor', count: pendingClosureVerification, severity: 'high', href: '/actions?status=TAMAMLANDI' });
        }

        if (access.followUps) {
            const insufficientNoNewAction = await this.prisma.findingFollowUp.count({
                where: { ...followUpScopeWhere(scope), result: 'YETERSIZ', newActionRequired: false },
            });
            issues.push({ key: 'INSUFFICIENT_NO_NEW_ACTION', label: 'takip sonucu yetersiz, yeni işlem bekleniyor', count: insufficientNoNewAction, severity: 'high', href: '/follow-ups' });
        }

        // Yıl kapsamına alınmış fakat hiç task'ı olmayan kontroller.
        const currentYear = now.getFullYear();
        const [scopesThisYear, scopesWithTasks] = await Promise.all([
            this.prisma.controlYearScope.findMany({
                where: { year: currentYear, status: 'ACTIVE', ...(scope.appliedScope === 'UNIT' ? { control: { directorateId: { in: scope.directorateIds! } } } : {}) },
                select: { id: true },
            }),
            this.prisma.controlTest.groupBy({ by: ['scopeId'], where: { year: currentYear, scopeId: { not: null } }, _count: true }),
        ]);
        const scopeIdsWithTasks = new Set(scopesWithTasks.map(g => g.scopeId));
        const scopesMissingTasks = scopesThisYear.filter(s => !scopeIdsWithTasks.has(s.id)).length;
        issues.push({ key: 'SCOPE_MISSING_TASKS', label: 'kapsamdaki kontrolün bu yıl hiç task\'ı yok', count: scopesMissingTasks, severity: 'medium', href: `/controls/agenda?year=${currentYear}` });

        // Test zamanı geçmiş, geçerli (ONAYLANDI) testi olmayan KRİTİK kontroller —
        // yalnızca planlanan tarihi geçmiş olanlar (henüz gelmemiş kontrol eksiklik sayılmaz).
        const overdueUntested = await this.prisma.controlTest.count({
            where: {
                year: currentYear,
                status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'] },
                plannedDate: { lt: startOfDayIstanbul(now) },
                ...(scope.appliedScope === 'UNIT' ? { directorateId: { in: scope.directorateIds! } } : {}),
            },
        });
        issues.push({ key: 'OVERDUE_UNTESTED', label: 'kontrolde test zamanı geçti, geçerli test yok', count: overdueUntested, severity: 'critical', href: `/controls/agenda?year=${currentYear}&overdue=true` });

        return issues.filter(i => i.count > 0).sort((a, b) => {
            const rank = { critical: 3, high: 2, medium: 1 } as const;
            return rank[b.severity] - rank[a.severity];
        });
    }

    // ─── Yıllık Kontrol Planı ────────────────────────────────────────────────

    async getAnnualPlan(userId: string, permissions: string[], q: { scope?: any; directorateId?: string[]; year?: number }) {
        const scope = await this.resolve(userId, permissions, q);
        const query: any = { year: q.year ?? new Date().getFullYear() };
        if (scope.appliedScope === 'MINE') query.assigneeId = scope.userId;
        if (scope.appliedScope === 'UNIT') query.directorateIds = scope.directorateIds;
        const result = await this.controlDashboard.getDashboard(query);
        return { ...result, scope: { applied: scope.appliedScope, directorateIds: scope.directorateIds } };
    }

    // ─── Yaklaşan Takvim ─────────────────────────────────────────────────────

    async getUpcoming(userId: string, permissions: string[], q: { scope?: any; directorateId?: string[]; days?: number }) {
        const scope = await this.resolve(userId, permissions, q);
        const access = resolveModuleAccess(permissions);
        const days = q.days === 30 ? 30 : 7;
        const { start, end } = daysFromNowRangeIstanbul(days);

        const [tests, actions, followUps] = await Promise.all([
            access.tests ? this.prisma.controlTest.findMany({
                where: { ...testScopeWhere(scope), status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'] }, plannedDate: { gte: start, lte: end } },
                select: { id: true, testNo: true, plannedDate: true, control: { select: { name: true } } },
            }) : Promise.resolve([]),
            access.actions ? this.prisma.action.findMany({
                where: { ...actionScopeWhere(scope), status: { notIn: [...CLOSED_ACTION_STATUSES] }, dueDate: { gte: start, lte: end } },
                select: { id: true, actionId: true, dueDate: true, description: true },
            }) : Promise.resolve([]),
            access.followUps ? this.prisma.findingFollowUp.findMany({
                where: { ...followUpScopeWhere(scope), status: { in: [...OPEN_FOLLOWUP_STATUSES] }, plannedDate: { gte: start, lte: end } },
                select: { id: true, followUpId: true, plannedDate: true },
            }) : Promise.resolve([] as { id: string; followUpId: string; plannedDate: Date | null }[]),
        ]);

        const items = [
            ...tests.map(t => ({ date: t.plannedDate, type: 'TEST' as const, ref: t.testNo, title: t.control.name, href: `/controls/testing/${t.id}` })),
            ...actions.map(a => ({ date: a.dueDate, type: 'ACTION' as const, ref: a.actionId, title: a.description, href: `/actions/${a.id}` })),
            ...followUps.filter(f => f.plannedDate).map(f => ({ date: f.plannedDate as Date, type: 'FOLLOWUP' as const, ref: f.followUpId, title: f.followUpId, href: '/follow-ups' })),
        ].sort((a, b) => a.date.getTime() - b.date.getTime());

        const grouped = new Map<string, typeof items>();
        for (const item of items) {
            const key = item.date.toISOString().slice(0, 10);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(item);
        }

        return {
            scope: { applied: scope.appliedScope, directorateIds: scope.directorateIds },
            range: { from: start, to: end, days },
            days: [...grouped.entries()].map(([date, dayItems]) => ({ date, items: dayItems })),
        };
    }
}
