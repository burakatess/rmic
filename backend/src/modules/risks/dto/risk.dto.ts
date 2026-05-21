import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum RiskStatus {
    IDENTIFIED = 'IDENTIFIED',
    ASSESSED = 'ASSESSED',
    TREATED = 'TREATED',
    ACCEPTED = 'ACCEPTED',
    CLOSED = 'CLOSED',
}

export enum TreatmentDecision {
    ACCEPT = 'ACCEPT',
    MITIGATE = 'MITIGATE',
    TRANSFER = 'TRANSFER',
    AVOID = 'AVOID',
}

export class CreateRiskDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsNotEmpty()
    categoryId: string;

    @IsString()
    @IsOptional()
    ownerId?: string;

    @IsInt()
    @Min(1)
    @Max(5)
    @Type(() => Number)
    inherentProbability: number = 1;

    @IsInt()
    @Min(1)
    @Max(5)
    @Type(() => Number)
    inherentImpact: number = 1;

    @IsInt()
    @Min(1)
    @Max(25)
    @IsOptional()
    @Type(() => Number)
    riskAppetite?: number;
}

export class UpdateRiskDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    categoryId?: string;

    @IsString()
    @IsOptional()
    ownerId?: string;

    @IsEnum(RiskStatus)
    @IsOptional()
    status?: RiskStatus;

    @IsInt()
    @Min(1)
    @Max(25)
    @IsOptional()
    @Type(() => Number)
    riskAppetite?: number;
}

export class AssessRiskDto {
    @IsInt()
    @Min(1)
    @Max(5)
    @Type(() => Number)
    probability: number;

    @IsInt()
    @Min(1)
    @Max(5)
    @Type(() => Number)
    impact: number;

    @IsString({ each: true })
    @IsOptional()
    mitigatingControlIds?: string[];

    @IsInt()
    @Min(1)
    @Max(5)
    @IsOptional()
    @Type(() => Number)
    residualProbability?: number;

    @IsInt()
    @Min(1)
    @Max(5)
    @IsOptional()
    @Type(() => Number)
    residualImpact?: number;

    @IsEnum(TreatmentDecision)
    @IsOptional()
    treatmentDecision?: TreatmentDecision;

    @IsString()
    @IsOptional()
    justification?: string;
}

export class TreatRiskDto {
    @IsEnum(TreatmentDecision)
    treatmentDecision: TreatmentDecision;

    @IsString()
    @IsOptional()
    justification?: string;
}

export class RiskQueryDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsString()
    categoryId?: string;

    @IsOptional()
    @IsString()
    ownerId?: string;

    @IsOptional()
    @IsEnum(RiskStatus)
    status?: RiskStatus;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(2000)
    limit?: number = 20;

    @IsOptional()
    @IsString()
    sortBy?: string = 'createdAt';

    @IsOptional()
    @IsString()
    sortOrder?: 'asc' | 'desc' = 'desc';
}

export class RiskResponseDto {
    id: string;
    riskId: string;
    name: string;
    description: string;
    status: RiskStatus;
    category: {
        id: string;
        name: string;
    };
    owner: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    inherentProbability: number;
    inherentImpact: number;
    inherentRiskScore: number;
    residualProbability: number | null;
    residualImpact: number | null;
    residualRiskScore: number | null;
    riskAppetite: number | null;
    isAboveAppetite: boolean;
    treatmentDecision: TreatmentDecision | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}
