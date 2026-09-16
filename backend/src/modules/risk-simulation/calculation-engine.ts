/**
 * SIM_METHODOLOGY_V1 — Risk Simülasyonu hesaplama motoru.
 *
 * Bağımlılıksız, saf fonksiyonlar: girdi → çıktı, DB/HTTP/Prisma YOK. Backend
 * bu dosyayı hem `POST .../calculate` (canlı önizleme, yazmaz) hem kayıt/aktarım
 * sırasında (istemcinin gönderdiği skora güvenmeden yeniden hesaplama) kullanır.
 * Frontend bu motoru KOPYALAMAZ — her girdi değişikliğinde debounce ile aynı
 * `calculate` ucuna gider, böylece "frontend ve backend aynı motor sürümünü
 * kullanmalı" şartı tek kod yoluyla sağlanır.
 *
 * Bu dosyadaki hiçbir formül mevcut envanterin (risks.service.ts, risk-entry.
 * service.ts, risk-management-controls.service.ts) hesaplarını değiştirmez veya
 * onlarla karıştırılmaz — tamamen izole, ayrı ve sürümlü bir metodolojidir.
 */

// ─── Tipler ─────────────────────────────────────────────────────────────────

export type P1 = 'MANUEL' | 'BT_MANUEL' | 'OTOMATIK';
export type P2 = 'TESPIT_EDICI' | 'DUZELTICI' | 'ONLEYICI';
export type P3 = 'IZ_KAYDI_YOK' | 'KULLANICI_SIFRE_SES_EMAIL' | 'SISTEM_LOG_ISLAK_IMZA' | 'ELEKTRONIK_IMZA';
export type P4 = 'YOK' | 'AYNI_EKIP' | 'FARKLI_EKIP' | 'HER_IKISI';
export type P5 = 'YOK' | 'DUZENSIZ_UST_AMIR' | 'DUZENLI_UST_AMIR' | 'FARKLI_BIRIM_GOZETIM';
export type ImpactArea = 'PROBABILITY' | 'IMPACT' | 'BOTH';
export type FinalImpactChoice = 'BUSINESS' | 'INFOSEC';

export interface RiskLevelBand { min: number; max: number; score: number; label: string }
export interface BkpLevelBand { min: number; max: number; label: string; tierReduction: number }

export interface MethodologyConfig {
    version: number;
    p1: Record<P1, number>;
    p2: Record<P2, number>;
    p3: Record<P3, number>;
    p4: Record<P4, number>;
    p5: Record<P5, number>;
    kypDivisor: number;
    kepWeights: { kyp: number; kts: number };
    businessImpactWeights: { financial: number; reputation: number; regulatory: number; customer: number };
    infosecImpactWeights: { confidentiality: number; integrity: number; availability: number };
    riskLevels: RiskLevelBand[]; // doğal risk puanı (1-25) → 5 kademe
    bkpLevels: BkpLevelBand[]; // 5 kademe + kademe azaltım tablosu
    rounding: 'ROUND_HALF_UP';
}

/** SIM_METHODOLOGY_V1 — spec'in kendi sayılarıyla birebir. */
export const METHODOLOGY_V1: MethodologyConfig = {
    version: 1,
    p1: { MANUEL: 0.5, BT_MANUEL: 1, OTOMATIK: 1.5 },
    p2: { TESPIT_EDICI: 0.5, DUZELTICI: 1, ONLEYICI: 1.5 },
    p3: { IZ_KAYDI_YOK: 0, KULLANICI_SIFRE_SES_EMAIL: 0.5, SISTEM_LOG_ISLAK_IMZA: 1, ELEKTRONIK_IMZA: 1.5 },
    p4: { YOK: 0, AYNI_EKIP: 0.5, FARKLI_EKIP: 1, HER_IKISI: 1.5 },
    p5: { YOK: 0, DUZENSIZ_UST_AMIR: 0.5, DUZENLI_UST_AMIR: 1, FARKLI_BIRIM_GOZETIM: 1.5 },
    kypDivisor: 7.5,
    kepWeights: { kyp: 0.40, kts: 0.60 },
    businessImpactWeights: { financial: 0.30, reputation: 0.30, regulatory: 0.20, customer: 0.20 },
    infosecImpactWeights: { confidentiality: 0.35, integrity: 0.30, availability: 0.35 },
    riskLevels: [
        { min: 0, max: 1, score: 1, label: 'Çok Düşük' },
        { min: 2, max: 4, score: 2, label: 'Düşük' },
        { min: 5, max: 10, score: 3, label: 'Orta' },
        { min: 11, max: 16, score: 4, label: 'Yüksek' },
        { min: 17, max: 25, score: 5, label: 'Çok Yüksek' },
    ],
    bkpLevels: [
        { min: 0, max: 20, label: 'Çok Zayıf', tierReduction: 0 },
        { min: 20, max: 40, label: 'Zayıf', tierReduction: 1 },
        { min: 40, max: 60, label: 'Orta', tierReduction: 1 },
        { min: 60, max: 80, label: 'Güçlü', tierReduction: 2 },
        { min: 80, max: 100, label: 'Çok Güçlü', tierReduction: 3 },
    ],
    rounding: 'ROUND_HALF_UP',
};

export interface ControlInput {
    id: string;
    p1: P1; p2: P2; p3: P3; p4: P4; p5: P5;
    /** null = "KTS bilinmiyor" — 0 veya 100 varsayılmaz. */
    kts: number | null;
    /** 0-1 oranı (UI'da % gösterilir, motora girmeden önce /100 yapılır). */
    weight: number;
    impactArea: ImpactArea;
    /** TARGET_KEP modlu bir aksiyon uygulanmışsa P1-P5/KTS'yi bypass eden doğrudan hedef. */
    targetKepOverride?: number;
}

export type ActionEffect =
    | { mode: 'P1P5_KTS'; p1?: P1; p2?: P2; p3?: P3; p4?: P4; p5?: P5; kts?: number }
    | { mode: 'TARGET_KEP'; targetKep: number };

export interface ActionInput {
    id: string;
    targetControlId: string;
    isApplied: boolean;
    priority: number;
    effect: ActionEffect;
}

export interface ActionConflict { controlId: string; field: string; actionIds: string[] }

// ─── Temel formüller ──────────────────────────────────────────────────────

export function calcKYP(control: Pick<ControlInput, 'p1' | 'p2' | 'p3' | 'p4' | 'p5'>, cfg: MethodologyConfig) {
    const raw = cfg.p1[control.p1] + cfg.p2[control.p2] + cfg.p3[control.p3] + cfg.p4[control.p4] + cfg.p5[control.p5];
    const kyp = (raw / cfg.kypDivisor) * 100;
    return { raw, kyp };
}

/** KTS bilinmiyorsa (null) KEP de bilinmez — 0/100 varsayılmaz. */
export function calcKEP(kyp: number, kts: number | null, cfg: MethodologyConfig): number | null {
    if (kts === null) return null;
    return kyp * cfg.kepWeights.kyp + kts * cfg.kepWeights.kts;
}

/** Bir kontrolün KEP'i: TARGET_KEP modlu bir aksiyon uygulanmışsa P1-P5/KTS bypass edilir. */
export function calcControlKep(control: ControlInput, cfg: MethodologyConfig): { raw: number; kyp: number; kep: number | null } {
    const { raw, kyp } = calcKYP(control, cfg);
    if (control.targetKepOverride !== undefined) {
        return { raw, kyp, kep: control.targetKepOverride };
    }
    return { raw, kyp, kep: calcKEP(kyp, control.kts, cfg) };
}

export interface WeightedImpactInputs { financial?: number | null; reputation?: number | null; regulatory?: number | null; customer?: number | null }
export function calcBusinessImpact(i: WeightedImpactInputs, cfg: MethodologyConfig): number | null {
    if (i.financial == null || i.reputation == null || i.regulatory == null || i.customer == null) return null;
    const w = cfg.businessImpactWeights;
    return i.financial * w.financial + i.reputation * w.reputation + i.regulatory * w.regulatory + i.customer * w.customer;
}

export interface InfosecImpactInputs { confidentiality?: number | null; integrity?: number | null; availability?: number | null }
export function calcInfosecImpact(i: InfosecImpactInputs, cfg: MethodologyConfig): number | null {
    if (i.confidentiality == null || i.integrity == null || i.availability == null) return null;
    const w = cfg.infosecImpactWeights;
    return i.confidentiality * w.confidentiality + i.integrity * w.integrity + i.availability * w.availability;
}

/** Ondalıklı ağırlıklı etkiyi 1-5 kademeye çevirir — SIM_METHODOLOGY_V1'in KENDİ
 * kararı olan round-half-up kuralı (onaylı başka bir kural mevcut değildi, bkz. teslim raporu). */
export function roundImpactToTier(impact: number): number {
    const rounded = Math.floor(impact + 0.5);
    return Math.min(5, Math.max(1, rounded));
}

export function calcNaturalRiskLevel(puan: number, cfg: MethodologyConfig): RiskLevelBand {
    const band = cfg.riskLevels.find(b => puan >= b.min && puan <= b.max);
    if (band) return band;
    // Aralık dışı (teorik olarak imkansız, 1-5×1-5=1-25) — en yakın uca sabitle.
    return puan < cfg.riskLevels[0].min ? cfg.riskLevels[0] : cfg.riskLevels[cfg.riskLevels.length - 1];
}

export function calcNaturalRisk(probability: number, impactTier: number, cfg: MethodologyConfig) {
    const puan = probability * impactTier;
    const band = calcNaturalRiskLevel(puan, cfg);
    return { puan, skor: band.score, seviye: band.label };
}

export function getBkpLevel(strength: number, cfg: MethodologyConfig): BkpLevelBand {
    // Spec: "0 ≤ x ≤ 20" (ilk aralık dahil), sonrakiler üst-dahil/alt-hariç.
    for (const band of cfg.bkpLevels) {
        if (strength <= band.max) return band;
    }
    return cfg.bkpLevels[cfg.bkpLevels.length - 1];
}

// ─── Genel BKP (yalnızca gösterim/rozet amaçlı) ───────────────────────────

export interface BkpResult {
    bkp: number | null;
    hasUnknownKts: boolean;
    contributions: { controlId: string; raw: number; kyp: number; kep: number | null; weight: number }[];
    weightTotal: number;
    unallocatedWeight: number;
}

export function calcBKP(controls: ControlInput[], cfg: MethodologyConfig): BkpResult {
    const contributions = controls.map(c => ({ controlId: c.id, ...calcControlKep(c, cfg), weight: c.weight }));
    const weightTotal = controls.reduce((s, c) => s + c.weight, 0);
    const unallocatedWeight = Math.max(0, 1 - weightTotal);
    const hasUnknownKts = contributions.some(c => c.kep === null && c.weight > 0);
    if (hasUnknownKts) return { bkp: null, hasUnknownKts, contributions, weightTotal, unallocatedWeight };
    const bkp = contributions.reduce((sum, c) => sum + (c.kep as number) * c.weight, 0);
    return { bkp, hasUnknownKts: false, contributions, weightTotal, unallocatedWeight };
}

// ─── Bileşen bazlı kontrol gücü (olasılık / etki, YENİDEN NORMALİZE EDİLMEZ) ──

export interface ComponentStrengthResult {
    strength: number | null;
    hasUnknownKts: boolean;
    controlIds: string[];
}

export function calcComponentControlStrength(controls: ControlInput[], area: 'PROBABILITY' | 'IMPACT', cfg: MethodologyConfig): ComponentStrengthResult {
    // "Her ikisi" kontrolü her iki bileşene de katkı verir; ağırlıklar bileşen
    // grubuna göre yeniden %100'e ölçeklenmez — orijinal ağırlıklarla toplanır.
    const relevant = controls.filter(c => c.impactArea === area || c.impactArea === 'BOTH');
    if (relevant.length === 0) return { strength: 0, hasUnknownKts: false, controlIds: [] };
    const contributions = relevant.map(c => ({ id: c.id, ...calcControlKep(c, cfg), weight: c.weight }));
    const hasUnknownKts = contributions.some(c => c.kep === null && c.weight > 0);
    if (hasUnknownKts) return { strength: null, hasUnknownKts, controlIds: relevant.map(c => c.id) };
    const strength = contributions.reduce((sum, c) => sum + (c.kep as number) * c.weight, 0);
    return { strength, hasUnknownKts: false, controlIds: relevant.map(c => c.id) };
}

// ─── Artık risk önerisi (kademe azaltımı — DOĞRUDAN (1-BKP) ÇARPIMI DEĞİL) ───

export interface ResidualSuggestion {
    residualProbability: number | null;
    residualImpact: number | null;
    residualRisk: number | null;
    probabilityReduction: number | null;
    impactReduction: number | null;
    probabilityStrength: number | null;
    impactStrength: number | null;
    hasUnknownKts: boolean;
}

export function calcResidualSuggestion(
    naturalProbability: number,
    naturalImpactTier: number,
    controls: ControlInput[],
    cfg: MethodologyConfig,
): ResidualSuggestion {
    const prob = calcComponentControlStrength(controls, 'PROBABILITY', cfg);
    const impact = calcComponentControlStrength(controls, 'IMPACT', cfg);
    if (prob.strength === null || impact.strength === null) {
        return {
            residualProbability: null, residualImpact: null, residualRisk: null,
            probabilityReduction: null, impactReduction: null,
            probabilityStrength: prob.strength, impactStrength: impact.strength,
            hasUnknownKts: true,
        };
    }
    const probReduction = getBkpLevel(prob.strength, cfg).tierReduction;
    const impactReduction = getBkpLevel(impact.strength, cfg).tierReduction;
    const residualProbability = Math.max(1, naturalProbability - probReduction);
    const residualImpact = Math.max(1, naturalImpactTier - impactReduction);
    return {
        residualProbability, residualImpact, residualRisk: residualProbability * residualImpact,
        probabilityReduction: probReduction, impactReduction, probabilityStrength: prob.strength, impactStrength: impact.strength,
        hasUnknownKts: false,
    };
}

export interface ResidualOverride { probability: number; impact: number; reason: string }
export interface ResolvedResidual {
    probability: number | null;
    impact: number | null;
    risk: number | null;
    level: RiskLevelBand | null;
    isOverridden: boolean;
    reason?: string;
    suggestion: ResidualSuggestion;
}

export function resolveResidual(suggestion: ResidualSuggestion, cfg: MethodologyConfig, override?: ResidualOverride | null): ResolvedResidual {
    if (override) {
        const risk = override.probability * override.impact;
        return {
            probability: override.probability, impact: override.impact, risk,
            level: calcNaturalRiskLevel(risk, cfg), isOverridden: true, reason: override.reason, suggestion,
        };
    }
    if (suggestion.residualProbability === null || suggestion.residualImpact === null) {
        return { probability: null, impact: null, risk: null, level: null, isOverridden: false, suggestion };
    }
    return {
        probability: suggestion.residualProbability, impact: suggestion.residualImpact, risk: suggestion.residualRisk,
        level: calcNaturalRiskLevel(suggestion.residualRisk as number, cfg), isOverridden: false, suggestion,
    };
}

// ─── Aksiyon etkilerinin uygulanması (çakışma tespiti + deterministik birleşim) ──

export interface ApplyActionsResult {
    controls: ControlInput[];
    conflicts: ActionConflict[];
}

/**
 * Uygulanan (isApplied=true) aksiyonları temel kontrol listesine uygular.
 * - Farklı kontrolleri veya aynı kontrolün FARKLI alanlarını hedefleyen aksiyonlar
 *   deterministik biçimde birleştirilir (sıralamaya bağlı gizli bir öncelik YOKTUR).
 * - Aynı kontrolün AYNI alanını FARKLI değerlere hedefleyen aksiyonlar çakışma
 *   olarak raporlanır (conflicts) — hesaplama yine de en düşük `priority` değerine
 *   sahip aksiyonla devam eder (görüntülenebilir bir sonuç üretmek için), ama
 *   arayüz kullanıcıdan açık seçim istemeden aktarıma izin vermemelidir.
 */
export function applyActions(baseControls: ControlInput[], actions: ActionInput[]): ApplyActionsResult {
    const applied = actions.filter(a => a.isApplied).slice().sort((a, b) => a.priority - b.priority);
    const byControl = new Map<string, ActionInput[]>();
    for (const a of applied) {
        if (!byControl.has(a.targetControlId)) byControl.set(a.targetControlId, []);
        byControl.get(a.targetControlId)!.push(a);
    }

    const conflicts: ActionConflict[] = [];
    const result = baseControls.map(c => ({ ...c }));

    for (const [controlId, acts] of byControl) {
        const idx = result.findIndex(c => c.id === controlId);
        if (idx === -1) continue;
        const control = { ...result[idx] };

        const kepActions = acts.filter((a): a is ActionInput & { effect: { mode: 'TARGET_KEP'; targetKep: number } } => a.effect.mode === 'TARGET_KEP');
        const p1p5Actions = acts.filter((a): a is ActionInput & { effect: { mode: 'P1P5_KTS' } & Record<string, unknown> } => a.effect.mode === 'P1P5_KTS');

        if (kepActions.length > 0 && p1p5Actions.length > 0) {
            conflicts.push({ controlId, field: 'mode', actionIds: acts.map(a => a.id) });
        }

        if (kepActions.length > 0) {
            const distinct = new Set(kepActions.map(a => a.effect.targetKep));
            if (distinct.size > 1) conflicts.push({ controlId, field: 'targetKep', actionIds: kepActions.map(a => a.id) });
            control.targetKepOverride = kepActions[0].effect.targetKep;
        } else {
            for (const field of ['p1', 'p2', 'p3', 'p4', 'p5'] as const) {
                const touching = p1p5Actions.filter(a => (a.effect as Record<string, unknown>)[field] !== undefined);
                if (touching.length === 0) continue;
                const distinct = new Set(touching.map(a => (a.effect as Record<string, unknown>)[field]));
                if (distinct.size > 1) conflicts.push({ controlId, field, actionIds: touching.map(a => a.id) });
                (control as Record<string, unknown>)[field] = (touching[0].effect as Record<string, unknown>)[field];
            }
            const ktsTouching = p1p5Actions.filter(a => (a.effect as Record<string, unknown>).kts !== undefined);
            if (ktsTouching.length > 0) {
                const distinct = new Set(ktsTouching.map(a => (a.effect as Record<string, unknown>).kts));
                if (distinct.size > 1) conflicts.push({ controlId, field: 'kts', actionIds: ktsTouching.map(a => a.id) });
                control.kts = (ktsTouching[0].effect as Record<string, unknown>).kts as number;
            }
        }
        result[idx] = control;
    }

    return { controls: result, conflicts };
}

// ─── Tam senaryo hesaplaması (orkestrasyon) ───────────────────────────────

export interface ScenarioCalcInput {
    cfg: MethodologyConfig;
    naturalProbability: number; // 1-5
    businessImpactInputs?: WeightedImpactInputs;
    infosecImpactInputs?: InfosecImpactInputs;
    finalImpactChoice: FinalImpactChoice;
    controls: ControlInput[];
    actions: ActionInput[];
    residualOverride?: ResidualOverride | null;
}

export interface ScenarioSnapshotResult {
    naturalRisk: ReturnType<typeof calcNaturalRisk> | null;
    finalImpactTier: number | null;
    bkp: BkpResult;
    residualSuggestion: ResidualSuggestion;
}

export interface ActionContribution {
    actionId: string;
    standalone: { residualRisk: number | null; bkp: number | null };
    marginal: { residualRisk: number | null; bkp: number | null };
    kepBefore: number | null;
    kepAfter: number | null;
}

export interface ScenarioCalcResult {
    naturalProbability: number;
    businessImpact: { raw: number | null; tier: number | null };
    infosecImpact: { raw: number | null; tier: number | null };
    finalImpactTier: number | null;
    naturalRisk: ReturnType<typeof calcNaturalRisk> | null;
    baseline: ScenarioSnapshotResult; // aksiyonlar uygulanmadan ÖNCE
    target: ScenarioSnapshotResult & { conflicts: ActionConflict[] }; // uygulanan aksiyonlarla
    residual: ResolvedResidual; // target'ın önerisi + varsa override
    actionContributions: ActionContribution[];
    weightCheck: { totalWeight: number; unallocatedWeight: number; isComplete: boolean; isOverAllocated: boolean };
}

function snapshotFor(naturalProbability: number, finalImpactTier: number | null, controls: ControlInput[], cfg: MethodologyConfig): ScenarioSnapshotResult {
    const naturalRisk = finalImpactTier !== null ? calcNaturalRisk(naturalProbability, finalImpactTier, cfg) : null;
    const bkp = calcBKP(controls, cfg);
    const residualSuggestion = finalImpactTier !== null
        ? calcResidualSuggestion(naturalProbability, finalImpactTier, controls, cfg)
        : { residualProbability: null, residualImpact: null, residualRisk: null, probabilityReduction: null, impactReduction: null, probabilityStrength: null, impactStrength: null, hasUnknownKts: true };
    return { naturalRisk, finalImpactTier, bkp, residualSuggestion };
}

export function calculateScenario(input: ScenarioCalcInput): ScenarioCalcResult {
    const { cfg } = input;
    const businessRaw = input.businessImpactInputs ? calcBusinessImpact(input.businessImpactInputs, cfg) : null;
    const infosecRaw = input.infosecImpactInputs ? calcInfosecImpact(input.infosecImpactInputs, cfg) : null;
    const businessTier = businessRaw !== null ? roundImpactToTier(businessRaw) : null;
    const infosecTier = infosecRaw !== null ? roundImpactToTier(infosecRaw) : null;
    const finalImpactTier = input.finalImpactChoice === 'BUSINESS' ? businessTier : infosecTier;

    const naturalRisk = finalImpactTier !== null ? calcNaturalRisk(input.naturalProbability, finalImpactTier, cfg) : null;

    const baseline = snapshotFor(input.naturalProbability, finalImpactTier, input.controls, cfg);
    const { controls: appliedControls, conflicts } = applyActions(input.controls, input.actions);
    const targetSnapshot = snapshotFor(input.naturalProbability, finalImpactTier, appliedControls, cfg);
    const target = { ...targetSnapshot, conflicts };

    const residual = resolveResidual(target.residualSuggestion, cfg, input.residualOverride ?? undefined);

    // Aksiyon katkıları: her aksiyon için hem "tek başına" (yalnız o aksiyon açık)
    // hem "marjinal" (diğer tümü açıkken bunu kapatınca ne değişir) hesaplanır.
    const appliedActionIds = input.actions.filter(a => a.isApplied).map(a => a.id);
    const actionContributions: ActionContribution[] = input.actions.map(action => {
        const controlBefore = input.controls.find(c => c.id === action.targetControlId);
        const kepBefore = controlBefore ? calcControlKep(controlBefore, cfg).kep : null;

        const standaloneActions = input.actions.map(a => ({ ...a, isApplied: a.id === action.id }));
        const { controls: standaloneControls } = applyActions(input.controls, standaloneActions);
        const standaloneSnap = snapshotFor(input.naturalProbability, finalImpactTier, standaloneControls, cfg);
        const standaloneResidual = resolveResidual(standaloneSnap.residualSuggestion, cfg);
        const controlAfterStandalone = standaloneControls.find(c => c.id === action.targetControlId);
        const kepAfter = controlAfterStandalone ? calcControlKep(controlAfterStandalone, cfg).kep : null;

        const withoutThisActions = input.actions.map(a => (a.id === action.id ? { ...a, isApplied: false } : a));
        const { controls: withoutThisControls } = applyActions(input.controls, withoutThisActions);
        const withoutThisSnap = snapshotFor(input.naturalProbability, finalImpactTier, withoutThisControls, cfg);
        const withoutThisResidual = resolveResidual(withoutThisSnap.residualSuggestion, cfg);

        const marginalResidualRisk = appliedActionIds.includes(action.id) && withoutThisResidual.risk !== null && residual.risk !== null
            ? residual.risk - withoutThisResidual.risk
            : null;
        const marginalBkp = appliedActionIds.includes(action.id) && withoutThisSnap.bkp.bkp !== null && target.bkp.bkp !== null
            ? target.bkp.bkp - withoutThisSnap.bkp.bkp
            : null;

        return {
            actionId: action.id,
            standalone: { residualRisk: standaloneResidual.risk, bkp: standaloneSnap.bkp.bkp },
            marginal: { residualRisk: marginalResidualRisk, bkp: marginalBkp },
            kepBefore, kepAfter,
        };
    });

    const totalWeight = input.controls.reduce((s, c) => s + c.weight, 0);
    const weightCheck = {
        totalWeight,
        unallocatedWeight: Math.max(0, 1 - totalWeight),
        isComplete: Math.abs(totalWeight - 1) < 1e-9,
        isOverAllocated: totalWeight > 1 + 1e-9,
    };

    return {
        naturalProbability: input.naturalProbability,
        businessImpact: { raw: businessRaw, tier: businessTier },
        infosecImpact: { raw: infosecRaw, tier: infosecTier },
        finalImpactTier,
        naturalRisk,
        baseline,
        target,
        residual,
        actionContributions,
        weightCheck,
    };
}
