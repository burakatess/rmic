import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';

// Aktif iş yükü/gecikme hesaplarına giren durumlar — iptal/kapsam dışı hariç.
const ACTIVE_STATUSES = ['BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'GERI_GONDERILDI', 'ONAYLANDI'];
const CANCELLED_STATUSES = ['IPTAL', 'KAPSAM_DISI'];

@Injectable()
export class ControlDashboardService {
    constructor(private prisma: PrismaService) { }

    /**
     * Kontrol Takip Panosu — Panel görünümü göstergeleri.
     * Tanım kuralları (plan §7): kontrol sayısı ≠ task sayısı; iptal/kapsam-dışı
     * tamamlanma paydasına girmez; TAMAMLANDI (2. kontrolcü onayı bekliyor) ayrı
     * gösterilir, "tamamlanmış" sayılmaz; sonucu olmayan task "uygun" sayılmaz;
     * veri yokken oran null döner (frontend %100 göstermez).
     */
    async getDashboard(query: any) {
        const currentYear = new Date().getFullYear();
        const year = query.year && query.year !== 'all' ? parseInt(query.year, 10) : currentYear;
        const includeOutOfScope = query.includeOutOfScope === 'true' || query.includeOutOfScope === true;

        // "Birimim" kapsamı: birden fazla yetkili direktörlük seçilebilir.
        const directorateIds: string[] | undefined = Array.isArray(query.directorateIds)
            ? query.directorateIds
            : (query.directorateId ? [query.directorateId] : undefined);

        const where: any = {};
        if (query.year !== 'all') where.year = year;
        if (query.period) where.periodKey = query.period;
        if (query.assigneeId) where.assigneeId = query.assigneeId;
        if (query.controlId) where.controlId = query.controlId;
        if (directorateIds?.length) where.directorateId = { in: directorateIds };
        if (query.taskStatus) where.status = query.taskStatus;
        if (query.result) where.findingStatus = query.result;
        if (query.frequency) {
            where.OR = [
                { scope: { frequency: query.frequency } },
                { scopeId: null, control: { frequency: query.frequency } },
            ];
        }
        if (!includeOutOfScope && !query.taskStatus) {
            where.status = { notIn: CANCELLED_STATUSES };
        }
        if (query.overdue === 'true' || query.overdue === true) {
            where.status = { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'] };
            where.plannedDate = { lt: new Date() };
        }

        const controlCountWhere: any = { year, status: 'ACTIVE' };
        if (query.frequency) controlCountWhere.frequency = query.frequency;
        if (query.controlId) controlCountWhere.controlId = query.controlId;
        if (directorateIds?.length) controlCountWhere.control = { directorateId: { in: directorateIds } };

        const [
            scopedControls,
            allTasks,
            overdueCount,
            resultGroups,
            periodGroups,
        ] = await Promise.all([
            this.prisma.controlYearScope.findMany({ where: controlCountWhere, select: { controlId: true }, distinct: ['controlId'] }),
            this.prisma.controlTest.findMany({ where, select: { id: true, status: true, findingStatus: true, plannedDate: true, periodKey: true } }),
            this.prisma.controlTest.count({
                where: {
                    ...where,
                    status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'] },
                    plannedDate: { lt: new Date() },
                },
            }),
            this.prisma.controlTest.groupBy({
                by: ['findingStatus'],
                where: { ...where, status: 'ONAYLANDI' },
                _count: { _all: true },
            }),
            this.prisma.controlTest.groupBy({
                by: ['periodKey'],
                where,
                _count: { _all: true },
            }),
        ]);

        const notStarted = allTasks.filter(t => t.status === 'BEKLIYOR').length;
        const inProgress = allTasks.filter(t => t.status === 'DEVAM_EDIYOR' || t.status === 'GERI_GONDERILDI').length;
        const pendingApproval = allTasks.filter(t => t.status === 'TAMAMLANDI').length;
        const completed = allTasks.filter(t => t.status === 'ONAYLANDI').length;
        const cancelled = allTasks.filter(t => CANCELLED_STATUSES.includes(t.status)).length;

        // Aktif payda: iptal/kapsam-dışı hariç tüm tasklar (dahil edilmişse dahi paydaya girmez)
        const activeDenominator = allTasks.filter(t => ACTIVE_STATUSES.includes(t.status)).length;
        const completionRate = activeDenominator > 0 ? Math.round((completed / activeDenominator) * 1000) / 10 : null;

        const resultDistribution = resultGroups.reduce((acc: Record<string, number>, g) => {
            const key = g.findingStatus || 'BELIRSIZ';
            acc[key] = g._count._all;
            return acc;
        }, {} as Record<string, number>);

        // Tamamlanan = onaylanmış task sayısı, dönem bazlı (planlanan vs tamamlanan grafiği)
        const completedByPeriodRaw = await this.prisma.controlTest.groupBy({
            by: ['periodKey'],
            where: { ...where, status: 'ONAYLANDI' },
            _count: { _all: true },
        });
        const completedByPeriod = new Map(completedByPeriodRaw.map(g => [g.periodKey, g._count._all]));
        const byPeriod = periodGroups
            .filter(g => g.periodKey)
            .map(g => ({ periodKey: g.periodKey, planned: g._count._all, completed: completedByPeriod.get(g.periodKey) || 0 }))
            .sort((a, b) => (a.periodKey || '').localeCompare(b.periodKey || ''));

        return {
            year,
            controlCount: scopedControls.length,
            plannedTaskCount: allTasks.length,
            notStarted,
            inProgress,
            pendingApproval,
            completed,
            cancelled,
            overdue: overdueCount,
            completionRate, // null = veri yok, frontend "-" gösterir
            resultDistribution,
            byPeriod,
        };
    }
}
