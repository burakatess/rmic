import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, IsBoolean, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { EmptyToUndefined } from '../../../common/decorators';

export enum FollowUpStatus { BEKLIYOR = 'BEKLIYOR', DEVAM_EDIYOR = 'DEVAM_EDIYOR', TAMAMLANDI = 'TAMAMLANDI', ONAYLANDI = 'ONAYLANDI' }
export enum FollowUpResult { YETERLI = 'YETERLI', YETERSIZ = 'YETERSIZ', YENI_AKSIYON_GEREKLI = 'YENI_AKSIYON_GEREKLI' }
export enum FollowUpApprovalStatus { BEKLIYOR = 'BEKLIYOR', ONAYLANDI = 'ONAYLANDI', REDDEDILDI = 'REDDEDILDI' }
export enum FindingResolutionOutcome {
    DEVAM_EDIYOR = 'DEVAM_EDIYOR', KISMEN_KAPATILDI = 'KISMEN_KAPATILDI',
    KAPATILDI = 'KAPATILDI', ERTELENDI = 'ERTELENDI', YENI_AKSIYON_GEREKLI = 'YENI_AKSIYON_GEREKLI',
}

// result/resolutionOutcome === YENI_AKSIYON_GEREKLI iken UI'nin topladığı yeni aksiyon detayı.
// Alanlar DTO düzeyinde opsiyonel görünür (nested object tamamen boş bırakılabilmeli değil,
// tip kontrolü içindir) — asıl zorunluluk audits.service.ts::updateFollowUp'ta iş kuralı
// olarak uygulanır: newAction eksik/alanları boşsa 400 döner, placeholder üretilmez.
class NewActionInputDto {
    @IsString() @IsNotEmpty() @MaxLength(2000) description: string;
    @IsString() @IsNotEmpty() ownerId: string;
    @IsOptional() @IsString() responsibleDepartment?: string;
    @IsDateString() dueDate: string;
    @IsOptional() @IsString() notes?: string;
}

export class CreateFollowUpDto {
    @IsOptional() @IsEnum(FollowUpStatus) status?: FollowUpStatus;
    @IsOptional() @IsString() actionId?: string;
    @IsOptional() @IsString() birimCevabi?: string;
    @IsOptional() @IsString() currentStatusDetail?: string;
    @IsOptional() @IsString() internalControlAssessment?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() targetResolutionDate?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() testDate?: string;
    @IsOptional() @IsString() secondControllerId?: string;
    @IsOptional() @IsString() sprint?: string;
    @IsOptional() @IsString() notes?: string;
    @IsOptional() @IsEnum(FollowUpResult) result?: FollowUpResult;
    @IsOptional() @IsEnum(FindingResolutionOutcome) resolutionOutcome?: FindingResolutionOutcome;
    @IsOptional() @EmptyToUndefined() @IsDateString() newFollowUpDate?: string;
    @IsOptional() @IsString() explanation?: string;
    @IsOptional() @IsBoolean() newActionRequired?: boolean;
    @IsOptional() @ValidateNested() @Type(() => NewActionInputDto) newAction?: NewActionInputDto;
}

export class UpdateFollowUpDto {
    @IsOptional() @IsEnum(FollowUpStatus) status?: FollowUpStatus;
    @IsOptional() @IsString() actionId?: string;
    @IsOptional() @IsString() birimCevabi?: string;
    @IsOptional() @IsString() currentStatusDetail?: string;
    @IsOptional() @IsString() internalControlAssessment?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() targetResolutionDate?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() testDate?: string;
    // secondControllerId: genel güncellemeden KABUL EDİLMEZ (forbidNonWhitelisted → 400).
    // Ayrı korumalı işlemden değişir: POST /findings/:id/follow-ups/:followUpId/second-controller (Madde 4).
    @IsOptional() @IsString() sprint?: string;
    @IsOptional() @IsString() notes?: string;
    // evaluatorId / evaluatedAt: SUNUCU üretir (@CurrentUser + new Date). İstemciden
    // gelen değer yok sayılır — sahte "değerlendiren" kimliği engellenir.
    @IsOptional() @IsEnum(FollowUpResult) result?: FollowUpResult;
    @IsOptional() @IsString() explanation?: string;
    // approvalStatus onay/ret niyetini bildirir; approvedBy / approvedAt SUNUCU üretir
    // (istemciden kabul edilmez) ve onay kuralları audits.service.ts::updateFollowUp'ta
    // uygulanır (geçerli önceki durum, ikinci kontrolcü, kendi değerlendirmesini
    // onaylayamama, tekrarlı onayın yan etki üretmemesi).
    @IsOptional() @IsEnum(FollowUpApprovalStatus) approvalStatus?: FollowUpApprovalStatus;
    @IsOptional() @IsEnum(FindingResolutionOutcome) resolutionOutcome?: FindingResolutionOutcome;
    @IsOptional() @EmptyToUndefined() @IsDateString() newFollowUpDate?: string;
    @IsOptional() @IsBoolean() newActionRequired?: boolean;
    @IsOptional() @ValidateNested() @Type(() => NewActionInputDto) newAction?: NewActionInputDto;
}

export class AssignSecondControllerDto {
    @IsString() @IsNotEmpty() secondControllerId: string;
    @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}
