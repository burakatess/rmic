import { Type } from 'class-transformer';
import {
    IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

// ─── Ortak sabitler ────────────────────────────────────────────────────────
export const SOURCE_KINDS = [
    'REGULATION', 'STANDARD_FRAMEWORK', 'AUDIT_METHODOLOGY', 'CORPORATE_POLICY', 'PRODUCT_DOC',
    'CONTROL_TEST_CARD', 'EVIDENCE_GUIDE', 'PRECEDENT_FINDING', 'TRAINING_EXAMPLE', 'EVAL_SCENARIO',
] as const;
export const CONFIDENTIALITY = ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'] as const;
export const USAGE_PERMISSION = ['UNKNOWN', 'ALLOWED', 'DENIED'] as const;
export const APPROVAL_STATUS = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'WITHDRAWN'] as const;
export const MATCH_TYPES = ['FULL', 'PARTIAL', 'SUPPORTS', 'RELATED'] as const;
export const MAPPING_STATUS = ['PENDING', 'AI_DRAFT', 'USER_CONFIRMED', 'REJECTED'] as const;
export const CARD_STATUS = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'WITHDRAWN'] as const;
export const DATASET_PURPOSE = ['RAG_SOURCE', 'TRAINING_EXAMPLE', 'EVAL_HOLDOUT'] as const;
export const SCENARIO_KIND = [
    'SUFFICIENT_EVIDENCE', 'CONTROL_GAP', 'INSUFFICIENT_EVIDENCE', 'CONFLICTING_EVIDENCE', 'WRONG_PERIOD_SCOPE',
] as const;
export const SCENARIO_STATUS = ['SYNTHETIC_PENDING_REVIEW', 'EXPERT_APPROVED', 'REJECTED'] as const;
export const DECISIONS = ['KARSILANDI', 'KARSILANMADI', 'DOGRULANAMADI', 'CELISKILI'] as const;

// ─── Kaynak / sürüm / birim ────────────────────────────────────────────────
class RightsDto {
    @IsOptional() @IsIn(USAGE_PERMISSION) rightRefLink?: string;
    @IsOptional() @IsIn(USAGE_PERMISSION) rightFullText?: string;
    @IsOptional() @IsIn(USAGE_PERMISSION) rightRag?: string;
    @IsOptional() @IsIn(USAGE_PERMISSION) rightFineTune?: string;
    @IsOptional() @IsIn(USAGE_PERMISSION) rightExport?: string;
    @IsOptional() @IsString() @MaxLength(4000) rightsNote?: string;
}

export class CreateSourceDto extends RightsDto {
    @IsIn(SOURCE_KINDS) kind!: string;
    @IsString() @MinLength(2) @MaxLength(80) slug!: string;
    @IsString() @MinLength(3) @MaxLength(300) title!: string;
    @IsOptional() @IsString() @MaxLength(200) publisher?: string;
    @IsOptional() @IsString() @MaxLength(500) officialUrl?: string;
    @IsOptional() @IsString() @MaxLength(80) docCode?: string;
    @IsOptional() @IsString() @MaxLength(10) language?: string;
    @IsOptional() @IsString() @MaxLength(120) owner?: string;
    @IsOptional() @IsIn(CONFIDENTIALITY) confidentiality?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}
export class UpdateSourceDto extends CreateSourceDto {
    @IsOptional() declare kind: string;
    @IsOptional() declare slug: string;
    @IsOptional() declare title: string;
}

export class CreateVersionDto {
    @IsString() @MinLength(1) @MaxLength(60) versionLabel!: string;
    @IsOptional() @IsString() publishDate?: string;
    @IsOptional() @IsString() effectiveDate?: string;
    @IsOptional() @IsString() validUntil?: string;
    @IsOptional() @IsString() accessedAt?: string;
    @IsOptional() @IsString() @MaxLength(200000) fullText?: string;
    @IsOptional() @IsBoolean() contentRetrieved?: boolean;
    @IsOptional() @IsString() @MaxLength(4000) storageNote?: string;
    @IsOptional() @IsIn(APPROVAL_STATUS) approvalStatus?: string;
    /** Bu sürümün yerine geçtiği (eski) sürüm id'si. */
    @IsOptional() @IsString() supersedesVersionId?: string;
}
export class UpdateVersionDto extends CreateVersionDto {
    @IsOptional() declare versionLabel: string;
}

class LocatorDto {
    @IsOptional() page?: number;
    @IsOptional() @IsString() section?: string;
    @IsOptional() @IsString() sheet?: string;
    @IsOptional() @IsString() cellRange?: string;
    @IsOptional() @IsString() heading?: string;
}
export class CreateUnitDto {
    @IsString() @MinLength(1) @MaxLength(120) stableKey!: string;
    @IsString() @MinLength(1) @MaxLength(120) unitCode!: string;
    @IsOptional() @IsIn(['article', 'clause', 'control', 'section']) unitType?: string;
    @IsString() @MinLength(1) @MaxLength(400) title!: string;
    @IsString() @MinLength(1) @MaxLength(50000) originalText!: string;
    @IsOptional() @IsString() @MaxLength(50000) translationTr?: string;
    @IsOptional() @IsString() @MaxLength(50000) commentaryTr?: string;
    @IsOptional() @ValidateNested() @Type(() => LocatorDto) locator?: LocatorDto;
    @IsOptional() @IsString() @MaxLength(500) scope?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) riskAreas?: string[];
    @IsOptional() @IsString() @MaxLength(120) parentKey?: string;
}
export class UpdateUnitDto extends CreateUnitDto {
    @IsOptional() declare stableKey: string;
    @IsOptional() declare unitCode: string;
    @IsOptional() declare title: string;
    @IsOptional() declare originalText: string;
}

// ─── Eşleştirme ────────────────────────────────────────────────────────────
export class CreateMappingDto {
    @IsIn(['CONTROL', 'CONTROL_TEST_CARD', 'PROCESS_SCOPE_CARD', 'RISK']) targetType!: string;
    @IsOptional() @IsString() controlId?: string;
    @IsOptional() @IsString() testCardId?: string;
    @IsOptional() @IsString() processCardId?: string;
    @IsString() versionId!: string;
    @IsOptional() @IsString() unitId?: string;
    @IsIn(MATCH_TYPES) matchType!: string;
    @IsOptional() @IsString() @MaxLength(4000) rationale?: string;
    @IsOptional() @IsIn(['binding_obligation', 'good_practice']) bindingType?: string;
    @IsOptional() @IsString() @MaxLength(4000) applicabilityRationale?: string;
}
export class ReviewMappingDto {
    @IsIn(['USER_CONFIRMED', 'REJECTED', 'PENDING']) status!: string;
    @IsOptional() @IsString() @MaxLength(4000) rationale?: string;
}

// ─── Kartlar ───────────────────────────────────────────────────────────────
class StepDto {
    @Type(() => Number) @IsInt() @Min(1) no!: number;
    @IsString() @MinLength(1) @MaxLength(4000) text!: string;
}
export class UpsertTestCardDto {
    @IsString() @MinLength(2) @MaxLength(40) code!: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) topicNo?: number;
    @IsString() @MinLength(3) @MaxLength(300) title!: string;
    @IsOptional() @IsIn(['AI_DRAFT', 'INTERNAL_METHODOLOGY', 'IMPORTED']) origin?: string;
    @IsString() @MaxLength(8000) purposeRisk!: string;
    @IsString() @MaxLength(8000) scopePrereq!: string;
    @IsString() @MaxLength(8000) method!: string;
    @IsArray() @ValidateNested({ each: true }) @Type(() => StepDto) steps!: StepDto[];
    @IsString() @MaxLength(8000) expectedState!: string;
    @IsArray() @IsString({ each: true }) requestedEvidence!: string[];
    @IsString() @MaxLength(8000) evidenceSufficiency!: string;
    decisionCriteria!: unknown;
    @IsString() @MaxLength(8000) misleadingSignals!: string;
    @IsString() @MaxLength(8000) sampleControlResult!: string;
    @IsString() @MaxLength(8000) sampleEvidenceRequest!: string;
    @IsOptional() @IsString() relatedControlId?: string;
}
export class UpsertProcessCardDto {
    @IsString() @MinLength(2) @MaxLength(40) code!: string;
    @IsString() @MinLength(3) @MaxLength(300) title!: string;
    @IsIn(['trading', 'market_data', 'surveillance', 'connectivity', 'session', 'clock_records']) area!: string;
    @IsString() @MaxLength(8000) description!: string;
    @IsArray() @IsString({ each: true }) criticalAssets!: string[];
    paramSpec!: unknown;
    @IsOptional() @IsArray() @IsString({ each: true }) linkedControlIds?: string[];
}
export class UpsertEvidenceRuleDto {
    @IsString() @MinLength(2) @MaxLength(40) code!: string;
    @IsIn(['distinction', 'dimension']) category!: string;
    @IsString() @MinLength(3) @MaxLength(300) title!: string;
    @IsString() @MaxLength(8000) rule!: string;
    @IsOptional() @IsString() @MaxLength(8000) goodExample?: string;
    @IsOptional() @IsString() @MaxLength(8000) badExample?: string;
    @IsOptional() scoringSpec?: unknown;
    @IsOptional() @Type(() => Number) @IsInt() @Min(0) orderNo?: number;
}
export class CardStatusDto {
    @IsIn(CARD_STATUS) status!: string;
}

// ─── Veri setleri / senaryolar ─────────────────────────────────────────────
export class UpsertDatasetDto {
    @IsString() @MinLength(2) @MaxLength(40) code!: string;
    @IsString() @MinLength(3) @MaxLength(200) name!: string;
    @IsIn(DATASET_PURPOSE) purpose!: string;
    @IsOptional() @IsString() @MaxLength(4000) description?: string;
}
export class UpsertScenarioDto {
    @IsString() @MinLength(2) @MaxLength(60) scenarioId!: string;
    @IsString() @MinLength(2) @MaxLength(60) familyKey!: string;
    @IsString() datasetId!: string;
    @IsOptional() @IsString() testCardId?: string;
    @IsIn(SCENARIO_KIND) kind!: string;
    inputEvidence!: unknown;
    @IsIn(DECISIONS) expectedDecision!: string;
    @IsString() @MaxLength(8000) rationale!: string;
    @IsArray() @IsString({ each: true }) requiredRefs!: string[];
    @IsArray() @IsString({ each: true }) forbiddenInferences!: string[];
    @IsArray() @IsString({ each: true }) missingEvidence!: string[];
    @IsOptional() @IsArray() @IsString({ each: true }) unitIds?: string[];
    @IsOptional() @IsArray() @IsString({ each: true }) versionIds?: string[];
}
export class ScenarioReviewDto {
    @IsIn(SCENARIO_STATUS) status!: string;
    @IsOptional() @IsString() @MaxLength(4000) note?: string;
}

// ─── Retrieval / kalite ────────────────────────────────────────────────────
export class RetrievalQueryDto {
    @IsString() @MinLength(2) @MaxLength(4000) query!: string;
    @IsOptional() @IsArray() @IsString({ each: true }) kinds?: string[];
    @IsOptional() @IsString() asOfDate?: string;
    @IsOptional() @IsString() @MaxLength(120) scope?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) topK?: number;
    /** Kesin madde/kontrol kodu araması. */
    @IsOptional() @IsString() @MaxLength(120) unitCode?: string;
}
export class QualityRunDto {
    @IsString() @MinLength(2) @MaxLength(200) label!: string;
    @IsString() datasetId!: string;
    @IsOptional() @IsString() modelName?: string;
    @IsOptional() @IsString() promptVersion?: string;
    @IsOptional() @IsString() retrievalVersion?: string;
    /** Her senaryo için tahmin edilen karar (dışarıda üretilip buraya verilir). */
    @IsArray() items!: { scenarioId: string; predictedDecision: string; usedRefs?: string[]; issues?: string[]; latencyMs?: number; rawOutput?: unknown }[];
}

// ─── Hazırlık / kullanım hakkı onayı ──────────────────────────────────────
export class VerifyRightsDto {
    @IsString() @MinLength(3) @MaxLength(8000) basis!: string; // lisans / karar / yazışma dayanağı
    @IsOptional() @IsIn(USAGE_PERMISSION) rightRefLink?: string;
    @IsOptional() @IsIn(USAGE_PERMISSION) rightFullText?: string;
    @IsOptional() @IsIn(USAGE_PERMISSION) rightRag?: string;
    @IsOptional() @IsIn(USAGE_PERMISSION) rightFineTune?: string;
    @IsOptional() @IsIn(USAGE_PERMISSION) rightExport?: string;
}
export class RevokeRightsDto {
    @IsString() @MinLength(3) @MaxLength(2000) reason!: string;
}
export class UnitLookupDto {
    @IsOptional() @IsString() @MaxLength(120) code?: string;
    @IsOptional() @IsString() @MaxLength(200) q?: string;
    @IsOptional() @IsString() versionId?: string;
}
export class VerifyCitationsDto {
    @IsArray() citations!: { unitId?: string; unitCode?: string; versionId?: string; quote?: string; group?: string; index?: number }[];
    @IsOptional() @IsArray() @IsString({ each: true }) sentUnitIds?: string[];
}

// ─── İçe aktarma ───────────────────────────────────────────────────────────
export class ImportManifestDto {
    /** { sources: [...] } — resmî URL + metadata + kullanım hakları. İçerik gövdesi opsiyonel. */
    manifest!: unknown;
    @IsOptional() @IsBoolean() apply?: boolean;
}
