import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles, RequirePermissions } from '../../common/decorators';
import { RiskSimulationService } from './risk-simulation.service';
import { TransferService } from './transfer.service';
import {
    CreateRiskSimulationDto, UpdateRiskSimulationDto, CreateScenarioDto, UpdateScenarioDto,
    CreateScenarioControlDto, UpdateScenarioControlDto, RedistributeWeightsDto,
    CreateScenarioActionDto, UpdateScenarioActionDto, ToggleScenarioActionDto, TransferDto,
} from './dto';

const SIM_ROLES = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'RISK_ANALYST'];
const TRANSFER_ROLES = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER'];

@ApiTags('Risk Simulation')
@ApiBearerAuth('JWT-Auth')
@Controller('risk-simulations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RiskSimulationController {
    constructor(
        private simService: RiskSimulationService,
        private transferService: TransferService,
    ) { }

    @Get()
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:view')
    list(@Query('status') status?: string, @Query('search') search?: string) {
        return this.simService.listSimulations({ status, search });
    }

    @Get(':id')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:view')
    get(@Param('id') id: string) {
        return this.simService.getSimulation(id);
    }

    @Post()
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:create')
    create(@Body() dto: CreateRiskSimulationDto, @CurrentUser('id') userId: string) {
        return this.simService.createSimulation(dto, userId);
    }

    @Patch(':id')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:edit')
    update(@Param('id') id: string, @Body() dto: UpdateRiskSimulationDto, @CurrentUser('id') userId: string) {
        return this.simService.updateSimulation(id, dto, userId);
    }

    // ── Senaryolar ──
    // NOT: literal 'scenarios/compare' rotası, 'scenarios/:sid' catch-all'ından
    // ÖNCE tanımlanmalı — aksi halde Nest sid='compare' ile eşleştirir.

    @Get('scenarios/compare')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:view')
    compare(@Query('a') a: string, @Query('b') b: string) {
        return this.simService.compare(a, b);
    }

    @Get('scenarios/:sid')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:view')
    getScenario(@Param('sid') sid: string) {
        return this.simService.getScenario(sid);
    }

    @Post(':id/scenarios')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:create')
    createScenario(@Param('id') id: string, @Body() dto: CreateScenarioDto, @CurrentUser('id') userId: string) {
        return this.simService.createScenario(id, dto, userId);
    }

    @Patch('scenarios/:sid')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:edit')
    updateScenario(@Param('sid') sid: string, @Body() dto: UpdateScenarioDto, @CurrentUser('id') userId: string) {
        return this.simService.updateScenario(sid, dto, userId);
    }

    @Post('scenarios/:sid/reset')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:edit')
    reset(@Param('sid') sid: string, @CurrentUser('id') userId: string) {
        return this.simService.resetScenario(sid, userId);
    }

    @Get('scenarios/:sid/refresh-preview')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:view')
    refreshPreview(@Param('sid') sid: string) {
        return this.simService.previewRefreshFromInventory(sid);
    }

    @Post('scenarios/:sid/refresh-apply')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:edit')
    refreshApply(@Param('sid') sid: string, @Body('acceptFields') acceptFields: string[], @CurrentUser('id') userId: string) {
        return this.simService.applyRefreshFromInventory(sid, acceptFields ?? [], userId);
    }

    @Post('scenarios/:sid/calculate')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:view')
    calculate(@Param('sid') sid: string) {
        return this.simService.calculate(sid);
    }

    // ── Kontroller ──

    @Post('scenarios/:sid/controls')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:edit')
    addControl(@Param('sid') sid: string, @Body() dto: CreateScenarioControlDto, @CurrentUser('id') userId: string) {
        return this.simService.addControl(sid, dto, userId);
    }

    @Patch('scenarios/:sid/controls/:cid')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:edit')
    updateControl(@Param('sid') sid: string, @Param('cid') cid: string, @Body() dto: UpdateScenarioControlDto, @CurrentUser('id') userId: string) {
        return this.simService.updateControl(sid, cid, dto, userId);
    }

    @Delete('scenarios/:sid/controls/:cid')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:edit')
    removeControl(@Param('sid') sid: string, @Param('cid') cid: string, @CurrentUser('id') userId: string) {
        return this.simService.removeControl(sid, cid, userId);
    }

    @Post('scenarios/:sid/controls/redistribute-weights')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:edit')
    redistribute(@Param('sid') sid: string, @Body() dto: RedistributeWeightsDto, @CurrentUser('id') userId: string) {
        return this.simService.redistributeWeights(sid, dto.weights ?? {}, userId);
    }

    // ── Aksiyonlar ──

    @Post('scenarios/:sid/actions')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:edit')
    addAction(@Param('sid') sid: string, @Body() dto: CreateScenarioActionDto, @CurrentUser('id') userId: string) {
        return this.simService.addAction(sid, dto, userId);
    }

    @Patch('scenarios/:sid/actions/:aid')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:edit')
    updateAction(@Param('sid') sid: string, @Param('aid') aid: string, @Body() dto: UpdateScenarioActionDto, @CurrentUser('id') userId: string) {
        return this.simService.updateAction(sid, aid, dto, userId);
    }

    @Patch('scenarios/:sid/actions/:aid/toggle')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:edit')
    toggleAction(@Param('sid') sid: string, @Param('aid') aid: string, @Body() dto: ToggleScenarioActionDto, @CurrentUser('id') userId: string) {
        return this.simService.toggleAction(sid, aid, dto.isApplied, userId);
    }

    @Delete('scenarios/:sid/actions/:aid')
    @Roles(...SIM_ROLES)
    @RequirePermissions('risk:sim:edit')
    removeAction(@Param('sid') sid: string, @Param('aid') aid: string, @CurrentUser('id') userId: string) {
        return this.simService.removeAction(sid, aid, userId);
    }

    // ── Aktarım (envantere) ──

    @Post('scenarios/:sid/transfer/preview')
    @Roles(...TRANSFER_ROLES)
    @RequirePermissions('risk:sim:transfer')
    previewTransfer(@Param('sid') sid: string) {
        return this.transferService.preview(sid);
    }

    @Post('scenarios/:sid/transfer')
    @Roles(...TRANSFER_ROLES)
    @RequirePermissions('risk:sim:transfer')
    applyTransfer(@Param('sid') sid: string, @Body() dto: TransferDto, @CurrentUser('id') userId: string) {
        return this.transferService.apply(sid, dto, userId);
    }
}
