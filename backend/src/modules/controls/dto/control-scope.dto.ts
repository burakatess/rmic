import { Type } from 'class-transformer';
import {
    IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional,
    IsString, Max, Min, ValidateNested,
} from 'class-validator';
import { EmptyToUndefined } from '../../../common/decorators';
import { ControlFrequency } from './control.dto';

export class AddScopeDto {
    @IsArray() @IsInt({ each: true }) @Min(2000, { each: true }) @Max(2100, { each: true })
    years: number[];

    @IsOptional() @IsEnum(ControlFrequency) frequency?: ControlFrequency;
    @IsOptional() @IsInt() @Min(1) @Max(12) referenceMonth?: number;
    @IsOptional() @IsArray() @IsString({ each: true }) selectedMonths?: string[];
    @IsOptional() @EmptyToUndefined() @IsDateString() controlDate?: string;
    @IsOptional() @IsBoolean() includePastPeriods?: boolean;
    // Not: EmptyToUndefined KULLANILMAZ — '' burada "atamayı temizle" anlamına
    // gelir, undefined "dokunma" anlamına gelir (directorateId'deki desenle
    // aynı, controls.service.ts::update).
    @IsOptional() @IsString() assigneeId?: string;
    @IsOptional() @IsString() secondControllerId?: string;
    @IsOptional() @IsBoolean() dryRun?: boolean;
}

export class BulkAddScopeDto {
    @IsArray() @IsString({ each: true }) controlIds: string[];
    @IsInt() @Min(2000) @Max(2100) year: number;
    @IsOptional() @IsEnum(ControlFrequency) frequency?: ControlFrequency;
    @IsOptional() @IsArray() @IsString({ each: true }) selectedMonths?: string[];
    @IsOptional() @IsBoolean() includePastPeriods?: boolean;
    @IsOptional() @IsBoolean() dryRun?: boolean;
}

export class CopyScopeDto {
    @IsInt() @Min(2000) @Max(2100) fromYear: number;
    @IsInt() @Min(2000) @Max(2100) toYear: number;
    @IsOptional() @IsArray() @IsString({ each: true }) controlIds?: string[];
    @IsOptional() @IsBoolean() dryRun?: boolean;
}

export class RemoveScopeDecisionDto {
    @IsString() @IsNotEmpty() taskId: string;
    @IsIn(['CONTINUE', 'CANCEL']) action: 'CONTINUE' | 'CANCEL';
}

export class RemoveScopeDto {
    @IsString() @IsNotEmpty() reason: string;
    @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RemoveScopeDecisionDto)
    decisions?: RemoveScopeDecisionDto[];
}

export class AssignmentDecisionDto {
    @IsString() @IsNotEmpty() taskId: string;
    @IsIn(['REASSIGN', 'KEEP']) action: 'REASSIGN' | 'KEEP';
}

export class ChangePeriodicityDto {
    @IsOptional() @IsEnum(ControlFrequency) frequency?: ControlFrequency;
    @IsOptional() @IsInt() @Min(1) @Max(12) referenceMonth?: number;
    @IsOptional() @IsArray() @IsString({ each: true }) selectedMonths?: string[];
    @IsString() @IsNotEmpty() reason: string;
    @IsOptional() @IsString() assigneeId?: string;
    @IsOptional() @IsString() secondControllerId?: string;
    @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AssignmentDecisionDto)
    assignmentDecisions?: AssignmentDecisionDto[];
    @IsOptional() @IsBoolean() dryRun?: boolean;
}
