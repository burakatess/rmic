import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { RiskControlStatus } from '@prisma/client';
import { EmptyToUndefined } from '../../../common/decorators';

/** Ortak alanlar (kontrolId backend üretir; istemciden kabul edilmez). */
class RiskControlFields {
    @IsOptional() @IsEnum(RiskControlStatus) status?: RiskControlStatus;
    @IsOptional() @IsString() @MaxLength(100) kayitId?: string;
    @IsOptional() @IsString() @MaxLength(200) ilgiliGmy?: string;
    @IsOptional() @IsString() @MaxLength(200) riskSahibi?: string;
    @IsOptional() @IsString() @MaxLength(200) surec?: string;
    @IsOptional() @IsString() @MaxLength(200) altSurec?: string;
    @IsOptional() @IsString() @MaxLength(5000) riskTanimi?: string;
    @IsOptional() @IsString() @MaxLength(100) kontrolTuru?: string;
    @IsOptional() @IsString() @MaxLength(100) kontrolIslevi?: string;
    @IsOptional() @IsString() @MaxLength(200) kontrolIsletimeSekli?: string;
    @IsOptional() @IsString() @MaxLength(500) kontrolIsletimDenetimi?: string;
    @IsOptional() @IsString() @MaxLength(500) kontrolIsletimRaporlama?: string;
    @IsOptional() @IsString() @MaxLength(100) birSeviyeKontrolSikligi?: string;
    @IsOptional() @IsNumber() @Min(0) @Max(100) kontrolPuani?: number;
    @IsOptional() @IsString() @MaxLength(20) kontrolSkoru?: string;
    @IsOptional() @IsNumber() @Min(0) @Max(100) butunlesikKontrolPuani?: number;
    @IsOptional() @IsString() @MaxLength(20) butunlesikKontrolSkoru?: string;
    @IsOptional() @IsString() @MaxLength(50) butunlesikKontrolSeviyesi?: string;
    @IsOptional() @IsString() @MaxLength(200) riskSorumlusu?: string;
    @IsOptional() @IsString() @MaxLength(5000) ozet?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() mutabakatTarihi?: string;
    @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) riskIds?: string[];
}

export class CreateRiskControlDto extends RiskControlFields {
    @IsString() @IsNotEmpty() @MaxLength(5000) kontrolTanimi: string;
}

export class UpdateRiskControlDto extends RiskControlFields {
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(5000) kontrolTanimi?: string;
}
