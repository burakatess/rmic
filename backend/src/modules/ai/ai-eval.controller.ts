import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { AI_EVAL_ROLES } from './ai.constants';
import { AiEvalService } from './ai-eval.service';
import { EvalAttachmentDto, EvalMessageDto, EvalSessionDto } from './dto';

@ApiTags('AI — Kontrol & Kanıt Değerlendirme')
@ApiBearerAuth('JWT-Auth')
@Controller('ai/eval-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_EVAL_ROLES)
export class AiEvalController {
    constructor(private evalService: AiEvalService) {}

    @Get()
    list(@CurrentUser('id') userId: string) {
        return this.evalService.listSessions(userId);
    }

    @Post()
    create(@Body() dto: EvalSessionDto, @CurrentUser('id') userId: string) {
        return this.evalService.createSession(dto, userId);
    }

    @Get(':id')
    get(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.evalService.getSession(id, userId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: EvalSessionDto, @CurrentUser('id') userId: string) {
        return this.evalService.updateSession(id, dto, userId);
    }

    @Delete(':id')
    archive(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.evalService.archiveSession(id, userId);
    }

    @Post(':id/attachments')
    addAttachment(
        @Param('id') id: string,
        @Body() dto: EvalAttachmentDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.evalService.addAttachment(id, dto, userId);
    }

    @Delete(':id/attachments/:attId')
    removeAttachment(
        @Param('id') id: string,
        @Param('attId') attId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.evalService.removeAttachment(id, attId, userId);
    }

    @Post(':id/messages')
    sendMessage(
        @Param('id') id: string,
        @Body() dto: EvalMessageDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.evalService.sendMessage(id, dto.text ?? '', userId);
    }
}
