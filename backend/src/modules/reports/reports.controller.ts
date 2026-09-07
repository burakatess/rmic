import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles, RequirePermissions } from '../../common/decorators';
import { matchesPermission } from '../../common/util/permission-match';
import { ReportPeriodQueryDto, RiskTrendsQueryDto } from './dto/report-query.dto';

// Raporlara erişebilen roller — anonim/oturumsuz erişim JwtAuthGuard ile zaten
// engelli. Bu liste "her oturumlu kullanıcıya açık" durumunu kaldırır. AUDITEE ve
// IKS_MANAGER yalnızca DAR KAPSAMLI raporları görür (report:org izinleri yok).
const REPORT_ROLES = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR', 'IKS_MANAGER', 'AUDITEE'] as const;

@ApiTags('Reports')
@ApiBearerAuth('JWT-Auth')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...REPORT_ROLES)
@RequirePermissions('report:view')
export class ReportsController {
    constructor(private reportsService: ReportsService) { }

    // Kurum geneli yönetim raporları — ek olarak report:org izni ister.
    @Get('dashboard')
    @RequirePermissions('report:view', 'report:org')
    async getDashboard() {
        return this.reportsService.getDashboard();
    }

    @Get('risk-trends')
    @RequirePermissions('report:view', 'report:org')
    async getRiskTrends(@Query() q: RiskTrendsQueryDto) {
        return this.reportsService.getRiskTrends(q.months);
    }

    @Get('control-heatmap')
    @RequirePermissions('report:view', 'report:org')
    async getControlHeatmap() {
        return this.reportsService.getControlHeatmap();
    }

    @Get('recurrent-findings')
    @RequirePermissions('report:view', 'report:org')
    async getRecurrentFindings() {
        return this.reportsService.getRecurrentFindings();
    }

    @Get('action-performance')
    @RequirePermissions('report:view', 'report:org')
    async getActionPerformance() {
        return this.reportsService.getActionPerformance();
    }

    @Get('risk-heatmap')
    @RequirePermissions('report:view', 'report:org')
    async getRiskHeatmap() {
        return this.reportsService.getRiskHeatmapData();
    }

    @Get('risk-trend-enhanced')
    @RequirePermissions('report:view', 'report:org')
    async getRiskTrendEnhanced() {
        return this.reportsService.getRiskTrendEnhanced();
    }

    @Get('executive-summary')
    @RequirePermissions('report:view', 'report:org')
    async getExecutiveSummary() {
        return this.reportsService.getExecutiveSummary();
    }

    // EK-6 Report Endpoints — kurum geneli özet.
    @Get('ek6/data')
    @RequirePermissions('report:view', 'report:org')
    async getEK6Data(@Query() q: ReportPeriodQueryDto) {
        return this.reportsService.getEK6ReportData(q.year ?? new Date().getFullYear(), q.month);
    }

    // My Work — her zaman oturum sahibinin kendi kalemleri (kapsam dar).
    @Get('my-work')
    async getMyWork(
        @CurrentUser('id') userId: string,
        @Query('month') month?: string,
    ) {
        return this.reportsService.getMyWork(userId, month);
    }

    // Bulgu Takip — report:org yoksa yalnızca kullanıcıya atanmış bulgular; bu
    // durumda directorateId sorgu parametresi YOK SAYILIR (kapsam genişletilemez).
    @Get('bulgu-takip')
    async getBulgeTakipReport(
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') perms: string[],
        @Query() q: ReportPeriodQueryDto,
    ) {
        const canOrgWide = matchesPermission(perms || [], 'report:org');
        return this.reportsService.getBulgeTakipReport({
            year: q.year,
            month: q.month,
            startDate: q.startDate ? new Date(q.startDate) : undefined,
            endDate: q.endDate ? new Date(q.endDate) : undefined,
            directorateId: canOrgWide ? (q.directorateId || undefined) : undefined,
            scopeAssigneeId: canOrgWide ? undefined : userId,
        });
    }

    // Monthly Management Report — kurum geneli.
    @Get('monthly')
    @RequirePermissions('report:view', 'report:org')
    async getMonthlyReport(@Query() q: ReportPeriodQueryDto) {
        return this.reportsService.getMonthlyReport({
            year: q.year,
            month: q.month,
            startDate: q.startDate ? new Date(q.startDate) : undefined,
            endDate: q.endDate ? new Date(q.endDate) : undefined,
            directorateId: q.directorateId || undefined,
        });
    }

    // JSON (`/monthly`) ile AYNI filtre/DTO — çıktı paritesi (Madde 8).
    @Get('monthly/word')
    @RequirePermissions('report:view', 'report:export', 'report:org')
    async downloadMonthlyWord(@Query() q: ReportPeriodQueryDto, @Res() res: Response) {
        try {
            const buffer = await this.reportsService.generateMonthlyReportWord({
                year: q.year,
                month: q.month,
                startDate: q.startDate ? new Date(q.startDate) : undefined,
                endDate: q.endDate ? new Date(q.endDate) : undefined,
                directorateId: q.directorateId || undefined,
            });

            const label = q.month && q.year ? `${q.year}_${q.month}` : q.year ? String(q.year) : 'rapor';
            res.set({
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="Aylik_Yonetim_Raporu_${label}.docx"`,
                'Content-Length': buffer.length,
            });
            res.send(buffer);
        } catch (error) {
            console.error('Monthly Word generation error:', error);
            // İç hata ayrıntısı istemciye SIZDIRILMAZ (Madde 8).
            res.status(500).json({ message: 'Word dosyası oluşturulamadı' });
        }
    }

    @Get('ek6/word')
    @RequirePermissions('report:view', 'report:export', 'report:org')
    async downloadEK6Word(@Query() q: ReportPeriodQueryDto, @Res() res: Response) {
        try {
            const yearNum = q.year ?? new Date().getFullYear();
            const buffer = await this.reportsService.generateEK6Word(yearNum, q.month);
            const filename = q.month ? `EK-6_${yearNum}_${q.month}.docx` : `EK-6_${yearNum}.docx`;
            res.set({
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': buffer.length,
            });
            res.send(buffer);
        } catch (error) {
            console.error('EK6 Word generation error:', error);
            res.status(500).json({ message: 'Word dosyası oluşturulamadı' });
        }
    }
}
