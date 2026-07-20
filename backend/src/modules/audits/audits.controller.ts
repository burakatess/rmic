import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditsService } from './audits.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import {
    CreateFindingDto, UpdateFindingDto, CreateActionDto, UpdateActionDto,
    CreateFollowUpDto, UpdateFollowUpDto,
} from './dto';

@ApiTags('Findings')
@ApiBearerAuth('JWT-Auth')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditsController {
    constructor(private auditsService: AuditsService) { }

    // ─── Audit Plans ─────────────────────────────────────────────────────────

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

    // ─── Audit Executions ────────────────────────────────────────────────────

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

    // ─── Findings ────────────────────────────────────────────────────────────

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
    async createFinding(@Body() data: CreateFindingDto, @CurrentUser('id') userId: string) {
        return this.auditsService.createFinding(data, userId);
    }

    @Put('findings/:id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async updateFinding(@Param('id') id: string, @Body() data: UpdateFindingDto, @CurrentUser('id') userId: string) {
        return this.auditsService.updateFinding(id, data, userId);
    }

    @Delete('findings/:id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async deleteFinding(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.auditsService.deleteFinding(id, userId);
    }

    // ─── Mutabakat Workflow Geçişleri ─────────────────────────────────────────

    @Post('findings/:id/workflow/mutabakata-gonder')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async mutabakataGonder(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.auditsService.mutabakataGonder(id, userId);
    }

    @Post('findings/:id/workflow/ic-kontrol-onayina-gonder')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async icKontrolOnayinaGonder(
        @Param('id') id: string,
        @Body() body: { birimCevabi: string; targetResolutionDate?: string },
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.icKontrolOnayinaGonder(id, body.birimCevabi, body.targetResolutionDate, userId);
    }

    @Post('findings/:id/workflow/mutabakat-onayla')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async mutabakatOnayla(
        @Param('id') id: string,
        @Body() body: { internalControlAssessment?: string; resolutionStatus?: string },
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.mutabakatOnayla(id, body, userId);
    }

    @Post('findings/:id/workflow/mutabakat-geri-gonder')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async mutabakatGeriGonder(
        @Param('id') id: string,
        @Body() body: { reason: string },
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.mutabakatGeriGonder(id, body.reason, userId);
    }

    @Post('findings/:id/workflow/iptal-et')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async iptalEt(
        @Param('id') id: string,
        @Body() body: { reason: string },
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.iptalEt(id, body.reason, userId);
    }

    // ─── Risk ↔ Finding Linking ───────────────────────────────────────────────

    @Post('findings/:id/link-risk')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async linkRisk(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
        return this.auditsService.linkRiskToFinding(id, body.riskId, userId);
    }

    @Delete('findings/:id/unlink-risk/:riskId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async unlinkRisk(@Param('id') id: string, @Param('riskId') riskId: string, @CurrentUser('id') userId: string) {
        return this.auditsService.unlinkRiskFromFinding(id, riskId, userId);
    }

    // ─── Finding Follow-Ups ───────────────────────────────────────────────────

    @Get('findings/:id/follow-ups')
    async getFollowUps(@Param('id') id: string) {
        return this.auditsService.getFollowUps(id);
    }

    @Post('findings/:id/follow-ups')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createFollowUp(@Param('id') id: string, @Body() data: CreateFollowUpDto, @CurrentUser('id') userId: string) {
        return this.auditsService.createFollowUp(id, data, userId);
    }

    @Put('findings/:id/follow-ups/:followUpId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async updateFollowUp(
        @Param('id') id: string,
        @Param('followUpId') followUpId: string,
        @Body() data: UpdateFollowUpDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.updateFollowUp(id, followUpId, data, userId);
    }

    @Delete('findings/:id/follow-ups/:followUpId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async deleteFollowUp(
        @Param('id') id: string,
        @Param('followUpId') followUpId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.deleteFollowUp(id, followUpId, userId);
    }

    // ─── Actions (Finding-Scoped) ─────────────────────────────────────────────

    @Get('findings/:id/actions')
    async getActions(@Param('id') id: string) {
        return this.auditsService.getActions(id);
    }

    @Post('findings/:id/actions')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createAction(
        @Param('id') id: string,
        @Body() data: CreateActionDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.createAction(id, data, userId);
    }

    @Put('findings/:id/actions/:actionId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async updateAction(
        @Param('id') id: string,
        @Param('actionId') actionId: string,
        @Body() data: UpdateActionDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.updateAction(id, actionId, data, userId);
    }

    @Delete('findings/:id/actions/:actionId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async deleteAction(
        @Param('id') id: string,
        @Param('actionId') actionId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.deleteAction(id, actionId, userId);
    }

    // ─── Action-Scoped Follow-Up ──────────────────────────────────────────────

    @Post('findings/:id/actions/:actionId/follow-ups')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createFollowUpForAction(
        @Param('id') id: string,
        @Param('actionId') actionId: string,
        @Body() data: any,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.createFollowUpForAction(id, actionId, data, userId);
    }

    // ─── Status History ───────────────────────────────────────────────────────

    @Get('findings/:id/status-history')
    async getStatusHistory(@Param('id') id: string) {
        return this.auditsService.getStatusHistory(id);
    }

    @Post('findings/:id/status-history')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async appendStatusHistory(
        @Param('id') id: string,
        @Body() data: any,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.appendStatusHistory(id, data, userId);
    }

    // ─── Scheduler Trigger (Manual trigger for cron) ─────────────────────────

    @Post('findings/generate-due-followups')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async generateDueFollowUps() {
        return this.auditsService.generateDueFollowUps();
    }

    // ─── Status Logs (Append-only Güncel Durum) ──────────────────────────────

    @Get('findings/:id/status-logs')
    async getStatusLogs(@Param('id') id: string) {
        return this.auditsService.getStatusLogs(id);
    }

    @Post('findings/:id/status-logs')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async appendStatusLog(
        @Param('id') id: string,
        @Body() body: { text: string; authorName?: string },
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.appendStatusLog(id, body.text, userId, body.authorName);
    }

    // ─── Finding Attachments ──────────────────────────────────────────────────

    @Post('findings/:id/attachments')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async addFindingAttachment(
        @Param('id') id: string,
        @Body() meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number },
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.addFindingAttachment(id, meta, userId);
    }

    @Delete('findings/:id/attachments/:attachmentId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async removeFindingAttachment(
        @Param('id') id: string,
        @Param('attachmentId') attachmentId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.removeFindingAttachment(id, attachmentId, userId);
    }

    // ─── Action Attachments ───────────────────────────────────────────────────

    @Post('findings/:id/actions/:actionId/attachments')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async addActionAttachment(
        @Param('id') id: string,
        @Param('actionId') actionId: string,
        @Body() meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number },
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.addActionAttachment(id, actionId, meta, userId);
    }

    @Delete('findings/:id/actions/:actionId/attachments/:attachmentId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async removeActionAttachment(
        @Param('id') id: string,
        @Param('actionId') actionId: string,
        @Param('attachmentId') attachmentId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.removeActionAttachment(id, actionId, attachmentId, userId);
    }

    // ─── FollowUp Attachments ─────────────────────────────────────────────────

    @Post('findings/:id/follow-ups/:followUpId/attachments')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async addFollowUpAttachment(
        @Param('id') id: string,
        @Param('followUpId') followUpId: string,
        @Body() meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number },
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.addFollowUpAttachment(id, followUpId, meta, userId);
    }

    @Delete('findings/:id/follow-ups/:followUpId/attachments/:attachmentId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async removeFollowUpAttachment(
        @Param('id') id: string,
        @Param('followUpId') followUpId: string,
        @Param('attachmentId') attachmentId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.removeFollowUpAttachment(id, followUpId, attachmentId, userId);
    }

    // ─── Bağımsız Follow-Ups Listesi ─────────────────────────────────────────

    @Get('follow-ups')
    async findAllFollowUps(@Query() query: any) {
        return this.auditsService.findAllFollowUps(query);
    }
}
