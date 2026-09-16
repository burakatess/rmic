import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { AI_EVAL_ROLES } from './ai.constants';
import { AiEvalService } from './ai-eval.service';
import {
    BulkEvalDto,
    CloneEvalSessionDto,
    CompleteEvalSessionDto,
    EvalAskDto,
    EvalAttachmentDto,
    EvalAttachmentMetaDto,
    EvalFindingReviewDto,
    EvalListQueryDto,
    EvalMessageDto,
    EvalRunDto,
    EvalSessionDto,
    RenameEvalSessionDto,
} from './dto';

@ApiTags('AI — Kontrol & Kanıt Değerlendirme')
@ApiBearerAuth('JWT-Auth')
@Controller('ai/eval-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_EVAL_ROLES)
export class AiEvalController {
    constructor(private evalService: AiEvalService) {}

    // ── Liste + oluşturma ──────────────────────────────────────────────────

    @Get()
    list(@Query() query: EvalListQueryDto, @CurrentUser('id') userId: string) {
        return this.evalService.listSessions(userId, query);
    }

    @Post()
    create(@Body() dto: EvalSessionDto, @CurrentUser('id') userId: string) {
        return this.evalService.createSession(dto, userId);
    }

    // ── Toplu işlemler (":id" rotalarından ÖNCE tanımlı olmalı) ─────────────

    @Post('bulk/archive')
    bulkArchive(@Body() dto: BulkEvalDto, @CurrentUser('id') userId: string) {
        return this.evalService.bulkArchive(dto.ids, userId);
    }

    @Post('bulk/trash')
    bulkTrash(@Body() dto: BulkEvalDto, @CurrentUser('id') userId: string) {
        return this.evalService.bulkTrash(dto.ids, userId);
    }

    // ── Tekil oturum ──────────────────────────────────────────────────────

    @Get(':id')
    get(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.evalService.getSession(id, userId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: EvalSessionDto, @CurrentUser('id') userId: string) {
        return this.evalService.updateSession(id, dto, userId);
    }

    @Post(':id/rename')
    rename(@Param('id') id: string, @Body() dto: RenameEvalSessionDto, @CurrentUser('id') userId: string) {
        return this.evalService.renameSession(id, dto.title, userId);
    }

    @Post(':id/complete')
    complete(@Param('id') id: string, @Body() dto: CompleteEvalSessionDto, @CurrentUser('id') userId: string) {
        return this.evalService.completeSession(id, dto.outcome, userId);
    }

    @Post(':id/reopen')
    reopen(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.evalService.reopenSession(id, userId);
    }

    @Post(':id/clone')
    clone(@Param('id') id: string, @Body() dto: CloneEvalSessionDto, @CurrentUser('id') userId: string) {
        return this.evalService.cloneForNewPeriod(id, dto.period, userId);
    }

    // ── Yaşam döngüsü ─────────────────────────────────────────────────────

    @Delete(':id')
    trash(@Param('id') id: string, @CurrentUser('id') userId: string) {
        // Varsayılan silme = çöp kutusuna taşı (geri alınabilir). Kalıcı silme UI'da yok.
        return this.evalService.trashSession(id, userId);
    }

    @Post(':id/restore')
    restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.evalService.restoreSession(id, userId);
    }

    @Post(':id/archive')
    archive(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.evalService.archiveSession(id, userId);
    }

    @Post(':id/unarchive')
    unarchive(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.evalService.unarchiveSession(id, userId);
    }

    // ── Ekler / kanıt ─────────────────────────────────────────────────────

    @Post(':id/attachments')
    addAttachment(@Param('id') id: string, @Body() dto: EvalAttachmentDto, @CurrentUser('id') userId: string) {
        return this.evalService.addAttachment(id, dto, userId);
    }

    @Patch(':id/attachments/:attId')
    updateAttachmentMeta(
        @Param('id') id: string,
        @Param('attId') attId: string,
        @Body() dto: EvalAttachmentMetaDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.evalService.updateAttachmentMeta(id, attId, dto, userId);
    }

    @Post(':id/attachments/:attId/version')
    replaceAttachment(
        @Param('id') id: string,
        @Param('attId') attId: string,
        @Body() dto: EvalAttachmentDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.evalService.replaceAttachment(id, attId, dto, userId);
    }

    @Delete(':id/attachments/:attId')
    removeAttachment(
        @Param('id') id: string,
        @Param('attId') attId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.evalService.removeAttachment(id, attId, userId);
    }

    // ── AI çalışması ──────────────────────────────────────────────────────

    /** "Değerlendir / Yeniden Değerlendir" — ekrandaki güncel girdiyle tam rapor. */
    @Post(':id/evaluate')
    evaluate(@Param('id') id: string, @Body() dto: EvalRunDto, @CurrentUser('id') userId: string) {
        return this.evalService.runEvaluation(id, dto, dto.additionalNote ?? '', userId);
    }

    /** "Ek soru sor" — 6 başlıklı raporu yeniden üretmez, soruya yanıt verir. */
    @Post(':id/ask')
    ask(@Param('id') id: string, @Body() dto: EvalAskDto, @CurrentUser('id') userId: string) {
        return this.evalService.askQuestion(id, dto, userId);
    }

    /** @deprecated `:id/evaluate` kullanın. Geriye dönük uyumluluk için korunuyor. */
    @Post(':id/messages')
    sendMessage(@Param('id') id: string, @Body() dto: EvalMessageDto, @CurrentUser('id') userId: string) {
        return this.evalService.sendMessage(id, dto.text ?? '', userId);
    }

    @Post(':id/cancel')
    cancel(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.evalService.cancelRun(id, userId);
    }

    /** Kaynak önerisi — suggestedSourceUnitIds'i doldurur, seçim kullanıcıya kalır. */
    @Post(':id/suggest-sources')
    suggestSources(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.evalService.suggestSources(id, userId);
    }

    // ── İnceleme + çıktılar ───────────────────────────────────────────────

    @Post(':id/findings/review')
    reviewFinding(@Param('id') id: string, @Body() dto: EvalFindingReviewDto, @CurrentUser('id') userId: string) {
        return this.evalService.reviewFinding(id, dto, userId);
    }

    @Get(':id/outputs')
    outputs(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.evalService.buildOutputs(id, userId);
    }
}
