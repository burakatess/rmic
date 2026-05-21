import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards';
import { Public } from '../../common/decorators';

@ApiTags('Reports')
@ApiBearerAuth('JWT-Auth')
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
    constructor(private reportsService: ReportsService) { }

    @Get('dashboard')
    async getDashboard() {
        return this.reportsService.getDashboard();
    }

    @Get('risk-trends')
    async getRiskTrends(@Query('months') months?: number) {
        return this.reportsService.getRiskTrends(months);
    }

    @Get('control-heatmap')
    async getControlHeatmap() {
        return this.reportsService.getControlHeatmap();
    }

    @Get('recurrent-findings')
    async getRecurrentFindings() {
        return this.reportsService.getRecurrentFindings();
    }

    @Get('action-performance')
    async getActionPerformance() {
        return this.reportsService.getActionPerformance();
    }

    @Get('risk-heatmap')
    async getRiskHeatmap() {
        return this.reportsService.getRiskHeatmapData();
    }

    @Get('risk-trend-enhanced')
    async getRiskTrendEnhanced() {
        return this.reportsService.getRiskTrendEnhanced();
    }

    @Get('executive-summary')
    async getExecutiveSummary() {
        return this.reportsService.getExecutiveSummary();
    }

    // EK-6 Report Endpoints
    @Get('ek6/data')
    async getEK6Data(
        @Query('year') year: string,
        @Query('month') month?: string,
    ) {
        return this.reportsService.getEK6ReportData(
            parseInt(year),
            month ? parseInt(month) : undefined
        );
    }

    @Get('ek6/word')
    async downloadEK6Word(
        @Query('year') year: string,
        @Query('month') month: string | undefined,
        @Res() res: Response,
    ) {
        try {
            const yearNum = parseInt(year) || new Date().getFullYear();
            const monthNum = month ? parseInt(month) : undefined;

            const buffer = await this.reportsService.generateEK6Word(yearNum, monthNum);

            const filename = monthNum
                ? `EK-6_${yearNum}_${monthNum}.docx`
                : `EK-6_${yearNum}.docx`;

            res.set({
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': buffer.length,
            });

            res.send(buffer);
        } catch (error) {
            console.error('EK6 Word generation error:', error);
            res.status(500).json({ message: 'Word dosyası oluşturulamadı', error: String(error) });
        }
    }
}
