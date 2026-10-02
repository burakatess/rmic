import { Type } from 'class-transformer';
import {
    IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength,
} from 'class-validator';

export class ReviewAssessmentDto {
    @IsIn(['accept', 'edit', 'reject'])
    action!: 'accept' | 'edit' | 'reject';

    /** action = 'edit' iken kullanıcının düzenlediği çıktı (serbest JSON). */
    @IsOptional()
    editedOutput?: unknown;
}

export class RunStageDto {
    /** Önbelleği atla, modeli yeniden çalıştır. */
    @IsOptional()
    force?: boolean;
}

export class AskQueryDto {
    @IsString()
    @MinLength(3)
    @MaxLength(1000)
    question!: string;
}

// ─── Kontrol & Kanıt Değerlendirme ──────────────────────────────────────────

export const EVAL_RUN_STATUSES = ['DRAFT', 'RUNNING', 'AWAITING_REVIEW', 'COMPLETED', 'ERROR'] as const;
export const EVAL_OUTCOMES = ['MET', 'PARTIALLY_MET', 'NOT_MET', 'INCONCLUSIVE'] as const;
export const EVAL_VIEWS = ['active', 'archived', 'trashed'] as const;

export class EvalSessionDto {
    @IsOptional() @IsString() @MaxLength(200)
    title?: string;

    @IsOptional() @IsString() @MaxLength(60)
    period?: string | null;

    @IsOptional() @IsString()
    controlRefId?: string | null;

    @IsOptional() @IsString() @MaxLength(20000)
    controlText?: string | null;

    @IsOptional() @IsString() @MaxLength(20000)
    controlManualNote?: string | null;

    @IsOptional() @IsString() @MaxLength(20000)
    evidenceText?: string | null;

    @IsOptional() @IsArray() @IsString({ each: true })
    regulationArticleIds?: string[];

    @IsOptional() @IsArray() @IsString({ each: true })
    knowledgeDocIds?: string[];

    /** Kaynak Kataloğu birimleri (SourceUnit.id) — sürümlü, yetkilendirilmiş kaynaklar. */
    @IsOptional() @IsArray() @IsString({ each: true })
    sourceUnitIds?: string[];

    /** Optimistic concurrency — istemcinin gördüğü son sürüm. Uyuşmazsa 409. */
    @IsOptional() @Type(() => Number) @IsInt() @Min(0)
    contentVersion?: number;
}

export class RenameEvalSessionDto {
    @IsString() @MinLength(1) @MaxLength(200)
    title!: string;
}

export class CompleteEvalSessionDto {
    @IsEnum(EVAL_OUTCOMES as unknown as string[])
    outcome!: string;
}

export class CloneEvalSessionDto {
    @IsString() @MinLength(1) @MaxLength(60)
    period!: string;
}

export class BulkEvalDto {
    @IsArray() @IsString({ each: true })
    ids!: string[];
}

export class EvalListQueryDto {
    @IsOptional() @IsIn(EVAL_VIEWS as unknown as string[])
    view?: string;

    @IsOptional() @IsString() @MaxLength(200)
    q?: string;

    @IsOptional() @IsIn(EVAL_RUN_STATUSES as unknown as string[])
    runStatus?: string;

    @IsOptional() @IsIn(EVAL_OUTCOMES as unknown as string[])
    outcome?: string;

    @IsOptional() @IsString()
    controlRefId?: string;

    @IsOptional() @IsString() @MaxLength(60)
    period?: string;

    @IsOptional() @IsString()
    dateFrom?: string;

    @IsOptional() @IsString()
    dateTo?: string;

    @IsOptional() @IsIn(['updatedAt', 'title', 'createdAt'])
    sort?: string;

    @IsOptional() @IsIn(['asc', 'desc'])
    dir?: string;

    @IsOptional() @Type(() => Number) @IsInt() @Min(1)
    page?: number;

    @IsOptional() @Type(() => Number) @IsInt() @Min(1)
    pageSize?: number;
}

export class EvalMessageDto {
    @IsOptional() @IsString() @MaxLength(10000)
    text?: string;
}

/**
 * "Değerlendir / Yeniden Değerlendir" — EKRANDAKİ güncel girdinin tamamı gövdede.
 * Sunucu önce bu girdiyi kaydeder (contentVersion çakışırsa 409), kayıt
 * başarısızsa çalıştırma YAPMAZ, sonra değişmez snapshot ile modeli çağırır.
 * `additionalNote` kanıttan AYRI bir alandır ve modele ayrı iletilir.
 */
export class EvalRunDto extends EvalSessionDto {
    @IsOptional() @IsString() @MaxLength(10000)
    additionalNote?: string | null;

    /** Yeniden değerlendirmeye eklenecek kullanıcı sorusu (ayrıca "Ek soru" ile sorulanlar da otomatik eklenir). */
    @IsOptional() @IsString() @MaxLength(4000)
    followUpQuestion?: string | null;
}

/** "Ek soru sor" — 6 başlıklı raporu yeniden üretmez, soruya doğrudan yanıt verir. */
export class EvalAskDto {
    @IsString() @MinLength(3) @MaxLength(4000)
    question!: string;

    /** İyimser eşzamanlılık — ekrandaki girdiyle tutarlılık için opsiyonel. */
    @IsOptional() @Type(() => Number) @IsInt() @Min(0)
    contentVersion?: number;
}

export class EvalAttachmentDto {
    @IsString() fileName!: string;
    @IsString() originalName!: string;
    @IsString() mimeType!: string;

    @IsInt() @Min(0)
    sizeBytes!: number;
}

export class EvalAttachmentMetaDto {
    @IsOptional() @IsString() @MaxLength(120) docDate?: string | null;
    @IsOptional() @IsString() @MaxLength(200) relatedSystem?: string | null;
    @IsOptional() @IsString() @MaxLength(200) relatedSample?: string | null;
    @IsOptional() @IsString() @MaxLength(200) relatedTestStep?: string | null;
    @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
}

/** Tespit bazında insan incelemesi (item 9). */
export class EvalFindingReviewDto {
    /** Değerlendirmedeki grup ve indeks. v1: uyumsuzAlanlar|bulguAdaylari; v2: findingAssessment|requirementAssessments. */
    @IsIn(['uyumsuzAlanlar', 'bulguAdaylari', 'uyumluAlanlar', 'findingAssessment', 'requirementAssessments', 'finding'])
    group!: string;
    @Type(() => Number) @IsInt() @Min(0) index!: number;
    @IsIn(['ACCEPTED', 'EDITED', 'REJECTED']) status!: string;
    @IsOptional() @IsString() @MaxLength(2000) reason?: string;
    /** status = EDITED iken düzenlenen alanlar (serbest JSON). */
    @IsOptional() edited?: unknown;
}
