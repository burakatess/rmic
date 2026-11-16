import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { nextCounterValue, formatRecordId } from '../../common/util/sequential-id';
import { AccessScopeService, and, riskWhere, type AccessActor } from '../../common/services/access-scope.service';
import { calcNaturalRiskLevel, getBkpLevel, type MethodologyConfig } from './calculation-engine';
import { calculateScenarioRow, RiskSimulationService } from './risk-simulation.service';
import { matchPOptions } from './p-option-match';

/**
 * Risk simülasyonu ÇALIŞMA ALANI: risk kütüğünün tamamı tek ekranda. Kapsamdaki her risk
 * için bir senaryo açılır (mevcut motor ve senaryo/kontrol uçları aynen kullanılır).
 * Kaynak: Risk Envanteri + Kontrol Alanı (RiskControl). Gerçek envantere hiçbir şey yazılmaz;
 * aktarım ayrı, onaylı bir adımdır.
 *
 * Metodoloji uygulamanın mevcut simülasyon metodolojisidir (P1–P5 + KTS → KEP → ağırlıklı
 * BKP → kademe düşürme). Kontrol Alanı'nda KTS ve ağırlık bulunmadığından:
 *  - KTS boş başlar (motor "KTS bilinmiyor" der, 0/100 varsaymaz),
 *  - ağırlık riskin aktif kontrolleri arasında eşit paylaştırılarak başlar (yer tutucu;
 *    kullanıcı düzenler ve ekranda "varsayılan ağırlık" olarak belirtilir).
 */

const SCENARIO_ROW_INCLUDE = {
    controls: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
    actions: { orderBy: [{ priority: 'asc' as const }, { createdAt: 'asc' as const }] },
    methodology: true,
};

function riskRecordSnapshot(risk: any) {
    return {
        riskId: risk.riskId, kayitId: risk.kayitId, name: risk.name, description: risk.description,
        status: risk.status, surec: risk.surec, altSurec: risk.altSurec, ilgiliGmy: risk.ilgiliGmy,
        riskSahibi: risk.owner ? `${risk.owner.firstName} ${risk.owner.lastName}` : null,
        riskSorumlusu: risk.riskSorumlusu, riskIsleme: risk.riskIsleme, ozet: risk.ozet,
        flagForIT: risk.flagForIT, directorate: risk.directorate?.name ?? null,
        mutabakatTarihi: risk.mutabakatTarihi, createdAt: risk.createdAt, updatedAt: risk.updatedAt,
        finansalEtki: risk.finansalEtki, itibarEtkisi: risk.itibarEtkisi, regulasyonEtkisi: risk.regulasyonEtkisi, musteriEtkisi: risk.musteriEtkisi,
        gizlilikEtkisi: risk.gizlilikEtkisi, butunlukEtkisi: risk.butunlukEtkisi, erisilebilirlikEtkisi: risk.erisilebilirlikEtkisi,
        olasilik: risk.olasilik,
        // Kayıtlı (envanterdeki) sonuçlar — "kayıttan sapma" karşılaştırması için.
        record: {
            dogalRiskPuani: risk.dogalRiskPuani, dogalRiskSeviyesi: risk.dogalRiskSeviyesi,
            kalintiRiskPuani: risk.kalintiRiskPuani ?? risk.residualRiskScore ?? null, kalintiRiskSeviyesi: risk.kalintiRiskSeviyesi,
        },
        version: risk.version, capturedAt: new Date().toISOString(),
    };
}

/** Değişiklik tespiti için senaryonun karşılaştırılabilir izdüşümü (kimlikten bağımsız). */
function projection(s: {
    naturalProbability: number; finalImpactChoice: string;
    finansalEtki: number | null; itibarEtkisi: number | null; regulasyonEtkisi: number | null; musteriEtkisi: number | null;
    gizlilikEtkisi: number | null; butunlukEtkisi: number | null; erisilebilirlikEtkisi: number | null;
    controls: any[];
}) {
    return JSON.stringify({
        p: s.naturalProbability, f: s.finalImpactChoice,
        i: [s.finansalEtki, s.itibarEtkisi, s.regulasyonEtkisi, s.musteriEtkisi, s.gizlilikEtkisi, s.butunlukEtkisi, s.erisilebilirlikEtkisi].map(v => v ?? null),
        c: s.controls.map(c => [c.sourceRiskControlId ?? null, c.name, c.description ?? null, c.p1, c.p2, c.p3, c.p4, c.p5,
            c.ktsManualValue ?? null, Math.round((c.weight ?? 0) * 10000), c.impactArea, c.isApproved !== false])
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    });
}

@Injectable()
export class WorkspaceService {
    constructor(private prisma: PrismaService, private scope: AccessScopeService, private sims: RiskSimulationService) { }

    async createWorkspace(dto: { name: string; description?: string }, actor: AccessActor) {
        const ctx = await this.scope.context(actor);
        const methodology = await this.sims.getActiveMethodology();
        const risks = await this.prisma.risk.findMany({
            where: and<Prisma.RiskWhereInput>({ status: { not: 'CLOSED' } }, riskWhere(ctx)),
            include: {
                owner: { select: { firstName: true, lastName: true } },
                directorate: { select: { name: true } },
                riskControls: { include: { riskControl: true } },
            },
            orderBy: { riskId: 'asc' },
        });
        if (risks.length === 0) throw new BadRequestException('Kapsamınızda simüle edilecek risk bulunamadı.');

        const simulationId = formatRecordId('SIM', await nextCounterValue(this.prisma, 'risk-simulation'));
        const unmatched: { riskId: string; kontrolId: string; param: string; text: string }[] = [];
        const result = await this.prisma.$transaction(async (tx) => {
            const sim = await tx.riskSimulation.create({
                data: { simulationId, name: dto.name, description: dto.description, mode: 'WORKSPACE', createdById: actor.id },
            });
            for (const risk of risks) {
                const links = risk.riskControls.map(l => l.riskControl);
                const activeCount = links.filter(c => c.status === 'AKTIF').length;
                // Eşit pay (toplam %100'ü aşmayacak biçimde aşağı yuvarlanır); onaysızlara pay verilmez.
                const share = activeCount > 0 ? Math.floor(10000 / activeCount) / 10000 : 0;
                const controls = links.map((c, i) => {
                    const m = matchPOptions(c);
                    m.unmatched.forEach(u => unmatched.push({ riskId: risk.riskId, kontrolId: c.kontrolId, ...u }));
                    const approved = c.status === 'AKTIF';
                    return {
                        sourceRiskControlId: c.id, name: c.kontrolId, description: c.kontrolTanimi ?? null,
                        p1: m.p1, p2: m.p2, p3: m.p3, p4: m.p4, p5: m.p5,
                        ktsMode: 'MANUAL' as const, ktsManualValue: null, weight: approved ? share : 0, impactArea: 'BOTH' as const,
                        isApproved: approved, sortOrder: i,
                    };
                });
                const riskFields = {
                    naturalProbability: risk.olasilik ?? risk.inherentProbability ?? 3,
                    finansalEtki: risk.finansalEtki, itibarEtkisi: risk.itibarEtkisi, regulasyonEtkisi: risk.regulasyonEtkisi, musteriEtkisi: risk.musteriEtkisi,
                    gizlilikEtkisi: risk.gizlilikEtkisi, butunlukEtkisi: risk.butunlukEtkisi, erisilebilirlikEtkisi: risk.erisilebilirlikEtkisi,
                    finalImpactChoice: (risk.flagForIT ? 'INFOSEC' : 'BUSINESS') as 'INFOSEC' | 'BUSINESS',
                };
                const scenario = await tx.riskSimulationScenario.create({
                    data: {
                        simulationId: sim.id, name: risk.riskId, methodologyVersionId: methodology.id,
                        sourceType: 'EXISTING_RISK', sourceRiskId: risk.id,
                        sourceRiskSnapshot: riskRecordSnapshot(risk) as Prisma.InputJsonValue,
                        sourceCapturedVersion: risk.version, sourceCapturedAt: new Date(),
                        ...riskFields,
                        initialStateSnapshot: { ...riskFields, controls } as Prisma.InputJsonValue,
                        createdById: actor.id,
                    },
                });
                if (controls.length) {
                    await tx.riskSimulationControl.createMany({ data: controls.map(c => ({ ...c, scenarioId: scenario.id })) });
                }
            }
            await tx.auditLog.create({
                data: { userId: actor.id, action: 'CREATE', entityType: 'RiskSimulation', entityId: sim.id, newValue: { ...sim, riskCount: risks.length } as Prisma.InputJsonValue },
            });
            return sim;
        }, { timeout: 60_000 });
        return { ...result, riskCount: risks.length, unmatched };
    }

    async getWorkspace(simulationId: string) {
        const sim = await this.prisma.riskSimulation.findUnique({
            where: { id: simulationId },
            include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
        });
        if (!sim) throw new NotFoundException('Risk simülasyonu bulunamadı');
        if (sim.mode !== 'WORKSPACE') throw new BadRequestException('Bu simülasyon bir çalışma alanı değil.');
        const scenarios = await this.prisma.riskSimulationScenario.findMany({
            where: { simulationId }, include: SCENARIO_ROW_INCLUDE, orderBy: { name: 'asc' },
        });

        const levels = ['Çok Yüksek', 'Yüksek', 'Orta', 'Düşük', 'Çok Düşük'];
        const simDist = Object.fromEntries(levels.map(l => [l, 0])) as Record<string, number>;
        const recDist = Object.fromEntries(levels.map(l => [l, 0])) as Record<string, number>;
        let activeControls = 0, deviation = 0, changed = 0, unknownResidual = 0;

        const rows = scenarios.map(s => {
            const cfg = s.methodology.config as unknown as MethodologyConfig;
            const calc = calculateScenarioRow(s);
            const snap = (s.sourceRiskSnapshot ?? {}) as any;
            const active = s.controls.filter(c => c.isApproved).length;
            activeControls += active;
            const bkp = calc.target.bkp.bkp;
            const residual = calc.residual;
            if (residual.level) simDist[residual.level.label] = (simDist[residual.level.label] ?? 0) + 1; else unknownResidual++;
            const recResidual: number | null = snap.record?.kalintiRiskPuani ?? null;
            if (recResidual !== null) { const b = calcNaturalRiskLevel(Math.round(recResidual), cfg); recDist[b.label] = (recDist[b.label] ?? 0) + 1; }
            const recNatural: number | null = snap.record?.dogalRiskPuani ?? null;
            // Sapma: kayıtta değer VARSA ve simülasyon sonucu ondan farklıysa (kayıt boşsa sapma sayılmaz).
            const devNatural = recNatural !== null && calc.naturalRisk !== null && Math.abs(recNatural - calc.naturalRisk.puan) > 0.001;
            const devResidual = recResidual !== null && residual.risk !== null && Math.abs(recResidual - residual.risk) > 0.001;
            if (devNatural || devResidual) deviation++;
            const isChanged = projection(s as any) !== projection({ ...(s.initialStateSnapshot as any), controls: (s.initialStateSnapshot as any)?.controls ?? [] });
            if (isChanged) changed++;
            return {
                scenarioId: s.id, riskDbId: s.sourceRiskId, riskId: snap.riskId ?? s.name, name: snap.name ?? s.name,
                description: snap.description ?? null, surec: snap.surec ?? null, altSurec: snap.altSurec ?? null,
                natural: calc.naturalRisk ? { probability: s.naturalProbability, impact: calc.finalImpactTier, puan: calc.naturalRisk.puan, level: calc.naturalRisk.seviye } : null,
                bkp: { value: bkp, level: bkp !== null ? getBkpLevel(bkp, cfg).label : null, unknownKts: calc.target.bkp.hasUnknownKts },
                residual: residual.risk !== null ? { probability: residual.probability, impact: residual.impact, risk: residual.risk, level: residual.level?.label ?? null, overridden: residual.isOverridden } : null,
                controls: { active, total: s.controls.length },
                record: { natural: recNatural, residual: recResidual, residualLevel: recResidual !== null ? calcNaturalRiskLevel(Math.round(recResidual), cfg).label : null },
                deviation: { natural: devNatural, residual: devResidual },
                changed: isChanged,
            };
        });
        const source = ((scenarios[0]?.sourceRiskSnapshot as any)?.source ?? 'PLATFORM') as 'PLATFORM' | 'EXCEL';
        const activeTest = await this.prisma.riskSimulationTest.findUnique({
            where: { activeFor: simulationId }, select: { id: true, name: true, startedAt: true },
        });
        const cfg0 = scenarios[0]?.methodology.config as unknown as MethodologyConfig | undefined;
        return {
            simulation: sim,
            source,
            activeTest,
            // Isı haritası hücre renkleri: doğal risk puanı (olasılık × etki) seviye sınırları.
            riskLevels: cfg0?.riskLevels ?? [],
            summary: { riskCount: rows.length, activeControls, residualDistribution: simDist, recordDistribution: recDist, unknownResidual, deviationCount: deviation, changedCount: changed },
            rows,
        };
    }
}
