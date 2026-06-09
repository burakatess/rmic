import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ControlsService } from './controls.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';

@ApiTags('Controls')
@ApiBearerAuth('JWT-Auth')
@Controller('controls')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ControlsController {
    constructor(private controlsService: ControlsService) { }

    // ─── Controls ─────────────────────────────────────────────────────────────

    @Get()
    async findAll(@Query() query: any) {
        return this.controlsService.findAll(query);
    }

    @Get(':id/relations')
    async getRelations(@Param('id') id: string) {
        return this.controlsService.getRelations(id);
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.controlsService.findOne(id);
    }

    @Post()
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async create(@Body() data: any, @CurrentUser('id') userId: string) {
        return this.controlsService.create(data, userId);
    }

    @Put(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async update(@Param('id') id: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.controlsService.update(id, data, userId);
    }

    @Patch(':id/activate')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async activate(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.controlsService.activate(id, userId);
    }

    @Patch(':id/passivate')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async passivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.controlsService.passivate(id, userId);
    }

    @Delete(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.controlsService.delete(id, userId);
    }

    @Post(':id/map-risk')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async mapRisk(@Param('id') id: string, @Body() body: { riskId: string; mappingType?: string }) {
        return this.controlsService.mapRisk(id, body.riskId, body.mappingType);
    }

    @Delete(':id/unmap-risk/:riskId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async unmapRisk(@Param('id') id: string, @Param('riskId') riskId: string) {
        return this.controlsService.unmapRisk(id, riskId);
    }

    // ─── ControlTests (Global List) ───────────────────────────────────────────

    @Get('tests')
    async getAllTests(@Query() query: any) {
        return this.controlsService.getAllTests(query);
    }

    // ─── ControlTests (Per-Control) ───────────────────────────────────────────

    @Get(':id/tests')
    async getTests(@Param('id') id: string) {
        return this.controlsService.getTests(id);
    }

    @Post(':id/tests')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createTest(@Param('id') id: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.controlsService.createTest(id, data, userId);
    }

    @Post(':id/generate-tests')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async generateTests(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.controlsService.generateTestsForControl(id);
    }

    @Patch('tests/:testId/start')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async startTest(@Param('testId') testId: string, @CurrentUser('id') userId: string) {
        return this.controlsService.startTest(testId, userId);
    }

    @Patch('tests/:testId/complete')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async completeTest(@Param('testId') testId: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.controlsService.completeTest(testId, data, userId);
    }

    @Patch('tests/:testId/approve')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async approveTest(@Param('testId') testId: string, @CurrentUser('id') userId: string) {
        return this.controlsService.approveTest(testId, userId);
    }

    @Patch('tests/:testId/return')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async returnTest(
        @Param('testId') testId: string,
        @Body('reason') reason: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.controlsService.returnTest(testId, reason, userId);
    }

    // Legacy: POST :id/test — backward compat
    @Post(':id/test')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createTestLegacy(@Param('id') id: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.controlsService.createTest(id, data, userId);
    }
}
