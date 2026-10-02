import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ControlScopeService } from './control-scope.service';
import { ControlDashboardService } from './control-dashboard.service';
import { DirectorateScopeService } from '../../common/services/directorate-scope.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { AddScopeDto, ApplyVersionImpactDto, BulkAddScopeDto, ChangePeriodicityDto, CopyScopeDto, RemoveScopeDto } from './dto';

// Not: Bu controller literal path'leri (scope-years, dashboard, scope/bulk,
// scope/copy, scope/period-controls) ControlsController'daki `@Get(':id')`
// gibi catch-all rotalardan ÖNCE eşleşmelidir — bkz. controls.module.ts
// controllers sırası.
@ApiTags('Control Scope')
@ApiBearerAuth('JWT-Auth')
@Controller('controls')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ControlScopeController {
    constructor(
        private scopeService: ControlScopeService,
        private dashboardService: ControlDashboardService,
        private directorateScope: DirectorateScopeService,
    ) { }

    @Get('scope-years')
    async getScopeYears() {
        return this.scopeService.getScopeYears();
    }

    @Get('dashboard')
    async getDashboard(@Query() query: any) {
        return this.dashboardService.getDashboard(query);
    }

    // ─── Dönem Kontrolleri (eski "Kontrol Takip Panosu") — kontrol×yıl bazlı
    // liste. RBAC: MINE/UNIT/ORG DirectorateScopeService ile AYNI şekilde
    // çözülür (annual-plan.controller.ts ile birebir desen) — kullanıcı
    // yetkisi dışına asla genişleyemez.
    @Get('scope/period-controls')
    async listPeriodControls(
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @Query() query: any,
    ) {
        const resolved = await this.directorateScope.resolveScope(userId, permissions || [], { scope: query.scope, directorateId: query.directorateId });
        return this.scopeService.listPeriodControls({
            year: query.year ? parseInt(query.year, 10) : undefined,
            directorateIds: resolved.appliedScope === 'UNIT' ? resolved.directorateIds! : undefined,
            mineUserId: resolved.appliedScope === 'MINE' ? userId : undefined,
            assigneeId: query.assigneeId, secondControllerId: query.secondControllerId,
            assigneeIds: query.assigneeIds, secondControllerIds: query.secondControllerIds,
            frequency: query.frequency, search: query.search,
            month: query.month ? parseInt(query.month, 10) : undefined,
            onlyOverdue: query.onlyOverdue === 'true', onlyPendingApproval: query.onlyPendingApproval === 'true',
            onlyWithFindings: query.onlyWithFindings === 'true',
            page: query.page ? parseInt(query.page, 10) : undefined,
            pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
        });
    }

    @Get('scope/period-controls/:scopeId')
    async getPeriodControlDetail(@Param('scopeId') scopeId: string) {
        return this.scopeService.getPeriodControlDetail(scopeId);
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

    @Post(':id/version-impact/preview')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async previewVersionImpact(@Param('id') id: string) {
        return this.scopeService.previewVersionImpact(id);
    }

    @Post(':id/version-impact/apply')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async applyVersionImpact(
        @Param('id') id: string,
        @Body() dto: ApplyVersionImpactDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.scopeService.applyVersionImpact(id, dto, userId);
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

    // ─── Yeni kontrol sürümünü bu döneme uygula (madde 17) ─────────────────────
    @Post(':id/scope/:year/apply-new-version')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async applyNewVersion(
        @Param('id') id: string,
        @Param('year', ParseIntPipe) year: number,
        @Body() dto: { confirmOngoing?: boolean; dryRun?: boolean },
        @CurrentUser('id') userId: string,
    ) {
        return this.scopeService.applyNewVersion(id, year, userId, dto || {});
    }
}
