import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuditsService } from './audits.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';

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
    @Roles('AUDITOR')
    async createPlan(@Body() data: any, @CurrentUser('id') userId: string) {
        return this.auditsService.createPlan(data, userId);
    }

    @Put('audit-plans/:id')
    @Roles('AUDITOR')
    async updatePlan(@Param('id') id: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.auditsService.updatePlan(id, data, userId);
    }

    // Audit Executions
    @Post('audit-executions')
    @Roles('AUDITOR')
    async createExecution(@Body() data: any, @CurrentUser('id') userId: string) {
        return this.auditsService.createExecution(data, userId);
    }

    @Put('audit-executions/:id')
    @Roles('AUDITOR')
    async updateExecution(@Param('id') id: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.auditsService.updateExecution(id, data, userId);
    }

    // Findings
    @Get('findings')
    async findAllFindings(@Query() query: any) {
        return this.auditsService.findAllFindings(query);
    }

    @Get('findings/:id')
    async getFinding(@Param('id') id: string) {
        return this.auditsService.getFinding(id);
    }

    @Post('findings')
    @Roles('AUDITOR')
    async createFinding(@Body() data: any, @CurrentUser('id') userId: string) {
        return this.auditsService.createFinding(data, userId);
    }

    @Put('findings/:id')
    @Roles('AUDITOR')
    async updateFinding(@Param('id') id: string, @Body() data: any, @CurrentUser('id') userId: string) {
        return this.auditsService.updateFinding(id, data, userId);
    }

    @Delete('findings/:id')
    @Roles('AUDITOR')
    async deleteFinding(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.auditsService.deleteFinding(id, userId);
    }
}
