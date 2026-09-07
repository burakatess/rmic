import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma';
import { AiProviderService } from '../ai-provider.service';
import { AiAssessmentService } from '../ai-assessment.service';
import { AiEmbeddingService } from '../ai-embedding.service';
import { AI_PROMPT_VERSION, FINDING_DRAFT, PriorFinding } from '../prompts';
import { loadControlFindings, loadLinkedRisks, loadTest, periodLabel } from './loaders';

/** Aşama 4 — bulgu + öneri taslağı, tekrar analizi, referans önerisi. */
@Injectable()
export class FindingDraftStageService {
    constructor(
        private prisma: PrismaService,
        private provider: AiProviderService,
        private assessments: AiAssessmentService,
        private embeddings: AiEmbeddingService,
    ) {}

    async run(testId: string, userId: string, force = false) {
        const { test } = await loadTest(this.prisma, testId);
        const c = test.control;
        const period = c.controlPeriod || periodLabel(test.plannedDate, c.frequency);

        const prev = await this.assessments.listFor('ControlTest', testId);
        const lastAssessment = prev.find(
            (a) => a.kind === 'ASSESSMENT' && a.status !== 'FAILED' && a.status !== 'REJECTED',
        );
        if (!lastAssessment?.output) {
            throw new BadRequestException(
                'Bulgu taslağı için önce Aşama 2 (Değerlendirme) çalıştırılmalı.',
            );
        }
        const assessmentJson = JSON.stringify(lastAssessment.editedOutput ?? lastAssessment.output, null, 2);

        const [linkedRisks, controlFindings] = await Promise.all([
            loadLinkedRisks(this.prisma, c.id),
            loadControlFindings(this.prisma, c.id, testId),
        ]);

        // Benzerlik: değerlendirme özeti ile geçmiş bulgu açıklamalarını karşılaştır
        let priorFindings: PriorFinding[] = controlFindings.map((f) => ({
            findingId: f.findingId,
            severity: f.severity,
            status: f.status,
            description: f.description.slice(0, 600),
            recommendation: f.recommendation?.slice(0, 400) ?? null,
            open: f.open,
        }));

        if (this.embeddings.enabled && priorFindings.length > 0) {
            const ranked = await this.embeddings.rankBySimilarity(
                assessmentJson,
                controlFindings.map((f) => ({ text: `${f.description} ${f.recommendation ?? ''}`, item: f.findingId })),
                8,
            );
            const simByFinding = new Map(ranked.map((r) => [r.item, r.similarity]));
            priorFindings = priorFindings
                .map((p) => ({ ...p, similarity: simByFinding.get(p.findingId) }))
                .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
                .slice(0, 8);
        }

        const inputHash = this.assessments.hashInput(AI_PROMPT_VERSION, {
            testId,
            assessmentJson,
            priorIds: priorFindings.map((p) => p.findingId),
        });
        if (!force) {
            const cached = await this.assessments.findFresh('FINDING_DRAFT', inputHash);
            if (cached) return { ...cached, cached: true };
        }

        const tier = 'heavy';
        const model = this.provider.config.models[tier];
        try {
            const resp = await this.provider.chat({
                tier,
                reasoning: true,
                json: true,
                system: FINDING_DRAFT.system,
                user: FINDING_DRAFT.user({
                    controlName: c.name,
                    controlDescription: c.description,
                    linkedRisks,
                    plannedPeriod: period,
                    assessmentJson,
                    priorFindings,
                }),
            });
            return this.assessments.recordResult({
                kind: 'FINDING_DRAFT',
                entityType: 'ControlTest',
                entityId: testId,
                tier,
                modelName: resp.model,
                promptVersion: AI_PROMPT_VERSION,
                inputHash,
                output: resp.parsed ?? { rawText: resp.text },
                tokensIn: resp.tokensIn,
                tokensOut: resp.tokensOut,
                latencyMs: resp.latencyMs,
                createdById: userId,
            });
        } catch (e) {
            await this.assessments.recordFailure(
                'FINDING_DRAFT', 'ControlTest', testId, tier, model, AI_PROMPT_VERSION, inputHash,
                (e as Error).message, userId,
            );
            throw e;
        }
    }
}
