import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditsService } from './audits.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';

@ApiTags('Findings')
@ApiBearerAuth('JWT-Auth')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditsController {
    constructor(private auditsService: AuditsService) { }

    // Audit Plans
    @Get('audit-plans')
    async findAllPlans(@Query() query: any) {
        return this.auditsService.findAllPlans(query);
    }

    @Post('audit-plans')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createPlan(@Body() data: any, @CurrentUser('id') userId: string) {
        return this.auditsService.createPlan(data, userId);
    }

    @Put('audit-plans/:id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async updatePlan(@Param('id') id: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.auditsService.updatePlan(id, data, userId);
    }

    // Audit Executions
    @Post('audit-executions')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createExecution(@Body() data: any, @CurrentUser('id') userId: string) {
        return this.auditsService.createExecution(data, userId);
    }

    @Put('audit-executions/:id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async updateExecution(@Param('id') id: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.auditsService.updateExecution(id, data, userId);
    }

    // Findings
    @Get('findings')
    async findAllFindings(@Query() query: any) {
        return this.auditsService.findAllFindings(query);
    }

    @Get('findings/:id/relations')
    async getFindingRelations(@Param('id') id: string) {
        return this.auditsService.getFindingRelations(id);
    }

    @Get('findings/:id')
    async getFinding(@Param('id') id: string) {
        return this.auditsService.getFinding(id);
    }

    @Post('findings')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createFinding(@Body() data: any, @CurrentUser('id') userId: string) {
        return this.auditsService.createFinding(data, userId);
    }

    @Put('findings/:id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async updateFinding(@Param('id') id: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.auditsService.updateFinding(id, data, userId);
    }

    @Delete('findings/:id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async deleteFinding(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.auditsService.deleteFinding(id, userId);
    }
}
