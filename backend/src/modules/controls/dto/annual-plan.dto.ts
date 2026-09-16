import { Transform, Type } from 'class-transformer';
import {
    IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString,
    Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { ControlFrequency } from '@prisma/client';

const toStringArray = ({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Array.isArray(value) ? value : [value];
};

export class AnnualPlanWorkspaceQueryDto {
    @IsOptional() @IsIn(['MINE', 'UNIT', 'ORG']) scope?: 'MINE' | 'UNIT' | 'ORG';
    @IsOptional() @Transform(toStringArray) @IsArray() @IsString({ each: true }) directorateId?: string[];

    @IsOptional() @IsString() @MaxLength(200) search?: string;
    @IsOptional() @IsString() ownerId?: string;
    @IsOptional() @IsEnum(ControlFrequency) frequency?: ControlFrequency;
    @IsOptional() @IsIn(['IN_SCOPE', 'OUT_OF_SCOPE']) scopeFilter?: 'IN_SCOPE' | 'OUT_OF_SCOPE';
    @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() missingSchedule?: boolean;
    @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() changedInDraft?: boolean;
    @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() assignmentIncomplete?: boolean;

    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class AnnualPlanDraftItemPatchDto {
    @IsString() controlId: string;
    @IsBoolean() inScope: boolean;
    @IsOptional() @IsEnum(ControlFrequency) frequency?: ControlFrequency;
    @IsOptional() @IsInt() @Min(1) @Max(12) referenceMonth?: number;
    @IsOptional() @IsArray() @IsString({ each: true }) selectedMonths?: string[];
    @IsOptional() @IsDateString() controlDate?: string;
    @IsOptional() @IsString() @MaxLength(2000) reason?: string;
    // Not: EmptyToUndefined KULLANILMAZ — '' "atamayı temizle" demek.
    @IsOptional() @IsString() assigneeId?: string;
    @IsOptional() @IsString() secondControllerId?: string;
}

export class SaveDraftItemsDto {
    @IsInt() expectedRevision: number;
    @IsArray() @ValidateNested({ each: true }) @Type(() => AnnualPlanDraftItemPatchDto) items: AnnualPlanDraftItemPatchDto[];
}

export class BulkDraftActionDto {
    @IsArray() @IsString({ each: true }) controlIds: string[];
    @IsIn(['ADD', 'REMOVE', 'ASSIGN']) action: 'ADD' | 'REMOVE' | 'ASSIGN';
    @IsOptional() @IsEnum(ControlFrequency) frequency?: ControlFrequency;
    @IsOptional() @IsArray() @IsString({ each: true }) selectedMonths?: string[];
    // ── ASSIGN aksiyonu için ──
    @IsOptional() @IsString() assigneeId?: string;
    @IsOptional() @IsString() secondControllerId?: string;
    @IsOptional() @IsBoolean() onlyMissing?: boolean;
    @IsOptional() @IsBoolean() dryRun?: boolean;
    @IsInt() expectedRevision: number;
}

export class EligibleControllersQueryDto {
    @IsOptional() @IsString() controlId?: string;
    @IsIn(['assignee', 'secondController']) role: 'assignee' | 'secondController';
}

export class ApplyPlanDto {
    @IsInt() expectedRevision: number;
}
