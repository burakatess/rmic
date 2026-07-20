import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class ReportsService {
    constructor(private prisma: PrismaService) { }

    async getDashboard() {
        const [
            risksByStatus,
            risksByScore,
            risksAboveAppetite,
            criticalFindings,
            criticalHighFindings,
            overdueActions,
            controlEffectiveness,
            riskTrend,
            recentActivity,
            controlTestStatusDistribution,
            findingWorkflowStatusDistribution,
            followUpResultDistributionRaw,
            overdueActionsByDirectorateRaw,
            findingsByDirectorateRaw,
        ] = await Promise.all([
            // Risk summary by status
            this.prisma.risk.groupBy({
                by: ['status'],
                _count: true,
            }),
            // Risk summary by score level
            this.getRisksByScoreLevel(),
            // Risks above appetite
            this.prisma.risk.count({ where: { isAboveAppetite: true } }),
            // Critical findings
            this.prisma.finding.count({ where: { severity: 'CRITICAL', status: { not: 'CLOSED' } } }),
            // Kritik + Yüksek önem düzeyindeki açık bulgular
            this.prisma.finding.count({ where: { severity: { in: ['CRITICAL', 'HIGH'] }, status: { not: 'CLOSED' } } }),
            // Overdue actions
            this.prisma.action.count({
                where: {
                    status: { notIn: ['CLOSED', 'COMPLETED'] },
                    dueDate: { lt: new Date() },
                },
            }),
            // Control effectiveness overview
            this.prisma.control.groupBy({
                by: ['effectivenessStatus'],
                _count: true,
            }),
            // Risk trend (last 12 months)
            this.getRiskTrend(),
            // Recent activity
            this.prisma.auditLog.findMany({
                take: 10,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { firstName: true, lastName: true } } },
            }),
            // Kontrol testi durum dağılımı
            this.prisma.controlTest.groupBy({ by: ['status'], _count: true }),
            // Bulgu mutabakat workflow durum dağılımı
            this.prisma.finding.groupBy({ by: ['workflowStatus'], _count: true }),
            // Takip çalışması sonuç dağılımı (yalnızca sonuçlanmış olanlar)
            this.prisma.findingFollowUp.groupBy({ by: ['result'], where: { result: { not: null } }, _count: true }),
            // Direktörlük bazlı gecikmiş aksiyon sayısı
            this.prisma.action.groupBy({
                by: ['directorateId'],
                where: { status: { notIn: ['CLOSED', 'COMPLETED', 'KAPATILDI', 'TAMAMLANDI'] }, dueDate: { lt: new Date() } },
                _count: true,
            }),
            // Direktörlük bazlı açık bulgu sayısı
            this.prisma.finding.groupBy({
                by: ['directorateId'],
                where: { status: { not: 'CLOSED' } },
                _count: true,
            }),
        ]);

        // Calculate totals
        const totalRisks = risksByStatus.reduce((sum, r) => sum + r._count, 0);
        const openFindings = await this.prisma.finding.count({ where: { status: { not: 'CLOSED' } } });
        const totalControls = await this.prisma.control.count();

        // Direktörlük adlarını çözümle (tek ek sorgu, N+1 değil)
        const dirIds = [
            ...overdueActionsByDirectorateRaw.map(d => d.directorateId),
            ...findingsByDirectorateRaw.map(d => d.directorateId),
        ].filter((id, idx, arr): id is string => !!id && arr.indexOf(id) === idx);
        const directorates = dirIds.length > 0
            ? await this.prisma.directorate.findMany({ where: { id: { in: dirIds } }, select: { id: true, name: true } })
            : [];
        const dirNameMap = new Map(directorates.map(d => [d.id, d.name]));
        const overdueActionsByDirectorate = overdueActionsByDirectorateRaw.map(d => ({
            directorateId: d.directorateId,
            directorateName: d.directorateId ? (dirNameMap.get(d.directorateId) ?? 'Bilinmiyor') : 'Direktörlük Atanmamış',
            count: d._count,
        }));
        const findingsByDirectorate = findingsByDirectorateRaw.map(d => ({
            directorateId: d.directorateId,
            directorateName: d.directorateId ? (dirNameMap.get(d.directorateId) ?? 'Bilinmiyor') : 'Direktörlük Atanmamış',
            count: d._count,
        }));

        return {
            summary: {
                totalRisks,
                risksAboveAppetite,
                openFindings,
                criticalFindings,
                criticalHighFindings,
                overdueActions,
                totalControls,
            },
            risksByStatus,
            risksByScore,
            controlEffectiveness,
            riskTrend,
            recentActivity,
            controlTestStatusDistribution,
            findingWorkflowStatusDistribution,
            followUpResultDistribution: followUpResultDistributionRaw,
            overdueActionsByDirectorate,
            findingsByDirectorate,
        };
    }

    private async getRisksByScoreLevel() {
        const risks = await this.prisma.risk.findMany({
            select: { inherentRiskScore: true, residualRiskScore: true },
        });

        const levels = { high: 0, medium: 0, low: 0 };
        risks.forEach((r) => {
            const score = r.residualRiskScore || r.inherentRiskScore;
            if (score >= 15) levels.high++;
            else if (score >= 8) levels.medium++;
            else levels.low++;
        });

        return levels;
    }

    private async getRiskTrend() {
        const now = new Date();

        // Tek sorgu — önceden 12 ay için 24 ayrı round-trip yapılıyordu; tüm riskleri
        // bir kez çekip her ay için kümülatif sayıyı JS'te hesaplıyoruz.
        const risks = await this.prisma.risk.findMany({
            select: { createdAt: true, inherentRiskScore: true },
        });

        const trend = [];
        for (let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

            const upToMonth = risks.filter(r => r.createdAt <= endDate);
            trend.push({
                month: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
                total: upToMonth.length,
                high: upToMonth.filter(r => r.inherentRiskScore >= 15).length,
            });
        }

        return trend;
    }

    async getRiskHeatmapData() {
        const risks = await this.prisma.risk.findMany({
            select: {
                id: true,
                riskId: true,
                name: true,
                inherentProbability: true,
                inherentImpact: true,
                residualProbability: true,
                residualImpact: true,
            }
        });

        // 5x5 matrix - rows: probability (5 to 1), cols: impact (1 to 5)
        const matrix: Array<Array<{ count: number; risks: Array<{ id: string; riskId: string; name: string }> }>> =
            Array(5).fill(null).map(() =>
                Array(5).fill(null).map(() => ({ count: 0, risks: [] }))
            );

        risks.forEach(risk => {
            const prob = (risk.residualProbability || risk.inherentProbability) - 1;
            const impact = (risk.residualImpact || risk.inherentImpact) - 1;
            if (prob >= 0 && prob < 5 && impact >= 0 && impact < 5) {
                matrix[4 - prob][impact].count++;
                matrix[4 - prob][impact].risks.push({
                    id: risk.id,
                    riskId: risk.riskId,
                    name: risk.name
                });
            }
        });

        return matrix;
    }

    async getRiskTrendEnhanced() {
        const now = new Date();

        // Tek sorgu — önceden 12 ay için 12 ayrı findMany yapılıyordu.
        const allRisks = await this.prisma.risk.findMany({
            select: { createdAt: true, inherentRiskScore: true, residualRiskScore: true },
        });

        const trend = [];
        for (let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

            const risks = allRisks.filter(r => r.createdAt <= endDate);

            let high = 0, medium = 0, low = 0;
            let totalScore = 0;

            risks.forEach(r => {
                const score = r.residualRiskScore || r.inherentRiskScore;
                totalScore += score;
                if (score >= 15) high++;
                else if (score >= 8) medium++;
                else low++;
            });

            trend.push({
                month: date.toLocaleString('tr-TR', { month: 'short' }),
                year: date.getFullYear(),
                total: risks.length,
                high,
                medium,
                low,
                avgScore: risks.length > 0 ? Math.round(totalScore / risks.length * 10) / 10 : 0,
            });
        }

        return trend;
    }

    async getRiskTrends(months: number = 12) {
        return this.getRiskTrend();
    }

    async getControlHeatmap() {
        const controls = await this.prisma.control.findMany({
            select: {
                id: true, name: true, type: true, effectivenessStatus: true,
                risks: { select: { risk: { select: { residualRiskScore: true, inherentRiskScore: true } } } },
                tests: { select: { findingStatus: true }, orderBy: { plannedDate: 'desc' }, take: 1 },
            },
        });

        return controls.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            effectivenessStatus: c.effectivenessStatus,
            riskCount: c.risks.length,
            avgRiskScore: c.risks.length > 0
                ? c.risks.reduce((sum, r) => sum + (r.risk.residualRiskScore || r.risk.inherentRiskScore), 0) / c.risks.length
                : 0,
            lastTestResult: c.tests[0]?.findingStatus || 'NOT_TESTED',
        }));
    }

    async getRecurrentFindings() {
        return this.prisma.finding.findMany({
            where: { isRecurrent: true },
            include: {
                risk: { select: { id: true, riskId: true, name: true } },
                control: { select: { id: true, controlId: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getActionPerformance() {
        const [total, completed, overdue, effective] = await Promise.all([
            this.prisma.action.count(),
            this.prisma.action.count({ where: { status: { in: ['COMPLETED', 'CLOSED', 'TAMAMLANDI', 'KAPATILDI'] } } }),
            this.prisma.action.count({
                where: { status: { notIn: ['COMPLETED', 'CLOSED', 'TAMAMLANDI', 'KAPATILDI'] }, dueDate: { lt: new Date() } },
            }),
            this.prisma.effectivenessReview.count({ where: { isEffective: true } }),
        ]);

        return {
            total,
            completed,
            overdue,
            effective,
            completionRate: total > 0 ? (completed / total) * 100 : 0,
            effectivenessRate: completed > 0 ? (effective / completed) * 100 : 0,
        };
    }

    async getExecutiveSummary() {
        const [dashboard, actionPerformance, recurrentFindings] = await Promise.all([
            this.getDashboard(),
            this.getActionPerformance(),
            this.getRecurrentFindings(),
        ]);

        return {
            overview: dashboard.summary,
            riskPosture: {
                distribution: dashboard.risksByScore,
                trend: dashboard.riskTrend,
            },
            controlHealth: dashboard.controlEffectiveness,
            actionPerformance,
            criticalIssues: {
                risksAboveAppetite: dashboard.summary.risksAboveAppetite,
                criticalFindings: dashboard.summary.criticalFindings,
                overdueActions: dashboard.summary.overdueActions,
                recurrentFindingsCount: recurrentFindings.length,
            },
        };
    }

    // ==========================================
    // MONTHLY MANAGEMENT REPORT
    // ==========================================

    private resolveMonthlyPeriod(params: {
        year?: number; month?: number;
        startDate?: Date; endDate?: Date;
    }): { start: Date; end: Date; label: string } {
        if (params.startDate && params.endDate) {
            return {
                start: params.startDate,
                end: new Date(new Date(params.endDate).setHours(23, 59, 59, 999)),
                label: `${params.startDate.toLocaleDateString('tr-TR')} – ${params.endDate.toLocaleDateString('tr-TR')}`,
            };
        }
        const now = new Date();
        const year = params.year ?? now.getFullYear();
        const month = params.month; // 1-indexed

        if (month) {
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0, 23, 59, 59);
            const monthName = start.toLocaleString('tr-TR', { month: 'long', year: 'numeric' });
            return { start, end, label: monthName.charAt(0).toUpperCase() + monthName.slice(1) };
        }
        return {
            start: new Date(year, 0, 1),
            end: new Date(year, 11, 31, 23, 59, 59),
            label: `${year} Yılı`,
        };
    }

    async getMonthlyReport(params: {
        year?: number; month?: number;
        startDate?: Date; endDate?: Date;
        directorateId?: string;
    }) {
        const { start, end, label } = this.resolveMonthlyPeriod(params);
        const dirWhere = params.directorateId ? { directorateId: params.directorateId } : {};
        const now = new Date();
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const closedStatuses = ['TAMAMLANDI', 'KAPATILDI', 'COMPLETED', 'CLOSED'] as any[];

        const [
            newFindings,
            closedFindings,
            postponedFindings,
            totalOpenFindings,
            criticalOpen,
            overdueActions,
            approachingActions,
            followUpsCompleted,
            followUpsPending,
            findingsBySeverity,
            findingsByResolutionStatus,
            actionsByStatus,
            findingsByDirectorate,
            directorate,
        ] = await Promise.all([
            // New findings this period
            this.prisma.finding.findMany({
                where: { createdAt: { gte: start, lte: end }, ...dirWhere },
                select: {
                    id: true, findingId: true, summary: true, description: true,
                    severity: true, resolutionStatus: true, workflowStatus: true,
                    targetResolutionDate: true, closedDate: true, createdAt: true,
                    directorateRel: { select: { name: true } },
                    responsiblePerson: true, gmy: true,
                },
                orderBy: { severity: 'asc' },
            }),
            // Closed findings this period
            this.prisma.finding.findMany({
                where: { closedDate: { gte: start, lte: end }, ...dirWhere },
                select: {
                    id: true, findingId: true, summary: true, description: true,
                    severity: true, resolutionStatus: true, closedDate: true,
                    directorateRel: { select: { name: true } },
                    responsiblePerson: true,
                },
                orderBy: { closedDate: 'desc' },
            }),
            // Postponed findings (currently active ertelendi)
            this.prisma.finding.findMany({
                where: {
                    resolutionStatus: 'ERTELENDI',
                    status: { not: 'CLOSED' },
                    ...dirWhere,
                },
                select: {
                    id: true, findingId: true, summary: true, description: true,
                    severity: true, targetResolutionDate: true, responsiblePerson: true,
                    directorateRel: { select: { name: true } },
                    updatedAt: true,
                },
                orderBy: { targetResolutionDate: 'asc' },
            }),
            // Total open findings
            this.prisma.finding.count({ where: { status: { not: 'CLOSED' }, ...dirWhere } }),
            // Critical open findings
            this.prisma.finding.count({ where: { severity: 'CRITICAL', status: { not: 'CLOSED' }, ...dirWhere } }),
            // Overdue actions
            this.prisma.action.findMany({
                where: {
                    status: { notIn: closedStatuses },
                    dueDate: { lt: now },
                    ...dirWhere,
                },
                select: {
                    id: true, actionId: true, description: true,
                    status: true, dueDate: true,
                    finding: { select: { findingId: true, summary: true } },
                    owner: { select: { firstName: true, lastName: true } },
                    directorate: { select: { name: true } },
                },
                orderBy: { dueDate: 'asc' },
            }),
            // Approaching actions (next 30 days)
            this.prisma.action.findMany({
                where: {
                    status: { notIn: closedStatuses },
                    dueDate: { gte: now, lte: in30Days },
                    ...dirWhere,
                },
                select: {
                    id: true, actionId: true, description: true,
                    status: true, dueDate: true,
                    finding: { select: { findingId: true, summary: true } },
                    owner: { select: { firstName: true, lastName: true } },
                    directorate: { select: { name: true } },
                },
                orderBy: { dueDate: 'asc' },
            }),
            // Follow-ups completed this period
            this.prisma.findingFollowUp.count({
                where: { status: { in: ['TAMAMLANDI', 'ONAYLANDI'] }, updatedAt: { gte: start, lte: end }, ...dirWhere },
            }),
            // Follow-ups pending
            this.prisma.findingFollowUp.count({
                where: { status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] }, ...dirWhere },
            }),
            // Findings by severity (all open)
            this.prisma.finding.groupBy({
                by: ['severity'],
                where: { status: { not: 'CLOSED' }, ...dirWhere },
                _count: true,
            }),
            // Findings by resolution status (all open)
            this.prisma.finding.groupBy({
                by: ['resolutionStatus'],
                where: { status: { not: 'CLOSED' }, ...dirWhere },
                _count: true,
            }),
            // Actions by status
            this.prisma.action.groupBy({
                by: ['status'],
                where: { ...dirWhere },
                _count: true,
            }),
            // Findings by directorate (all open, top 10)
            this.prisma.finding.groupBy({
                by: ['directorateId'],
                where: { status: { not: 'CLOSED' } },
                _count: true,
                orderBy: { _count: { directorateId: 'desc' } },
                take: 10,
            }),
            // Directorate info if filter applied
            params.directorateId
                ? this.prisma.directorate.findUnique({ where: { id: params.directorateId }, select: { id: true, name: true } })
                : Promise.resolve(null),
        ]);

        // Resolve directorate names for chart
        const dirIds = findingsByDirectorate.map(r => r.directorateId).filter(Boolean) as string[];
        const dirNames = dirIds.length > 0 ? await this.prisma.directorate.findMany({
            where: { id: { in: dirIds } },
            select: { id: true, name: true },
        }) : [];
        const dirMap = Object.fromEntries(dirNames.map(d => [d.id, d.name]));

        // Build 6-month trend
        const monthlyTrend = await this.buildFindingTrend(6, params.directorateId);

        // Follow-ups this period
        const followUps = await this.prisma.findingFollowUp.findMany({
            where: { createdAt: { gte: start, lte: end }, ...dirWhere },
            select: {
                id: true, followUpId: true, status: true, plannedDate: true,
                result: true, approvalStatus: true,
                finding: { select: { findingId: true, summary: true } },
                directorate: { select: { name: true } },
            },
            orderBy: { plannedDate: 'asc' },
        });

        return {
            period: { label, start, end },
            directorate: directorate ?? null,
            summary: {
                newFindings: newFindings.length,
                closedFindings: closedFindings.length,
                postponedFindings: postponedFindings.length,
                totalOpenFindings,
                criticalOpen,
                overdueActions: overdueActions.length,
                approachingActions: approachingActions.length,
                followUpsCompleted,
                followUpsPending,
            },
            findingsBySeverity: findingsBySeverity.map(r => ({ severity: r.severity, count: r._count })),
            findingsByResolutionStatus: findingsByResolutionStatus.map(r => ({ status: r.resolutionStatus, count: r._count })),
            actionsByStatus: actionsByStatus.map(r => ({ status: r.status, count: r._count })),
            findingsByDirectorate: findingsByDirectorate.map(r => ({
                name: dirMap[r.directorateId ?? ''] ?? 'Bilinmiyor',
                count: r._count,
            })),
            monthlyTrend,
            newFindings: newFindings.map(f => ({ ...f, directorate: (f as any).directorateRel })),
            closedFindings: closedFindings.map(f => ({ ...f, directorate: (f as any).directorateRel })),
            postponedFindings: postponedFindings.map(f => ({ ...f, directorate: (f as any).directorateRel })),
            overdueActions,
            approachingActions,
            followUps,
        };
    }

    private async buildFindingTrend(monthsBack: number, directorateId?: string) {
        const now = new Date();
        const trend = [];
        const dirWhere = directorateId ? { directorateId } : {};

        for (let i = monthsBack - 1; i >= 0; i--) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

            const [newCount, closedCount] = await Promise.all([
                this.prisma.finding.count({ where: { createdAt: { gte: start, lte: end }, ...dirWhere } }),
                this.prisma.finding.count({ where: { closedDate: { gte: start, lte: end }, ...dirWhere } }),
            ]);

            trend.push({
                month: start.toLocaleString('tr-TR', { month: 'short', year: '2-digit' }),
                newFindings: newCount,
                closedFindings: closedCount,
            });
        }

        return trend;
    }

    async getMyWork(userId: string, month?: string) {
        // month: 'YYYY-MM' — varsayılan güncel ay
        const now = new Date();
        let year = now.getFullYear();
        let mon = now.getMonth(); // 0-index
        if (month && /^\d{4}-\d{2}$/.test(month)) {
            const [y, m] = month.split('-').map(Number);
            year = y; mon = m - 1;
        }
        const start = new Date(year, mon, 1);
        const end = new Date(year, mon + 1, 0, 23, 59, 59, 999);
        const monthName = start.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        const fullName = user ? `${user.firstName} ${user.lastName}` : '';

        // Ay adı (selectedMonths eşleşmesi için, örn. "Temmuz")
        const trMonth = start.toLocaleDateString('tr-TR', { month: 'long' });

        const [controlTests, assignedFindings, assignedActions, upcomingFollowUps] = await Promise.all([
            // Kullanıcının sahibi/test edicisi olduğu, bu ay testi olan aktif kontroller
            this.prisma.control.findMany({
                where: {
                    status: 'ACTIVE',
                    OR: [{ ownerId: userId }, { testPerformerId: userId }],
                },
                select: {
                    id: true, controlId: true, name: true, frequency: true,
                    selectedMonths: true, lastTestDate: true, lastTestResult: true,
                    directorateRel: { select: { name: true } },
                },
            }).then(controls => controls.filter(c =>
                c.frequency === 'MONTHLY'
                || (c.selectedMonths?.some(m => m.toLowerCase() === trMonth.toLowerCase()))
                || !c.lastTestDate
                || c.lastTestDate < start,
            )),
            // Sorumlusu kullanıcı olan açık bulgular
            this.prisma.finding.findMany({
                where: {
                    status: { not: 'CLOSED' },
                    OR: [
                        { assigneeId: userId },
                        ...(fullName ? [{ responsiblePerson: { contains: fullName, mode: 'insensitive' as any } }] : []),
                    ],
                },
                select: {
                    id: true, findingId: true, summary: true, severity: true,
                    targetResolutionDate: true, resolutionStatus: true,
                    directorateRel: { select: { name: true } },
                },
                orderBy: { targetResolutionDate: 'asc' },
            }),
            // Kullanıcıya atanmış açık aksiyonlar
            this.prisma.action.findMany({
                where: {
                    ownerId: userId,
                    status: { notIn: ['TAMAMLANDI', 'KAPATILDI'] as any },
                },
                select: {
                    id: true, actionId: true, description: true, status: true, dueDate: true,
                    finding: { select: { findingId: true, summary: true } },
                },
                orderBy: { dueDate: 'asc' },
            }),
            // Ay içinde planlanan takip çalışmaları (kullanıcının bulgu/aksiyonlarıyla ilişkili)
            this.prisma.findingFollowUp.findMany({
                where: {
                    plannedDate: { gte: start, lte: end },
                    status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR'] as any },
                },
                select: {
                    id: true, followUpId: true, status: true, plannedDate: true,
                    finding: { select: { findingId: true, summary: true, assigneeId: true, responsiblePerson: true } },
                    action: { select: { actionId: true, ownerId: true } },
                },
                orderBy: { plannedDate: 'asc' },
            }).then(fus => fus.filter(fu =>
                fu.finding?.assigneeId === userId
                || (fullName && fu.finding?.responsiblePerson?.toLowerCase().includes(fullName.toLowerCase()))
                || fu.action?.ownerId === userId,
            )),
        ]);

        // Yaklaşan vadeler: ay içi aksiyon vadeleri + takip planları birleşik
        const upcomingDeadlines = [
            ...assignedActions
                .filter(a => a.dueDate >= start && a.dueDate <= end)
                .map(a => ({ type: 'ACTION' as const, id: a.id, ref: a.actionId, title: a.description, date: a.dueDate })),
            ...upcomingFollowUps
                .map(fu => ({ type: 'FOLLOWUP' as const, id: fu.id, ref: fu.followUpId, title: fu.finding?.summary ?? fu.followUpId, date: fu.plannedDate! })),
        ].sort((a, b) => +new Date(a.date) - +new Date(b.date));

        return {
            period: { label: monthName, start, end },
            controlTests,
            assignedFindings,
            assignedActions,
            upcomingDeadlines,
        };
    }

    async getBulgeTakipReport(params: {
        year?: number; month?: number;
        startDate?: Date; endDate?: Date;
        directorateId?: string;
    }) {
        const { start, end, label } = this.resolveMonthlyPeriod(params);
        const dirFilter = params.directorateId ? { directorateId: params.directorateId } : {};

        // 1. Dönemde tespit edilen bulgular
        const tespitEdilenBulgular = await this.prisma.finding.findMany({
            where: { createdAt: { gte: start, lte: end }, ...dirFilter },
            select: {
                id: true, findingId: true, summary: true, severity: true,
                targetResolutionDate: true, resolutionStatus: true, workflowStatus: true,
                source: true, responsiblePerson: true, gmy: true, createdAt: true,
                directorateRel: { select: { name: true } },
            },
            orderBy: { findingId: 'asc' },
        });

        // 2. Dönemde gerçekleştirilen takip çalışmaları (status != BEKLIYOR)
        const takipCalismalari = await this.prisma.findingFollowUp.findMany({
            where: {
                createdAt: { gte: start, lte: end },
                status: { not: 'BEKLIYOR' as any },
                ...(params.directorateId ? { directorateId: params.directorateId } : {}),
            },
            include: {
                finding: { select: { findingId: true, summary: true, severity: true } },
                directorate: { select: { name: true } },
            },
            orderBy: { createdAt: 'asc' },
        });

        // 3. Daha önce takip yapılmış ancak kapatılmamış bulgular
        const takipliAcikBulgular = await this.prisma.finding.findMany({
            where: {
                followUps: { some: {} },
                status: { not: 'CLOSED' },
                resolutionStatus: { not: 'KAPATILDI' as any },
                ...dirFilter,
            },
            include: {
                followUps: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { status: true, plannedDate: true, result: true, approvalStatus: true, createdAt: true },
                },
                directorateRel: { select: { name: true } },
            },
            orderBy: { findingId: 'asc' },
        });

        // 4. Takip çalışması gerçekleşmemiş veya hedef tarihi belirsiz açık bulgular
        const takipsizBulgular = await this.prisma.finding.findMany({
            where: {
                status: { not: 'CLOSED' },
                ...dirFilter,
                OR: [{ followUps: { none: {} } }, { targetResolutionDate: null }],
            },
            select: {
                id: true, findingId: true, summary: true, severity: true,
                targetResolutionDate: true, createdAt: true, responsiblePerson: true,
                resolutionStatus: true, workflowStatus: true,
                directorateRel: { select: { name: true } },
                _count: { select: { followUps: true } },
            },
            orderBy: { createdAt: 'asc' },
        });

        return {
            period: { label, start, end },
            tespitEdilenBulgular: tespitEdilenBulgular.map((f: any) => ({
                ...f, directorate: f.directorateRel,
            })),
            takipCalismalari,
            takipliAcikBulgular: takipliAcikBulgular.map((f: any) => ({
                ...f,
                directorate: f.directorateRel,
                sonTakip: f.followUps?.[0] ?? null,
            })),
            takipsizBulgular: takipsizBulgular.map((f: any) => ({
                ...f,
                directorate: f.directorateRel,
                neden: f._count?.followUps === 0 ? 'Takip Yok' : 'Tarih Belirsiz',
            })),
        };
    }

    async generateMonthlyReportWord(params: {
        year?: number; month?: number;
        startDate?: Date; endDate?: Date;
        directorateId?: string;
    }): Promise<Buffer> {
        const {
            Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun,
            WidthType, AlignmentType, BorderStyle, HeadingLevel, PageOrientation, ShadingType,
        } = await import('docx');

        const data = await this.getMonthlyReport(params);

        const HEADER_FILL = 'E8EAF6'; // indigo-50
        const CRITICAL_COLOR = 'CC0000';

        const mkCell = (text: string, opts?: { bold?: boolean; color?: string; fill?: string; center?: boolean }) =>
            new TableCell({
                children: [new Paragraph({
                    children: [new TextRun({ text, size: 18, bold: opts?.bold, color: opts?.color })],
                    alignment: opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
                })],
                shading: opts?.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
            });

        const mkHeaderRow = (cols: string[]) =>
            new TableRow({
                tableHeader: true,
                children: cols.map(c => mkCell(c, { bold: true, fill: HEADER_FILL })),
            });

        const mkTitle = (text: string) =>
            new Paragraph({
                children: [new TextRun({ text, bold: true, size: 26 })],
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 400, after: 200 },
            });

        const severityLabel: Record<string, string> = { CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük' };
        const resLabel: Record<string, string> = {
            DEVAM_EDIYOR: 'Devam Ediyor', KISMEN_KAPATILDI: 'Kısmen Kapatıldı',
            KAPATILDI: 'Kapatıldı', ERTELENDI: 'Ertelendi', YENI_AKSIYON_GEREKLI: 'Yeni Aksiyon Gerekli',
        };
        const actionStatusLabel: Record<string, string> = {
            BEKLIYOR: 'Bekliyor', DEVAM_EDIYOR: 'Devam Ediyor', TAMAMLANDI: 'Tamamlandı',
            YETERSIZ: 'Yetersiz', KAPATILDI: 'Kapatıldı',
        };
        const fmt = (d?: Date | string | null) => d ? new Date(d).toLocaleDateString('tr-TR') : '—';
        const dayDiff = (d: Date | string) => Math.round((new Date().getTime() - new Date(d).getTime()) / 86400000);

        // 1. Summary table
        const summaryRows = [
            ['Dönem', data.period.label],
            ['Direktörlük', data.directorate?.name ?? 'Tüm Direktörlükler'],
            ['Yeni Tespit Edilen Bulgu', String(data.summary.newFindings)],
            ['Dönemde Kapanan Bulgu', String(data.summary.closedFindings)],
            ['Ertelenen Bulgu', String(data.summary.postponedFindings)],
            ['Toplam Açık Bulgu', String(data.summary.totalOpenFindings)],
            ['Kritik Açık Bulgu', String(data.summary.criticalOpen)],
            ['Vadesi Geçmiş Aksiyon', String(data.summary.overdueActions)],
            ['30 Gün İçinde Vadesi Dolacak Aksiyon', String(data.summary.approachingActions)],
            ['Dönemde Tamamlanan Takip Çalışması', String(data.summary.followUpsCompleted)],
            ['Bekleyen Takip Çalışması', String(data.summary.followUpsPending)],
        ].map(([k, v]) => new TableRow({
            children: [mkCell(k, { bold: true, fill: 'F5F5F5' }), mkCell(v)],
        }));

        // 2. New findings table
        const newFindingRows = data.newFindings.map(f => new TableRow({
            children: [
                mkCell((f as any).findingId),
                mkCell((f as any).summary || (f as any).description?.substring(0, 80) || ''),
                mkCell(severityLabel[(f as any).severity] || (f as any).severity, { color: (f as any).severity === 'CRITICAL' ? CRITICAL_COLOR : undefined }),
                mkCell((f as any).directorate?.name ?? '—'),
                mkCell(fmt((f as any).targetResolutionDate)),
            ],
        }));

        // 3. Overdue actions
        const overdueRows = data.overdueActions.map((a: any) => new TableRow({
            children: [
                mkCell(a.actionId),
                mkCell(a.finding?.findingId ?? '—'),
                mkCell(`${a.owner?.firstName ?? ''} ${a.owner?.lastName ?? ''}`.trim()),
                mkCell(fmt(a.dueDate), { color: CRITICAL_COLOR }),
                mkCell(`${dayDiff(a.dueDate)} gün`, { color: CRITICAL_COLOR }),
                mkCell(actionStatusLabel[a.status] || a.status),
            ],
        }));

        // 4. Approaching actions
        const approachingRows = data.approachingActions.map((a: any) => new TableRow({
            children: [
                mkCell(a.actionId),
                mkCell(a.finding?.findingId ?? '—'),
                mkCell(`${a.owner?.firstName ?? ''} ${a.owner?.lastName ?? ''}`.trim()),
                mkCell(fmt(a.dueDate)),
                mkCell(actionStatusLabel[a.status] || a.status),
            ],
        }));

        // 5. Follow-ups
        const followUpRows = data.followUps.map((f: any) => new TableRow({
            children: [
                mkCell(f.followUpId),
                mkCell(f.finding?.findingId ?? '—'),
                mkCell(fmt(f.plannedDate)),
                mkCell(f.result ? (f.result === 'YETERLI' ? 'Yeterli' : f.result === 'YETERSIZ' ? 'Yetersiz' : 'Yeni Aksiyon') : '—'),
                mkCell(f.approvalStatus === 'ONAYLANDI' ? 'Onaylandı' : f.approvalStatus === 'REDDEDILDI' ? 'Reddedildi' : 'Bekliyor'),
            ],
        }));

        // 6. Closed findings
        const closedRows = data.closedFindings.map((f: any) => new TableRow({
            children: [
                mkCell(f.findingId),
                mkCell(f.summary || f.description?.substring(0, 80) || ''),
                mkCell(severityLabel[f.severity] || f.severity),
                mkCell(f.directorate?.name ?? '—'),
                mkCell(fmt(f.closedDate)),
                mkCell(resLabel[f.resolutionStatus] || f.resolutionStatus),
            ],
        }));

        // 7. Postponed findings
        const postponedRows = data.postponedFindings.map((f: any) => new TableRow({
            children: [
                mkCell(f.findingId),
                mkCell(f.summary || f.description?.substring(0, 80) || ''),
                mkCell(severityLabel[f.severity] || f.severity),
                mkCell(f.directorate?.name ?? '—'),
                mkCell(fmt(f.targetResolutionDate)),
                mkCell(f.responsiblePerson ?? '—'),
            ],
        }));

        const emptyRow = (cols: number) => new TableRow({
            children: Array(cols).fill(null).map(() => mkCell('Kayıt bulunamadı.')),
        });

        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        size: { orientation: PageOrientation.LANDSCAPE },
                        margin: { top: 720, right: 720, bottom: 720, left: 720 },
                    },
                },
                children: [
                    // Cover
                    new Paragraph({
                        children: [new TextRun({ text: 'AYLIK YÖNETİM RAPORU', bold: true, size: 36 })],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 800, after: 200 },
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: data.period.label, size: 28, color: '4F46E5' })],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 100 },
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: data.directorate?.name ?? 'Tüm Direktörlükler', size: 24, italics: true })],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 200 },
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: `Oluşturulma Tarihi: ${fmt(new Date())}`, size: 18, italics: true })],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 800 },
                    }),

                    // 1. Summary
                    mkTitle('1. Yönetici Özeti'),
                    new Table({ rows: summaryRows, width: { size: 50, type: WidthType.PERCENTAGE } }),

                    // 2. New findings
                    mkTitle('2. Dönemde Yeni Tespit Edilen Bulgular'),
                    new Table({
                        rows: [
                            mkHeaderRow(['Bulgu No', 'Özet', 'Önem', 'Direktörlük', 'Hedef Tarih']),
                            ...(newFindingRows.length > 0 ? newFindingRows : [emptyRow(5)]),
                        ],
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),

                    // 3. Overdue actions
                    mkTitle('3. Vadesi Geçmiş Aksiyonlar'),
                    new Table({
                        rows: [
                            mkHeaderRow(['Aksiyon No', 'Bağlı Bulgu', 'Sorumlu', 'Vade Tarihi', 'Gecikme', 'Durum']),
                            ...(overdueRows.length > 0 ? overdueRows : [emptyRow(6)]),
                        ],
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),

                    // 4. Approaching actions
                    mkTitle('4. Tarihi Yaklaşan Aksiyonlar (30 Gün)'),
                    new Table({
                        rows: [
                            mkHeaderRow(['Aksiyon No', 'Bağlı Bulgu', 'Sorumlu', 'Vade Tarihi', 'Durum']),
                            ...(approachingRows.length > 0 ? approachingRows : [emptyRow(5)]),
                        ],
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),

                    // 5. Follow-ups
                    mkTitle('5. Bulgu Takip Çalışmaları'),
                    new Table({
                        rows: [
                            mkHeaderRow(['Takip No', 'Bağlı Bulgu', 'Planlanan Tarih', 'Sonuç', 'Onay']),
                            ...(followUpRows.length > 0 ? followUpRows : [emptyRow(5)]),
                        ],
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),

                    // 6. Closed findings
                    mkTitle('6. Dönemde Kapanan Bulgular'),
                    new Table({
                        rows: [
                            mkHeaderRow(['Bulgu No', 'Özet', 'Önem', 'Direktörlük', 'Kapanış Tarihi', 'Karar']),
                            ...(closedRows.length > 0 ? closedRows : [emptyRow(6)]),
                        ],
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),

                    // 7. Postponed findings
                    mkTitle('7. Ertelenen Bulgular'),
                    new Table({
                        rows: [
                            mkHeaderRow(['Bulgu No', 'Özet', 'Önem', 'Direktörlük', 'Hedef Tarih', 'Sorumlu']),
                            ...(postponedRows.length > 0 ? postponedRows : [emptyRow(6)]),
                        ],
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),
                ],
            }],
        });

        return await Packer.toBuffer(doc);
    }

    // ==========================================
    // EK-6 REPORT GENERATION
    // ==========================================

    private readonly frequencyLabels: Record<string, string> = {
        DAILY: 'Günlük',
        WEEKLY: 'Haftalık',
        MONTHLY: 'Aylık',
        QUARTERLY: 'Üç Aylık',
        SEMI_ANNUAL: 'Altı Aylık',
        ANNUAL: 'Yıllık',
        AD_HOC: 'İhtiyaç Halinde',
    };

    async getEK6ReportData(year: number, month?: number) {
        // Build date filter based on year/month
        let startDate: Date, endDate: Date;

        if (month) {
            startDate = new Date(year, month - 1, 1);
            endDate = new Date(year, month, 0, 23, 59, 59);
        } else {
            startDate = new Date(year, 0, 1);
            endDate = new Date(year, 11, 31, 23, 59, 59);
        }

        // Dönemde en az bir testi planlanmış/gerçekleşmiş kontroller
        // (Not: 'startDate'/'endDate' önceden hesaplanıp hiç kullanılmıyordu — tüm kontroller
        // dönemden bağımsız dönüyordu. Bu filtre EK-6'nın "Yılında Gerçekleştirilen" anlamını uygular.)
        const controls = await this.prisma.control.findMany({
            where: {
                tests: { some: { plannedDate: { gte: startDate, lte: endDate } } },
            },
            include: {
                owner: {
                    select: {
                        department: true,
                    }
                },
                findings: {
                    select: {
                        findingId: true,
                    }
                },
            },
            orderBy: [
                { owner: { department: 'asc' } },
                { controlId: 'asc' },
            ]
        });

        // Transform to report format
        const reportData = controls.map((control, index) => ({
            siraNo: index + 1,
            direktorluk: control.owner?.department || 'Belirtilmemiş',
            kontrolNo: control.controlId,
            kontrolSikligi: this.frequencyLabels[control.frequency] || control.frequency,
            kontrolTanimi: control.description,
            bulgu: control.findings.length > 0
                ? control.findings.map(f => f.findingId).join(', ')
                : 'Bulgu Yok',
        }));

        return {
            title: `EK-6 – ${year} Yılında Gerçekleştirilen Periyodik Kontroller (BT Birimleri)`,
            period: month
                ? `${month}/${year}`
                : `${year}`,
            generatedAt: new Date().toISOString(),
            totalControls: reportData.length,
            data: reportData,
        };
    }

    async generateEK6Word(year: number, month?: number): Promise<Buffer> {
        const { Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun, WidthType, AlignmentType, BorderStyle, HeadingLevel, PageOrientation } = await import('docx');

        const reportData = await this.getEK6ReportData(year, month);

        // Table header row
        const headerRow = new TableRow({
            tableHeader: true,
            children: [
                this.createHeaderCell('Sıra No', Document, TableCell, Paragraph, TextRun, WidthType, AlignmentType, BorderStyle),
                this.createHeaderCell('İlgili Direktörlük', Document, TableCell, Paragraph, TextRun, WidthType, AlignmentType, BorderStyle),
                this.createHeaderCell('Kontrol No', Document, TableCell, Paragraph, TextRun, WidthType, AlignmentType, BorderStyle),
                this.createHeaderCell('Kontrol Sıklığı', Document, TableCell, Paragraph, TextRun, WidthType, AlignmentType, BorderStyle),
                this.createHeaderCell('Kontrol Tanımı', Document, TableCell, Paragraph, TextRun, WidthType, AlignmentType, BorderStyle),
                this.createHeaderCell('Bulgu', Document, TableCell, Paragraph, TextRun, WidthType, AlignmentType, BorderStyle),
            ].map((cell, index) => {
                const widths = [600, 1500, 1200, 1000, 3500, 1500];
                return new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({ text: ['Sıra No', 'İlgili Direktörlük', 'Kontrol No', 'Kontrol Sıklığı', 'Kontrol Tanımı', 'Bulgu'][index], bold: true, size: 20 })],
                        alignment: AlignmentType.CENTER,
                    })],
                    width: { size: widths[index], type: WidthType.DXA },
                    shading: { fill: 'B8CCE4' }, // Light blue
                    verticalAlign: 'center' as any,
                });
            }),
        });

        // Data rows
        const dataRows = reportData.data.map(row =>
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.siraNo), size: 18 })], alignment: AlignmentType.CENTER })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.direktorluk, size: 18 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.kontrolNo, size: 18 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.kontrolSikligi, size: 18 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.kontrolTanimi, size: 18 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.bulgu, size: 18, color: row.bulgu === 'Bulgu Yok' ? '008000' : 'CC0000' })] })] }),
                ],
            })
        );

        // Create document
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        size: {
                            orientation: PageOrientation.LANDSCAPE,
                        },
                        margin: {
                            top: 720,
                            right: 720,
                            bottom: 720,
                            left: 720,
                        },
                    },
                },
                children: [
                    new Paragraph({
                        children: [new TextRun({ text: reportData.title, bold: true, size: 28 })],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 400 },
                    }),
                    new Table({
                        rows: [headerRow, ...dataRows],
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: `Oluşturulma Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, size: 16, italics: true })],
                        alignment: AlignmentType.RIGHT,
                        spacing: { before: 400 },
                    }),
                ],
            }],
        });

        return await Packer.toBuffer(doc);
    }

    private createHeaderCell(text: string, Document: any, TableCell: any, Paragraph: any, TextRun: any, WidthType: any, AlignmentType: any, BorderStyle: any) {
        return { text };
    }
}
