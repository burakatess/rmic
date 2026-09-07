import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma';
import { AiProviderService } from '../ai-provider.service';
import { AiAssessmentService } from '../ai-assessment.service';
import { AI_PROMPT_VERSION, REVIEW } from '../prompts';
import { loadPriorTests, loadTest, periodLabel } from './loaders';

/** Faz 3 — 2. kontrolcü inceleme ön-raporu (test TAMAMLANDI iken). */
@Injectable()
export class ReviewStageService {
    constructor(
        private prisma: PrismaService,
        private provider: AiProviderService,
        private assessments: AiAssessmentService,
    ) {}

    async run(testId: string, userId: string, force = false) {
        const { test, attachments } = await loadTest(this.prisma, testId);
        if (!['TAMAMLANDI', 'GERI_GONDERILDI', 'ONAYLANDI'].includes(test.status)) {
            throw new BadRequestException(
                'İnceleme ön-raporu yalnızca tamamlanmış (2. kontrolcü onayına gönderilmiş) test için üretilebilir.',
            );
        }
        const c = test.control;
        const period = c.controlPeriod || periodLabel(test.plannedDate, c.frequency);

        const full = await this.prisma.controlTest.findUnique({
            where: { id: testId },
            select: {
                testNo: true,
                status: true,
                findingStatus: true,
                resultText: true,
                evidenceSummary: true,
                evidenceUrls: true,
                referencedFindingId: true,
                referenceReason: true,
                completedAt: true,
            },
        });

        const findings = await this.prisma.finding.findMany({
            where: { controlTestId: testId },
            select: {
                findingId: true,
                severity: true,
                description: true,
                impact: true,
                recommendation: true,
                isRecurrent: true,
            },
        });

        const priorAssessments = (await this.assessments.listFor('ControlTest', testId))
            .filter((a) => a.kind !== 'REVIEW' && a.status !== 'FAILED')
            .map((a) => ({
                kind: a.kind,
                status: a.status,
                output: a.editedOutput ?? a.output,
            }));

        const priorTests = await loadPriorTests(this.prisma, c.id, testId);

        const completedTest = {
            ...full,
            attachmentCount: attachments.length,
            attachmentNames: attachments.map((x) => x.originalName),
        };

        const inputHash = this.assessments.hashInput(AI_PROMPT_VERSION, {
            testId,
            completedTest,
            findings,
            priorAssessments,
        });
        if (!force) {
            const cached = await this.assessments.findFresh('REVIEW', inputHash);
            if (cached) return { ...cached, cached: true };
        }

        const tier = 'heavy';
        const model = this.provider.config.models[tier];
        try {
            const resp = await this.provider.chat({
                tier,
                reasoning: true,
                json: true,
                system: REVIEW.system,
                user: REVIEW.user({
                    controlName: c.name,
                    plannedPeriod: period,
                    completedTest,
                    findings,
                    priorAssessments,
                    priorTests,
                }),
            });
            const parsed = resp.parsed as { guven?: number } | null;
            return this.assessments.recordResult({
                kind: 'REVIEW',
                entityType: 'ControlTest',
                entityId: testId,
                tier,
                modelName: resp.model,
                promptVersion: AI_PROMPT_VERSION,
                inputHash,
                output: resp.parsed ?? { rawText: resp.text },
                confidence: typeof parsed?.guven === 'number' ? parsed.guven : null,
                tokensIn: resp.tokensIn,
                tokensOut: resp.tokensOut,
                latencyMs: resp.latencyMs,
                createdById: userId,
            });
        } catch (e) {
            await this.assessments.recordFailure(
                'REVIEW', 'ControlTest', testId, tier, model, AI_PROMPT_VERSION, inputHash,
                (e as Error).message, userId,
            );
            throw e;
        }
    }
}
