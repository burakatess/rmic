import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import {
    DashboardScopeQueryDto, DashboardUpcomingQueryDto, DashboardWorkItemsQueryDto,
} from './dto/dashboard-query.dto';

// Çalışma Panosu — dashboard:view zaten seed-system.ts'te tüm rollere tanımlı
// (SYSTEM_ADMIN '*' ile örtük). Kapsam (İşlerim/Birimim/Kurum) ayrıca
// DirectorateScopeService tarafından oturumdan üretilir; sorgu parametreleri
// yalnızca TERCİHTİR, yetkiyi genişletemez.
@ApiTags('Dashboard')
@ApiBearerAuth('JWT-Auth')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermissions('dashboard:view')
export class DashboardController {
    constructor(private dashboardService: DashboardService) { }

    @Get('scope-options')
    async getScopeOptions(
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
    ) {
        return this.dashboardService.getScopeOptions(userId, permissions || []);
    }

    @Get('summary')
    async getSummary(
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @CurrentUser('role') role: string,
        @Query() q: DashboardScopeQueryDto,
    ) {
        return this.dashboardService.getSummary(userId, permissions || [], role, q);
    }

    @Get('work-items')
    async getWorkItems(
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @CurrentUser('role') role: string,
        @Query() q: DashboardWorkItemsQueryDto,
    ) {
        return this.dashboardService.getWorkItems(userId, permissions || [], role, q);
    }

    @Get('approvals')
    async getApprovals(
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @CurrentUser('role') role: string,
    ) {
        return this.dashboardService.getPendingApprovals(userId, permissions || [], role);
    }

    @Get('critical-issues')
    async getCriticalIssues(
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @Query() q: DashboardScopeQueryDto,
    ) {
        return this.dashboardService.getCriticalIssues(userId, permissions || [], q);
    }

    @Get('annual-plan')
    async getAnnualPlan(
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @Query() q: DashboardScopeQueryDto,
    ) {
        return this.dashboardService.getAnnualPlan(userId, permissions || [], q);
    }

    @Get('upcoming')
    async getUpcoming(
        @CurrentUser('id') userId: string,
        @CurrentUser('permissions') permissions: string[],
        @Query() q: DashboardUpcomingQueryDto,
    ) {
        return this.dashboardService.getUpcoming(userId, permissions || [], q);
    }
}
