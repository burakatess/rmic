import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnnualPlanService } from './annual-plan.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles, RequirePermissions } from '../../common/decorators';
import {
    AnnualPlanWorkspaceQueryDto, ApplyPlanDto, BulkDraftActionDto, EligibleControllersQueryDto, SaveDraftItemsDto,
} from './dto/annual-plan.dto';

// Kontrol Yönetimi — Yıllık Plan. Erişim, mevcut ControlScopeController ile
// BİREBİR AYNI (SYSTEM_ADMIN/RISK_CONTROL_MANAGER + control:*) — planlama
// zaten yetkili bir mutasyon, ayrı bir "birim planlayıcı" rolü icat edilmedi
// (bkz. plan "Mimari Kararlar"). Literal yollar (`annual-plan/...`)
// ControlsController'ın `:id` catch-all'ından ÖNCE kaydedilmeli — controls.module.ts.
@ApiTags('Annual Plan')
@ApiBearerAuth('JWT-Auth')
@Controller('controls/annual-plan')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
@RequirePermissions('control:*')
export class AnnualPlanController {
    constructor(private service: AnnualPlanService) { }

    @Get(':year/workspace')
    async getWorkspace(
        @Param('year', ParseIntPipe) year: number,
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @Query() query: AnnualPlanWorkspaceQueryDto,
    ) {
        return this.service.getWorkspace(year, userId, permissions || [], query);
    }

    @Get(':year/draft')
    async getDraft(@Param('year', ParseIntPipe) year: number, @CurrentUser('id') userId: string) {
        return this.service.getDraft(year, userId);
    }

    // ─── Kontrolcü Atamaları sekmesi ──────────────────────────────────────────
    @Get(':year/assignments')
    async getAssignmentsView(
        @Param('year', ParseIntPipe) year: number,
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @Query() query: AnnualPlanWorkspaceQueryDto,
    ) {
        return this.service.getAssignmentsView(year, userId, permissions || [], query);
    }

    @Get(':year/eligible-controllers')
    async getEligibleControllers(
        @Param('year', ParseIntPipe) year: number,
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @Query() query: EligibleControllersQueryDto,
    ) {
        return this.service.getEligibleControllers(year, userId, permissions || [], query.role, query.controlId, {});
    }

    @Get(':year/workload-by-assignee')
    async getWorkloadByAssignee(
        @Param('year', ParseIntPipe) year: number,
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @Query() query: AnnualPlanWorkspaceQueryDto,
    ) {
        return this.service.getWorkloadByAssignee(year, userId, permissions || [], { scope: query.scope, directorateId: query.directorateId });
    }

    @Post(':year/draft/items')
    async saveDraftItems(
        @Param('year', ParseIntPipe) year: number,
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @Body() dto: SaveDraftItemsDto,
        @Query() query: AnnualPlanWorkspaceQueryDto,
    ) {
        return this.service.saveDraftItems(year, userId, permissions || [], dto, { scope: query.scope, directorateId: query.directorateId });
    }

    @Post(':year/draft/bulk')
    async bulkDraftAction(
        @Param('year', ParseIntPipe) year: number,
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @Body() dto: BulkDraftActionDto,
        @Query() query: AnnualPlanWorkspaceQueryDto,
    ) {
        return this.service.bulkDraftAction(year, userId, permissions || [], dto, { scope: query.scope, directorateId: query.directorateId });
    }

    @Post(':year/draft/copy-from/:fromYear')
    async copyFromYear(
        @Param('year', ParseIntPipe) year: number,
        @Param('fromYear', ParseIntPipe) fromYear: number,
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @Query() query: AnnualPlanWorkspaceQueryDto,
    ) {
        return this.service.copyFromYear(year, fromYear, userId, permissions || [], { scope: query.scope, directorateId: query.directorateId });
    }

    @Post(':year/draft/discard')
    async discardDraft(@Param('year', ParseIntPipe) year: number, @CurrentUser('id') userId: string) {
        return this.service.discardDraft(year, userId);
    }

    @Post(':year/preview')
    async previewApply(
        @Param('year', ParseIntPipe) year: number,
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
    ) {
        return this.service.previewApply(year, userId, permissions || []);
    }

    @Post(':year/apply')
    async applyPlan(
        @Param('year', ParseIntPipe) year: number,
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @Body() dto: ApplyPlanDto,
    ) {
        return this.service.applyPlan(year, userId, permissions || [], dto);
    }
}
