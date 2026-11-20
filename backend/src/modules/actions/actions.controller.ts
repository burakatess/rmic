import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ActionsService } from './actions.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { CreateStandaloneActionDto, UpdateStandaloneActionDto, ExtendActionDto, CreateEffectivenessReviewDto } from './dto';
import { CompleteActionDto } from '../../common/dto/attachment.dto';
import { AccessScopeService, actionWhere } from '../../common/services/access-scope.service';
import type { AccessActor } from '../../common/services/access-scope.service';
import { actionCapabilities } from '../audits/finding-capabilities';
import { WorkflowReasonDto } from '../audits/dto/finding.dto';

@ApiTags('Actions')
@ApiBearerAuth('JWT-Auth')
@Controller('actions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActionsController {
    constructor(private actionsService: ActionsService, private scope: AccessScopeService) { }

    // Aksiyona doğrudan atanmış ama bulgunun tamamına erişimi olmayan kullanıcı, bulgu
    // için yalnız işin yapılması için gereken üst bilgiyi görür.
    private async scopedAction<T extends { findingId?: string | null; finding?: any; risk?: any }>(user: AccessActor, id: string, load: () => Promise<T>) {
        const ctx = await this.scope.context(user);
        await this.scope.assertActionAccess(ctx, id);
        const action = await load();
        const level = ctx.enforced && action.findingId ? await this.scope.findingAccess(ctx, action.findingId) : 'FULL';
        const capabilities = actionCapabilities(action as any, user, level === 'FULL' ? 'FULL' : 'PARTIAL');
        if (level === 'FULL') return { ...action, capabilities };
        const f = action.finding;
        return {
            ...action,
            capabilities,
            finding: f ? { id: f.id, findingId: f.findingId, summary: f.summary, description: f.description, severity: f.severity, workflowStatus: f.workflowStatus } : null,
            risk: action.risk && !ctx.orgModules.has('risk') ? { id: action.risk.id, riskId: action.risk.riskId, name: action.risk.name } : action.risk,
        };
    }

    // Yazma uçları: @Roles rolü doğrular; kayıt kapsamı (bağlı bulgu kapsamı veya aksiyon
    // sahipliği) ayrıca uygulanır — kapsam dışı aksiyon 404.
    private async assertActionScope(user: AccessActor, id: string) {
        await this.scope.assertActionAccess(await this.scope.context(user), id);
    }

    @Get()
    async findAll(@Query() query: any, @CurrentUser() user: AccessActor) {
        const ctx = await this.scope.context(user);
        return this.actionsService.findAll(query, user.id, actionWhere(ctx));
    }

    @Get(':id/relations')
    async getRelations(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        // İlişki haritası bulgunun/riskin tamamını gösterir → bulguya TAM erişim gerekir.
        const ctx = await this.scope.context(user);
        await this.scope.assertActionAccess(ctx, id);
        const findingId = await this.actionsService.findingIdOf(id);
        if (ctx.enforced && findingId && (await this.scope.findingAccess(ctx, findingId)) !== 'FULL') {
            throw new ForbiddenException('İlişki haritası için bulgunun tamamına erişim yetkiniz yok.');
        }
        return this.actionsService.getRelations(id);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @CurrentUser() user: AccessActor) {
        return this.scopedAction(user, id, () => this.actionsService.findOne(id));
    }

    @Post()
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async create(@Body() data: CreateStandaloneActionDto, @CurrentUser('id') userId: string) {
        return this.actionsService.create(data, userId);
    }

    @Put(':id')
    @Roles('SYSTEM_ADMIN', 'AUDITOR', 'AUDITEE')
    async update(
        @Param('id') id: string,
        @Body() data: UpdateStandaloneActionDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser() actor: AccessActor,
    ) {
        await this.assertActionScope(actor, id);
        return this.actionsService.update(id, data, userId, role);
    }

    // Maker-checker: silme doğrudan yapılmaz, gerekçeli silme talebi ikinci kontrolcüye gider.
    @Delete(':id')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async remove(@Param('id') id: string, @Body() body: WorkflowReasonDto, @CurrentUser('id') userId: string, @CurrentUser() actor: AccessActor) {
        await this.assertActionScope(actor, id);
        return this.actionsService.delete(id, userId, body.reason);
    }

    @Post(':id/complete')
    @Roles('SYSTEM_ADMIN', 'AUDITOR', 'AUDITEE')
    async complete(
        @Param('id') id: string,
        @Body() data: CompleteActionDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser() actor: AccessActor,
    ) {
        await this.assertActionScope(actor, id);
        return this.actionsService.complete(id, data, userId, role);
    }

    @Post(':id/extend')
    @Roles('SYSTEM_ADMIN', 'AUDITOR', 'AUDITEE')
    async extend(
        @Param('id') id: string,
        @Body() data: ExtendActionDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser() actor: AccessActor,
    ) {
        await this.assertActionScope(actor, id);
        return this.actionsService.extend(id, data, userId, role);
    }

    @Post(':id/effectiveness-review')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR')
    async createEffectivenessReview(@Param('id') id: string, @Body() data: CreateEffectivenessReviewDto, @CurrentUser('id') userId: string, @CurrentUser() actor: AccessActor) {
        await this.assertActionScope(actor, id);
        return this.actionsService.createEffectivenessReview(id, data, userId);
    }

    @Post(':id/approve')
    @Roles('AUDITOR')
    async approveEffectivenessReview(@Param('id') id: string, @CurrentUser('id') userId: string, @CurrentUser() actor: AccessActor) {
        await this.assertActionScope(actor, id);
        return this.actionsService.approveEffectivenessReview(id, userId);
    }
}
