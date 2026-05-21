import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
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
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async create(@Body() data: any, @CurrentUser('id') userId: string) {
        return this.controlsService.create(data, userId);
    }

    @Put(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async update(@Param('id') id: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.controlsService.update(id, data, userId);
    }

    @Post(':id/map-risk')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async mapRisk(@Param('id') id: string, @Body() body: { riskId: string; mappingType?: string }) {
        return this.controlsService.mapRisk(id, body.riskId, body.mappingType);
    }

    @Delete(':id/unmap-risk/:riskId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async unmapRisk(@Param('id') id: string, @Param('riskId') riskId: string) {
        return this.controlsService.unmapRisk(id, riskId);
    }

    @Post(':id/test')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createTest(@Param('id') id: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.controlsService.createTest(id, data, userId);
    }

    @Get(':id/tests')
    async getTests(@Param('id') id: string) {
        return this.controlsService.getTests(id);
    }

    @Put('tests/:testId/submit')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async submitForApproval(@Param('testId') testId: string, @CurrentUser('id') userId: string) {
        return this.controlsService.submitForApproval(testId, userId);
    }

    @Put('tests/:testId/approve')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async approveTest(@Param('testId') testId: string, @CurrentUser('id') userId: string) {
        return this.controlsService.approveTest(testId, userId);
    }

    @Put('tests/:testId/reject')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async rejectTest(@Param('testId') testId: string, @Body('reason') reason: string, @CurrentUser('id') userId: string) {
        return this.controlsService.rejectTest(testId, userId, reason);
    }

    @Delete(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.controlsService.delete(id, userId);
    }
}
