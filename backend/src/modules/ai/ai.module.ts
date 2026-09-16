import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiProviderService } from './ai-provider.service';
import { AiAssessmentService } from './ai-assessment.service';
import { AiEmbeddingService } from './ai-embedding.service';
import { TextExtractService } from './text-extract.service';
import { PrepStageService } from './stages/prep.service';
import { EvidenceReadStageService } from './stages/evidence-read.service';
import { AssessStageService } from './stages/assess.service';
import { ResultDraftStageService } from './stages/result-draft.service';
import { FindingDraftStageService } from './stages/finding-draft.service';
import { ReviewStageService } from './stages/review.service';
import { AiQueryService } from './ai-query.service';
import { AiEvalController } from './ai-eval.controller';
import { AiEvalService } from './ai-eval.service';

/**
 * Yapay Zeka Destekli Modüller — Kontrol Testi Asistanı.
 * Faz 1: Aşama 0–2 (hazırlık, kanıt okuma, değerlendirme).
 * Faz 2: Aşama 3–4 (sonuç taslağı, bulgu taslağı + tekrar/referans + embedding).
 * Sağlayıcıdan bağımsız (OpenAI-uyumlu). Yapılandırma: backend/.env (AI_*).
 */
@Module({
    controllers: [AiController, AiEvalController],
    providers: [
        AiProviderService,
        AiAssessmentService,
        AiEmbeddingService,
        TextExtractService,
        PrepStageService,
        EvidenceReadStageService,
        AssessStageService,
        ResultDraftStageService,
        FindingDraftStageService,
        ReviewStageService,
        AiQueryService,
        AiEvalService,
    ],
    exports: [AiProviderService, AiAssessmentService, AiEmbeddingService],
})
export class AiModule {}
