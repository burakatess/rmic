import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { controlTestCapabilities } from './control-test-capabilities';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ControlsService } from './controls.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser, RequirePermissions, RequireAnyPermission } from '../../common/decorators';
import { CreateAttachmentDto, UpdateAttachmentDto } from '../../common/dto/attachment.dto';
import { AccessScopeService, actionWhere, controlTestWhere, findingFullWhere, riskWhere } from '../../common/services/access-scope.service';
import type { AccessActor, AccessContext } from '../../common/services/access-scope.service';
import type { RelatedScopes } from './controls.service';
import { CompleteControlTestDto, CreateControlDto, CreateControlTestDto, UpdateControlDto, SaveTestDraftDto } from './dto';

@ApiTags('Controls')
@ApiBearerAuth('JWT-Auth')
@Controller('controls')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ControlsController {
    constructor(private controlsService: ControlsService, private scope: AccessScopeService) { }

    private related(ctx: AccessContext): RelatedScopes {
        return { test: controlTestWhere(ctx), finding: findingFullWhere(ctx), action: actionWhere(ctx), risk: riskWhere(ctx) };
    }

    // Kontrol Havuzu: control:view izni olan herkese kurum geneli açık.
    private async poolContext(user: AccessActor): Promise<AccessContext> {
        const ctx = await this.scope.context(user);
        this.scope.assertViewPermission(ctx, 'control:view', 'Kontrol Havuzu görüntüleme yetkiniz yok.');
        return ctx;
    }

    // Test yaşam döngüsü yazma uçları: detay ucuyla aynı kayıt kapsamı (birim/atanmış).
    private async assertTestAccess(user: AccessActor, testId: string): Promise<void> {
        await this.scope.assertControlTestAccess(await this.scope.context(user), testId);
    }

    // ─── Controls ─────────────────────────────────────────────────────────────

    @Get()
    async findAll(@Query() query: any, @CurrentUser() user: AccessActor) {
        return this.controlsService.findAll(query, this.related(await this.poolContext(user)));
    }

    // ─── ControlTests (literal path — :id'den ÖNCE olmalı, NestJS route order) ─
    @Get('tests')
    async getAllTests(@Query() query: any, @CurrentUser() user: AccessActor) {
        const ctx = await this.scope.context(user);
        return this.controlsService.getAllTests(query, user.id, controlTestWhere(ctx));
    }

    // Kontrol Testi çalışma sayfası — tekil, tam detaylı kayıt (deep link/yenileme için)
    @Get('tests/:testId')
    async getTestById(@Param('testId') testId: string, @CurrentUser() user: AccessActor) {
        const ctx = await this.scope.context(user);
        await this.scope.assertControlTestAccess(ctx, testId);
        const test = await this.controlsService.getTestById(testId, this.related(ctx));
        return { ...test, capabilities: controlTestCapabilities(test, user) };
    }

    @Patch('tests/:testId/draft')
    @RequireAnyPermission('control:test', 'test:execute')
    async saveDraft(@Param('testId') testId: string, @Body() data: SaveTestDraftDto, @CurrentUser() user: AccessActor) {
        await this.assertTestAccess(user, testId);
        return this.controlsService.saveDraft(testId, data, user.id);
    }

    @Patch('tests/:testId/start')
    @RequireAnyPermission('control:test', 'test:execute')
    async startTest(@Param('testId') testId: string, @CurrentUser() user: AccessActor) {
        await this.assertTestAccess(user, testId);
        return this.controlsService.startTest(testId, user.id);
    }

    @Patch('tests/:testId/complete')
    @RequireAnyPermission('control:test', 'test:execute')
    async completeTest(@Param('testId') testId: string, @Body() data: CompleteControlTestDto, @CurrentUser() user: AccessActor) {
        await this.assertTestAccess(user, testId);
        return this.controlsService.completeTest(testId, data, user.id);
    }

    @Get('tests/:testId/open-finding-references')
    async getOpenFindingReferences(@Param('testId') testId: string, @CurrentUser() user: AccessActor) {
        const ctx = await this.scope.context(user);
        await this.scope.assertControlTestAccess(ctx, testId);
        return this.controlsService.getOpenFindingReferences(testId, findingFullWhere(ctx));
    }

    @Patch('tests/:testId/approve')
    @RequirePermissions('control:approve')
    async approveTest(@Param('testId') testId: string, @CurrentUser() user: AccessActor) {
        await this.assertTestAccess(user, testId);
        return this.controlsService.approveTest(testId, user.id);
    }

    @Patch('tests/:testId/return')
    @RequirePermissions('control:approve')
    async returnTest(
        @Param('testId') testId: string,
        @Body('reason') reason: string,
        @CurrentUser() user: AccessActor,
    ) {
        await this.assertTestAccess(user, testId);
        return this.controlsService.returnTest(testId, reason, user.id);
    }

    // Repo deseni: "submit-approval" ayrı bir iş kuralı değil, mevcut "complete" ile
    // eşdeğer (test tamamlanınca zaten onaya düşüyor) — endpoint tekilliği için alias.
    @Patch('tests/:testId/submit-approval')
    @RequireAnyPermission('control:test', 'test:execute')
    async submitApproval(@Param('testId') testId: string, @Body() data: CompleteControlTestDto, @CurrentUser() user: AccessActor) {
        await this.assertTestAccess(user, testId);
        return this.controlsService.completeTest(testId, data, user.id);
    }

    @Patch('tests/:testId/cancel-final')
    @Roles('SYSTEM_ADMIN') // final onay iptali yalnız sistem yöneticisi (yetki genişletilmedi)
    async cancelFinal(
        @Param('testId') testId: string,
        @Body('reason') reason: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.controlsService.cancelFinalApproval(testId, reason, userId);
    }

    @Post('tests/:testId/attachments')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async addTestAttachment(
        @Param('testId') testId: string,
        @Body() meta: CreateAttachmentDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.controlsService.addControlTestAttachment(testId, meta, userId);
    }

    @Patch('tests/:testId/attachments/:attachmentId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    updateTestAttachment(@Param('testId') testId: string, @Param('attachmentId') attachmentId: string, @Body() dto: UpdateAttachmentDto, @CurrentUser('id') userId: string) {
        return this.controlsService.updateControlTestAttachment(testId, attachmentId, dto, userId);
    }

    @Delete('tests/:testId/attachments/:attachmentId')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async removeTestAttachment(
        @Param('testId') testId: string,
        @Param('attachmentId') attachmentId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.controlsService.removeControlTestAttachment(testId, attachmentId, userId);
    }

    @Get(':id/relations')
    async getRelations(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        return this.controlsService.getRelations(id, this.related(await this.poolContext(user)));
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        return this.controlsService.findOne(id, this.related(await this.poolContext(user)));
    }

    @Post()
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async create(@Body() data: CreateControlDto, @CurrentUser('id') userId: string) {
        return this.controlsService.create(data, userId);
    }

    @Put(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async update(@Param('id') id: string, @Body() data: UpdateControlDto, @CurrentUser('id') userId: string) {
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

    // Kalıcı silme endpoint'i kaldırıldı — Control ana envanterdir, yerine
    // PATCH :id/passivate kullanılır (bkz. plan "KONTROL ENVANTERİ").

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

    // ─── ControlTests (Per-Control) ───────────────────────────────────────────

    @Get(':id/tests')
    async getTests(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        return this.controlsService.getTests(id, this.related(await this.scope.context(user)));
    }

    @Post(':id/tests')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createTest(@Param('id') id: string, @Body() data: CreateControlTestDto, @CurrentUser('id') userId: string) {
        return this.controlsService.createTest(id, data, userId);
    }

    // Legacy: POST :id/test — backward compat
    @Post(':id/test')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createTestLegacy(@Param('id') id: string, @Body() data: CreateControlTestDto, @CurrentUser('id') userId: string) {
        return this.controlsService.createTest(id, data, userId);
    }
}
