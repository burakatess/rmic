import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma';
import { AiProviderService } from '../ai-provider.service';
import { AiAssessmentService } from '../ai-assessment.service';
import { TextExtractService } from '../text-extract.service';
import { AI_PROMPT_VERSION, EVIDENCE_IMAGE, EVIDENCE_TEXT } from '../prompts';
import { loadTest, periodLabel } from './loaders';

/** Aşama 1 — kanıt okuma / sınıflandırma / OCR. */
@Injectable()
export class EvidenceReadStageService {
    constructor(
        private prisma: PrismaService,
        private provider: AiProviderService,
        private assessments: AiAssessmentService,
        private extractor: TextExtractService,
    ) {}

    async run(testId: string, userId: string, force = false) {
        const { test, attachments } = await loadTest(this.prisma, testId);
        if (attachments.length === 0) {
            throw new BadRequestException('Bu teste henüz kanıt dosyası eklenmemiş.');
        }
        const c = test.control;
        const period = c.controlPeriod || periodLabel(test.plannedDate, c.frequency);

        const docs = await this.extractor.extractMany(attachments);

        const textItems = docs
            .filter((d) => d.kind === 'text' && (d.text?.trim().length ?? 0) > 0)
            .map((d) => ({
                attachmentId: d.attachmentId,
                originalName: d.originalName,
                mimeType: d.mimeType,
                text: d.text as string,
                note: d.note,
            }));
        const imageDocs = docs.filter((d) => d.kind === 'image' && d.imageBase64);
        const skipped = docs.filter((d) => d.kind === 'unsupported' || d.kind === 'error');

        // Girdi imzası: hangi dosyalar + içerik uzunlukları
        const signature = docs.map((d) => ({ id: d.attachmentId, k: d.kind, n: d.text?.length ?? 0 }));
        const inputHash = this.assessments.hashInput(AI_PROMPT_VERSION, { testId, signature });
        if (!force) {
            const cached = await this.assessments.findFresh('EVIDENCE_READ', inputHash);
            if (cached) return { ...cached, cached: true };
        }

        const files: unknown[] = [];
        let tokensIn = 0;
        let tokensOut = 0;
        let latencyMs = 0;
        let lastModel = '';
        let generalNote = '';

        try {
            if (textItems.length > 0) {
                const resp = await this.provider.chat({
                    tier: 'heavy',
                    reasoning: true,
                    json: true,
                    system: EVIDENCE_TEXT.system,
                    user: EVIDENCE_TEXT.user({
                        controlName: c.name,
                        testSteps: c.testSteps,
                        plannedPeriod: period,
                        items: textItems,
                    }),
                });
                lastModel = resp.model;
                tokensIn += resp.tokensIn ?? 0;
                tokensOut += resp.tokensOut ?? 0;
                latencyMs += resp.latencyMs;
                const parsed = resp.parsed as { dosyalar?: unknown[]; genelNot?: string } | null;
                if (parsed?.dosyalar) files.push(...parsed.dosyalar);
                if (parsed?.genelNot) generalNote = parsed.genelNot;
            }

            for (const img of imageDocs) {
                const resp = await this.provider.chat({
                    tier: 'vision',
                    json: true,
                    system: EVIDENCE_IMAGE.system,
                    user: EVIDENCE_IMAGE.user({
                        controlName: c.name,
                        testSteps: c.testSteps,
                        plannedPeriod: period,
                        fileName: img.originalName,
                    }),
                    images: [{ mimeType: img.mimeType, dataBase64: img.imageBase64 as string }],
                });
                lastModel = lastModel || resp.model;
                tokensIn += resp.tokensIn ?? 0;
                tokensOut += resp.tokensOut ?? 0;
                latencyMs += resp.latencyMs;
                const v = (resp.parsed as Record<string, unknown>) ?? { rawText: resp.text };
                files.push({
                    attachmentId: img.attachmentId,
                    belgeTuru: 'Görsel / ekran görüntüsü',
                    kapsadigiTarih: v.tarihDamgasi ?? 'belirsiz',
                    ilgiliTestAdimi: v.ilgiliTestAdimi ?? 'belirsiz',
                    uyarilar: v.uyarilar ?? [],
                    ozet: v.kapsam ?? '',
                    gorsel: v,
                });
            }

            for (const s of skipped) {
                files.push({
                    attachmentId: s.attachmentId,
                    belgeTuru: 'okunamadı',
                    kapsadigiTarih: 'belirsiz',
                    ilgiliTestAdimi: 'belirsiz',
                    uyarilar: [s.note || 'Dosya otomatik okunamadı'],
                    ozet: '',
                });
            }

            return this.assessments.recordResult({
                kind: 'EVIDENCE_READ',
                entityType: 'ControlTest',
                entityId: testId,
                tier: imageDocs.length && !textItems.length ? 'vision' : 'heavy',
                modelName: lastModel || this.provider.config.models.heavy,
                promptVersion: AI_PROMPT_VERSION,
                inputHash,
                output: { dosyalar: files, genelNot: generalNote, okunamayan: skipped.length },
                tokensIn,
                tokensOut,
                latencyMs,
                createdById: userId,
            });
        } catch (e) {
            await this.assessments.recordFailure(
                'EVIDENCE_READ', 'ControlTest', testId, 'heavy',
                this.provider.config.models.heavy, AI_PROMPT_VERSION, inputHash,
                (e as Error).message, userId,
            );
            throw e;
        }
    }
}
