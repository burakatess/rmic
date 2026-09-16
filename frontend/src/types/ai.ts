// Yapay Zeka — Kontrol Testi Asistanı tipleri (backend AiAssessment ile eşleşir)

export type AiAssessmentKind =
    | 'PREP_PLAN'
    | 'EVIDENCE_READ'
    | 'ASSESSMENT'
    | 'RESULT_DRAFT'
    | 'FINDING_DRAFT'
    | 'REVIEW';

export type AiAssessmentStatus =
    | 'PROCESSING'
    | 'SUGGESTED'
    | 'ACCEPTED'
    | 'EDITED'
    | 'REJECTED'
    | 'FAILED';

export interface AiAssessment {
    id: string;
    kind: AiAssessmentKind;
    entityType: string;
    entityId: string;
    status: AiAssessmentStatus;
    tier: string;
    modelName: string;
    promptVersion: string;
    inputHash: string;
    tokensIn: number | null;
    tokensOut: number | null;
    latencyMs: number | null;
    errorText: string | null;
    output: unknown;
    editedOutput: unknown;
    confidence: number | null;
    createdById: string;
    reviewedById: string | null;
    reviewedAt: string | null;
    createdAt: string;
    updatedAt: string;
    /** Yalnızca API yanıtında — önbellekten döndüyse true. */
    cached?: boolean;
}

export interface AiStatus {
    enabled: boolean;
    baseUrl: string;
    models: { heavy: string; light: string; vision: string };
    embedModel: string;
}

export interface AiUsage {
    periodDays: number;
    total: number;
    tokensIn: number;
    tokensOut: number;
    accepted: number;
    rejected: number;
    failed: number;
    acceptanceRate: number | null;
}

export interface AiCockpitTest {
    id: string;
    testNo: string;
    plannedDate: string;
    status: string;
    control: { controlId: string; name: string };
    aiStages: Array<{ kind: AiAssessmentKind; status: AiAssessmentStatus; createdAt: string }>;
}

export interface AiCockpit {
    tests: AiCockpitTest[];
    pendingReview: number;
}

// ─── Aşama çıktı şekilleri (output alanının beklenen yapısı) ─────────────────

export interface PrepPlanOutput {
    hedefDonem?: string;
    testAdimlari?: Array<{
        adim: string;
        nasilTestEdilir?: string;
        istenecekKanit?: string;
        kimden?: string;
        hangiSistem?: string;
        tarihAraligi?: string;
    }>;
    orneklemeOnerisi?: string;
    gecmisUyarilar?: string[];
    riskOdak?: string;
    rawText?: string;
}

export interface EvidenceReadOutput {
    dosyalar?: Array<{
        attachmentId?: string;
        belgeTuru?: string;
        kapsadigiTarih?: string;
        ilgiliTestAdimi?: string;
        uyarilar?: string[];
        ozet?: string;
    }>;
    genelNot?: string;
    okunamayan?: number;
}

export interface ReviewOutput {
    kanitYeterliligi?: 'YETERLI' | 'KISMEN' | 'YETERSIZ';
    tutarlilikKontrolleri?: Array<{ konu: string; durum: 'TAMAM' | 'SORUN' | 'BELIRSIZ'; aciklama: string }>;
    findingStatusDegerlendirmesi?: string;
    gecmisKararTutarliligi?: string;
    oneri?: 'ONAYLANABILIR' | 'GERI_GONDER' | 'EK_KANIT_Iste';
    geriGondermeGerekcesiTaslagi?: string;
    guven?: number;
    rawText?: string;
}

export interface AiQueryResult {
    question: string;
    answer: string;
    usedData: string[];
    notInData: boolean;
    model: string;
    promptVersion: string;
}

export type AssessStepResult = 'KARSILANDI' | 'KISMEN' | 'KARSILANMADI' | 'DEGERLENDIRILEMEDI';

export interface ResultDraftOutput {
    resultText?: string;
    evidenceSummary?: string;
    notlar?: string;
    rawText?: string;
}

export interface FindingDraftItem {
    baslik?: string;
    description?: string;
    impact?: string;
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    recommendation?: string;
    onerilenAksiyon?: string;
    hedefGunSayisi?: number;
}

export interface FindingDraftOutput {
    bulgular?: FindingDraftItem[];
    tekrarAnalizi?: Array<{ findingId: string; benzerlik: number; aciklama: string }>;
    referansOnerisi?: { varMi: boolean; findingId: string | null; gerekce: string };
    rawText?: string;
}

export interface AssessmentOutput {
    adimlar?: Array<{
        adim: string;
        sonuc: AssessStepResult;
        gerekce?: string;
        kaynaklar?: string[];
    }>;
    genelDegerlendirme?: 'ETKIN' | 'KISMEN_ETKIN' | 'ETKIN_DEGIL' | 'DEGERLENDIRILEMEDI';
    onerilenFindingStatus?: 'BULGUSU_YOK' | 'BULGUSU_VAR';
    onerilenFindingStatusGerekcesi?: string;
    eksikKanit?: string[];
    guven?: number;
    rawText?: string;
}

// ─── Kontrol & Kanıt Değerlendirme ─────────────────────────────────────────

/** Kaynak Kataloğu birimine dayanma alanları (prompt 2026-09-08.1). */
interface EvalSourceBasis {
    beklenenDurum?: string;
    gozlenenDurum?: string;
    kanitRef?: string;
    karsilastirma?: string;
    dayanakKaynakBirimId?: string | null;
    dayanakAlinti?: string | null;
}

export interface EvalCompliancePoint extends EvalSourceBasis {
    konu: string;
    gerekce?: string;
    kaynak?: string;
    onem?: 'YUKSEK' | 'ORTA' | 'DUSUK';
    ihlalEdilenMaddeler?: { madde: string; aciklama?: string }[];
    /** İnsan incelemesi (backend reviewFinding ile yazılır). */
    _review?: EvalFindingReview;
}

export interface EvalFindingCandidate extends EvalSourceBasis {
    baslik: string;
    aciklama?: string;
    etki?: string;
    oneri?: string;
    onerilenSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    hedefGunSayisi?: number;
    ilgiliMevzuat?: string;
    tekrarMi?: boolean;
    emsalFindingId?: string | null;
    _review?: EvalFindingReview;
}

/** sendMessage sonrası her çalışma için doğrulanan kaynak atıfları. */
export interface CitedSourceRef {
    group: string;
    index: number;
    sourceUnitId?: string;
    sourceVersionId?: string;
    unitCode?: string;
    quote?: string | null;
    exists: boolean;
    inSentSet: boolean;
    textVerified: boolean;
    relationReviewed: boolean;
    reason: string;
}

export interface EvalOutput {
    sohbetNotu?: string;
    uyumluAlanlar?: EvalCompliancePoint[];
    uyumsuzAlanlar?: EvalCompliancePoint[];
    genelDurum?: { sonuc?: 'UYUMLU' | 'KISMEN_UYUMLU' | 'UYUMSUZ' | 'DEGERLENDIRILEMEDI'; ozet?: string };
    ihlalEdilenMaddeOzeti?: string[];
    bulguAdaylari?: EvalFindingCandidate[];
    eksikBilgi?: string[];
}

/** İnsan incelemesi damgası — AI çıktısının içine eklenir, AI'nin özgün çıktısını ezmez. */
export interface EvalFindingReview {
    status: 'ACCEPTED' | 'EDITED' | 'REJECTED';
    reviewerId: string;
    reviewedAt: string;
    reason?: string | null;
}

// ─── Yapılandırılmış çıktı v2 (schemaVersion 2026-09-10.1) ─────────────────
export type ReqResult =
    | 'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'INSUFFICIENT_EVIDENCE' | 'OUT_OF_SCOPE';
export type ControlOverall = 'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'INSUFFICIENT_EVIDENCE';

export interface EvalSourceRefV2 {
    sourceUnitId?: string | null;
    label?: string;
    version?: string | null;
    clause?: string | null;
    quote?: string | null;
    supportsRequirementKey?: string | null;
}

export interface EvalRequirementAssessment {
    requirementKey: string;
    requirement: string;
    applicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNDETERMINED';
    applicabilityRationale?: string;
    expectedEvidence?: string;
    presentedEvidence?: string;
    observation?: string;
    result: ReqResult;
    rationale?: string;
    designVsOperating?: 'DESIGN' | 'OPERATING' | 'BOTH' | 'NA';
    sourceRefs?: EvalSourceRefV2[];
    evidenceRefs?: string[];
    _review?: EvalFindingReview;
}

export interface EvalFindingAssessment {
    title: string;
    expected?: string;
    observed?: string;
    gap?: string;
    sourceBasis?: EvalSourceRefV2[];
    evidenceRefs?: string[];
    supported?: boolean;
    suggestedSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null;
    recurring?: boolean;
    precedentFindingId?: string | null;
    _review?: EvalFindingReview;
}

export interface EvalOutputV2 {
    summary?: string;
    expectedState?: Array<{
        requirementKey: string; statement: string; sourceRef?: EvalSourceRefV2; mandatory?: boolean;
    }>;
    evaluatedEvidence?: Array<{
        evidenceRef: string; attachmentId?: string | null; locator?: string; period?: string; scope?: string;
        shows?: string; doesNotShow?: string; readStatus?: 'READ' | 'PARTIAL' | 'FAILED';
        evidenceType?: string;
    }>;
    requirementAssessments?: EvalRequirementAssessment[];
    controlResult?: {
        overall?: ControlOverall; designAdequacy?: string; operatingEffectiveness?: string;
        samplingPeriodLimits?: string; summary?: string;
    };
    impact?: { type?: 'REALIZED' | 'POTENTIAL' | 'UNDETERMINED'; description?: string; note?: string };
    recommendations?: Array<{
        text: string; type?: 'REMEDIATION' | 'EVIDENCE_REQUEST';
        addressesRequirementKey?: string | null; requestedDocument?: string | null; answersQuestion?: string | null;
    }>;
    findingAssessment?: EvalFindingAssessment[];
    sourceReferences?: EvalSourceRefV2[];
    evidenceReferences?: Array<{ evidenceRef: string; attachmentId?: string | null; locator?: string }>;
    limitations?: string[];
    conflicts?: string[];
    changesSincePreviousRun?: {
        hasPrevious?: boolean; changed?: boolean; newEvidence?: string[]; changedSources?: string[];
        changedResults?: Array<{ requirementKey: string; from: string; to: string; reason: string }>;
        explanationIfUnchanged?: string;
    };
}

export interface CitedSourceRefV2 {
    path: string;
    sourceUnitId?: string;
    sourceVersionId?: string;
    unitCode?: string;
    label?: string | null;
    quote?: string | null;
    exists: boolean;
    inSentSet: boolean;
    quoteVerified: boolean;
    relationReviewed: boolean;
    reason: string;
}

export interface SchemaIssue {
    path: string;
    message: string;
    severity: 'ERROR' | 'WARN';
}

export interface AiEvalMessage {
    id: string;
    role: 'USER' | 'ASSISTANT' | 'SYSTEM';
    kind?: 'EVALUATION' | 'QUESTION' | 'ANSWER';
    content: string;
    additionalNote?: string | null;
    answerText?: string | null;
    evaluation: (EvalOutput & EvalOutputV2) | null;
    editedEvaluation: (EvalOutput & EvalOutputV2) | null;
    schemaVersion?: string | null;
    schemaValid?: boolean | null;
    schemaIssues?: SchemaIssue[] | Record<string, unknown> | null;
    retrievalNote?: Record<string, unknown> | null;
    modelName: string | null;
    promptVersion: string | null;
    inputVersion: number | null;
    evidenceRefs: {
        attachmentIds?: string[];
        evidenceTextHash?: string | null;
        knowledgeDocIds?: string[];
        regulationArticleIds?: string[];
    } | null;
    reviewedById: string | null;
    reviewedAt: string | null;
    /** Bu çalışmada modele GERÇEKTEN iletilen kaynak birimleri. */
    sentSourceUnitIds?: string[];
    /** Çıktıdaki kaynak atıflarının doğrulaması (var mı / iletildi mi / alıntı eşleşiyor mu). */
    citedSourceRefs?: (CitedSourceRef | CitedSourceRefV2)[] | null;
    runInputSnapshot?: Record<string, unknown> | null;
    tokensIn: number | null;
    tokensOut: number | null;
    latencyMs: number | null;
    errorText: string | null;
    cancelled: boolean;
    stale: boolean;
    createdAt: string;
}

export type AiEvalReadStatus = 'PENDING' | 'READING' | 'READ' | 'PARTIAL' | 'FAILED';

export const READ_STATUS_LABEL: Record<AiEvalReadStatus, string> = {
    PENDING: 'Bekliyor',
    READING: 'Okunuyor',
    READ: 'Okundu',
    PARTIAL: 'Kısmen okundu',
    FAILED: 'Okunamadı',
};

export interface AiEvalAttachment {
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    kind: 'DOCUMENT' | 'IMAGE' | 'EMAIL' | 'TEXT';
    docDate: string | null;
    relatedSystem: string | null;
    relatedSample: string | null;
    relatedTestStep: string | null;
    note: string | null;
    readStatus: AiEvalReadStatus;
    readNote: string | null;
    version: number;
    active: boolean;
    supersededById: string | null;
    createdAt: string;
    updatedAt: string;
}

export type AiEvalRunStatus = 'DRAFT' | 'RUNNING' | 'AWAITING_REVIEW' | 'COMPLETED' | 'ERROR';
export type AiEvalOutcome = 'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'INCONCLUSIVE';
export type AiEvalLifecycle = 'ACTIVE' | 'ARCHIVED' | 'TRASHED';

export const RUN_STATUS_LABEL: Record<AiEvalRunStatus, string> = {
    DRAFT: 'Taslak',
    RUNNING: 'Değerlendiriliyor',
    AWAITING_REVIEW: 'İnceleme bekliyor',
    COMPLETED: 'Tamamlandı',
    ERROR: 'Hata',
};

export const OUTCOME_LABEL: Record<AiEvalOutcome, string> = {
    MET: 'Karşılandı',
    PARTIALLY_MET: 'Kısmen karşılandı',
    NOT_MET: 'Karşılanmadı',
    INCONCLUSIVE: 'Değerlendirilemedi',
};

export interface EvalRunProgress {
    phase?: 'preparing' | 'reading_files' | 'evaluating';
    filesRead?: number;
    filesTotal?: number;
}

export interface EvalLatestEvaluation {
    messageId: string;
    original: (EvalOutput & EvalOutputV2) | null;
    edited: (EvalOutput & EvalOutputV2) | null;
    effective: (EvalOutput & EvalOutputV2) | null;
    schemaVersion?: string | null;
    schemaValid?: boolean | null;
    schemaIssues?: SchemaIssue[] | Record<string, unknown> | null;
    citedSourceRefs?: (CitedSourceRef | CitedSourceRefV2)[] | null;
    sentSourceUnitIds?: string[];
    retrievalNote?: Record<string, unknown> | null;
    modelName: string | null;
    promptVersion: string | null;
    inputVersion: number | null;
    reviewedById: string | null;
    reviewedAt: string | null;
    createdAt: string;
}

export interface AiEvalSession {
    id: string;
    title: string;
    titleEditedByUser: boolean;
    period: string | null;
    controlRefId: string | null;
    controlText: string | null;
    controlManualNote: string | null;
    evidenceText: string | null;
    controlSnapshot: Record<string, unknown> | null;
    regulationArticleIds: string[];
    regulationSnapshot: Array<{ madde: string; regulasyon: string; baslik: string; metin: string }> | null;
    knowledgeDocIds: string[];
    knowledgeSnapshot: Array<{ tur: KnowledgeDocKind; kod: string; baslik: string; metin: string; kaynak: string | null }> | null;
    // Kaynak Kataloğu birimleri — önerilen / kullanıcı seçtiği / gerçekte kullanılan AYRI.
    suggestedSourceUnitIds: string[];
    sourceUnitIds: string[];
    usedSourceUnitIds: string[];
    sourceSnapshot: Array<{
        unitId: string; kod: string; baslik: string; ozgunMetin: string; trAciklama: string | null;
        kaynak: string; slug: string; surum: string; versionId: string; resmiUrl: string | null; gizlilik: string; ragHakki: string;
    }> | null;
    status: AiEvalLifecycle;
    trashedAt: string | null;
    runStatus: AiEvalRunStatus;
    runStartedAt: string | null;
    runProgress: EvalRunProgress | null;
    cancelRequested: boolean;
    outcome: AiEvalOutcome | null;
    completedAt: string | null;
    completedById: string | null;
    contentVersion: number;
    inputsDirty: boolean;
    needsReview?: boolean;
    needsReviewReason?: string | null;
    clonedFromId: string | null;
    createdAt: string;
    updatedAt: string;
    messages: AiEvalMessage[];
    attachments: AiEvalAttachment[];
    latestEvaluation: EvalLatestEvaluation | null;
}

export interface EvalOutputBundle {
    schemaVersion?: string | null;
    outcome: AiEvalOutcome | null;
    runStatus: AiEvalRunStatus;
    needsReview?: boolean;
    needsReviewReason?: string | null;
    evaluationVersion: string | null;
    reviewed: boolean;
    controlResult: string;
    missingEvidenceRequest: string;
    findingCandidates: (EvalFindingCandidate | EvalFindingAssessment)[];
}

/** "Ek soru" akışında yanıt mesajının içine gömülen meta (schemaIssues alanında). */
export interface EvalAnswerMeta {
    reevaluationRecommended?: boolean;
    why?: string;
}

// ─── Kurumsal Kaynak Kütüphanesi ──────────────────────────────────────────

export type KnowledgeDocKind =
    | 'POLICY'
    | 'PROCEDURE'
    | 'METHODOLOGY'
    | 'RUBRIC'
    | 'GLOSSARY'
    | 'PRECEDENT';

export const KNOWLEDGE_KIND_LABEL: Record<KnowledgeDocKind, string> = {
    POLICY: 'Politika',
    PROCEDURE: 'Prosedür',
    METHODOLOGY: 'Metodoloji',
    RUBRIC: 'Derecelendirme Rehberi',
    GLOSSARY: 'Terminoloji',
    PRECEDENT: 'Emsal',
};

export interface KnowledgeDoc {
    id: string;
    kind: KnowledgeDocKind;
    code: string;
    title: string;
    body: string;
    category: string | null;
    tags: string[];
    sourceRef: string | null;
    effectiveDate: string | null;
    isActive: boolean;
    createdById: string;
    createdAt: string;
    updatedAt: string;
}

export interface AiEvalSessionListItem {
    id: string;
    title: string;
    period: string | null;
    control: { controlId: string | null; name: string | null } | null;
    runStatus: AiEvalRunStatus;
    outcome: AiEvalOutcome | null;
    inputsDirty: boolean;
    needsReview?: boolean;
    lifecycle: AiEvalLifecycle;
    trashedAt: string | null;
    evidenceCount: number;
    hasEvidenceText: boolean;
    findingCount: number | null;
    missingEvidenceCount: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface AiEvalListResponse {
    data: AiEvalSessionListItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface AiEvalListParams {
    view?: 'active' | 'archived' | 'trashed';
    q?: string;
    runStatus?: AiEvalRunStatus;
    outcome?: AiEvalOutcome;
    controlRefId?: string;
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: 'updatedAt' | 'title' | 'createdAt';
    dir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
}

export interface BulkEvalResult {
    requested: number;
    ok: number;
    failed: { id: string; reason: string }[];
}
