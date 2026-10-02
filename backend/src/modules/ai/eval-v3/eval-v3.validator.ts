// v3 çıktının YAPISAL + iç-tutarlılık doğrulaması (saf fonksiyon).
// "Atıf gerçekten retrieval kümesinde mi" kontrolü AYRI katmandır
// (eval-v3.references.ts); ikisi birlikte AiEvalService'te çalışır.
//
// Beyaz liste yaklaşımı: model şemada olmayan anahtar üretirse (özellikle eski
// Gereklilik/Uygulanabilirlik/Sonuç/Gerekçe yapısı) bu anahtarlar atılır.

import {
    CONTROL_STATUSES, REF_ASSESSMENTS, REF_SOURCE_TYPES,
    EvalV3Evidence, EvalV3Finding, EvalV3Output, EvalV3Reference, V3Issue,
} from './eval-v3.types';
import { BANNED_PHRASES, LEGACY_FOUR_COLUMN_KEYS } from './eval-v3.constants';

export interface V3ValidationResult {
    valid: boolean;
    issues: V3Issue[];
    /** Yalnız beyaz listedeki alanlarla, güvenli-okunur kopya. valid değilse null. */
    normalized: EvalV3Output | null;
}

function isObj(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => (x as string).trim()) : [];

export function validateEvalV3Output(parsed: unknown): V3ValidationResult {
    const issues: V3Issue[] = [];
    const err = (path: string, message: string) => issues.push({ path, message, severity: 'ERROR' });
    const warn = (path: string, message: string) => issues.push({ path, message, severity: 'WARN' });

    if (!isObj(parsed)) {
        return {
            valid: false,
            issues: [{ path: '$', message: 'Model çıktısı JSON nesnesi değil.', severity: 'ERROR' }],
            normalized: null,
        };
    }

    // Eski dört sütunlu yapı gelirse atılır ve işaretlenir.
    const legacyHits = Object.keys(parsed).filter((k) => LEGACY_FOUR_COLUMN_KEYS.includes(k));
    if (legacyHits.length > 0) {
        warn('$', `Eski dört sütunlu yapıya ait alan(lar) yok sayıldı: ${legacyHits.join(', ')}.`);
    }

    const expectedState = str(parsed.expectedState);
    if (!expectedState) err('expectedState', 'Beklenen Durum boş.');

    // Kanıtlar
    const evidence: EvalV3Evidence[] = [];
    if (!Array.isArray(parsed.evaluatedEvidence)) {
        err('evaluatedEvidence', 'evaluatedEvidence dizi değil.');
    } else {
        parsed.evaluatedEvidence.forEach((e, i) => {
            if (!isObj(e)) { err(`evaluatedEvidence[${i}]`, 'Nesne değil.'); return; }
            const evidenceId = str(e.evidenceId);
            if (!evidenceId) { err(`evaluatedEvidence[${i}].evidenceId`, 'evidenceId boş.'); return; }
            evidence.push({
                evidenceId, name: str(e.name), type: str(e.type),
                observation: str(e.observation), limitations: str(e.limitations),
            });
        });
    }

    // Kontrol sonucu
    let status = 'INSUFFICIENT_EVIDENCE' as EvalV3Output['controlResult']['status'];
    let resultText = '';
    if (!isObj(parsed.controlResult)) {
        err('controlResult', 'controlResult nesnesi yok.');
    } else {
        const cr = parsed.controlResult;
        if (!CONTROL_STATUSES.includes(cr.status as never)) {
            err('controlResult.status', `Geçersiz durum: ${String(cr.status)}`);
        } else {
            status = cr.status as typeof status;
        }
        resultText = str(cr.text);
        if (!resultText) err('controlResult.text', 'Kontrol Sonucu metni boş.');
    }

    // Atıflar (model künyesi — DB doğrulaması ayrı katmanda)
    const references: EvalV3Reference[] = [];
    const seenRefIds = new Set<string>();
    if (!Array.isArray(parsed.references)) {
        err('references', 'references dizi değil.');
    } else {
        parsed.references.forEach((r, i) => {
            if (!isObj(r)) { err(`references[${i}]`, 'Nesne değil.'); return; }
            const refId = str(r.refId) || `REF${i + 1}`;
            if (seenRefIds.has(refId)) { err(`references[${i}].refId`, `Yinelenen refId: ${refId}`); return; }
            seenRefIds.add(refId);
            if (!REF_SOURCE_TYPES.includes(r.sourceType as never)) {
                err(`references[${i}].sourceType`, `Geçersiz: ${String(r.sourceType)}`);
            }
            if (!REF_ASSESSMENTS.includes(r.assessment as never)) {
                err(`references[${i}].assessment`, `Geçersiz: ${String(r.assessment)}`);
            }
            const sourceUnitId = str(r.sourceUnitId);
            if (!sourceUnitId) err(`references[${i}].sourceUnitId`, 'sourceUnitId zorunlu (yalnız verilen kaynak bloğundaki id).');
            const page = typeof r.page === 'number' && Number.isFinite(r.page) ? Math.trunc(r.page) : null;
            references.push({
                refId,
                sourceType: r.sourceType as EvalV3Reference['sourceType'],
                sourceName: str(r.sourceName), version: str(r.version),
                articleNumber: str(r.articleNumber), articleTitle: str(r.articleTitle),
                page, sourceUnitId, relation: str(r.relation),
                assessment: r.assessment as EvalV3Reference['assessment'],
            });
        });
    }

    const impact = str(parsed.impact);
    if (!impact) warn('impact', 'Etki boş.');
    const recommendation = str(parsed.recommendation);
    if (!recommendation) warn('recommendation', 'Öneri boş.');

    // Bulgu
    let finding: EvalV3Finding = { exists: false, title: '', explanation: '', relatedReferenceIds: [] };
    if (!isObj(parsed.finding)) {
        err('finding', 'finding nesnesi yok.');
    } else {
        const f = parsed.finding;
        if (typeof f.exists !== 'boolean') err('finding.exists', 'finding.exists boolean olmalı.');
        finding = {
            exists: f.exists === true,
            title: str(f.title), explanation: str(f.explanation),
            relatedReferenceIds: strArr(f.relatedReferenceIds),
        };
        if (finding.exists) {
            if (!finding.title) err('finding.title', 'Bulgu varken başlık zorunlu.');
            if (!finding.explanation) err('finding.explanation', 'Bulgu varken açıklama zorunlu.');
            if (finding.relatedReferenceIds.length === 0) {
                err('finding.relatedReferenceIds', 'Bulgu varken ilişkili kaynak atfı (sourceUnitId) zorunlu.');
            }
        }
    }

    const additionalEvidenceRequired = strArr(parsed.additionalEvidenceRequired);

    // Durum tutarlılığı (görev §9)
    if (status === 'INSUFFICIENT_EVIDENCE') {
        if (finding.exists) {
            err('finding.exists', 'Kanıt yetersizken (INSUFFICIENT_EVIDENCE) kesin bulgu üretilemez; ek kanıt ihtiyacı belirtilmelidir.');
        }
        if (additionalEvidenceRequired.length === 0) {
            err('additionalEvidenceRequired', 'Kanıt yetersizken eksik kanıtlar ve yapılması gereken inceleme listelenmelidir.');
        }
    }
    if (status === 'COMPLIANT' && finding.exists) {
        err('finding.exists', 'Kontrol sonucu COMPLIANT iken bulgu bulunamaz.');
    }
    if ((status === 'NON_COMPLIANT') && !finding.exists) {
        warn('finding.exists', 'Kontrol sonucu NON_COMPLIANT ancak bulgu oluşturulmadı — insan incelemesi gerekir.');
    }

    // finding → refId çapraz kontrolü
    for (const id of finding.relatedReferenceIds) {
        if (!seenRefIds.has(id)) err('finding.relatedReferenceIds', `İlişkili refId "${id}" references içinde yok.`);
    }

    // Dil kuralları (uyarı — insan incelemesi)
    const langTarget = [
        ['controlResult.text', resultText], ['finding.explanation', finding.explanation],
        ['impact', impact], ['expectedState', expectedState],
    ] as const;
    for (const [path, text] of langTarget) {
        for (const b of BANNED_PHRASES) {
            if (b.pattern.test(text)) warn(path, `Kaçınılması gereken ifade: "${b.label}".`);
        }
    }

    let reEvaluation: EvalV3Output['reEvaluation'] = null;
    if (isObj(parsed.reEvaluation)) {
        const r = parsed.reEvaluation;
        reEvaluation = {
            changed: r.changed === true,
            changedPoints: strArr(r.changedPoints),
            unchangedPoints: strArr(r.unchangedPoints),
            explanation: str(r.explanation),
        };
    }

    const hasError = issues.some((x) => x.severity === 'ERROR');
    if (hasError) return { valid: false, issues, normalized: null };

    const normalized: EvalV3Output = {
        expectedState,
        evaluatedEvidence: evidence,
        controlResult: { status, text: resultText },
        references,
        impact,
        recommendation,
        finding,
        additionalEvidenceRequired,
        usedSourceUnitIds: [], // backend, doğrulanmış atıflardan yeniden hesaplar
        reEvaluation,
    };
    return { valid: true, issues, normalized };
}
