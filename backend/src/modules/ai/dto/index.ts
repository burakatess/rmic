import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

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

export class EvalSessionDto {
    @IsOptional() @IsString() @MaxLength(200)
    title?: string;

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
}

export class EvalMessageDto {
    @IsOptional() @IsString() @MaxLength(10000)
    text?: string;
}

export class EvalAttachmentDto {
    @IsString() fileName!: string;
    @IsString() originalName!: string;
    @IsString() mimeType!: string;

    @IsInt() @Min(0)
    sizeBytes!: number;
}
