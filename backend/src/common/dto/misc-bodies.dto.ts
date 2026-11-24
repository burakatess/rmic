/**
 * Küçük, tek amaçlı istek gövdeleri — önceden satır içi TypeScript tipiyle (`{ ... }`)
 * alınıyordu; çalışma anında `any` ile aynıdır (ValidationPipe doğrulayamaz).
 */
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { EmptyToUndefined } from '../decorators';

export class LogoutDto {
    @IsOptional() @IsString() @MaxLength(2000) refreshToken?: string;
}

export class CreateRiskProposalDto {
    @IsOptional() @EmptyToUndefined() @IsString() findingId?: string;
    @IsOptional() @EmptyToUndefined() @IsString() directorateId?: string;
    @IsString() @IsNotEmpty() @MaxLength(5000) riskTanimi: string;
}

export class IcKontrolOnayinaGonderDto {
    @IsString() @IsNotEmpty() @MaxLength(10000) birimCevabi: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() targetResolutionDate?: string;
}

/**
 * Mutabakat bilgi kaydıdır, onay mekanizması değildir: bulgunun çözüm durumunu değiştirmez.
 * (Eskiden `resolutionStatus: KAPATILDI` kabul ediliyordu — bulgu açıkken "kapatıldı" + kapanış tarihi
 * yazılabiliyordu. Kapanış yalnız kapanış değerlendirmesiyle olur; alan artık reddedilir.)
 */
export class MutabakatOnaylaDto {
    @IsOptional() @IsString() @MaxLength(10000) internalControlAssessment?: string;
}

/** Yazar oturumdaki kullanıcıdır; istemciden yazar adı alınmaz. */
export class AppendStatusLogDto {
    @IsString() @IsNotEmpty() @MaxLength(5000) text: string;
}

export class CreateRegulationDto {
    @IsString() @IsNotEmpty() @MaxLength(50) code: string;
    @IsString() @IsNotEmpty() @MaxLength(300) name: string;
    @IsOptional() @IsString() @MaxLength(5000) description?: string;
}

export class UpdateRegulationDto {
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50) code?: string;
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300) name?: string;
    @IsOptional() @IsString() @MaxLength(5000) description?: string;
    @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateArticleDto {
    @IsString() @IsNotEmpty() @MaxLength(50) articleCode: string;
    @IsString() @IsNotEmpty() @MaxLength(500) title: string;
    @IsString() @IsNotEmpty() @MaxLength(10000) description: string;
}

export class ApplyNewVersionDto {
    @IsOptional() @IsBoolean() confirmOngoing?: boolean;
    @IsOptional() @IsBoolean() dryRun?: boolean;
}

export class MapControlRiskDto {
    @IsString() @IsNotEmpty() riskId: string;
    @IsOptional() @IsIn(['PRIMARY', 'SECONDARY']) mappingType?: 'PRIMARY' | 'SECONDARY';
}

export class FlagReReviewDto {
    @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) @MaxLength(200, { each: true }) changedUnitKeys: string[];
}

/** Gerekçe zorunlu işlemler (iade, final onay iptali). */
export class RequiredReasonDto {
    @IsString() @IsNotEmpty({ message: 'Gerekçe zorunludur' }) @MaxLength(2000) reason: string;
}

export class RejectProposalDto {
    @IsOptional() @IsString() @MaxLength(2000) reviewNote?: string;
}

export class RefreshApplyDto {
    @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(100, { each: true }) acceptFields: string[];
}

/** SIEM yönlendirme ayarı — yalnız bilinen alanlar saklanır (önceden serbest JSON). */
export class SiemConfigDto {
    @IsIn(['CEF', 'LEEF', 'JSON']) format: 'CEF' | 'LEEF' | 'JSON';
    @IsString() @MaxLength(253) @Matches(/^[A-Za-z0-9.-]*$/, { message: 'Syslog sunucusu alan adı veya IP olmalı' }) syslogHost: string;
    @IsInt() @Min(1) @Max(65535) syslogPort: number;
    @IsBoolean() enabled: boolean;
}
