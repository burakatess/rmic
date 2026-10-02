// Kontrol & Kanıt Değerlendirme v3 — çıktı sözleşmesi.
// Alan adları İngilizce, değerler Türkçe. Modelin ürettiği alanlar ile backend'in
// DB'den doğrulayıp eklediği ("enriched") alanlar ayrıdır.

export const CONTROL_STATUSES = [
    'COMPLIANT', 'PARTIALLY_COMPLIANT', 'NON_COMPLIANT', 'INSUFFICIENT_EVIDENCE',
] as const;
export type ControlStatus = (typeof CONTROL_STATUSES)[number];

export const REF_SOURCE_TYPES = ['REGULATION', 'OFFICIAL_GUIDE', 'INTERNAL_POLICY'] as const;
export type RefSourceType = (typeof REF_SOURCE_TYPES)[number];

export const REF_ASSESSMENTS = ['COMPLIANT', 'NON_COMPLIANT', 'RELEVANT', 'NEEDS_CONFIRMATION'] as const;
export type RefAssessment = (typeof REF_ASSESSMENTS)[number];

export interface EvalV3Evidence {
    /** Prompt'ta verilen kanıt kimliği (E0 = kullanıcı kanıt metni, E1.. = dosyalar). */
    evidenceId: string;
    name: string;
    type: string;
    observation: string;
    limitations: string;
    /** Backend: modelin çıktısında yer aldı mı? */
    used?: boolean;
    /** Backend: ilgili ek dosya (varsa). */
    attachmentId?: string | null;
    readStatus?: 'READ' | 'PARTIAL' | 'FAILED';
}

export interface EvalV3Reference {
    /** Modelin verdiği yerel kimlik ("REF1"...). finding.relatedReferenceIds buna işaret eder. */
    refId: string;
    sourceType: RefSourceType;
    sourceName: string;
    version: string;
    articleNumber: string;
    articleTitle: string;
    page: number | null;
    sourceUnitId: string;
    relation: string;
    assessment: RefAssessment;

    // ── Backend'in doğrulayıp eklediği alanlar (modelden GELMEZ) ──────────────
    sourceId?: string;
    sourceVersionId?: string;
    /** Değerlendirme anındaki kaynak metni — kaynak sonradan güncellense de korunur. */
    snapshotText?: string;
    snapshotHash?: string;
    retrievalScore?: number | null;
    retrievalRank?: number | null;
    retrievalMethod?: string | null;
    /** Bağlayıcılık/kapsam notu (ör. Tebliğ kapsamı doğrulanmadı; rehber ≠ kanuni zorunluluk). */
    bindingNote?: string | null;
    /** Modelin verdiği künyeyi backend düzeltti mi? */
    corrected?: boolean;
    verified?: true;
}

export interface EvalV3Finding {
    exists: boolean;
    title: string;
    explanation: string;
    relatedReferenceIds: string[];
}

export interface EvalV3Output {
    expectedState: string;
    evaluatedEvidence: EvalV3Evidence[];
    controlResult: { status: ControlStatus; text: string };
    references: EvalV3Reference[];
    impact: string;
    recommendation: string;
    finding: EvalV3Finding;
    additionalEvidenceRequired: string[];
    usedSourceUnitIds: string[];
    /** Yalnız yeniden değerlendirmede: önceki sonuca göre değişen / değişmeyen hususlar. */
    reEvaluation?: { changed: boolean; changedPoints: string[]; unchangedPoints: string[]; explanation: string } | null;

    // ── Backend ekleri ─────────────────────────────────────────────────────────
    /** Kaynak bulunamadıysa sabit ifade (model uydurmasın diye backend yazar). */
    referencesNote?: string | null;
    /** Retrieval kümesinde olmadığı için REDDEDİLEN atıflar (kanıt olarak saklanır, gösterilmez). */
    rejectedReferences?: { refId: string; claimed: string; reason: string }[];
    /** Kapsam/bağlayıcılık uyarıları (Tebliğ uygulanabilirliği vb.). */
    scopeNotes?: string[];
}

/** Doğrulama sorunu — ERROR onarım denemesini tetikler, WARN yalnızca inceleme işaretler. */
export interface V3Issue {
    path: string;
    message: string;
    severity: 'ERROR' | 'WARN';
}

/** Modele iletilen ve atıf için geçerli sayılan kaynak birimi (retrieval sonucu / kullanıcı seçimi). */
export interface RetrievedUnit {
    unitId: string;
    /** Prompt'ta kullanılan KISA takma ad (U1, U2...) — uzun cuid'i modelin kopyalarken bozmasını önler. */
    alias?: string;
    sourceId: string;
    versionId: string;
    sourceSlug: string;
    sourceName: string;
    sourceKind: string; // SourceKind
    versionLabel: string;
    unitCode: string;
    title: string;
    page: number | null;
    text: string;
    textHash: string;
    truncated: boolean;
    /** 'IN_SCOPE' | 'OUT_OF_SCOPE' | 'UNVERIFIED' | 'NOT_APPLICABLE_CHECK' — bağlayıcılık için. */
    scopeStatus: string;
    score: number | null;
    rank: number | null;
    method: string | null;
    origin: 'RETRIEVAL' | 'USER_SELECTED';
}
