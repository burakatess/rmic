// Madde atıflarının DOĞRULANMASI (saf fonksiyon).
//
// Model serbest biçimde madde numarası üretemez: bir atıf yalnız
//   - bu koşuda modele iletilen (retrieval veya kullanıcı seçimi) bir SourceUnit'e
//     işaret ediyorsa ve
//   - künye (kaynak adı/sürüm/madde/başlık/sayfa/tür) DB kaydından yazılıyorsa
// çıktıda kalır. Aksi halde atıf REDDEDİLİR ve rejectedReferences'a kanıt olarak
// yazılır (kullanıcıya gösterilmez). Kaynak metni değerlendirme anında snapshot'lanır.

import {
    EvalV3Output, EvalV3Reference, RefAssessment, RefSourceType, RetrievedUnit, V3Issue,
} from './eval-v3.types';
import {
    GUIDE_AS_LAW_PATTERNS, GUIDE_NOT_BINDING_SENTENCE, NO_REFERENCE_SENTENCE, SCOPE_UNVERIFIED_SENTENCE,
} from './eval-v3.constants';

export function sourceTypeOfKind(kind: string): RefSourceType {
    if (kind === 'REGULATION') return 'REGULATION';
    if (kind === 'OFFICIAL_GUIDE') return 'OFFICIAL_GUIDE';
    return 'INTERNAL_POLICY';
}

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();

export interface ReferenceVerification {
    output: EvalV3Output;
    issues: V3Issue[];
    /** Doğrulanmış (geçerli) atıf sayısı. */
    validCount: number;
}

export function verifyAndEnrichReferences(
    output: EvalV3Output,
    units: RetrievedUnit[],
): ReferenceVerification {
    const issues: V3Issue[] = [];
    const byId = new Map(units.map((u) => [u.unitId, u]));
    // Model kısa takma adı ("U3", "[U3]", "U:U3") veya gerçek id'yi yazabilir.
    const byAlias = new Map(units.filter((u) => u.alias).map((u) => [u.alias!.toUpperCase(), u]));
    const resolveId = (raw: string): RetrievedUnit | undefined => {
        const direct = byId.get(raw);
        if (direct) return direct;
        const a = raw.replace(/[\[\]\s]/g, '').replace(/^U:/i, '').toUpperCase();
        return byAlias.get(a);
    };
    // Künye eşleşmesi için (model id'yi yanlış yazdıysa): yalnız TEK bir birime karşılık gelirse düzelt.
    const byCode = new Map<string, RetrievedUnit[]>();
    for (const u of units) {
        const k = norm(u.unitCode);
        byCode.set(k, [...(byCode.get(k) ?? []), u]);
    }

    const valid: EvalV3Reference[] = [];
    const rejected: NonNullable<EvalV3Output['rejectedReferences']> = [];
    const scopeNotes = new Set<string>(output.scopeNotes ?? []);

    for (const ref of output.references) {
        let unit = resolveId(ref.sourceUnitId);
        let corrected = false;
        if (!unit) {
            const candidates = byCode.get(norm(ref.articleNumber)) ?? [];
            if (candidates.length === 1) {
                unit = candidates[0];
                corrected = true;
            }
        }
        if (!unit) {
            rejected.push({
                refId: ref.refId,
                claimed: `${ref.sourceName} ${ref.articleNumber}`.trim(),
                reason: 'Atıf yapılan birim bu değerlendirmeye iletilen kaynaklar arasında yok (uydurma/geçersiz atıf).',
            });
            issues.push({
                path: `references.${ref.refId}`,
                message: `"${ref.articleNumber || ref.sourceUnitId}" atfı retrieval sonucunda bulunmadığı için reddedildi.`,
                severity: 'WARN',
            });
            continue;
        }

        // Künye DB kaydından yazılır; model ile çelişki varsa "corrected" işaretlenir.
        const type = sourceTypeOfKind(unit.sourceKind);
        const mismatch =
            corrected ||
            norm(ref.articleNumber) !== norm(unit.unitCode) ||
            ref.sourceType !== type;
        if (mismatch && !corrected) {
            issues.push({
                path: `references.${ref.refId}`,
                message: `Atıf künyesi kaynak kaydına göre düzeltildi (${ref.articleNumber || '—'} → ${unit.unitCode}).`,
                severity: 'WARN',
            });
        }

        let assessment: RefAssessment = ref.assessment;
        let bindingNote: string | null = null;
        if (type === 'REGULATION' && unit.scopeStatus !== 'IN_SCOPE') {
            if (unit.scopeStatus === 'OUT_OF_SCOPE') {
                bindingNote = 'Kurum kapsamı dışında işaretli mevzuat; yalnızca referans/iyi uygulama olarak değerlendirilebilir.';
                if (assessment === 'NON_COMPLIANT') assessment = 'NEEDS_CONFIRMATION';
            } else {
                bindingNote = SCOPE_UNVERIFIED_SENTENCE;
                if (assessment === 'NON_COMPLIANT' || assessment === 'COMPLIANT') assessment = 'NEEDS_CONFIRMATION';
                scopeNotes.add(SCOPE_UNVERIFIED_SENTENCE);
            }
        } else if (type === 'OFFICIAL_GUIDE') {
            bindingNote = GUIDE_NOT_BINDING_SENTENCE;
        }
        if (type === 'OFFICIAL_GUIDE' && GUIDE_AS_LAW_PATTERNS.some((p) => p.test(ref.relation))) {
            issues.push({
                path: `references.${ref.refId}.relation`,
                message: 'Resmî rehber tedbiri kanuni zorunluluk/mevzuat ihlali gibi sunulmuş — insan incelemesi gerekir.',
                severity: 'WARN',
            });
        }

        valid.push({
            refId: ref.refId,
            sourceType: type,
            sourceName: unit.sourceName,
            version: unit.versionLabel,
            articleNumber: unit.unitCode,
            articleTitle: unit.title,
            page: unit.page,
            sourceUnitId: unit.unitId,
            relation: ref.relation,
            assessment,
            sourceId: unit.sourceId,
            sourceVersionId: unit.versionId,
            snapshotText: unit.text,
            snapshotHash: unit.textHash,
            retrievalScore: unit.score,
            retrievalRank: unit.rank,
            retrievalMethod: unit.method,
            bindingNote,
            corrected: corrected || undefined,
            verified: true,
        });
    }

    // Bulgu → yalnız geçerli refId'lere işaret edebilir.
    const validIds = new Set(valid.map((r) => r.refId));
    const finding = {
        ...output.finding,
        relatedReferenceIds: output.finding.relatedReferenceIds.filter((id) => validIds.has(id)),
    };
    if (finding.exists && finding.relatedReferenceIds.length === 0) {
        issues.push({
            path: 'finding.relatedReferenceIds',
            message: 'Bulgunun dayandığı kaynak atıfları doğrulanamadı (retrieval kümesinde yok) — bulgu kaynak dayanaksız.',
            severity: 'ERROR',
        });
    }
    // Bulgu yalnız kapsamı doğrulanmamış mevzuata dayanıyorsa açıklamaya sabit ifade eklenir.
    if (finding.exists) {
        const related = valid.filter((r) => finding.relatedReferenceIds.includes(r.refId));
        const onlyUnverifiedReg =
            related.length > 0 && related.every((r) => r.sourceType === 'REGULATION' && r.bindingNote === SCOPE_UNVERIFIED_SENTENCE);
        if (onlyUnverifiedReg && !finding.explanation.includes(SCOPE_UNVERIFIED_SENTENCE)) {
            finding.explanation = `${finding.explanation} ${SCOPE_UNVERIFIED_SENTENCE}`.trim();
        }
    }

    const referencesNote = valid.length === 0 ? NO_REFERENCE_SENTENCE : null;
    const enriched: EvalV3Output = {
        ...output,
        references: valid,
        finding,
        usedSourceUnitIds: [...new Set(valid.map((r) => r.sourceUnitId))],
        referencesNote,
        rejectedReferences: rejected,
        scopeNotes: [...scopeNotes],
    };
    return { output: enriched, issues, validCount: valid.length };
}
