// Kaynak Kataloğu (Genişletilmiş Kütüphane) — backend `library` modülü ile eşleşir.

export type SourceKind =
    | 'REGULATION' | 'STANDARD_FRAMEWORK' | 'AUDIT_METHODOLOGY' | 'CORPORATE_POLICY' | 'PRODUCT_DOC'
    | 'CONTROL_TEST_CARD' | 'EVIDENCE_GUIDE' | 'PRECEDENT_FINDING' | 'TRAINING_EXAMPLE' | 'EVAL_SCENARIO'
    | 'OFFICIAL_GUIDE' | 'INTERNAL_METHODOLOGY';

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
    REGULATION: 'Mevzuat',
    STANDARD_FRAMEWORK: 'Standart / Çerçeve',
    AUDIT_METHODOLOGY: 'Denetim Metodolojisi',
    CORPORATE_POLICY: 'Kurumsal Politika/Prosedür',
    PRODUCT_DOC: 'Teknik Ürün Dokümantasyonu',
    CONTROL_TEST_CARD: 'Kontrol Test Kartı',
    EVIDENCE_GUIDE: 'Kanıt Değerlendirme Rehberi',
    PRECEDENT_FINDING: 'Emsal Bulgu',
    TRAINING_EXAMPLE: 'Eğitim Örneği',
    EVAL_SCENARIO: 'Değerlendirme Senaryosu',
    OFFICIAL_GUIDE: 'Resmî Rehber',
    INTERNAL_METHODOLOGY: 'Kurumsal Metodoloji',
};

export type UsagePermission = 'UNKNOWN' | 'ALLOWED' | 'DENIED';
export const USAGE_LABEL: Record<UsagePermission, string> = {
    UNKNOWN: 'Bilinmiyor',
    ALLOWED: 'İzinli',
    DENIED: 'İzin yok',
};

export type Confidentiality = 'PUBLIC' | 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL';
export const CONF_LABEL: Record<Confidentiality, string> = {
    PUBLIC: 'Herkese açık',
    INTERNAL: 'Kurum içi',
    RESTRICTED: 'Kısıtlı',
    CONFIDENTIAL: 'Gizli',
};

export type SourceApprovalStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SUPERSEDED' | 'WITHDRAWN';
export type CardStatus = SourceApprovalStatus;
export const STATUS_LABEL: Record<string, string> = {
    DRAFT: 'Taslak',
    IN_REVIEW: 'İncelemede',
    APPROVED: 'Onaylı',
    SUPERSEDED: 'Yerine geçildi',
    WITHDRAWN: 'Yürürlükten kalktı',
};

export type MappingMatchType = 'FULL' | 'PARTIAL' | 'SUPPORTS' | 'RELATED';
export const MATCH_LABEL: Record<MappingMatchType, string> = {
    FULL: 'Tam karşılar',
    PARTIAL: 'Kısmen karşılar',
    SUPPORTS: 'Destekler',
    RELATED: 'İlişkili',
};
export type MappingStatus = 'PENDING' | 'AI_DRAFT' | 'USER_CONFIRMED' | 'REJECTED';
export const MAPPING_STATUS_LABEL: Record<MappingStatus, string> = {
    PENDING: 'Eşleştirme bekliyor',
    AI_DRAFT: 'AI taslağı',
    USER_CONFIRMED: 'Onaylandı',
    REJECTED: 'Reddedildi',
};

export interface SourceVersionSummary {
    id: string;
    versionLabel: string;
    approvalStatus: SourceApprovalStatus;
    effectiveDate: string | null;
    validUntil: string | null;
    contentRetrieved: boolean;
    supersededById: string | null;
    _count: { units: number; chunks: number; mappings: number };
}

export interface Source {
    id: string;
    kind: SourceKind;
    slug: string;
    title: string;
    publisher: string | null;
    officialUrl: string | null;
    docCode: string | null;
    language: string;
    owner: string | null;
    confidentiality: Confidentiality;
    tags: string[];
    rightRefLink: UsagePermission;
    rightFullText: UsagePermission;
    rightRag: UsagePermission;
    rightFineTune: UsagePermission;
    rightExport: UsagePermission;
    rightsNote: string | null;
    createdAt: string;
    updatedAt: string;
    versions: SourceVersionSummary[];
}

export interface SourceUnit {
    id: string;
    versionId: string;
    stableKey: string;
    unitCode: string;
    unitType: string;
    title: string;
    originalText: string;
    translationTr: string | null;
    commentaryTr: string | null;
    locator: Record<string, unknown> | null;
    scope: string | null;
    riskAreas: string[];
    parentKey: string | null;
}

export interface SourceVersionDetail extends SourceVersionSummary {
    sourceId: string;
    publishDate: string | null;
    accessedAt: string | null;
    contentHash: string | null;
    fullText: string | null;
    storageNote: string | null;
    source: Source;
    units: SourceUnit[];
    supersedes: { id: string; versionLabel: string } | null;
    supersededBy: { id: string; versionLabel: string } | null;
}

export interface TestCardStep {
    no: number;
    text: string;
}
export interface ControlTestCard {
    id: string;
    code: string;
    topicNo: number | null;
    title: string;
    origin: string;
    status: CardStatus;
    version: number;
    purposeRisk: string;
    scopePrereq: string;
    method: string;
    steps: TestCardStep[];
    expectedState: string;
    requestedEvidence: string[];
    evidenceSufficiency: string;
    decisionCriteria: { met?: string; notMet?: string; inconclusive?: string; conflicting?: string; suggestedSourceRefs?: string[] };
    misleadingSignals: string;
    sampleControlResult: string;
    sampleEvidenceRequest: string;
    relatedControlId: string | null;
    _count?: { mappings: number; scenarios: number };
    mappings?: { status: MappingStatus }[];
}

export interface ProcessScopeCard {
    id: string;
    code: string;
    title: string;
    area: string;
    status: CardStatus;
    description: string;
    criticalAssets: string[];
    paramSpec: { key: string; label: string; unit: string; filledValue: string | number | null }[];
    linkedControlIds: string[];
    _count?: { mappings: number };
}

export interface EvidenceRule {
    id: string;
    code: string;
    category: 'distinction' | 'dimension';
    title: string;
    rule: string;
    goodExample: string | null;
    badExample: string | null;
    scoringSpec: Record<string, unknown> | null;
    orderNo: number;
}

export type ScenarioKind =
    | 'SUFFICIENT_EVIDENCE' | 'CONTROL_GAP' | 'INSUFFICIENT_EVIDENCE' | 'CONFLICTING_EVIDENCE' | 'WRONG_PERIOD_SCOPE';
export const SCENARIO_KIND_LABEL: Record<ScenarioKind, string> = {
    SUFFICIENT_EVIDENCE: 'Yeterli kanıt',
    CONTROL_GAP: 'Kontrol eksikliği',
    INSUFFICIENT_EVIDENCE: 'Yetersiz kanıt',
    CONFLICTING_EVIDENCE: 'Çelişkili kanıt',
    WRONG_PERIOD_SCOPE: 'Yanlış dönem/kapsam',
};
export type ScenarioStatus = 'SYNTHETIC_PENDING_REVIEW' | 'EXPERT_APPROVED' | 'REJECTED';

export interface EvalDataset {
    id: string;
    code: string;
    name: string;
    purpose: 'RAG_SOURCE' | 'TRAINING_EXAMPLE' | 'EVAL_HOLDOUT';
    description: string | null;
    _count?: { scenarios: number };
}
export interface EvalScenario {
    id: string;
    scenarioId: string;
    familyKey: string;
    datasetId: string;
    testCardId: string | null;
    kind: ScenarioKind;
    status: ScenarioStatus;
    synthetic: boolean;
    inputEvidence: { name: string; type: string; text: string }[];
    expectedDecision: string;
    rationale: string;
    requiredRefs: string[];
    forbiddenInferences: string[];
    missingEvidence: string[];
    dataset?: { code: string; purpose: string };
    testCard?: { code: string; title: string } | null;
    _count?: { sourceRefs: number; versionRefs: number };
}

export interface RetrievalResult {
    score: number;
    text: string;
    source: { id: string; slug: string; title: string; kind: SourceKind; officialUrl: string | null };
    versionLabel: string;
    unit: { id: string; code: string; stableKey: string; title: string } | null;
    versionId: string;
}
export interface RetrievalResponse {
    query: string;
    results: RetrievalResult[];
    note?: string;
    filter?: Record<string, unknown>;
}

export interface SourceMapping {
    id: string;
    targetType: string;
    controlId: string | null;
    testCardId: string | null;
    processCardId: string | null;
    versionId: string;
    unitId: string | null;
    matchType: MappingMatchType;
    status: MappingStatus;
    rationale: string | null;
    bindingType: string | null;
    applicabilityRationale: string | null;
    version?: { id: string; versionLabel: string; source: { id: string; slug: string; title: string; kind: SourceKind } };
    unit?: { id: string; unitCode: string; stableKey: string; title: string } | null;
    control?: { id: string; controlId: string; name: string } | null;
    testCard?: { id: string; code: string; title: string } | null;
    processCard?: { id: string; code: string; title: string } | null;
}

export type SourceIndexStatus = 'NONE' | 'QUEUED' | 'RUNNING' | 'READY' | 'ERROR' | 'STALE';

export interface ReadinessStep {
    key: string;
    label: string;
    done: boolean;
    optional?: boolean;
    action: { verb: string; role: string; hint: string } | null;
}
export interface VersionReadiness {
    versionId: string;
    versionLabel: string;
    source: { id: string; slug: string; title: string; rightRag: UsagePermission };
    indexStatus: SourceIndexStatus;
    indexError: string | null;
    indexAttempts: number;
    indexChunkCount: number;
    steps: ReadinessStep[];
    manualSelectable: boolean;
    autoRetrievalReady: boolean;
    usableInEvaluation: boolean;
}
export interface IndexJob {
    id: string;
    versionId: string;
    status: SourceIndexStatus;
    attempt: number;
    chunkCount: number | null;
    error: string | null;
    startedAt: string;
    finishedAt: string | null;
}
export interface UnitLookupResult {
    unitId: string;
    unitCode: string;
    stableKey: string;
    title: string;
    charCount: number;
    withinLimit: boolean;
    limit: number;
    excerpt: string;
    translationTr: string | null;
    source: { id: string; slug: string; title: string; kind: SourceKind; officialUrl: string | null };
    versionId: string;
    versionLabel: string;
    indexReady: boolean;
}
export interface SourceSuggestion {
    unitId: string;
    unitCode: string;
    sourceTitle: string;
    versionLabel: string;
    versionId: string;
    rationale: string;
    matchType?: string;
}
export interface SuggestSourcesResponse {
    suggestions: SourceSuggestion[];
    reason: string | null;
    catalogLink: string | null;
}

export interface QualityRun {
    id: string;
    label: string;
    datasetId: string;
    modelName: string | null;
    promptVersion: string | null;
    status: string;
    metrics: Record<string, number | null> | null;
    startedAt: string;
    finishedAt: string | null;
    _count?: { items: number };
}
