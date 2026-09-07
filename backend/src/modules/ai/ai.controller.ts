import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { AI_QUERY_ROLES, AI_REVIEW_ROLES, AI_TEST_ROLES } from './ai.constants';
import { AiProviderService } from './ai-provider.service';
import { AiAssessmentService } from './ai-assessment.service';
import { PrepStageService } from './stages/prep.service';
import { EvidenceReadStageService } from './stages/evidence-read.service';
import { AssessStageService } from './stages/assess.service';
import { ResultDraftStageService } from './stages/result-draft.service';
import { FindingDraftStageService } from './stages/finding-draft.service';
import { ReviewStageService } from './stages/review.service';
import { AiQueryService } from './ai-query.service';
import { AskQueryDto, ReviewAssessmentDto, RunStageDto } from './dto';

@ApiTags('AI — Kontrol Testi Asistanı')
@ApiBearerAuth('JWT-Auth')
@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
    constructor(
        private provider: AiProviderService,
        private assessments: AiAssessmentService,
        private prep: PrepStageService,
        private evidenceRead: EvidenceReadStageService,
        private assess: AssessStageService,
        private resultDraft: ResultDraftStageService,
        private findingDraft: FindingDraftStageService,
        private reviewStage: ReviewStageService,
        private query: AiQueryService,
    ) {}

    /** Modül durumu — Ayarlar sayfası ve frontend feature-flag'i. */
    @Get('status')
    status() {
        const cfg = this.provider.config;
        return {
            enabled: cfg.enabled,
            baseUrl: cfg.baseUrl,
            models: cfg.models,
            embedModel: cfg.embedModel,
        };
    }

    /** Sağlayıcının canlı model listesi — ID doğrulaması (yalnızca admin). */
    @Get('models')
    @Roles('SYSTEM_ADMIN')
    async models() {
        return { models: await this.provider.listModels() };
    }

    /** 30 günlük kullanım özeti. */
    @Get('usage')
    @Roles('SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER')
    usage() {
        return this.assessments.usage();
    }

    /** Kokpit — bana atanmış testler + AI durumları + bekleyen önerilerim. */
    @Get('cockpit')
    cockpit(@CurrentUser('id') userId: string) {
        return this.assessments.cockpit(userId);
    }

    // ─── Kontrol testi aşamaları ──────────────────────────────────────────────

    @Get('control-tests/:testId/assessments')
    listForTest(@Param('testId') testId: string) {
        return this.assessments.listFor('ControlTest', testId);
    }

    @Post('control-tests/:testId/prep')
    @Roles(...AI_TEST_ROLES)
    runPrep(
        @Param('testId') testId: string,
        @Body() dto: RunStageDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.prep.run(testId, userId, !!dto?.force);
    }

    @Post('control-tests/:testId/evidence-read')
    @Roles(...AI_TEST_ROLES)
    runEvidenceRead(
        @Param('testId') testId: string,
        @Body() dto: RunStageDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.evidenceRead.run(testId, userId, !!dto?.force);
    }

    @Post('control-tests/:testId/assess')
    @Roles(...AI_TEST_ROLES)
    runAssess(
        @Param('testId') testId: string,
        @Body() dto: RunStageDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.assess.run(testId, userId, !!dto?.force);
    }

    @Post('control-tests/:testId/result-draft')
    @Roles(...AI_TEST_ROLES)
    runResultDraft(
        @Param('testId') testId: string,
        @Body() dto: RunStageDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.resultDraft.run(testId, userId, !!dto?.force);
    }

    @Post('control-tests/:testId/finding-draft')
    @Roles(...AI_TEST_ROLES)
    runFindingDraft(
        @Param('testId') testId: string,
        @Body() dto: RunStageDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.findingDraft.run(testId, userId, !!dto?.force);
    }

    /** Faz 3 — 2. kontrolcü inceleme ön-raporu (test TAMAMLANDI iken). */
    @Post('control-tests/:testId/reviewer-check')
    @Roles(...AI_REVIEW_ROLES)
    runReviewerCheck(
        @Param('testId') testId: string,
        @Body() dto: RunStageDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.reviewStage.run(testId, userId, !!dto?.force);
    }

    /** Faz 3 — Doğal dil sorgu (salt okunur özet veri). */
    @Post('query')
    @Roles(...AI_QUERY_ROLES)
    ask(@Body() dto: AskQueryDto, @CurrentUser('id') userId: string) {
        return this.query.ask(dto.question, userId);
    }

    // ─── Kullanıcı kararı ─────────────────────────────────────────────────────

    @Post('assessments/:id/review')
    @Roles(...AI_TEST_ROLES)
    review(
        @Param('id') id: string,
        @Body() dto: ReviewAssessmentDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.assessments.review(id, dto.action, userId, dto.editedOutput);
    }
}
