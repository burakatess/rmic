import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, IsArray, IsIn, IsDateString, IsInt, MaxLength } from 'class-validator';
import { EmptyToUndefined } from '../../../common/decorators';

export enum ControlType { IT_GENERAL = 'IT_GENERAL', IT_APPLICATION = 'IT_APPLICATION', OPERATIONAL = 'OPERATIONAL', FINANCIAL = 'FINANCIAL', COMPLIANCE = 'COMPLIANCE', BT = 'BT', BT_DISI = 'BT_DISI' }
export enum ControlNature { PREVENTIVE = 'PREVENTIVE', DETECTIVE = 'DETECTIVE' }
export enum ControlAutomation { MANUAL = 'MANUAL', AUTOMATED = 'AUTOMATED', SEMI_AUTOMATED = 'SEMI_AUTOMATED' }
export enum ControlFrequency { DAILY = 'DAILY', WEEKLY = 'WEEKLY', MONTHLY = 'MONTHLY', QUARTERLY = 'QUARTERLY', SEMI_ANNUAL = 'SEMI_ANNUAL', ANNUAL = 'ANNUAL', AD_HOC = 'AD_HOC' }

export class CreateControlDto {
    @IsOptional() @IsString() controlId?: string;
    @IsOptional() @IsString() name?: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsEnum(ControlType) type?: ControlType;
    @IsOptional() @IsEnum(ControlNature) nature?: ControlNature;
    @IsOptional() @IsEnum(ControlAutomation) automation?: ControlAutomation;
    @IsOptional() @IsEnum(ControlFrequency) frequency?: ControlFrequency;
    @IsOptional() @IsString() controlPeriod?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() controlDate?: string;
    @IsOptional() @IsString() directorate?: string; // Legacy serbest metin
    @IsOptional() @IsString() directorateId?: string;
    @IsOptional() @IsString() gmy?: string;
    @IsOptional() @IsString() mehaz?: string;
    @IsOptional() @IsString() testSteps?: string;
    @IsOptional() @IsString() notes?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) selectedMonths?: string[];
    @IsOptional() @IsArray() @IsString({ each: true }) months?: string[]; // selectedMonths alias
    // ownerId/testPerformerId/reviewerId/secondControllerId KASITLI OLARAK YOK —
    // test kontrolcü ataması artık ana kontrolün değil, yıllık kapsamın (bkz.
    // control-scope.dto.ts::AddScopeDto) özelliği. contactPersonId (LDAP bildirim
    // kişisi) ayrı bir kavram olduğu için kalır.
    @IsOptional() @IsString() contactPersonId?: string;
    @IsOptional() @IsBoolean() isActive?: boolean;
    // Prisma'ya doğrudan yazılmaz, servis 'ACTIVE'/'PASSIVE' kararını isActive'den türetir — 'DRAFT' geçişi de kabul edilir.
    @IsOptional() @IsIn(['ACTIVE', 'PASSIVE', 'DRAFT']) status?: string;
}

export class UpdateControlDto {
    @IsOptional() @IsString() controlId?: string;
    @IsOptional() @IsString() name?: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsEnum(ControlType) type?: ControlType;
    @IsOptional() @IsEnum(ControlNature) nature?: ControlNature;
    @IsOptional() @IsEnum(ControlAutomation) automation?: ControlAutomation;
    @IsOptional() @IsEnum(ControlFrequency) frequency?: ControlFrequency;
    @IsOptional() @IsString() controlPeriod?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() controlDate?: string;
    @IsOptional() @IsString() directorate?: string;
    @IsOptional() @IsString() directorateId?: string;
    @IsOptional() @IsString() gmy?: string;
    @IsOptional() @IsString() mehaz?: string;
    @IsOptional() @IsString() testSteps?: string;
    @IsOptional() @IsString() notes?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) selectedMonths?: string[];
    @IsOptional() @IsArray() @IsString({ each: true }) months?: string[];
    // ownerId/testPerformerId/reviewerId/secondControllerId KASITLI OLARAK YOK —
    // bkz. CreateControlDto üstündeki not.
    @IsOptional() @IsString() contactPersonId?: string;
    @IsOptional() @IsBoolean() isActive?: boolean;
    @IsOptional() @IsIn(['ACTIVE', 'PASSIVE', 'DRAFT']) status?: string;
}

export class SaveTestDraftDto {
    @IsOptional() @IsString() @MaxLength(10000) resultText?: string;
    @IsOptional() @IsString() @MaxLength(10000) evidenceSummary?: string;
    @IsOptional() @IsIn(['BULGUSU_YOK', 'BULGUSU_VAR']) findingStatus?: string;
    @IsOptional() @IsArray() stepObservations?: Record<string, unknown>[];
    @IsInt() contentVersion: number;
}
