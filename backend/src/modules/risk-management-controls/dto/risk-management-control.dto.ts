import { IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { TestResult } from '@prisma/client';
import { EmptyToUndefined } from '../../../common/decorators';

/** controlCode, controlScore ve ownerId backend'de üretilir. */
export class CreateRiskManagementControlDto {
    @IsString() @IsNotEmpty() @MaxLength(300) name: string;
    @IsOptional() @IsString() @MaxLength(5000) description?: string;
    @IsOptional() @IsInt() @Min(1) @Max(5) effectiveness?: number;
    @IsOptional() @IsInt() @Min(1) @Max(5) frequency?: number;
    @IsOptional() @IsInt() @Min(1) @Max(5) automationLevel?: number;
    @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateRiskManagementControlDto {
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300) name?: string;
    @IsOptional() @IsString() @MaxLength(5000) description?: string;
    @IsOptional() @IsInt() @Min(1) @Max(5) effectiveness?: number;
    @IsOptional() @IsInt() @Min(1) @Max(5) frequency?: number;
    @IsOptional() @IsInt() @Min(1) @Max(5) automationLevel?: number;
    @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Testi yapan kişi oturumdaki kullanıcıdır (istemciden "tester" alınmaz). */
export class CreateRmControlTestDto {
    @IsEnum(TestResult) result: TestResult;
    @IsOptional() @EmptyToUndefined() @IsDateString() testDate?: string;
    @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class ApplicabilityScoreDto {
    @IsInt() @Min(1) @Max(5) applicabilityScore: number;
}

export class OptionalApplicabilityScoreDto {
    @IsOptional() @IsInt() @Min(1) @Max(5) applicabilityScore?: number;
}
