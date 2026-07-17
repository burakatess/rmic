import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, IsArray, IsIn, IsDateString } from 'class-validator';

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
    @IsOptional() @IsDateString() controlDate?: string;
    @IsOptional() @IsString() directorate?: string; // Legacy serbest metin
    @IsOptional() @IsString() directorateId?: string;
    @IsOptional() @IsString() gmy?: string;
    @IsOptional() @IsString() mehaz?: string;
    @IsOptional() @IsString() testSteps?: string;
    @IsOptional() @IsString() notes?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) selectedMonths?: string[];
    @IsOptional() @IsArray() @IsString({ each: true }) months?: string[]; // selectedMonths alias
    @IsOptional() @IsString() ownerId?: string;
    @IsOptional() @IsString() testPerformerId?: string;
    @IsOptional() @IsString() reviewerId?: string;
    @IsOptional() @IsString() secondControllerId?: string;
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
    @IsOptional() @IsDateString() controlDate?: string;
    @IsOptional() @IsString() directorate?: string;
    @IsOptional() @IsString() directorateId?: string;
    @IsOptional() @IsString() gmy?: string;
    @IsOptional() @IsString() mehaz?: string;
    @IsOptional() @IsString() testSteps?: string;
    @IsOptional() @IsString() notes?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) selectedMonths?: string[];
    @IsOptional() @IsArray() @IsString({ each: true }) months?: string[];
    @IsOptional() @IsString() ownerId?: string;
    @IsOptional() @IsString() testPerformerId?: string;
    @IsOptional() @IsString() reviewerId?: string;
    @IsOptional() @IsString() secondControllerId?: string;
    @IsOptional() @IsString() contactPersonId?: string;
    @IsOptional() @IsBoolean() isActive?: boolean;
    @IsOptional() @IsIn(['ACTIVE', 'PASSIVE', 'DRAFT']) status?: string;
}
