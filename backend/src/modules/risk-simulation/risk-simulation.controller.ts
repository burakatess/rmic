import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles, RequirePermissions, RequireAnyPermission } from '../../common/decorators';
import { RiskSimulationService } from './risk-simulation.service';
import { TransferService } from './transfer.service';
import { WorkspaceService } from './workspace.service';
import { WorkspaceExcelService } from './workspace-excel.service';
import { WorkspaceTestService } from './workspace-test.service';
import { MethodologyService } from './methodology.service';
import { WorkspaceTransferService } from './workspace-transfer.service';
import type { AccessActor } from '../../common/services/access-scope.service';
import {
    CreateRiskSimulationDto, UpdateRiskSimulationDto, CreateScenarioDto, UpdateScenarioDto,
    CreateScenarioControlDto, UpdateScenarioControlDto, RedistributeWeightsDto,
    CreateScenarioActionDto, UpdateScenarioActionDto, ToggleScenarioActionDto, TransferDto, ImportWorkspaceDto, StartSimulationTestDto, OpenLiveWorkspaceDto, SaveWorkspaceDto, DeleteSimulationsDto,
    PublishMethodologyDto, TrialMethodologyDto, TransferPreviewDto, CreateTransferRequestDto, TransferDecisionDto,
} from './dto';
import { RefreshApplyDto } from '../../common/dto/misc-bodies.dto';

// Ürün kararı (2026-11-16): Risk Simülasyonu, Risk Yönetimi modülünü (risk:view) gören herkese
// açıktır — görüntüleme, oluşturma, düzenleme, kaydetme ve silme dahil; kayıtlı simülasyonları
// herkes görür. Bu nedenle CLAUDE.md'deki "yazma/silme için @Roles" kuralı bu uçlarda bilinçli
// olarak uygulanmaz; erişim izinle (risk:sim:* veya risk:view) denetlenir. Envantere aktarma
// gerçek envantere yazdığı için rol + risk:sim:transfer ile kısıtlı kalır.
const SIM = {
    view: () => RequireAnyPermission('risk:sim:view', 'risk:view'),
    create: () => RequireAnyPermission('risk:sim:create', 'risk:view'),
    edit: () => RequireAnyPermission('risk:sim:edit', 'risk:view'),
    delete: () => RequireAnyPermission('risk:sim:delete', 'risk:view'),
};
const TRANSFER_ROLES = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER'];

@ApiTags('Risk Simulation')
@ApiBearerAuth('JWT-Auth')
@Controller('risk-simulations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RiskSimulationController {
    constructor(
        private simService: RiskSimulationService,
        private transferService: TransferService,
        private workspaceService: WorkspaceService,
        private workspaceExcel: WorkspaceExcelService,
        private workspaceTests: WorkspaceTestService,
        private methodology: MethodologyService,
        private workspaceTransfer: WorkspaceTransferService,
    ) { }

    // ── Çalışma alanı (risk kütüğünün tamamı) ──
    // Kapsamdaki riskler (kayıt kapsamı) ve Kontrol Alanı kontrolleriyle oluşturulur.
    @Post('workspaces')
    @SIM.create()
    createWorkspace(@Body() dto: CreateRiskSimulationDto, @CurrentUser() actor: AccessActor) {
        return this.workspaceService.createWorkspace(dto, actor);
    }

    // ── Metodoloji: resmî sürümler (yalnız Sistem Yöneticisi yayınlar) ve simülasyon içi deneme ──
    @Get('methodologies')
    @SIM.view()
    listMethodologies() {
        return this.methodology.listOfficial();
    }

    @Post('methodologies')
    @Roles('SYSTEM_ADMIN')
    @SIM.edit()
    publishMethodology(@Body() dto: PublishMethodologyDto, @CurrentUser('id') userId: string) {
        return this.methodology.publish(dto.settings, dto.changeNote, userId);
    }

    @Get('workspaces/:id/methodology')
    @SIM.view()
    workspaceMethodology(@Param('id') id: string) {
        return this.methodology.forSimulation(id);
    }

    @Post('workspaces/:id/methodology/trial')
    @SIM.edit()
    trialMethodology(@Param('id') id: string, @Body() dto: TrialMethodologyDto, @CurrentUser('id') userId: string) {
        return this.methodology.setTrial(id, dto.settings, dto.note, userId);
    }

    @Post('workspaces/:id/methodology/official')
    @SIM.edit()
    officialMethodology(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.methodology.useOfficial(id, userId);
    }

    // ── Envantere aktarım (iki aşamalı): talep herkes, onay/ret yetkili rol ──
    @Post('workspaces/:id/transfer-preview')
    @SIM.view()
    workspaceTransferPreview(@Param('id') id: string, @Body() dto: TransferPreviewDto) {
        return this.workspaceTransfer.preview(id, dto.scenarioIds);
    }

    @Post('workspaces/:id/transfer-requests')
    @SIM.edit()
    createTransferRequest(@Param('id') id: string, @Body() dto: CreateTransferRequestDto, @CurrentUser('id') userId: string) {
        return this.workspaceTransfer.createRequest(id, dto.scenarioIds, dto.note, userId);
    }

    @Get('transfer-requests')
    @SIM.view()
    listTransferRequests(@Query('status') status?: string) {
        const allowed = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
        return this.workspaceTransfer.list(status && allowed.includes(status) ? status : undefined);
    }

    @Get('transfer-requests/:rid')
    @SIM.view()
    getTransferRequest(@Param('rid') rid: string) {
        return this.workspaceTransfer.get(rid);
    }

    @Post('transfer-requests/:rid/approve')
    @Roles(...TRANSFER_ROLES)
    @RequirePermissions('risk:sim:transfer')
    approveTransferRequest(@Param('rid') rid: string, @Body() dto: TransferDecisionDto, @CurrentUser('id') userId: string) {
        return this.workspaceTransfer.approve(rid, dto.note, userId);
    }

    @Post('transfer-requests/:rid/reject')
    @Roles(...TRANSFER_ROLES)
    @RequirePermissions('risk:sim:transfer')
    rejectTransferRequest(@Param('rid') rid: string, @Body() dto: TransferDecisionDto, @CurrentUser('id') userId: string) {
        return this.workspaceTransfer.reject(rid, dto.note, userId);
    }

    @Post('transfer-requests/:rid/cancel')
    @SIM.edit()
    cancelTransferRequest(@Param('rid') rid: string, @CurrentUser('id') userId: string) {
        return this.workspaceTransfer.cancel(rid, userId);
    }

    // Güncel simülatör: Risk Envanteri + Kontrol Alanı'nın şimdiki hali (kullanıcı başına taslak).
    @Post('workspaces/live')
    @SIM.create()
    openLive(@Body() dto: OpenLiveWorkspaceDto, @CurrentUser() actor: AccessActor) {
        return this.workspaceService.openLive(actor, !!dto.refresh);
    }

    @Post('workspaces/:id/save')
    @SIM.create()
    saveWorkspace(@Param('id') id: string, @Body() dto: SaveWorkspaceDto, @CurrentUser() actor: AccessActor) {
        return this.workspaceService.saveDraft(id, dto, actor);
    }

    // Toplu silme. Envantere aktarım yapılmış simülasyonlar silinmez (servis).
    @Post('bulk-delete')
    @SIM.delete()
    bulkDelete(@Body() dto: DeleteSimulationsDto, @CurrentUser() actor: AccessActor) {
        return this.workspaceService.deleteMany(dto.ids, actor);
    }

    // Excel'den yeni çalışma alanı. Dosya tarayıcıda okunur; burada yalnız doğrulanmış satırlar
    // işlenir. dryRun=true → yalnız kontrol raporu (yazma yok).
    @Post('workspaces/import')
    @SIM.create()
    importWorkspace(@Body() dto: ImportWorkspaceDto, @CurrentUser() actor: AccessActor) {
        return this.workspaceExcel.importWorkspace(dto, actor);
    }

    // GRC kolonlarıyla Risk/Kontrol tabloları (simülasyon sonuçları hesaplanmış).
    @Get('workspaces/:id/tables')
    @SIM.view()
    getWorkspaceTables(@Param('id') id: string) {
        return this.workspaceExcel.getTables(id);
    }

    // ── Simülasyon testi: başlangıç anı kaydedilir, sonraki değişiklikler raporlanır ──
    @Get('workspaces/:id/tests')
    @SIM.view()
    listTests(@Param('id') id: string) {
        return this.workspaceTests.list(id);
    }

    @Post('workspaces/:id/tests')
    @SIM.edit()
    startTest(@Param('id') id: string, @Body() dto: StartSimulationTestDto, @CurrentUser('id') userId: string) {
        return this.workspaceTests.start(id, dto.name, userId);
    }

    @Post('workspaces/:id/tests/:tid/finish')
    @SIM.edit()
    finishTest(@Param('id') id: string, @Param('tid') tid: string, @CurrentUser('id') userId: string) {
        return this.workspaceTests.finish(id, tid, userId);
    }

    @Post('workspaces/:id/tests/:tid/reset')
    @SIM.edit()
    resetTest(@Param('id') id: string, @Param('tid') tid: string, @CurrentUser('id') userId: string) {
        return this.workspaceTests.reset(id, tid, userId);
    }

    @Get('workspaces/:id/tests/:tid/report')
    @SIM.view()
    testReport(@Param('id') id: string, @Param('tid') tid: string) {
        return this.workspaceTests.report(id, tid);
    }

    @Get('workspaces/:id')
    @SIM.view()
    getWorkspace(@Param('id') id: string) {
        return this.workspaceService.getWorkspace(id);
    }

    @Get()
    @SIM.view()
    list(@Query('status') status?: string, @Query('search') search?: string) {
        return this.simService.listSimulations({ status, search });
    }

    @Get(':id')
    @SIM.view()
    get(@Param('id') id: string) {
        return this.simService.getSimulation(id);
    }

    @Post()
    @SIM.create()
    create(@Body() dto: CreateRiskSimulationDto, @CurrentUser('id') userId: string) {
        return this.simService.createSimulation(dto, userId);
    }

    @Patch(':id')
    @SIM.edit()
    update(@Param('id') id: string, @Body() dto: UpdateRiskSimulationDto, @CurrentUser('id') userId: string) {
        return this.simService.updateSimulation(id, dto, userId);
    }

    // ── Senaryolar ──
    // NOT: literal 'scenarios/compare' rotası, 'scenarios/:sid' catch-all'ından
    // ÖNCE tanımlanmalı — aksi halde Nest sid='compare' ile eşleştirir.

    @Get('scenarios/compare')
    @SIM.view()
    compare(@Query('a') a: string, @Query('b') b: string) {
        return this.simService.compare(a, b);
    }

    @Get('scenarios/:sid')
    @SIM.view()
    getScenario(@Param('sid') sid: string) {
        return this.simService.getScenario(sid);
    }

    @Post(':id/scenarios')
    @SIM.create()
    createScenario(@Param('id') id: string, @Body() dto: CreateScenarioDto, @CurrentUser('id') userId: string) {
        return this.simService.createScenario(id, dto, userId);
    }

    @Patch('scenarios/:sid')
    @SIM.edit()
    updateScenario(@Param('sid') sid: string, @Body() dto: UpdateScenarioDto, @CurrentUser('id') userId: string) {
        return this.simService.updateScenario(sid, dto, userId);
    }

    @Post('scenarios/:sid/reset')
    @SIM.edit()
    reset(@Param('sid') sid: string, @CurrentUser('id') userId: string) {
        return this.simService.resetScenario(sid, userId);
    }

    @Get('scenarios/:sid/refresh-preview')
    @SIM.view()
    refreshPreview(@Param('sid') sid: string) {
        return this.simService.previewRefreshFromInventory(sid);
    }

    @Post('scenarios/:sid/refresh-apply')
    @SIM.edit()
    refreshApply(@Param('sid') sid: string, @Body() body: RefreshApplyDto, @CurrentUser('id') userId: string) {
        return this.simService.applyRefreshFromInventory(sid, body.acceptFields, userId);
    }

    @Post('scenarios/:sid/calculate')
    @SIM.view()
    calculate(@Param('sid') sid: string) {
        return this.simService.calculate(sid);
    }

    // ── Kontroller ──

    @Post('scenarios/:sid/controls')
    @SIM.edit()
    addControl(@Param('sid') sid: string, @Body() dto: CreateScenarioControlDto, @CurrentUser('id') userId: string) {
        return this.simService.addControl(sid, dto, userId);
    }

    @Patch('scenarios/:sid/controls/:cid')
    @SIM.edit()
    updateControl(@Param('sid') sid: string, @Param('cid') cid: string, @Body() dto: UpdateScenarioControlDto, @CurrentUser('id') userId: string) {
        return this.simService.updateControl(sid, cid, dto, userId);
    }

    @Delete('scenarios/:sid/controls/:cid')
    @SIM.edit()
    removeControl(@Param('sid') sid: string, @Param('cid') cid: string, @CurrentUser('id') userId: string) {
        return this.simService.removeControl(sid, cid, userId);
    }

    @Post('scenarios/:sid/controls/redistribute-weights')
    @SIM.edit()
    redistribute(@Param('sid') sid: string, @Body() dto: RedistributeWeightsDto, @CurrentUser('id') userId: string) {
        return this.simService.redistributeWeights(sid, dto.weights ?? {}, userId);
    }

    // ── Aksiyonlar ──

    @Post('scenarios/:sid/actions')
    @SIM.edit()
    addAction(@Param('sid') sid: string, @Body() dto: CreateScenarioActionDto, @CurrentUser('id') userId: string) {
        return this.simService.addAction(sid, dto, userId);
    }

    @Patch('scenarios/:sid/actions/:aid')
    @SIM.edit()
    updateAction(@Param('sid') sid: string, @Param('aid') aid: string, @Body() dto: UpdateScenarioActionDto, @CurrentUser('id') userId: string) {
        return this.simService.updateAction(sid, aid, dto, userId);
    }

    @Patch('scenarios/:sid/actions/:aid/toggle')
    @SIM.edit()
    toggleAction(@Param('sid') sid: string, @Param('aid') aid: string, @Body() dto: ToggleScenarioActionDto, @CurrentUser('id') userId: string) {
        return this.simService.toggleAction(sid, aid, dto.isApplied, userId);
    }

    @Delete('scenarios/:sid/actions/:aid')
    @SIM.edit()
    removeAction(@Param('sid') sid: string, @Param('aid') aid: string, @CurrentUser('id') userId: string) {
        return this.simService.removeAction(sid, aid, userId);
    }

    // ── Aktarım (envantere) ──

    @Post('scenarios/:sid/transfer/preview')
    @Roles(...TRANSFER_ROLES)
    @RequirePermissions('risk:sim:transfer')
    previewTransfer(@Param('sid') sid: string) {
        return this.transferService.preview(sid);
    }

    @Post('scenarios/:sid/transfer')
    @Roles(...TRANSFER_ROLES)
    @RequirePermissions('risk:sim:transfer')
    applyTransfer(@Param('sid') sid: string, @Body() dto: TransferDto, @CurrentUser('id') userId: string) {
        return this.transferService.apply(sid, dto, userId);
    }
}
