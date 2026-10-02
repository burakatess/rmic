import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { DirectorateScopeService } from '../../common/services/directorate-scope.service';
import { WorkflowHealthQueryDto } from './dto/workflow-health-query.dto';

type HealthSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
type HealthItem = {
    code: string; severity: HealthSeverity; entityType: string; entityId: string;
    title: string; message: string; nextAction: string; href: string;
    year?: number; directorateId?: string | null;
};

const OPEN_ACTIONS = ['BEKLIYOR', 'DEVAM_EDIYOR', 'YETERSIZ', 'OPEN', 'IN_PROGRESS', 'OVERDUE'];

@Injectable()
export class WorkflowHealthService {
    constructor(private prisma: PrismaService, private directorateScope: DirectorateScopeService) { }

    private async collect(userId: string, permissions: string[], query: WorkflowHealthQueryDto): Promise<HealthItem[]> {
        const year = query.year ?? new Date().getFullYear();
        const resolved = await this.directorateScope.resolveScope(userId, permissions, { scope: query.scope, directorateId: query.directorateId });
        const directorateFilter = resolved.appliedScope === 'UNIT' ? { in: resolved.directorateIds! } : undefined;
        const controlAnd: any[] = [];
        if (directorateFilter) controlAnd.push({ control: { directorateId: directorateFilter } });
        if (resolved.appliedScope === 'MINE') controlAnd.push({ OR: [{ assigneeId: userId }, { secondControllerId: userId }, { control: { ownerId: userId } }] });
        const scopeWhere: any = { year, status: 'ACTIVE', ...(controlAnd.length ? { AND: controlAnd } : {}) };

        const findingWhere: any = {};
        if (directorateFilter) findingWhere.directorateId = directorateFilter;
        if (resolved.appliedScope === 'MINE') findingWhere.OR = [{ assigneeId: userId }, { actions: { some: { ownerId: userId } } }];
        const actionWhere: any = {};
        if (directorateFilter) actionWhere.directorateId = directorateFilter;
        if (resolved.appliedScope === 'MINE') actionWhere.ownerId = userId;
        const hasPermission = (permission: string) => {
            const [domain] = permission.split(':');
            return permissions.some(p => p === '*' || p === permission || p === `${domain}:*`);
        };
        const canViewFindings = hasPermission('finding:view');
        const canViewActions = hasPermission('action:view') || canViewFindings;

        const [draft, scopes, findings, overdueActions, completedActions, pendingFollowUps] = await Promise.all([
            this.prisma.annualPlanDraft.findUnique({ where: { year } }),
            this.prisma.controlYearScope.findMany({
                where: scopeWhere,
                include: {
                    control: { select: { id: true, controlId: true, name: true, version: true, directorateId: true } },
                    tasks: { select: { id: true, testNo: true, status: true, plannedDate: true } },
                },
            }),
            canViewFindings ? this.prisma.finding.findMany({
                where: { ...findingWhere, workflowStatus: 'MUTABAKAT_YAPILDI', resolutionStatus: { not: 'KAPATILDI' } },
                select: { id: true, findingId: true, summary: true, directorateId: true, actions: { select: { id: true } } },
            }) : Promise.resolve([]),
            canViewActions ? this.prisma.action.findMany({
                where: { ...actionWhere, status: { in: OPEN_ACTIONS as any }, dueDate: { lt: new Date() } },
                select: { id: true, actionId: true, description: true, dueDate: true, directorateId: true },
            }) : Promise.resolve([]),
            canViewActions ? this.prisma.action.findMany({
                where: { ...actionWhere, status: { in: ['TAMAMLANDI', 'COMPLETED'] as any }, followUps: { none: {} } },
                select: { id: true, actionId: true, description: true, directorateId: true },
            }) : Promise.resolve([]),
            canViewFindings ? this.prisma.findingFollowUp.findMany({
                where: {
                    status: 'TAMAMLANDI', approvalStatus: { not: 'ONAYLANDI' },
                    ...(directorateFilter ? { directorateId: directorateFilter } : {}),
                    ...(resolved.appliedScope === 'MINE' ? { OR: [{ evaluatorId: userId }, { secondControllerId: userId }] } : {}),
                },
                select: { id: true, followUpId: true, directorateId: true },
            }) : Promise.resolve([]),
        ]);

        const items: HealthItem[] = [];
        if (draft?.status === 'PENDING_APPROVAL') items.push({
            code: 'PLAN_APPROVAL_PENDING', severity: 'WARNING', entityType: 'ANNUAL_PLAN', entityId: draft.id,
            title: `${year} Yıllık Planı`, message: 'Yıllık Plan yönetici onayı bekliyor.', nextAction: 'PLANI_INCELE', href: `/controls/annual-plan?year=${year}`, year,
        });

        for (const scope of scopes) {
            const periodic = !['DAILY', 'AD_HOC'].includes(scope.frequency);
            if (periodic && (!scope.assigneeId || !scope.secondControllerId)) items.push({
                code: 'PLAN_ASSIGNMENT_MISSING', severity: 'CRITICAL', entityType: 'CONTROL', entityId: scope.id,
                title: `${scope.control.controlId} — ${scope.control.name}`, message: 'Dönem Kontrolünde kontrolcü veya ikinci kontrolcü ataması eksik.',
                nextAction: 'ATAMA_YAP', href: `/controls/annual-plan?year=${year}&tab=assignments`, year, directorateId: scope.control.directorateId,
            });
            for (const task of scope.tasks) {
                if (task.status === 'BEKLIYOR' && task.plannedDate < new Date()) items.push({
                    code: 'TEST_OVERDUE_NOT_STARTED', severity: 'CRITICAL', entityType: 'CONTROL_TEST', entityId: task.id,
                    title: task.testNo, message: 'Planlanan tarihi geçen kontrol testi henüz başlamadı.', nextAction: 'TESTI_BASLAT', href: `/controls/testing/${task.id}`, year, directorateId: scope.control.directorateId,
                });
                if (task.status === 'TAMAMLANDI') items.push({
                    code: 'TEST_APPROVAL_PENDING', severity: 'WARNING', entityType: 'CONTROL_TEST', entityId: task.id,
                    title: task.testNo, message: 'Kontrol testi ikinci kontrolcü onayı bekliyor.', nextAction: 'TESTI_ONAYLA', href: '/approvals', year, directorateId: scope.control.directorateId,
                });
            }
            if (scope.control.version > (scope.controlVersion ?? 1)) items.push({
                code: 'CONTROL_VERSION_OUTDATED', severity: 'INFO', entityType: 'CONTROL', entityId: scope.control.id,
                title: `${scope.control.controlId} — ${scope.control.name}`, message: `${year} Dönem Kontrolü Ana Kontrolün eski sürümünü kullanıyor.`,
                nextAction: 'ETKI_ANALIZI', href: `/controls/${scope.control.id}/edit?versionImpact=1`, year, directorateId: scope.control.directorateId,
            });
        }
        const visibleFindings = findings as Array<{
            id: string; findingId: string; summary: string | null;
            directorateId: string | null; actions: Array<{ id: string }>;
        }>;
        for (const finding of visibleFindings.filter(f => f.actions.length === 0)) items.push({
            code: 'FINDING_WITHOUT_ACTION', severity: 'CRITICAL', entityType: 'FINDING', entityId: finding.id,
            title: finding.findingId, message: 'Mutabakatı tamamlanmış açık bulgunun aksiyonu yok.', nextAction: 'AKSIYON_EKLE', href: `/findings/${finding.id}`, directorateId: finding.directorateId,
        });
        for (const action of overdueActions) items.push({
            code: 'ACTION_OVERDUE', severity: 'CRITICAL', entityType: 'ACTION', entityId: action.id,
            title: action.actionId, message: 'Aksiyon termini geçti ve aksiyon kapanmadı.', nextAction: 'AKSIYONU_GUNCELLE', href: `/actions/${action.id}`, directorateId: action.directorateId,
        });
        for (const action of completedActions) items.push({
            code: 'ACTION_COMPLETED_NO_FOLLOWUP', severity: 'WARNING', entityType: 'ACTION', entityId: action.id,
            title: action.actionId, message: 'Tamamlanan aksiyon için Bulgu Takip Çalışması oluşturulmamış.', nextAction: 'TAKIP_OLUSTUR', href: `/actions/${action.id}`, directorateId: action.directorateId,
        });
        for (const followUp of pendingFollowUps) items.push({
            code: 'FOLLOWUP_APPROVAL_PENDING', severity: 'WARNING', entityType: 'FOLLOW_UP', entityId: followUp.id,
            title: followUp.followUpId, message: 'Bulgu Takip değerlendirmesi ikinci kontrolcü onayı bekliyor.', nextAction: 'TAKIBI_ONAYLA', href: `/follow-ups?search=${encodeURIComponent(followUp.followUpId)}`, directorateId: followUp.directorateId,
        });
        return items;
    }

    async getItems(userId: string, permissions: string[], query: WorkflowHealthQueryDto) {
        let items = await this.collect(userId, permissions, query);
        if (query.code) items = items.filter(i => i.code === query.code);
        if (query.severity) items = items.filter(i => i.severity === query.severity);
        if (query.entityType) items = items.filter(i => i.entityType === query.entityType);
        const order = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
        items.sort((a, b) => order[a.severity] - order[b.severity] || a.title.localeCompare(b.title, 'tr'));
        const page = query.page ?? 1, pageSize = query.pageSize ?? 50;
        return { data: items.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total: items.length, totalPages: Math.ceil(items.length / pageSize) } };
    }

    async getSummary(userId: string, permissions: string[], query: WorkflowHealthQueryDto) {
        const items = await this.collect(userId, permissions, query);
        const byCode = items.reduce<Record<string, number>>((acc, item) => { acc[item.code] = (acc[item.code] ?? 0) + 1; return acc; }, {});
        return {
            total: items.length,
            critical: items.filter(i => i.severity === 'CRITICAL').length,
            warning: items.filter(i => i.severity === 'WARNING').length,
            info: items.filter(i => i.severity === 'INFO').length,
            overdue: items.filter(i => ['TEST_OVERDUE_NOT_STARTED', 'ACTION_OVERDUE'].includes(i.code)).length,
            pendingApproval: items.filter(i => i.code.endsWith('APPROVAL_PENDING')).length,
            outdatedVersion: byCode.CONTROL_VERSION_OUTDATED ?? 0,
            byCode,
            updatedAt: new Date().toISOString(),
        };
    }
}
