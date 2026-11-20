import { Type } from 'class-transformer';
import {
    ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString,
    Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { RiskEntryRecordType, RiskEntryStatus, RiskTreatmentOption } from '@prisma/client';
import { EmptyToUndefined } from '../../../common/decorators';

/** Ortak alanlar. riskId backend üretir; hesaplanan skorlar (etki, puanlar, seviyeler) istemciden kabul edilmez. */
class RiskEntryFields {
    @IsOptional() @IsString() @MaxLength(100) kayitId?: string;
    @IsOptional() @IsEnum(RiskEntryRecordType) kayitTipi?: RiskEntryRecordType;
    @IsOptional() @IsEnum(RiskEntryStatus) riskStatus?: RiskEntryStatus;
    @IsOptional() @IsString() @MaxLength(200) riskSahibi?: string;
    @IsOptional() @IsString() @MaxLength(200) surec?: string;
    @IsOptional() @IsString() @MaxLength(200) altSurec?: string;
    @IsOptional() @IsBoolean() flagForIT?: boolean;
    @IsOptional() @IsInt() @Min(1) @Max(5) finansalEtki?: number;
    @IsOptional() @IsInt() @Min(1) @Max(5) itibarEtkisi?: number;
    @IsOptional() @IsInt() @Min(1) @Max(5) regulasyonEtkisi?: number;
    @IsOptional() @IsInt() @Min(1) @Max(5) musteriEtkisi?: number;
    @IsOptional() @IsInt() @Min(1) @Max(5) gizlilikEtkisi?: number;
    @IsOptional() @IsInt() @Min(1) @Max(5) butunlukEtkisi?: number;
    @IsOptional() @IsInt() @Min(1) @Max(5) erisebilirlikEtkisi?: number;
    @IsOptional() @IsInt() @Min(1) @Max(5) olasilik?: number;
    @IsOptional() @IsNumber() @Min(0) @Max(5) butunlesikKontrolPuani?: number;
    @IsOptional() @IsEnum(RiskTreatmentOption) riskIsleme?: RiskTreatmentOption;
    @IsOptional() @EmptyToUndefined() @IsDateString() mutabakatTarihi?: string;
    @IsOptional() @IsString() @MaxLength(200) riskSorumlusu?: string;
    @IsOptional() @IsString() @MaxLength(200) atanan?: string;
}

export class CreateRiskEntryDto extends RiskEntryFields {
    @IsString() @IsNotEmpty() @MaxLength(5000) riskTanimi: string;
}

export class UpdateRiskEntryDto extends RiskEntryFields {
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(5000) riskTanimi?: string;
}

export class BulkCreateRiskEntryDto {
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => CreateRiskEntryDto)
    entries: CreateRiskEntryDto[];
}

export class SyncRiskEntriesDto {
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsString({ each: true }) ids: string[];
}
