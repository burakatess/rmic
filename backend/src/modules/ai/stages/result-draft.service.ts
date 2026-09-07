import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma';
import { AiProviderService } from '../ai-provider.service';
import { AiAssessmentService } from '../ai-assessment.service';
import { TextExtractService } from '../text-extract.service';
import { AI_PROMPT_VERSION, RESULT_DRAFT } from '../prompts';
import { loadTest, periodLabel } from './loaders';

/** Aşama 3 — sonuç metni + kanıt özeti taslağı. */
@Injectable()
export class ResultDraftStageService {
    constructor(
        private prisma: PrismaService,
        private provider: AiProviderService,
        private assessments: AiAssessmentService,
        private extractor: TextExtractService,
    ) {}

    async run(testId: string, userId: string, force = false) {
        const { test, attachments } = await loadTest(this.prisma, testId);
        if (attachments.length === 0) {
            throw new BadRequestException('Sonuç taslağı için önce kanıt dosyası eklenmeli.');
        }
        const c = test.control;
        const period = c.controlPeriod || periodLabel(test.plannedDate, c.frequency);

        const prev = await this.assessments.listFor('ControlTest', testId);
        const lastAssessment = prev.find(
            (a) => a.kind === 'ASSESSMENT' && a.status !== 'FAILED' && a.status !== 'REJECTED',
        );
        const assessmentJson = lastAssessment?.output
            ? JSON.stringify(lastAssessment.editedOutput ?? lastAssessment.output, null, 2)
            : null;

        let evidenceDigest: string;
        const lastRead = prev.find((a) => a.kind === 'EVIDENCE_READ' && a.status !== 'FAILED' && a.status !== 'REJECTED');
        if (lastRead?.output) {
            evidenceDigest = JSON.stringify(lastRead.output, null, 2);
        } else {
            const docs = await this.extractor.extractMany(attachments);
            evidenceDigest = docs
                .map((d) => `### ${d.originalName}\n${d.text?.slice(0, 6000) ?? `(${d.kind}${d.note ? ' — ' + d.note : ''})`}`)
                .join('\n\n');
        }

        const inputHash = this.assessments.hashInput(AI_PROMPT_VERSION, { testId, assessmentJson, evidenceDigest });
        if (!force) {
            const cached = await this.assessments.findFresh('RESULT_DRAFT', inputHash);
            if (cached) return { ...cached, cached: true };
        }

        const tier = 'light';
        const model = this.provider.config.models[tier];
        try {
            const resp = await this.provider.chat({
                tier,
                json: true,
                system: RESULT_DRAFT.system,
                user: RESULT_DRAFT.user({
                    controlName: c.name,
                    plannedPeriod: period,
                    assessmentJson,
                    evidenceDigest,
                }),
            });
            return this.assessments.recordResult({
                kind: 'RESULT_DRAFT',
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
                'RESULT_DRAFT', 'ControlTest', testId, tier, model, AI_PROMPT_VERSION, inputHash,
                (e as Error).message, userId,
            );
            throw e;
        }
    }
}
