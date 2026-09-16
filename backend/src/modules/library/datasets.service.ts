import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { ScenarioReviewDto, UpsertDatasetDto, UpsertScenarioDto } from './dto';
import { writeAudit } from './library.util';

const J = (v: unknown) => (v ?? Prisma.JsonNull);

/**
 * Değerlendirme veri setleri:
 *   A. RAG_SOURCE        — retrieval kaynakları
 *   B. TRAINING_EXAMPLE  — uzman onaylı eğitim örnekleri
 *   C. EVAL_HOLDOUT      — eğitimde KULLANILMAYAN değerlendirme seti
 * Sentetik senaryolar "uzman onayı bekliyor" durumunda kaydedilir; gerçek kurum
 * kanıtı gibi gösterilmez. Üretilen beklenen cevap otomatik altın standart
 * SAYILMAZ (status = EXPERT_APPROVED ile insan onayı gerekir).
 */
@Injectable()
export class DatasetsService {
    constructor(private prisma: PrismaService) {}

    // ─── Veri seti ─────────────────────────────────────────────────────────
    listDatasets() {
        return this.prisma.evalDataset.findMany({
            orderBy: { code: 'asc' },
            include: { _count: { select: { scenarios: true } } },
        });
    }

    async upsertDataset(dto: UpsertDatasetDto, userId: string) {
        const code = dto.code.trim();
        const existing = await this.prisma.evalDataset.findUnique({ where: { code } });
        const data = {
            name: dto.name.trim(),
            purpose: dto.purpose as Prisma.EvalDatasetCreateInput['purpose'],
            description: dto.description?.trim() || null,
        };
        if (existing) {
            const d = await this.prisma.evalDataset.update({ where: { code }, data });
            await writeAudit(this.prisma, userId, 'UPDATE', 'EvalDataset', d.id, existing, d);
            return d;
        }
        const d = await this.prisma.evalDataset.create({ data: { code, createdById: userId, ...data } });
        await writeAudit(this.prisma, userId, 'CREATE', 'EvalDataset', d.id, null, d);
        return d;
    }

    // ─── Senaryo ───────────────────────────────────────────────────────────
    async listScenarios(params: { datasetId?: string; status?: string; testCardId?: string; kind?: string }) {
        const where: Prisma.EvalScenarioWhereInput = {};
        if (params.datasetId) where.datasetId = params.datasetId;
        if (params.status) where.status = params.status as Prisma.EvalScenarioWhereInput['status'];
        if (params.testCardId) where.testCardId = params.testCardId;
        if (params.kind) where.kind = params.kind as Prisma.EvalScenarioWhereInput['kind'];
        return this.prisma.evalScenario.findMany({
            where,
            orderBy: { scenarioId: 'asc' },
            include: {
                dataset: { select: { code: true, purpose: true } },
                testCard: { select: { code: true, title: true } },
                _count: { select: { sourceRefs: true, versionRefs: true } },
            },
        });
    }

    async getScenario(id: string) {
        const s = await this.prisma.evalScenario.findUnique({
            where: { id },
            include: {
                dataset: true,
                testCard: { select: { id: true, code: true, title: true } },
                sourceRefs: { include: { unit: { select: { unitCode: true, stableKey: true, title: true } } } },
                versionRefs: { include: { version: { select: { versionLabel: true, source: { select: { slug: true } } } } } },
            },
        });
        if (!s) throw new NotFoundException('Senaryo bulunamadı');
        return s;
    }

    async upsertScenario(dto: UpsertScenarioDto, userId: string) {
        const dataset = await this.prisma.evalDataset.findUnique({ where: { id: dto.datasetId } });
        if (!dataset) throw new BadRequestException('Geçersiz veri seti');
        const scenarioId = dto.scenarioId.trim();
        const existing = await this.prisma.evalScenario.findUnique({ where: { scenarioId } });

        const base = {
            familyKey: dto.familyKey.trim(),
            datasetId: dto.datasetId,
            testCardId: dto.testCardId || null,
            kind: dto.kind as Prisma.EvalScenarioCreateInput['kind'],
            inputEvidence: J(dto.inputEvidence),
            expectedDecision: dto.expectedDecision,
            rationale: dto.rationale,
            requiredRefs: J(dto.requiredRefs),
            forbiddenInferences: J(dto.forbiddenInferences),
            missingEvidence: J(dto.missingEvidence),
        };

        const scenario = existing
            ? await this.prisma.evalScenario.update({ where: { scenarioId }, data: base })
            : await this.prisma.evalScenario.create({ data: { scenarioId, ...base } });

        // Kaynak birim / sürüm bağlantıları (varsa) — yeniden kur.
        if (dto.unitIds) {
            await this.prisma.evalScenarioRef.deleteMany({ where: { scenarioId: scenario.id } });
            for (const unitId of [...new Set(dto.unitIds)]) {
                if (await this.prisma.sourceUnit.findUnique({ where: { id: unitId } })) {
                    await this.prisma.evalScenarioRef.create({ data: { scenarioId: scenario.id, unitId } });
                }
            }
        }
        if (dto.versionIds) {
            await this.prisma.evalScenarioSource.deleteMany({ where: { scenarioId: scenario.id } });
            for (const versionId of [...new Set(dto.versionIds)]) {
                if (await this.prisma.sourceVersion.findUnique({ where: { id: versionId } })) {
                    await this.prisma.evalScenarioSource.create({ data: { scenarioId: scenario.id, versionId } });
                }
            }
        }

        await writeAudit(this.prisma, userId, existing ? 'UPDATE' : 'CREATE', 'EvalScenario', scenario.id, existing, scenario);
        return scenario;
    }

    async reviewScenario(id: string, dto: ScenarioReviewDto, userId: string) {
        const before = await this.getScenario(id);
        const s = await this.prisma.evalScenario.update({
            where: { id },
            data: {
                status: dto.status as Prisma.EvalScenarioUpdateInput['status'],
                approvedById: dto.status === 'EXPERT_APPROVED' ? userId : null,
                labeledById: before.labeledById ?? userId,
            },
        });
        await writeAudit(this.prisma, userId, 'UPDATE', 'EvalScenario', id, { status: before.status }, {
            status: s.status,
            note: dto.note,
        });
        return s;
    }

    // ─── JSONL dışa aktarım (GERÇEK eğitim BAŞLATMAZ) ──────────────────────
    async exportJsonl(datasetId: string, opts: { onlyApproved?: boolean } = {}) {
        const dataset = await this.prisma.evalDataset.findUnique({ where: { id: datasetId } });
        if (!dataset) throw new NotFoundException('Veri seti bulunamadı');
        const scenarios = await this.prisma.evalScenario.findMany({
            where: {
                datasetId,
                ...(opts.onlyApproved ? { status: 'EXPERT_APPROVED' } : {}),
            },
            orderBy: { familyKey: 'asc' },
            include: {
                testCard: { select: { code: true } },
                sourceRefs: { include: { unit: { select: { unitCode: true, stableKey: true } } } },
                versionRefs: { include: { version: { select: { versionLabel: true, source: { select: { slug: true } } } } } },
            },
        });

        // Veri sızıntısı önleme: bölme AİLE anahtarına göre — aynı familyKey tek split'te.
        const families = [...new Set(scenarios.map((s) => s.familyKey))].sort();
        const split = new Map<string, 'train' | 'test'>();
        families.forEach((f, i) => split.set(f, i % 5 === 0 ? 'test' : 'train'));

        const lines = scenarios.map((s) =>
            JSON.stringify({
                scenario_id: s.scenarioId,
                family_key: s.familyKey,
                split: dataset.purpose === 'EVAL_HOLDOUT' ? 'test' : split.get(s.familyKey),
                synthetic: s.synthetic,
                status: s.status,
                control_test_card: s.testCard?.code ?? null,
                kind: s.kind,
                input_evidence: s.inputEvidence,
                expected_decision: s.expectedDecision,
                rationale: s.rationale,
                required_refs: s.requiredRefs,
                forbidden_inferences: s.forbiddenInferences,
                missing_evidence: s.missingEvidence,
                source_units: s.sourceRefs.map((r) => r.unit.unitCode),
                source_versions: s.versionRefs.map((r) => `${r.version.source.slug}@${r.version.versionLabel}`),
            }),
        );

        return {
            dataset: { code: dataset.code, purpose: dataset.purpose },
            count: lines.length,
            familiesTrain: families.filter((f) => split.get(f) === 'train').length,
            familiesTest: families.filter((f) => split.get(f) === 'test').length,
            jsonl: lines.join('\n'),
            note:
                'Bu çıktı GERÇEK EĞİTİM BAŞLATMAZ. Sentetik senaryolar uzman onayı bekliyor olabilir; ' +
                'bölme senaryo ailesine göre yapıldı (veri sızıntısı önleme).',
        };
    }
}
