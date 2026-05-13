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
            overdueActions,
            controlEffectiveness,
            riskTrend,
            recentActivity,
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
        ]);

        // Calculate totals
        const totalRisks = risksByStatus.reduce((sum, r) => sum + r._count, 0);
        const openFindings = await this.prisma.finding.count({ where: { status: { not: 'CLOSED' } } });
        const totalControls = await this.prisma.control.count();

        return {
            summary: {
                totalRisks,
                risksAboveAppetite,
                openFindings,
                criticalFindings,
                overdueActions,
                totalControls,
            },
            risksByStatus,
            risksByScore,
            controlEffectiveness,
            riskTrend,
            recentActivity,
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
        const trend = [];

        for (let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

            const count = await this.prisma.risk.count({
                where: { createdAt: { lte: endDate } },
            });

            const highRisks = await this.prisma.risk.count({
                where: {
                    createdAt: { lte: endDate },
                    inherentRiskScore: { gte: 15 },
                },
            });

            trend.push({
                month: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
                total: count,
                high: highRisks,
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
        const trend = [];

        for (let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

            const risks = await this.prisma.risk.findMany({
                where: { createdAt: { lte: endDate } },
                select: { inherentRiskScore: true, residualRiskScore: true }
            });

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
            include: {
                risks: { include: { risk: true } },
                tests: { orderBy: { testDate: 'desc' }, take: 1 },
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
            lastTestResult: c.tests[0]?.result || 'NOT_TESTED',
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
        const actions = await this.prisma.action.findMany({
            include: { effectivenessReview: true },
        });

        const total = actions.length;
        const completed = actions.filter((a) => ['COMPLETED', 'CLOSED'].includes(a.status)).length;
        const overdue = actions.filter((a) =>
            !['COMPLETED', 'CLOSED'].includes(a.status) && a.dueDate < new Date()
        ).length;
        const effective = actions.filter((a) => a.effectivenessReview?.isEffective).length;

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
}
