import { Body, Controller, Get, Param, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequireAnyPermission } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards';
import type { AccessActor } from '../../common/services/access-scope.service';
import { WorkflowService } from './workflow.service';
import { DeletionRequestsService, type DeletionEntity } from './deletion-requests.service';
import { DeletionDecisionDto, DeletionRequestDto, ENTITY_TYPE_VALUES, WorkflowBoardQueryDto, WorkflowMoveDto, WorkflowTransitionDto, DELETION_TYPES } from './dto/workflow.dto';
import type { WorkflowEntityType } from '../../common/workflow/workflow-stages';

/** Ortak iş akışı: durum, geçiş, Kanban ("İşlem Durumları") ve yönetici onaylı silme talepleri. */
@ApiTags('Workflow')
@ApiBearerAuth('JWT-Auth')
@Controller()
@UseGuards(JwtAuthGuard)
export class WorkflowController {
    constructor(private workflow: WorkflowService, private deletions: DeletionRequestsService) { }

    private type(t: string): WorkflowEntityType {
        if (!(ENTITY_TYPE_VALUES as readonly string[]).includes(t)) throw new BadRequestException('Geçersiz kayıt türü.');
        return t as WorkflowEntityType;
    }

    @Get('workflow/board')
    @RequireAnyPermission('control:view', 'finding:view')
    board(@Query() q: WorkflowBoardQueryDto, @CurrentUser() user: AccessActor) {
        return this.workflow.board(user, q);
    }

    @Post('workflow/board/move')
    @RequireAnyPermission('control:view', 'finding:view')
    move(@Body() dto: WorkflowMoveDto, @CurrentUser() user: AccessActor) {
        return this.workflow.move(dto.entityType, dto.entityId, dto.toStage, dto.reason, user);
    }

    @Get('workflow/:type/:id')
    @RequireAnyPermission('control:view', 'finding:view')
    state(@Param('type') type: string, @Param('id') id: string, @CurrentUser() user: AccessActor) {
        return this.workflow.getState(this.type(type), id, user);
    }

    @Post('workflow/:type/:id/transition')
    @RequireAnyPermission('control:view', 'finding:view')
    transition(@Param('type') type: string, @Param('id') id: string, @Body() dto: WorkflowTransitionDto, @CurrentUser() user: AccessActor) {
        return this.workflow.transition(this.type(type), id, dto.action, dto.reason, user);
    }

    @Get('deletion-requests')
    @RequireAnyPermission('control:view')
    pendingDeletions(@CurrentUser() user: AccessActor) {
        return this.deletions.pending(user);
    }

    @Post('deletion-requests')
    @RequireAnyPermission('control:view')
    requestDeletion(@Body() dto: DeletionRequestDto, @CurrentUser() user: AccessActor) {
        return this.deletions.request(dto.entityType, dto.entityId, dto.reason, user);
    }

    @Post('deletion-requests/:type/:id/approve')
    @RequireAnyPermission('control:view')
    approveDeletion(@Param('type') type: string, @Param('id') id: string, @CurrentUser() user: AccessActor) {
        return this.deletions.approve(this.delType(type), id, user);
    }

    @Post('deletion-requests/:type/:id/reject')
    @RequireAnyPermission('control:view')
    rejectDeletion(@Param('type') type: string, @Param('id') id: string, @Body() dto: DeletionDecisionDto, @CurrentUser() user: AccessActor) {
        return this.deletions.reject(this.delType(type), id, dto.reason ?? '', user);
    }

    private delType(t: string): DeletionEntity {
        if (!(DELETION_TYPES as readonly string[]).includes(t)) throw new BadRequestException('Geçersiz kayıt türü.');
        return t as DeletionEntity;
    }
}
