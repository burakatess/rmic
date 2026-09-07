import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma';
import { AiProviderService } from '../ai-provider.service';
import { AiAssessmentService } from '../ai-assessment.service';
import { TextExtractService } from '../text-extract.service';
import { AI_PROMPT_VERSION, ASSESS } from '../prompts';
import { loadTest, periodLabel } from './loaders';

/** Aşama 2 — test adımı × kanıt skorkartı. */
@Injectable()
export class AssessStageService {
    constructor(
        private prisma: PrismaService,
        private provider: AiProviderService,
        private assessments: AiAssessmentService,
        private extractor: TextExtractService,
    ) {}

    async run(testId: string, userId: string, force = false) {
        const { test, attachments } = await loadTest(this.prisma, testId);
        if (attachments.length === 0) {
            throw new BadRequestException('Değerlendirme için önce kanıt dosyası eklenmeli.');
        }
        const c = test.control;
        const period = c.controlPeriod || periodLabel(test.plannedDate, c.frequency);

        // Kanıt özeti: son EVIDENCE_READ çıktısı varsa onu kullan, yoksa ham metni çıkar.
        const lastRead = (
            await this.assessments.listFor('ControlTest', testId)
        ).find((a) => a.kind === 'EVIDENCE_READ' && a.status !== 'FAILED' && a.status !== 'REJECTED');

        let evidenceDigest: string;
        if (lastRead?.output) {
            evidenceDigest = `Aşama 1 kanıt okuma çıktısı:\n${JSON.stringify(lastRead.output, null, 2)}`;
        } else {
            const docs = await this.extractor.extractMany(attachments);
            evidenceDigest = docs
                .map((d) => {
                    if (d.kind === 'text') return `### ${d.originalName}\n${d.text?.slice(0, 8000) ?? ''}`;
                    if (d.kind === 'image') return `### ${d.originalName}\n(görsel — Aşama 1 çalıştırılmadı, içerik değerlendirilemedi)`;
                    return `### ${d.originalName}\n(${d.note})`;
                })
                .join('\n\n');
        }

        const inputHash = this.assessments.hashInput(AI_PROMPT_VERSION, {
            testId,
            steps: c.testSteps,
            digest: evidenceDigest,
        });
        if (!force) {
            const cached = await this.assessments.findFresh('ASSESSMENT', inputHash);
            if (cached) return { ...cached, cached: true };
        }

        const tier = 'heavy';
        const model = this.provider.config.models[tier];
        try {
            const resp = await this.provider.chat({
                tier,
                reasoning: true,
                json: true,
                system: ASSESS.system,
                user: ASSESS.user({
                    controlName: c.name,
                    controlDescription: c.description,
                    testSteps: c.testSteps,
                    plannedPeriod: period,
                    evidenceDigest,
                }),
            });
            const parsed = resp.parsed as { guven?: number } | null;
            return this.assessments.recordResult({
                kind: 'ASSESSMENT',
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
                'ASSESSMENT', 'ControlTest', testId, tier, model, AI_PROMPT_VERSION, inputHash,
                (e as Error).message, userId,
            );
            throw e;
        }
    }
}
