import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { QualityRunDto } from './dto';
import { writeAudit } from './library.util';

/**
 * Kalite test modülü — sabit değerlendirme setiyle model/prompt/retrieval
 * sürümlerini karşılaştırır. Tahminler dışarıda üretilip (AI eval akışı) buraya
 * verilir; burada beklenen karara göre metrik hesaplanır. Modelin KENDİ cevabını
 * onaylaması tek kalite ölçütü DEĞİLDİR — insan incelemesi alanları korunur.
 */
@Injectable()
export class QualityService {
    constructor(private prisma: PrismaService) {}

    list(datasetId?: string) {
        return this.prisma.qualityRun.findMany({
            where: datasetId ? { datasetId } : {},
            orderBy: { startedAt: 'desc' },
            include: { _count: { select: { items: true } } },
        });
    }

    async get(id: string) {
        const run = await this.prisma.qualityRun.findUnique({
            where: { id },
            include: { items: { orderBy: { scenarioId: 'asc' } } },
        });
        if (!run) throw new NotFoundException('Kalite çalışması bulunamadı');
        return run;
    }

    async record(dto: QualityRunDto, userId: string) {
        const dataset = await this.prisma.evalDataset.findUnique({ where: { id: dto.datasetId } });
        if (!dataset) throw new BadRequestException('Geçersiz veri seti');
        const scenarios = await this.prisma.evalScenario.findMany({
            where: { datasetId: dto.datasetId },
            select: { scenarioId: true, expectedDecision: true, requiredRefs: true, missingEvidence: true },
        });
        const expectedById = new Map(scenarios.map((s) => [s.scenarioId, s]));

        const run = await this.prisma.qualityRun.create({
            data: {
                label: dto.label.trim(),
                datasetId: dto.datasetId,
                modelName: dto.modelName ?? null,
                promptVersion: dto.promptVersion ?? null,
                retrievalVersion: dto.retrievalVersion ?? null,
                status: 'RUNNING',
                createdById: userId,
            },
        });

        let correct = 0;
        let falseMet = 0;
        let badRefs = 0;
        let missedGaps = 0;
        let conflictDetected = 0;
        let humanFixNeeded = 0;
        let latencySum = 0;
        let latencyN = 0;

        for (const it of dto.items) {
            const exp = expectedById.get(it.scenarioId);
            const expected = exp?.expectedDecision ?? null;
            const isCorrect = expected != null && it.predictedDecision === expected;
            if (isCorrect) correct++;
            if (expected && expected !== 'KARSILANDI' && it.predictedDecision === 'KARSILANDI') falseMet++;
            if (expected === 'KARSILANMADI' && it.predictedDecision !== 'KARSILANMADI') missedGaps++;
            if (expected === 'CELISKILI' && it.predictedDecision === 'CELISKILI') conflictDetected++;

            const requiredRefs = Array.isArray(exp?.requiredRefs) ? (exp.requiredRefs as string[]) : [];
            const usedRefs = it.usedRefs ?? [];
            const refsOk = requiredRefs.length === 0 || requiredRefs.every((r) => usedRefs.some((u) => u.includes(r)));
            if (!refsOk) badRefs++;
            if ((it.issues ?? []).length > 0 || !isCorrect) humanFixNeeded++;
            if (it.latencyMs != null) {
                latencySum += it.latencyMs;
                latencyN++;
            }

            await this.prisma.qualityRunItem.create({
                data: {
                    runId: run.id,
                    scenarioId: it.scenarioId,
                    predictedDecision: it.predictedDecision,
                    expectedDecision: expected,
                    correct: isCorrect,
                    usedRefs: (usedRefs ?? Prisma.JsonNull),
                    issues: (it.issues ?? Prisma.JsonNull),
                    latencyMs: it.latencyMs ?? null,
                    rawOutput: (it.rawOutput ?? Prisma.JsonNull),
                },
            });
        }

        const n = dto.items.length || 1;
        const metrics = {
            total: dto.items.length,
            correctRate: Number((correct / n).toFixed(4)),
            falseMet,
            badRefs,
            missedGaps,
            conflictDetected,
            humanFixNeeded,
            latencyMsAvg: latencyN ? Math.round(latencySum / latencyN) : null,
        };
        const done = await this.prisma.qualityRun.update({
            where: { id: run.id },
            data: { status: 'DONE', finishedAt: new Date(), metrics: metrics },
        });
        await writeAudit(this.prisma, userId, 'CREATE', 'QualityRun', run.id, null, done);
        return this.get(run.id);
    }

    /** İki çalışmayı aynı senaryo setinde karşılaştır. */
    async compare(aId: string, bId: string) {
        const [a, b] = await Promise.all([this.get(aId), this.get(bId)]);
        const byScenario = (run: Awaited<ReturnType<QualityService['get']>>) =>
            new Map(run.items.map((i) => [i.scenarioId, i]));
        const ma = byScenario(a);
        const mb = byScenario(b);
        const common = [...ma.keys()].filter((k) => mb.has(k));
        const regressions = common.filter((k) => ma.get(k)!.correct && !mb.get(k)!.correct);
        const improvements = common.filter((k) => !ma.get(k)!.correct && mb.get(k)!.correct);
        return {
            a: { id: a.id, label: a.label, metrics: a.metrics },
            b: { id: b.id, label: b.label, metrics: b.metrics },
            commonScenarios: common.length,
            regressions,
            improvements,
        };
    }
}
