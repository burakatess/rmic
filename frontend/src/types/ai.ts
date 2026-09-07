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

export interface EvalCompliancePoint {
    konu: string;
    gerekce?: string;
    kaynak?: string;
    onem?: 'YUKSEK' | 'ORTA' | 'DUSUK';
    ihlalEdilenMaddeler?: { madde: string; aciklama?: string }[];
}

export interface EvalFindingCandidate {
    baslik: string;
    aciklama?: string;
    etki?: string;
    oneri?: string;
    onerilenSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    hedefGunSayisi?: number;
    ilgiliMevzuat?: string;
    tekrarMi?: boolean;
    emsalFindingId?: string | null;
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

export interface AiEvalMessage {
    id: string;
    role: 'USER' | 'ASSISTANT' | 'SYSTEM';
    content: string;
    evaluation: EvalOutput | null;
    modelName: string | null;
    tokensIn: number | null;
    tokensOut: number | null;
    latencyMs: number | null;
    errorText: string | null;
    createdAt: string;
}

export interface AiEvalAttachment {
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    kind: 'DOCUMENT' | 'IMAGE' | 'EMAIL' | 'TEXT';
    createdAt: string;
}

export interface AiEvalSession {
    id: string;
    title: string;
    controlRefId: string | null;
    controlText: string | null;
    controlManualNote: string | null;
    evidenceText: string | null;
    controlSnapshot: Record<string, unknown> | null;
    regulationArticleIds: string[];
    regulationSnapshot: Array<{ madde: string; regulasyon: string; baslik: string; metin: string }> | null;
    knowledgeDocIds: string[];
    knowledgeSnapshot: Array<{ tur: KnowledgeDocKind; kod: string; baslik: string; metin: string; kaynak: string | null }> | null;
    status: 'ACTIVE' | 'ARCHIVED';
    createdAt: string;
    updatedAt: string;
    messages: AiEvalMessage[];
    attachments: AiEvalAttachment[];
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
    controlRefId: string | null;
    createdAt: string;
    updatedAt: string;
    _count: { messages: number; attachments: number };
}
