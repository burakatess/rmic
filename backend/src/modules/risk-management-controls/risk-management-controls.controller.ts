import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RiskManagementControlsService } from './risk-management-controls.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles } from '../../common/decorators';

@ApiTags('Risk Management Controls')
@ApiBearerAuth('JWT-Auth')
@Controller('risk-management-controls')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RiskManagementControlsController {
    constructor(private readonly service: RiskManagementControlsService) { }

    // List all RYK controls
    @Get()
    async findAll(@Query() query: any) {
        return this.service.findAll(query);
    }

    // Get single RYK control
    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    // Create new RYK control
    @Post()
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async create(@Body() data: any, @Request() req: any) {
        return this.service.create(data, req.user.sub);
    }

    // Update RYK control
    @Put(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async update(@Param('id') id: string, @Body() data: any, @Request() req: any) {
        return this.service.update(id, data, req.user.sub);
    }

    // Delete RYK control
    @Delete(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async delete(@Param('id') id: string) {
        return this.service.delete(id);
    }

    // Map control to risk entry
    @Post(':id/map-risk/:riskEntryId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async mapToRiskEntry(
        @Param('id') controlId: string,
        @Param('riskEntryId') riskEntryId: string,
        @Body() body: { applicabilityScore?: number },
    ) {
        return this.service.mapToRiskEntry(controlId, riskEntryId, body.applicabilityScore);
    }

    // Unmap control from risk entry
    @Delete(':id/map-risk/:riskEntryId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async unmapFromRiskEntry(
        @Param('id') controlId: string,
        @Param('riskEntryId') riskEntryId: string,
    ) {
        return this.service.unmapFromRiskEntry(controlId, riskEntryId);
    }

    // Update applicability score
    @Put(':id/map-risk/:riskEntryId/applicability')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async updateApplicabilityScore(
        @Param('id') controlId: string,
        @Param('riskEntryId') riskEntryId: string,
        @Body() body: { applicabilityScore: number },
    ) {
        return this.service.updateApplicabilityScore(controlId, riskEntryId, body.applicabilityScore);
    }

    // Get tests for a control
    @Get(':id/tests')
    async getTests(@Param('id') controlId: string) {
        return this.service.getTests(controlId);
    }

    // Create test for a control
    @Post(':id/tests')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createTest(@Param('id') controlId: string, @Body() data: any, @Request() req: any) {
        return this.service.createTest(controlId, data, req.user.sub);
    }
}
