// Kontrol & Kanıt Değerlendirme — v2 yapılandırılmış çıktının RUNTIME doğrulaması.
//
// Bu katman YALNIZ yapısal + iç-tutarlılık kontrolü yapar. "Atıf gerçekten bu
// gerekliliği destekliyor mu" (anlam) kontrolü AYRI bir katmandır
// (AiEvalService.verifyOutputCitationsV2 → DB'ye karşı). Task §6: yapısal
// doğrulama ile anlam desteği ayrılmalı.

export const REQ_RESULTS = [
    'MET', 'PARTIALLY_MET', 'NOT_MET', 'INSUFFICIENT_EVIDENCE', 'OUT_OF_SCOPE',
] as const;
export const APPLICABILITY = ['APPLICABLE', 'NOT_APPLICABLE', 'UNDETERMINED'] as const;
export const CONTROL_OVERALL = ['MET', 'PARTIALLY_MET', 'NOT_MET', 'INSUFFICIENT_EVIDENCE'] as const;
export const IMPACT_TYPES = ['REALIZED', 'POTENTIAL', 'UNDETERMINED'] as const;

export interface SchemaIssue {
    path: string;
    message: string;
    severity: 'ERROR' | 'WARN';
}

export interface EvalValidationResult {
    valid: boolean; // ERROR yoksa true
    issues: SchemaIssue[];
    /** Eksik dizi/alanlar tamamlanmış, güvenli-okunur kopya (valid ise). */
    normalized: Record<string, unknown> | null;
}

const ARRAY_KEYS = [
    'expectedState', 'evaluatedEvidence', 'requirementAssessments', 'recommendations',
    'findingAssessment', 'sourceReferences', 'evidenceReferences', 'limitations', 'conflicts',
] as const;

function isObj(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function validateEvalOutput(parsed: unknown): EvalValidationResult {
    const issues: SchemaIssue[] = [];
    const err = (path: string, message: string) => issues.push({ path, message, severity: 'ERROR' });
    const warn = (path: string, message: string) => issues.push({ path, message, severity: 'WARN' });

    if (!isObj(parsed)) {
        return {
            valid: false,
            issues: [{ path: '$', message: 'Model çıktısı JSON nesnesi değil.', severity: 'ERROR' }],
            normalized: null,
        };
    }
    const o: Record<string, unknown> = { ...parsed };

    if (typeof o.summary !== 'string' || !o.summary.trim()) {
        err('summary', 'summary boş veya string değil.');
    }

    // Diziler
    for (const k of ARRAY_KEYS) {
        if (o[k] === undefined || o[k] === null) {
            warn(k, `${k} eksik — boş dizi kabul edildi.`);
            o[k] = [];
        } else if (!Array.isArray(o[k])) {
            err(k, `${k} dizi değil.`);
            o[k] = [];
        }
    }

    // controlResult
    if (!isObj(o.controlResult)) {
        err('controlResult', 'controlResult nesnesi yok.');
        o.controlResult = { overall: 'INSUFFICIENT_EVIDENCE', summary: '', samplingPeriodLimits: '' };
    } else {
        const cr = o.controlResult as Record<string, unknown>;
        if (!CONTROL_OVERALL.includes(cr.overall as never)) {
            err('controlResult.overall', `overall geçersiz: ${String(cr.overall)}`);
        }
        if (typeof cr.summary !== 'string') cr.summary = '';
        if (typeof cr.samplingPeriodLimits !== 'string') {
            warn('controlResult.samplingPeriodLimits', 'Örneklem/dönem sınırı belirtilmemiş.');
            cr.samplingPeriodLimits = '';
        }
    }

    // impact
    if (!isObj(o.impact)) {
        err('impact', 'impact nesnesi yok.');
        o.impact = { type: 'UNDETERMINED', description: '', note: '' };
    } else {
        const im = o.impact as Record<string, unknown>;
        if (!IMPACT_TYPES.includes(im.type as never)) {
            err('impact.type', `impact.type geçersiz: ${String(im.type)}`);
        }
    }

    // changesSincePreviousRun
    if (!isObj(o.changesSincePreviousRun)) {
        warn('changesSincePreviousRun', 'changesSincePreviousRun nesnesi yok — varsayılan eklendi.');
        o.changesSincePreviousRun = {
            hasPrevious: false, changed: false, newEvidence: [], changedSources: [],
            changedResults: [], explanationIfUnchanged: '',
        };
    }

    // requirementAssessments — her giriş
    const reqs = o.requirementAssessments as unknown[];
    const applicableUnmet: string[] = [];
    reqs.forEach((r, i) => {
        if (!isObj(r)) {
            err(`requirementAssessments[${i}]`, 'Nesne değil.');
            return;
        }
        if (!APPLICABILITY.includes(r.applicability as never)) {
            err(`requirementAssessments[${i}].applicability`, `Geçersiz: ${String(r.applicability)}`);
        }
        if (!REQ_RESULTS.includes(r.result as never)) {
            err(`requirementAssessments[${i}].result`, `Geçersiz: ${String(r.result)}`);
        }
        if (typeof r.rationale !== 'string' || !r.rationale.trim()) {
            warn(`requirementAssessments[${i}].rationale`, 'Gerekçe boş.');
        }
        if (
            r.applicability === 'UNDETERMINED' &&
            (r.result === 'NOT_MET' || r.result === 'MET')
        ) {
            err(
                `requirementAssessments[${i}]`,
                'Uygulanabilirlik UNDETERMINED iken kesin sonuç (MET/NOT_MET) verilemez.',
            );
        }
        if (
            r.applicability === 'APPLICABLE' &&
            (r.result === 'NOT_MET' || r.result === 'INSUFFICIENT_EVIDENCE')
        ) {
            applicableUnmet.push(String((r as { requirementKey?: unknown }).requirementKey ?? i));
        }
    });

    // Genel sonuç tutarlılığı (task §4)
    const overall = (o.controlResult as Record<string, unknown>)?.overall;
    if (overall === 'MET' && applicableUnmet.length > 0) {
        err(
            'controlResult.overall',
            `Genel sonuç "MET" olamaz: uygulanabilir gereklilik(ler) karşılanmıyor/kanıt yetersiz (${applicableUnmet.join(', ')}).`,
        );
    }
    if (reqs.length === 0) {
        warn('requirementAssessments', 'Hiç gereklilik değerlendirmesi yok.');
    }

    // Kanıt yetersizken "desteklenen" bulgu adayı — büyük olasılıkla "kayıt eksik"
    // türü; insan incelemesine işaret et (task §3: kanıt yokluğu ≠ uyumsuzluk).
    const findings = Array.isArray(o.findingAssessment) ? (o.findingAssessment as unknown[]) : [];
    const supportedFindings = findings.filter((f) => isObj(f) && f.supported !== false).length;
    if (overall === 'INSUFFICIENT_EVIDENCE' && supportedFindings > 0) {
        warn(
            'findingAssessment',
            'Genel sonuç "kanıt yetersiz" iken desteklenen bulgu adayı var — "kayıt/kanıt eksik" bir bulgu değildir; insan incelemesi gerekir.',
        );
    }

    const hasError = issues.some((x) => x.severity === 'ERROR');
    return { valid: !hasError, issues, normalized: hasError ? null : o };
}
