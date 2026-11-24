import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsEnum, IsBoolean, ValidateIf, MaxLength, IsIn } from 'class-validator';
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

    // Riskin niteliği: birim riski → directorateId zorunlu; kurum geneli risk → isOrgWide=true
    // ve directorateId boş. Kural serviste uygulanır (RisksService.create).
    @IsString()
    @IsOptional()
    directorateId?: string;

    @IsBoolean()
    @IsOptional()
    isOrgWide?: boolean;

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

    // ── Tanımlayıcı alanlar (risk ekranı) ──
    @IsOptional() @IsString() @MaxLength(5000) ozet?: string;
    // İlgili GMY ve Risk Sorumlusu yalnız veritabanında tanımlı kayıtlardan seçilir (serbest
    // metin kabul edilmez); gösterim adları sunucuda türetilir. null = seçimi kaldır.
    @IsOptional() @ValidateIf(o => o.gmyId !== null) @IsString() @MaxLength(64) gmyId?: string | null;
    @IsOptional() @IsString() @MaxLength(255) surec?: string;
    @IsOptional() @IsString() @MaxLength(255) altSurec?: string;
    @IsOptional() @IsBoolean() flagForIT?: boolean;
    @IsOptional() @ValidateIf(o => o.riskSorumlusuId !== null) @IsString() @MaxLength(64) riskSorumlusuId?: string | null;
    @IsOptional() @IsIn(['KABUL', 'AZALT', 'TRANSFER', 'KAÇIN']) riskIsleme?: string;
    // ── Puanlama girdileri (1–5). Etki/doğal puan/seviye SUNUCUDA hesaplanır. ──
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) finansalEtki?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) itibarEtkisi?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) regulasyonEtkisi?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) musteriEtkisi?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) gizlilikEtkisi?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) butunlukEtkisi?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) erisilebilirlikEtkisi?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) olasilik?: number;
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

    // Değiştirmek risk:directorate:change izni ister (erişimi etkiler) ve denetim kaydı yazar.
    // null → direktörlüğü kaldır (yalnız isOrgWide=true ile birlikte).
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    directorateId?: string | null;

    @IsBoolean()
    @IsOptional()
    isOrgWide?: boolean;

    @IsInt()
    @Min(1)
    @Max(5)
    @IsOptional()
    @Type(() => Number)
    inherentProbability?: number;

    @IsInt()
    @Min(1)
    @Max(5)
    @IsOptional()
    @Type(() => Number)
    inherentImpact?: number;

    @IsInt()
    @Min(1)
    @Max(25)
    @IsOptional()
    @Type(() => Number)
    riskAppetite?: number;

    // ── Tanımlayıcı alanlar (risk ekranı) ──
    @IsOptional() @IsString() @MaxLength(5000) ozet?: string;
    // İlgili GMY ve Risk Sorumlusu yalnız veritabanında tanımlı kayıtlardan seçilir (serbest
    // metin kabul edilmez); gösterim adları sunucuda türetilir. null = seçimi kaldır.
    @IsOptional() @ValidateIf(o => o.gmyId !== null) @IsString() @MaxLength(64) gmyId?: string | null;
    @IsOptional() @IsString() @MaxLength(255) surec?: string;
    @IsOptional() @IsString() @MaxLength(255) altSurec?: string;
    @IsOptional() @IsBoolean() flagForIT?: boolean;
    @IsOptional() @ValidateIf(o => o.riskSorumlusuId !== null) @IsString() @MaxLength(64) riskSorumlusuId?: string | null;
    @IsOptional() @IsIn(['KABUL', 'AZALT', 'TRANSFER', 'KAÇIN']) riskIsleme?: string;
    // ── Puanlama girdileri (1–5). Etki/doğal puan/seviye SUNUCUDA hesaplanır. ──
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) finansalEtki?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) itibarEtkisi?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) regulasyonEtkisi?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) musteriEtkisi?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) gizlilikEtkisi?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) butunlukEtkisi?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) erisilebilirlikEtkisi?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) olasilik?: number;
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
    @IsString()
    directorateId?: string;

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
