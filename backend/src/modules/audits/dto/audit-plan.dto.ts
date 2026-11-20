import { Type } from 'class-transformer';
import {
    ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { AuditExecutionStatus, AuditPlanPhase, AuditPlanPriority, AuditPlanRationale, AuditPlanStatus, PeriodType } from '@prisma/client';
import { EmptyToUndefined } from '../../../common/decorators';

/** Ortak alanlar. planId backend üretir; sayaçlar (bulgu/aksiyon) istemciden alınmaz. */
class AuditPlanFields {
    @IsOptional() @IsEnum(AuditPlanStatus) status?: AuditPlanStatus;
    @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) riskIds?: string[];
    @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) controlIds?: string[];
    @IsOptional() @IsString() @MaxLength(300) auditedUnit?: string;
    @IsOptional() @IsString() @MaxLength(300) auditTeam?: string;
    @IsOptional() @IsString() @MaxLength(200) teamLeader?: string;
    @IsOptional() @IsInt() @Min(0) @Max(500) teamSize?: number;
    @IsOptional() @EmptyToUndefined() @IsDateString() plannedStartDate?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() plannedEndDate?: string;
    @IsOptional() @IsEnum(AuditPlanPhase) phase?: AuditPlanPhase;
    @IsOptional() @EmptyToUndefined() @IsEnum(AuditPlanRationale) rationale?: AuditPlanRationale;
    @IsOptional() @IsEnum(AuditPlanPriority) priority?: AuditPlanPriority;
    @IsOptional() @IsInt() @Min(0) @Max(100000) plannedManDays?: number;
    @IsOptional() @IsInt() @Min(0) @Max(100000) actualManDays?: number;
    @IsOptional() @EmptyToUndefined() @IsDateString() draftReportDate?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() finalReportDate?: string;
}

export class CreateAuditPlanDto extends AuditPlanFields {
    @IsString() @IsNotEmpty() @MaxLength(300) name: string;
    @IsInt() @Min(2000) @Max(2100) year: number;
    @IsEnum(PeriodType) periodType: PeriodType;
    @IsString() @MaxLength(10000) objectives: string;
    @IsString() @MaxLength(10000) scope: string;
}

export class UpdateAuditPlanDto extends AuditPlanFields {
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300) name?: string;
    @IsOptional() @IsInt() @Min(2000) @Max(2100) year?: number;
    @IsOptional() @IsEnum(PeriodType) periodType?: PeriodType;
    @IsOptional() @IsString() @MaxLength(10000) objectives?: string;
    @IsOptional() @IsString() @MaxLength(10000) scope?: string;
}

export class AuditControlTestEntryDto {
    @IsString() @MaxLength(100) controlId: string;
    @IsOptional() @IsString() @MaxLength(100) result?: string;
    @IsOptional() @IsString() @MaxLength(5000) evidence?: string;
    @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

/** executionId backend üretir. */
class AuditExecutionFields {
    @IsOptional() @EmptyToUndefined() @IsDateString() endDate?: string;
    @IsOptional() @IsEnum(AuditExecutionStatus) status?: AuditExecutionStatus;
    @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
    @IsOptional() @IsInt() @Min(0) @Max(100000) workpapers?: number;
    @IsOptional() @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => AuditControlTestEntryDto)
    controlTests?: AuditControlTestEntryDto[];
}

export class CreateAuditExecutionDto extends AuditExecutionFields {
    @IsString() @IsNotEmpty() auditPlanId: string;
    @IsDateString() startDate: string;
    @IsString() @IsNotEmpty() @MaxLength(200) auditor: string;
}

export class UpdateAuditExecutionDto extends AuditExecutionFields {
    @IsOptional() @EmptyToUndefined() @IsDateString() startDate?: string;
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) auditor?: string;
}
