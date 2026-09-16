import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ControlScopeService } from './control-scope.service';
import { ControlDashboardService } from './control-dashboard.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { AddScopeDto, BulkAddScopeDto, ChangePeriodicityDto, CopyScopeDto, RemoveScopeDto } from './dto';

// Not: Bu controller literal path'leri (scope-years, dashboard, scope/bulk,
// scope/copy) ControlsController'daki `@Get(':id')` gibi catch-all rotalardan
// ÖNCE eşleşmelidir — bkz. controls.module.ts controllers sırası.
@ApiTags('Control Scope')
@ApiBearerAuth('JWT-Auth')
@Controller('controls')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ControlScopeController {
    constructor(
        private scopeService: ControlScopeService,
        private dashboardService: ControlDashboardService,
    ) { }

    @Get('scope-years')
    async getScopeYears() {
        return this.scopeService.getScopeYears();
    }

    @Get('dashboard')
    async getDashboard(@Query() query: any) {
        return this.dashboardService.getDashboard(query);
    }

    @Post('scope/bulk')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async bulkAddScope(@Body() dto: BulkAddScopeDto, @CurrentUser('id') userId: string) {
        return this.scopeService.bulkAddScope(dto, userId);
    }

    @Post('scope/copy')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async copyScope(@Body() dto: CopyScopeDto, @CurrentUser('id') userId: string) {
        return this.scopeService.copyScope(dto, userId);
    }

    @Post('tests/:testId/reactivate')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async reactivateTask(@Param('testId') testId: string, @CurrentUser('id') userId: string) {
        return this.scopeService.reactivateTask(testId, userId);
    }

    @Get(':id/scope-history')
    async getScopeHistory(@Param('id') id: string) {
        return this.scopeService.getScopeHistory(id);
    }

    @Post(':id/scope')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async addScope(@Param('id') id: string, @Body() dto: AddScopeDto, @CurrentUser('id') userId: string) {
        return this.scopeService.addScope(id, dto, userId);
    }

    @Delete(':id/scope/:year')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async removeScope(
        @Param('id') id: string,
        @Param('year', ParseIntPipe) year: number,
        @Body() dto: RemoveScopeDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.scopeService.removeScope(id, year, dto, userId);
    }

    @Patch(':id/scope/:year')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async changePeriodicity(
        @Param('id') id: string,
        @Param('year', ParseIntPipe) year: number,
        @Body() dto: ChangePeriodicityDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.scopeService.changePeriodicity(id, year, dto, userId);
    }

    @Post(':id/scope/:year/reactivate')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async reactivateScope(
        @Param('id') id: string,
        @Param('year', ParseIntPipe) year: number,
        @CurrentUser('id') userId: string,
    ) {
        return this.scopeService.reactivateScope(id, year, userId);
    }
}
