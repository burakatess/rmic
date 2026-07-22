import {
    IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, IsDateString, IsIn,
    MaxLength, ValidateNested, IsArray, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

// Şema seviyesinde FindingSeverity hâlâ 4 değer taşıyor (geriye dönük uyumluluk —
// eski kayıtlar MEDIUM/LOW olabilir), ancak İş kuralı: yeni bulgularda yalnızca
// KZ (CRITICAL) / KD (HIGH) seçilebilir. Kısıtlama burada @IsIn ile uygulanıyor;
// enum'dan MEDIUM/LOW SİLİNMEDİ (mevcut veriyi bozmamak için) — bkz. rapor.
export const CREATABLE_SEVERITIES = ['CRITICAL', 'HIGH'] as const;
// FindingStatus şeması 6 değer taşıyor (OPEN/PENDING_REVIEW/VERIFIED legacy) — iş
// kuralı: yeni/güncellenen bulgularda yalnızca bu 3 değer seçilebilir.
export const SELECTABLE_STATUSES = ['IN_PROGRESS', 'PARTIALLY_CLOSED', 'CLOSED'] as const;

export enum FindingSeverity { CRITICAL = 'CRITICAL', HIGH = 'HIGH', MEDIUM = 'MEDIUM', LOW = 'LOW' }
export enum FindingType {
    BT = 'BT', IB = 'IB',
    // Legacy
    CONTROL_DEFICIENCY = 'CONTROL_DEFICIENCY', PROCESS_GAP = 'PROCESS_GAP',
    COMPLIANCE_ISSUE = 'COMPLIANCE_ISSUE', DOCUMENTATION = 'DOCUMENTATION',
    IT_SECURITY = 'IT_SECURITY', OPERATIONAL = 'OPERATIONAL',
}
export enum FindingStatus {
    OPEN = 'OPEN', IN_PROGRESS = 'IN_PROGRESS', PARTIALLY_CLOSED = 'PARTIALLY_CLOSED',
    PENDING_REVIEW = 'PENDING_REVIEW', CLOSED = 'CLOSED', VERIFIED = 'VERIFIED',
}
export enum FindingSource {
    INTERNAL_AUDIT = 'INTERNAL_AUDIT', EXTERNAL_AUDIT = 'EXTERNAL_AUDIT', CONTROL_TEST = 'CONTROL_TEST',
    INCIDENT = 'INCIDENT', SELF_ASSESSMENT = 'SELF_ASSESSMENT', OTHER = 'OTHER',
}
export enum FindingWorkflowStatus {
    TASLAK = 'TASLAK', MUTABAKATA_GONDERILDI = 'MUTABAKATA_GONDERILDI',
    IC_KONTROL_ONAYINA_GONDERILDI = 'IC_KONTROL_ONAYINA_GONDERILDI',
    MUTABAKAT_YAPILDI = 'MUTABAKAT_YAPILDI', IPTAL = 'IPTAL',
}
export enum FindingResolutionStatus {
    DEVAM_EDIYOR = 'DEVAM_EDIYOR', KISMEN_KAPATILDI = 'KISMEN_KAPATILDI',
    KAPATILDI = 'KAPATILDI', ERTELENDI = 'ERTELENDI', YENI_AKSIYON_GEREKLI = 'YENI_AKSIYON_GEREKLI',
}
export enum ActionStatus {
    BEKLIYOR = 'BEKLIYOR', DEVAM_EDIYOR = 'DEVAM_EDIYOR', TAMAMLANDI = 'TAMAMLANDI',
    YETERSIZ = 'YETERSIZ', KAPATILDI = 'KAPATILDI',
    // Legacy
    OPEN = 'OPEN', IN_PROGRESS = 'IN_PROGRESS', COMPLETED = 'COMPLETED', CLOSED = 'CLOSED',
}

class AttachmentMetaDto {
    @IsString() @IsNotEmpty() fileName: string;
    @IsString() @IsNotEmpty() originalName: string;
    @IsString() @IsNotEmpty() mimeType: string;
    @IsOptional() sizeBytes?: number;
}

// Bulgu oluştururken inline gönderilen aksiyon satırları
class NestedActionDto {
    @IsString() @IsNotEmpty() @MaxLength(2000) description: string;
    @IsString() @IsNotEmpty() ownerId: string;
    @IsOptional() @IsString() responsibleDepartment?: string;
    @IsDateString() dueDate: string;
    @IsOptional() @IsString() notes?: string;
    @IsOptional() @IsEnum(ActionStatus) status?: ActionStatus;
    @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AttachmentMetaDto) attachments?: AttachmentMetaDto[];
}

export class CreateFindingDto {
    @IsOptional() @IsEnum(FindingType) findingType?: FindingType;
    @IsOptional() @IsString() controlId?: string;
    @IsString() @IsNotEmpty() description: string;
    @IsOptional() @IsString() @MaxLength(500) summary?: string;
    @IsOptional() @IsString() gmy?: string;
    @IsOptional() @IsString() relatedDepartment?: string;
    @IsOptional() @IsString() directorateId?: string;
    @IsOptional() @IsString() responsiblePerson?: string;
    @IsOptional() @IsIn(SELECTABLE_STATUSES) status?: string;
    @IsOptional() @IsIn(CREATABLE_SEVERITIES) severity?: string;
    @IsOptional() @IsString() internalControlAssessment?: string;
    @IsOptional() @IsString() currentStatusDetail?: string;
    @IsOptional() @IsString() birimCevabi?: string;
    @IsOptional() @IsDateString() targetResolutionDate?: string;
    @IsOptional() @IsDateString() closedDate?: string;
    @IsOptional() @IsDateString() testDate?: string;
    // Legacy/dead alan — Finding modelinde skaler karşılığı yok, backend yok sayar.
    @IsOptional() @IsString() attachment?: string;
    @IsOptional() @IsString() assigneeId?: string;
    @IsOptional() @IsBoolean() sendEmail?: boolean;
    @IsOptional() @IsString() riskId?: string;
    @IsOptional() @IsString() controlTestId?: string;
    @IsOptional() @IsString() testRecordId?: string;
    @IsOptional() @IsEnum(FindingSource) source?: FindingSource;
    @IsOptional() @IsString() impact?: string;
    @IsOptional() @IsString() affectedSystem?: string;
    @IsOptional() @IsString() recommendation?: string;
    @IsOptional() @IsString() managementResponse?: string;
    @IsOptional() @IsString() iletisimKisisi?: string;
    @IsOptional() @IsEnum(FindingWorkflowStatus) workflowStatus?: FindingWorkflowStatus;
    @IsOptional() @IsEnum(FindingResolutionStatus) resolutionStatus?: FindingResolutionStatus;
    @IsOptional() @IsArray() @ArrayMinSize(0) @ValidateNested({ each: true }) @Type(() => NestedActionDto) actions?: NestedActionDto[];
}

export class UpdateFindingDto {
    @IsOptional() @IsEnum(FindingType) findingType?: FindingType;
    @IsOptional() @IsString() controlId?: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsString() @MaxLength(500) summary?: string;
    @IsOptional() @IsString() gmy?: string;
    @IsOptional() @IsString() relatedDepartment?: string;
    @IsOptional() @IsString() directorateId?: string;
    @IsOptional() @IsString() responsiblePerson?: string;
    @IsOptional() @IsIn(SELECTABLE_STATUSES) status?: string;
    @IsOptional() @IsIn(CREATABLE_SEVERITIES) severity?: string;
    @IsOptional() @IsString() internalControlAssessment?: string;
    @IsOptional() @IsString() currentStatusDetail?: string;
    @IsOptional() @IsString() birimCevabi?: string;
    // targetResolutionDate DTO'da yer alır (frontend eski payload'ları kırılmasın diye)
    // ama servis katmanında İSTEMCİDEN gelen değer HER ZAMAN yok sayılır (Madde 4).
    @IsOptional() @IsDateString() targetResolutionDate?: string;
    @IsOptional() @IsDateString() closedDate?: string;
    @IsOptional() @IsDateString() testDate?: string;
    @IsOptional() @IsString() attachment?: string;
    @IsOptional() @IsString() assigneeId?: string;
    @IsOptional() @IsBoolean() sendEmail?: boolean;
    @IsOptional() @IsString() riskId?: string;
    @IsOptional() @IsEnum(FindingSource) source?: FindingSource;
    @IsOptional() @IsString() impact?: string;
    @IsOptional() @IsString() affectedSystem?: string;
    @IsOptional() @IsString() recommendation?: string;
    @IsOptional() @IsString() managementResponse?: string;
    @IsOptional() @IsString() iletisimKisisi?: string;
    @IsOptional() @IsEnum(FindingWorkflowStatus) workflowStatus?: FindingWorkflowStatus;
    @IsOptional() @IsEnum(FindingResolutionStatus) resolutionStatus?: FindingResolutionStatus;
}

export class CreateActionDto {
    @IsString() @IsNotEmpty() @MaxLength(2000) description: string;
    @IsString() @IsNotEmpty() ownerId: string;
    @IsOptional() @IsString() responsibleDepartment?: string;
    @IsDateString() dueDate: string;
    @IsOptional() @IsString() notes?: string;
    @IsOptional() @IsEnum(ActionStatus) status?: ActionStatus;
    @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AttachmentMetaDto) attachments?: AttachmentMetaDto[];
}

export class UpdateActionDto {
    @IsOptional() @IsString() @MaxLength(2000) description?: string;
    @IsOptional() @IsString() ownerId?: string;
    @IsOptional() @IsString() responsibleDepartment?: string;
    @IsOptional() @IsDateString() dueDate?: string;
    @IsOptional() @IsString() notes?: string;
    @IsOptional() @IsEnum(ActionStatus) status?: ActionStatus;
}
