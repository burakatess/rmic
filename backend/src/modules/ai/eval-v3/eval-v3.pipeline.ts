// Model cevabının işlenmesi: şema doğrulama → atıf doğrulama/zenginleştirme → kanıt eşleme.
// Saf fonksiyon; AiEvalService bunu çağırır, onarım denemesini ve kaydı kendisi yönetir.

import { EvalV3Evidence, EvalV3Output, RetrievedUnit, V3Issue } from './eval-v3.types';
import { validateEvalV3Output } from './eval-v3.validator';
import { verifyAndEnrichReferences } from './eval-v3.references';

export interface EvidenceCtx {
    evidenceId: string;
    name: string;
    kind: string;
    readStatus: 'READ' | 'PARTIAL' | 'FAILED';
    note?: string | null;
    attachmentId?: string | null;
}

export interface V3PipelineResult {
    valid: boolean;
    issues: V3Issue[];
    output: EvalV3Output | null;
    /** İnsan incelemesi gerektiren sebepler (WARN / reddedilen atıf / düzeltilen künye). */
    reviewReasons: string[];
}

export function processEvalV3Response(
    parsed: unknown,
    ctx: { units: RetrievedUnit[]; evidence: EvidenceCtx[] },
): V3PipelineResult {
    const v = validateEvalV3Output(parsed);
    if (!v.valid || !v.normalized) {
        return { valid: false, issues: v.issues, output: null, reviewReasons: [] };
    }

    const refCheck = verifyAndEnrichReferences(v.normalized, ctx.units);
    const issues = [...v.issues, ...refCheck.issues];
    const out = refCheck.output;

    // Kanıt eşleme: künye backend'den; modelin bilmediği id'ler atılır; ele alınmayanlar "kullanılmadı".
    const evById = new Map(ctx.evidence.map((e) => [e.evidenceId, e]));
    const seen = new Set<string>();
    const merged: EvalV3Evidence[] = [];
    for (const e of out.evaluatedEvidence) {
        const c = evById.get(e.evidenceId);
        if (!c) {
            issues.push({ path: `evaluatedEvidence.${e.evidenceId}`, message: `Tanımsız kanıt kimliği "${e.evidenceId}" yok sayıldı.`, severity: 'WARN' });
            continue;
        }
        if (seen.has(e.evidenceId)) continue;
        seen.add(e.evidenceId);
        merged.push({
            ...e, name: c.name, type: e.type || c.kind, used: true,
            attachmentId: c.attachmentId ?? null, readStatus: c.readStatus,
            limitations:
                c.readStatus === 'FAILED'
                    ? [e.limitations, `Dosya okunamadı${c.note ? `: ${c.note}` : ''}.`].filter(Boolean).join(' ')
                    : e.limitations,
        });
    }
    for (const c of ctx.evidence) {
        if (seen.has(c.evidenceId)) continue;
        merged.push({
            evidenceId: c.evidenceId, name: c.name, type: c.kind, observation: '',
            limitations:
                c.readStatus === 'FAILED'
                    ? `Dosya okunamadığı için değerlendirmeye alınamadı${c.note ? ` (${c.note})` : ''}.`
                    : 'Model bu kanıtı değerlendirmesinde ele almadı.',
            used: false, attachmentId: c.attachmentId ?? null, readStatus: c.readStatus,
        });
    }
    out.evaluatedEvidence = merged;

    const reviewReasons: string[] = [];
    if ((out.rejectedReferences?.length ?? 0) > 0) {
        reviewReasons.push(`${out.rejectedReferences!.length} kaynak atfı retrieval sonucunda bulunmadığı için reddedildi.`);
    }
    if (out.references.some((r) => r.corrected)) reviewReasons.push('Bazı atıfların künyesi kaynak kaydına göre düzeltildi.');
    if (issues.some((i) => i.severity === 'WARN' && /Kaçınılması gereken ifade|kanuni zorunluluk/.test(i.message))) {
        reviewReasons.push('Metinde kaçınılması gereken ifade veya rehber/mevzuat karışıklığı bulundu.');
    }

    const hasError = issues.some((i) => i.severity === 'ERROR');
    return { valid: !hasError, issues, output: hasError ? null : out, reviewReasons };
}
