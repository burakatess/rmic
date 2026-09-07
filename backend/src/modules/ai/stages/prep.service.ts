import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma';
import { AiProviderService } from '../ai-provider.service';
import { AiAssessmentService } from '../ai-assessment.service';
import { AI_PROMPT_VERSION, PREP, PrepContext } from '../prompts';
import { loadLinkedRisks, loadPriorTests, loadRegulations, loadTest } from './loaders';

/** Aşama 0 — test hazırlık planı. */
@Injectable()
export class PrepStageService {
    constructor(
        private prisma: PrismaService,
        private provider: AiProviderService,
        private assessments: AiAssessmentService,
    ) {}

    async run(testId: string, userId: string, force = false) {
        const { test } = await loadTest(this.prisma, testId);
        const c = test.control;

        const [linkedRisks, regulations, priorTests] = await Promise.all([
            loadLinkedRisks(this.prisma, c.id),
            loadRegulations(this.prisma, c.id),
            loadPriorTests(this.prisma, c.id, testId),
        ]);

        const ctx: PrepContext = {
            control: {
                controlId: c.controlId,
                name: c.name,
                description: c.description,
                type: c.type,
                nature: c.nature,
                automation: c.automation,
                frequency: c.frequency,
                controlPeriod: c.controlPeriod,
                selectedMonths: c.selectedMonths,
                testSteps: c.testSteps,
            },
            linkedRisks,
            regulations,
            priorTests,
            plannedDate: test.plannedDate.toISOString().slice(0, 10),
        };

        const inputHash = this.assessments.hashInput(AI_PROMPT_VERSION, ctx);
        if (!force) {
            const cached = await this.assessments.findFresh('PREP_PLAN', inputHash);
            if (cached) return { ...cached, cached: true };
        }

        const tier = 'heavy';
        const model = this.provider.config.models[tier];
        try {
            const resp = await this.provider.chat({
                tier,
                reasoning: true,
                json: true,
                system: PREP.system,
                user: PREP.user(ctx),
            });
            return this.assessments.recordResult({
                kind: 'PREP_PLAN',
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
                'PREP_PLAN', 'ControlTest', testId, tier, model, AI_PROMPT_VERSION, inputHash,
                (e as Error).message, userId,
            );
            throw e;
        }
    }
}
