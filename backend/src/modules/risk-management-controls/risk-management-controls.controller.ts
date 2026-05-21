import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RiskManagementControlsService } from './risk-management-controls.service';
import { JwtAuthGuard } from '../../common/guards';

@ApiTags('Risk Management Controls')
@ApiBearerAuth('JWT-Auth')
@Controller('risk-management-controls')
@UseGuards(JwtAuthGuard)
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
    async create(@Body() data: any, @Request() req: any) {
        return this.service.create(data, req.user.sub);
    }

    // Update RYK control
    @Put(':id')
    async update(@Param('id') id: string, @Body() data: any, @Request() req: any) {
        return this.service.update(id, data, req.user.sub);
    }

    // Delete RYK control
    @Delete(':id')
    async delete(@Param('id') id: string) {
        return this.service.delete(id);
    }

    // Map control to risk entry
    @Post(':id/map-risk/:riskEntryId')
    async mapToRiskEntry(
        @Param('id') controlId: string,
        @Param('riskEntryId') riskEntryId: string,
        @Body() body: { applicabilityScore?: number },
    ) {
        return this.service.mapToRiskEntry(controlId, riskEntryId, body.applicabilityScore);
    }

    // Unmap control from risk entry
    @Delete(':id/map-risk/:riskEntryId')
    async unmapFromRiskEntry(
        @Param('id') controlId: string,
        @Param('riskEntryId') riskEntryId: string,
    ) {
        return this.service.unmapFromRiskEntry(controlId, riskEntryId);
    }

    // Update applicability score
    @Put(':id/map-risk/:riskEntryId/applicability')
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
    async createTest(@Param('id') controlId: string, @Body() data: any, @Request() req: any) {
        return this.service.createTest(controlId, data, req.user.sub);
    }
}
