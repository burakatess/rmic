import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditsService } from './audits.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser, RequireAnyPermission } from '../../common/decorators';
import { CreateAttachmentDto, UpdateAttachmentDto } from '../../common/dto/attachment.dto';
import { AccessScopeService, findingFullWhere, followUpWhere, actionWhere } from '../../common/services/access-scope.service';
import type { AccessActor } from '../../common/services/access-scope.service';
import { projectPartialFinding } from './finding-access.projection';
import { withCapabilities } from './finding-capabilities';
import { FindingWriteScope, FindingWriteScopeGuard } from './finding-write-scope.guard';
import {
    CreateFindingDto, UpdateFindingDto, CreateActionDto, UpdateActionDto,
    CreateFollowUpDto, UpdateFollowUpDto, AssignSecondControllerDto, ReassignFollowUpAssigneeDto, WorkflowReasonDto,
    AppendStatusNoteDto, CreateActionFollowUpDto, LinkRiskDto,
} from './dto';

import { CreateAuditExecutionDto, CreateAuditPlanDto, UpdateAuditExecutionDto, UpdateAuditPlanDto } from './dto/audit-plan.dto';
import { AppendStatusLogDto, IcKontrolOnayinaGonderDto, MutabakatOnaylaDto } from '../../common/dto/misc-bodies.dto';
@ApiTags('Findings')
@ApiBearerAuth('JWT-Auth')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, FindingWriteScopeGuard)
export class AuditsController {
    constructor(private auditsService: AuditsService, private scope: AccessScopeService) { }

    // Bulgu kimliğiyle açılan okuma uçları için kapsam kapısı. Kapsam dışı → 404
    // (varlık açıklanmaz). Yalnız bir aksiyona/takibe atanmış kullanıcı (PARTIAL)
    // yalnız izin verilen uçlarda, kendi iş kalemleriyle sınırlı görür.
    private async findingGate(user: AccessActor, id: string, allowPartial: boolean) {
        const ctx = await this.scope.context(user);
        const level = await this.scope.findingAccess(ctx, id);
        if (level === 'NONE') throw new NotFoundException('Bulgu bulunamadı');
        if (level === 'PARTIAL' && !allowPartial) {
            throw new ForbiddenException('Bu bulgunun yalnız size atanmış iş kalemlerini görüntüleyebilirsiniz.');
        }
        return { ctx, level };
    }

    // ─── Audit Plans ─────────────────────────────────────────────────────────

    @Get('audit-plans')
    async findAllPlans(@Query() query: any) {
        return this.auditsService.findAllPlans(query);
    }

    @Get('audit-plans/:id')
    async findPlanById(@Param('id') id: string) {
        return this.auditsService.findPlanById(id);
    }

    @Post('audit-plans')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createPlan(@Body() data: CreateAuditPlanDto, @CurrentUser('id') userId: string) {
        return this.auditsService.createPlan(data, userId);
    }

    @Put('audit-plans/:id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async updatePlan(@Param('id') id: string, @Body() data: UpdateAuditPlanDto, @CurrentUser('id') userId: string) {
        return this.auditsService.updatePlan(id, data, userId);
    }

    // ─── Audit Executions ────────────────────────────────────────────────────

    @Get('audit-executions')
    async findAllExecutions(@Query() query: any) {
        return this.auditsService.findAllExecutions(query);
    }

    @Post('audit-executions')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createExecution(@Body() data: CreateAuditExecutionDto, @CurrentUser('id') userId: string) {
        return this.auditsService.createExecution(data, userId);
    }

    @Put('audit-executions/:id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async updateExecution(@Param('id') id: string, @Body() data: UpdateAuditExecutionDto, @CurrentUser('id') userId: string) {
        return this.auditsService.updateExecution(id, data, userId);
    }

    // ─── Findings ────────────────────────────────────────────────────────────

    @Get('findings')
    async findAllFindings(@Query() query: any, @CurrentUser() user: AccessActor) {
        const ctx = await this.scope.context(user);
        return this.auditsService.findAllFindings(query, user.id, findingFullWhere(ctx));
    }

    @Get('findings/:id/relations')
    async getFindingRelations(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        await this.findingGate(user, id, false);
        return this.auditsService.getFindingRelations(id);
    }

    @Get('findings/:id')
    async getFinding(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        const { level } = await this.findingGate(user, id, true);
        const finding = await this.auditsService.getFinding(id);
        const view = level === 'PARTIAL' ? projectPartialFinding(finding, user.id) : finding;
        return withCapabilities(view, user, level === 'PARTIAL' ? 'PARTIAL' : 'FULL');
    }

    @Post('findings')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createFinding(@Body() data: CreateFindingDto, @CurrentUser('id') userId: string) {
        return this.auditsService.createFinding(data, userId);
    }

    @FindingWriteScope()
    @Put('findings/:id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async updateFinding(@Param('id') id: string, @Body() data: UpdateFindingDto, @CurrentUser('id') userId: string) {
        return this.auditsService.updateFinding(id, data, userId);
    }

    // Bulgu doğrudan silinmez: silme talebi açılır, yönetici (talep eden hariç) onaylayınca bulgu
    // iptal edilir (kayıt korunur). Gerekçe zorunludur. Karar: POST /deletion-requests/FINDING/:id/approve|reject
    @FindingWriteScope()
    @Delete('findings/:id')
    @RequireAnyPermission('finding:delete', 'finding:delete:own', 'finding:update')
    async deleteFinding(@Param('id') id: string, @Body() body: WorkflowReasonDto, @CurrentUser('id') userId: string) {
        return this.auditsService.requestFindingDeletion(id, body?.reason ?? '', userId);
    }

    // ─── Mutabakat Workflow Geçişleri ─────────────────────────────────────────

    @FindingWriteScope()
    @Post('findings/:id/workflow/mutabakata-gonder')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async mutabakataGonder(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.auditsService.mutabakataGonder(id, userId);
    }

    @FindingWriteScope()
    @Post('findings/:id/workflow/ic-kontrol-onayina-gonder')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async icKontrolOnayinaGonder(
        @Param('id') id: string,
        @Body() body: IcKontrolOnayinaGonderDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.icKontrolOnayinaGonder(id, body.birimCevabi, body.targetResolutionDate, userId);
    }

    @FindingWriteScope()
    @Post('findings/:id/workflow/mutabakat-onayla')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async mutabakatOnayla(
        @Param('id') id: string,
        @Body() body: MutabakatOnaylaDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.mutabakatOnayla(id, body, userId);
    }

    @FindingWriteScope()
    @Post('findings/:id/workflow/mutabakat-geri-gonder')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async mutabakatGeriGonder(
        @Param('id') id: string,
        @Body() body: WorkflowReasonDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.mutabakatGeriGonder(id, body.reason, userId);
    }

    @FindingWriteScope()
    @Post('findings/:id/workflow/iptal-et')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async iptalEt(
        @Param('id') id: string,
        @Body() body: WorkflowReasonDto,
        @CurrentUser('id') userId: string,
    ) {
        // İptal = silme: yönetici onaylı talep açar (doğrudan iptal edilmez).
        return this.auditsService.requestFindingDeletion(id, body.reason, userId);
    }

    // Onaylı kapanış — tüm aksiyonlar KAPATILDI + gerekçe (Madde 3).
    @FindingWriteScope()
    @Post('findings/:id/workflow/kapat')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async closeFinding(
        @Param('id') id: string,
        @Body() body: WorkflowReasonDto,
        @CurrentUser('id') userId: string,
    ) {
        // Artık doğrudan kapatmaz: kapanış değerlendirmesine gönderir (2. kontrolcü/yönetici onaylar).
        return this.auditsService.closeFinding(id, body?.reason, userId);
    }

    // Yeniden açma — gerekçeli, yetkili, loglanan ayrı işlem (Madde 3).
    @FindingWriteScope()
    @Post('findings/:id/workflow/yeniden-ac')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async reopenFinding(
        @Param('id') id: string,
        @Body() body: WorkflowReasonDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.reopenFinding(id, body?.reason, userId);
    }

    // ─── Risk ↔ Finding Linking ───────────────────────────────────────────────

    @FindingWriteScope()
    @Post('findings/:id/link-risk')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async linkRisk(@Param('id') id: string, @Body() body: LinkRiskDto, @CurrentUser('id') userId: string) {
        return this.auditsService.linkRiskToFinding(id, body.riskId, userId);
    }

    @FindingWriteScope()
    @Delete('findings/:id/unlink-risk/:riskId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async unlinkRisk(@Param('id') id: string, @Param('riskId') riskId: string, @CurrentUser('id') userId: string) {
        return this.auditsService.unlinkRiskFromFinding(id, riskId, userId);
    }

    // ─── Finding Follow-Ups ───────────────────────────────────────────────────

    @Get('findings/:id/follow-ups')
    async getFollowUps(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        const { ctx, level } = await this.findingGate(user, id, true);
        return this.auditsService.getFollowUps(id, level === 'PARTIAL' ? followUpWhere({ ...ctx, orgModules: new Set() }) : null);
    }

    @FindingWriteScope()
    @Post('findings/:id/follow-ups')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createFollowUp(@Param('id') id: string, @Body() data: CreateFollowUpDto, @CurrentUser('id') userId: string) {
        return this.auditsService.createFollowUp(id, data, userId);
    }

    @FindingWriteScope('follow-up')
    @Put('findings/:id/follow-ups/:followUpId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async updateFollowUp(
        @Param('id') id: string,
        @Param('followUpId') followUpId: string,
        @Body() data: UpdateFollowUpDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.auditsService.updateFollowUp(id, followUpId, data, userId, userRole);
    }

    // İkinci kontrolcü ataması — genel güncellemeden ayrı, gerekçeli, loglanan işlem (Madde 4).
    @FindingWriteScope()
    @Post('findings/:id/follow-ups/:followUpId/second-controller')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async assignSecondController(
        @Param('id') id: string,
        @Param('followUpId') followUpId: string,
        @Body() body: AssignSecondControllerDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.auditsService.assignSecondController(id, followUpId, body, userId, userRole);
    }

    @Get('findings/:id/follow-ups/:followUpId/assignee-candidates')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async getFollowUpAssigneeCandidates(@Param('id') id: string, @Param('followUpId') followUpId: string, @CurrentUser() user: AccessActor) {
        await this.findingGate(user, id, false);
        return this.auditsService.getFollowUpAssigneeCandidates(id, followUpId);
    }

    // Birinci kontrolcü (maker) yeniden atama — pasife alınan/ayrılan atanan için çıkış yolu.
    @FindingWriteScope()
    @Post('findings/:id/follow-ups/:followUpId/assignee')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async reassignFollowUpAssignee(
        @Param('id') id: string,
        @Param('followUpId') followUpId: string,
        @Body() body: ReassignFollowUpAssigneeDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.auditsService.reassignFollowUpAssignee(id, followUpId, body, userId, userRole);
    }

    @FindingWriteScope('follow-up')
    @Delete('findings/:id/follow-ups/:followUpId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async deleteFollowUp(
        @Param('id') id: string,
        @Param('followUpId') followUpId: string,
        @Body() body: WorkflowReasonDto,
        @CurrentUser('id') userId: string,
    ) {
        // Doğrudan silme yok: ikinci kontrolcü onayına silme talebi açılır.
        return this.auditsService.deleteFollowUp(id, followUpId, userId, body?.reason);
    }

    // ── Takip çalışması: onayı geri alma ve onaylı silme (kontrolcü kimliği serviste doğrulanır) ──
    @FindingWriteScope()
    @Post('findings/:id/follow-ups/:followUpId/revert')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    revertFollowUp(@Param('id') id: string, @Param('followUpId') followUpId: string, @Body() body: WorkflowReasonDto, @CurrentUser('id') userId: string) {
        return this.auditsService.revertFollowUp(id, followUpId, body.reason, userId);
    }

    @FindingWriteScope('follow-up')
    @Post('findings/:id/follow-ups/:followUpId/delete-request')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    requestFollowUpDeletion(@Param('id') id: string, @Param('followUpId') followUpId: string, @Body() body: WorkflowReasonDto, @CurrentUser('id') userId: string) {
        return this.auditsService.requestFollowUpDeletion(id, followUpId, body.reason, userId);
    }

    @FindingWriteScope()
    @Post('findings/:id/follow-ups/:followUpId/delete-approve')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    approveFollowUpDeletion(@Param('id') id: string, @Param('followUpId') followUpId: string, @CurrentUser('id') userId: string) {
        return this.auditsService.decideFollowUpDeletion(id, followUpId, true, undefined, userId);
    }

    @FindingWriteScope()
    @Post('findings/:id/follow-ups/:followUpId/delete-reject')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    rejectFollowUpDeletion(@Param('id') id: string, @Param('followUpId') followUpId: string, @Body() body: WorkflowReasonDto, @CurrentUser('id') userId: string) {
        return this.auditsService.decideFollowUpDeletion(id, followUpId, false, body.reason, userId);
    }

    // ─── Actions (Finding-Scoped) ─────────────────────────────────────────────

    @Get('findings/:id/actions')
    async getActions(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        const { ctx, level } = await this.findingGate(user, id, true);
        return this.auditsService.getActions(id, level === 'PARTIAL' ? actionWhere({ ...ctx, orgModules: new Set() }) : null);
    }

    @FindingWriteScope()
    @Post('findings/:id/actions')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createAction(
        @Param('id') id: string,
        @Body() data: CreateActionDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.auditsService.createAction(id, data, userId, undefined, { actorRole: userRole ?? '' });
    }

    @FindingWriteScope()
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

    @FindingWriteScope()
    @Delete('findings/:id/actions/:actionId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async deleteAction(
        @Param('id') id: string,
        @Param('actionId') actionId: string,
        @Body() body: WorkflowReasonDto,
        @CurrentUser('id') userId: string,
    ) {
        // Doğrudan silme yok: ikinci kontrolcü onayına silme talebi açılır.
        return this.auditsService.deleteAction(id, actionId, userId, body?.reason);
    }

    // ── Aksiyon maker-checker: birinci kontrolcü onaya gönderir / silme talep eder;
    // ikinci kontrolcü onaylar, gerekçeyle reddeder, onayı geri alır, silmeyi sonuçlandırır.
    // Kontrolcü kimliği serviste doğrulanır (rol tek başına yetmez).
    @FindingWriteScope()
    @Post('findings/:id/actions/:actionId/submit')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    submitAction(@Param('id') id: string, @Param('actionId') actionId: string, @CurrentUser('id') userId: string) {
        return this.auditsService.submitAction(id, actionId, userId);
    }

    @FindingWriteScope()
    @Post('findings/:id/actions/:actionId/approve')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    approveActionApproval(@Param('id') id: string, @Param('actionId') actionId: string, @CurrentUser('id') userId: string) {
        return this.auditsService.approveAction(id, actionId, userId);
    }

    @FindingWriteScope()
    @Post('findings/:id/actions/:actionId/reject')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    rejectActionApproval(@Param('id') id: string, @Param('actionId') actionId: string, @Body() body: WorkflowReasonDto, @CurrentUser('id') userId: string) {
        return this.auditsService.rejectAction(id, actionId, body.reason, userId);
    }

    @FindingWriteScope()
    @Post('findings/:id/actions/:actionId/revert')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    revertActionApproval(@Param('id') id: string, @Param('actionId') actionId: string, @Body() body: WorkflowReasonDto, @CurrentUser('id') userId: string) {
        return this.auditsService.revertAction(id, actionId, body.reason, userId);
    }

    @FindingWriteScope()
    @Post('findings/:id/actions/:actionId/delete-request')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    requestActionDeletion(@Param('id') id: string, @Param('actionId') actionId: string, @Body() body: WorkflowReasonDto, @CurrentUser('id') userId: string) {
        return this.auditsService.requestActionDeletion(id, actionId, body.reason, userId);
    }

    @FindingWriteScope()
    @Post('findings/:id/actions/:actionId/delete-approve')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    approveActionDeletion(@Param('id') id: string, @Param('actionId') actionId: string, @CurrentUser('id') userId: string) {
        return this.auditsService.decideActionDeletion(id, actionId, true, undefined, userId);
    }

    @FindingWriteScope()
    @Post('findings/:id/actions/:actionId/delete-reject')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    rejectActionDeletion(@Param('id') id: string, @Param('actionId') actionId: string, @Body() body: WorkflowReasonDto, @CurrentUser('id') userId: string) {
        return this.auditsService.decideActionDeletion(id, actionId, false, body.reason, userId);
    }

    // ─── Action-Scoped Follow-Up ──────────────────────────────────────────────

    @FindingWriteScope()
    @Post('findings/:id/actions/:actionId/follow-ups')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createFollowUpForAction(
        @Param('id') id: string,
        @Param('actionId') actionId: string,
        @Body() data: CreateActionFollowUpDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.createFollowUpForAction(id, actionId, data, userId);
    }

    // ─── Status History ───────────────────────────────────────────────────────

    @Get('findings/:id/status-history')
    async getStatusHistory(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        await this.findingGate(user, id, false);
        return this.auditsService.getStatusHistory(id);
    }

    @FindingWriteScope()
    @Post('findings/:id/status-history')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async appendStatusHistory(
        @Param('id') id: string,
        @Body() data: AppendStatusNoteDto,
        @CurrentUser('id') userId: string,
    ) {
        // Yalnız serbest not alanları servis tarafına geçer.
        return this.auditsService.appendStatusHistory(id, {
            explanation: data.explanation,
            evidenceLinks: data.evidenceLinks,
            result: data.result,
            changeType: 'MANUAL_NOTE',
        }, userId);
    }

    // ─── Scheduler Trigger (Manual trigger for cron) ─────────────────────────

    @Post('findings/generate-due-followups')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    async generateDueFollowUps(@CurrentUser('id') userId: string) {
        return this.auditsService.generateDueFollowUps('manual', userId);
    }

    // ─── Status Logs (Append-only Güncel Durum) ──────────────────────────────

    @Get('findings/:id/status-logs')
    async getStatusLogs(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        await this.findingGate(user, id, false);
        return this.auditsService.getStatusLogs(id);
    }

    @FindingWriteScope()
    @Post('findings/:id/status-logs')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async appendStatusLog(
        @Param('id') id: string,
        @Body() body: AppendStatusLogDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.appendStatusLog(id, body.text, userId);
    }

    // ─── Finding Attachments ──────────────────────────────────────────────────

    @FindingWriteScope()
    @Post('findings/:id/attachments')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async addFindingAttachment(
        @Param('id') id: string,
        @Body() meta: CreateAttachmentDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.addFindingAttachment(id, meta, userId);
    }

    @FindingWriteScope()
    @Patch('findings/:id/attachments/:attachmentId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    updateFindingAttachment(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @Body() dto: UpdateAttachmentDto, @CurrentUser('id') userId: string) {
        return this.auditsService.updateAttachmentMetadata('finding', id, attachmentId, dto, userId);
    }

    @FindingWriteScope()
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

    @FindingWriteScope()
    @Post('findings/:id/actions/:actionId/attachments')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async addActionAttachment(
        @Param('id') id: string,
        @Param('actionId') actionId: string,
        @Body() meta: CreateAttachmentDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.addActionAttachment(id, actionId, meta, userId);
    }

    @FindingWriteScope()
    @Patch('findings/:id/actions/:actionId/attachments/:attachmentId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    updateActionAttachment(@Param('id') id: string, @Param('actionId') actionId: string, @Param('attachmentId') attachmentId: string, @Body() dto: UpdateAttachmentDto, @CurrentUser('id') userId: string) {
        return this.auditsService.updateAttachmentMetadata('action', id, attachmentId, dto, userId, actionId);
    }

    @FindingWriteScope()
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

    @FindingWriteScope('follow-up')
    @Post('findings/:id/follow-ups/:followUpId/attachments')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async addFollowUpAttachment(
        @Param('id') id: string,
        @Param('followUpId') followUpId: string,
        @Body() meta: CreateAttachmentDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.auditsService.addFollowUpAttachment(id, followUpId, meta, userId);
    }

    @FindingWriteScope('follow-up')
    @Patch('findings/:id/follow-ups/:followUpId/attachments/:attachmentId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    updateFollowUpAttachment(@Param('id') id: string, @Param('followUpId') followUpId: string, @Param('attachmentId') attachmentId: string, @Body() dto: UpdateAttachmentDto, @CurrentUser('id') userId: string) {
        return this.auditsService.updateAttachmentMetadata('follow-up', id, attachmentId, dto, userId, followUpId);
    }

    @FindingWriteScope('follow-up')
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
    async findAllFollowUps(@Query() query: any, @CurrentUser() user: AccessActor) {
        const ctx = await this.scope.context(user);
        return this.auditsService.findAllFollowUps(query, user.id, followUpWhere(ctx));
    }
}
