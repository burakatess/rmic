import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards';
import { Public } from '../../common/decorators';

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

    @Get('executive-summary')
    async getExecutiveSummary() {
        return this.reportsService.getExecutiveSummary();
    }
}
