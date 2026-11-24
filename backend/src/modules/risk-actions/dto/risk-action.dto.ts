import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { RiskActionStatus } from '@prisma/client';
import { EmptyToUndefined } from '../../../common/decorators';

/** Ortak alanlar (aksiyonId backend üretir; istemciden kabul edilmez). */
class RiskActionFields {
    @IsOptional() @IsEnum(RiskActionStatus) status?: RiskActionStatus;
    @IsOptional() @IsString() @MaxLength(100) kayitId?: string;
    @IsOptional() @IsString() @MaxLength(200) aksiyonSahibi?: string;
    @IsOptional() @IsString() @MaxLength(200) aksiyonSorumlusu?: string;
    @IsOptional() @IsString() @MaxLength(200) atanan?: string;
    @IsOptional() @IsString() @MaxLength(200) ilgiliGmy?: string;
    @IsOptional() @IsString() @MaxLength(5000) ozet?: string;
    @IsOptional() @IsString() @MaxLength(100) potaNo?: string;
    @IsOptional() @IsString() @MaxLength(100) bulgReferansNo?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() mutabakatTarihi?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() hedeflenenTamamlanmaTarihi?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() tamamlanmaTarihi?: string;
    @IsOptional() @EmptyToUndefined() @IsString() riskControlId?: string;
    @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) riskIds?: string[];
}

export class CreateRiskActionDto extends RiskActionFields {
    @IsString() @IsNotEmpty() @MaxLength(5000) aksiyonTanimi: string;
}

export class UpdateRiskActionDto extends RiskActionFields {
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(5000) aksiyonTanimi?: string;
}
