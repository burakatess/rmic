import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ControlsService } from './controls.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';

@Controller('controls')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ControlsController {
    constructor(private controlsService: ControlsService) { }

    @Get()
    async findAll(@Query() query: any) {
        return this.controlsService.findAll(query);
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

    @Delete(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.controlsService.delete(id, userId);
    }
}
