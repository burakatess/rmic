import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, IsIn, MaxLength } from 'class-validator';
import { EmptyToUndefined } from '../../../common/decorators';

export enum ActionStatus {
    BEKLIYOR = 'BEKLIYOR', DEVAM_EDIYOR = 'DEVAM_EDIYOR', TAMAMLANDI = 'TAMAMLANDI',
    YETERSIZ = 'YETERSIZ', KAPATILDI = 'KAPATILDI',
    // Legacy
    OPEN = 'OPEN', IN_PROGRESS = 'IN_PROGRESS', COMPLETED = 'COMPLETED', CLOSED = 'CLOSED', OVERDUE = 'OVERDUE',
}

export class CreateStandaloneActionDto {
    @IsString() @IsNotEmpty() @MaxLength(2000) description: string;
    @IsOptional() @IsString() ownerId?: string;
    @IsOptional() @IsString() riskId?: string;
    @IsOptional() @IsString() findingId?: string;
    @IsOptional() @IsString() controlId?: string;
    @IsDateString() dueDate: string;
    @IsOptional() @IsIn(['BEKLIYOR', 'DEVAM_EDIYOR', 'YETERSIZ', 'OPEN', 'IN_PROGRESS']) status?: ActionStatus;
    @IsOptional() @IsString() source?: string;
}

/**
 * Manuel aksiyon planı (bulgudan bağımsız). Kontrolcülerin ikisi de zorunlu ve farklı kişi;
 * kod (AM-YYYY-NNNN) sunucuda üretilir. Onay sonrası takip çalışması otomatik oluşur.
 */
export class CreateManualActionDto {
    @IsString() @IsNotEmpty() @MaxLength(300) title: string;
    @IsString() @IsNotEmpty() @MaxLength(5000) description: string;
    @IsString() @IsNotEmpty() ownerId: string;
    @IsDateString() dueDate: string;
    @IsOptional() @IsIn(['BEKLIYOR', 'DEVAM_EDIYOR']) status?: 'BEKLIYOR' | 'DEVAM_EDIYOR';
    @IsString() @IsNotEmpty() firstControllerId: string;
    @IsString() @IsNotEmpty() secondControllerId: string;
    @IsOptional() @IsString() directorateId?: string;
    @IsOptional() @IsString() @MaxLength(500) responsibleDepartment?: string;
    @IsOptional() @IsString() @MaxLength(5000) notes?: string;
    @IsOptional() @IsString() riskId?: string;
    @IsOptional() @IsString() controlId?: string;
}

/** Manuel aksiyon planı taslak düzenleme (1. kontrolcü, taslak/reddedilmiş iken; maker-checker kuralları serviste). */
export class UpdateManualActionDto {
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300) title?: string;
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(5000) description?: string;
    @IsOptional() @IsString() ownerId?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() dueDate?: string;
    @IsOptional() @IsIn(['BEKLIYOR', 'DEVAM_EDIYOR']) status?: 'BEKLIYOR' | 'DEVAM_EDIYOR';
    @IsOptional() @IsString() @MaxLength(500) responsibleDepartment?: string;
    @IsOptional() @IsString() @MaxLength(5000) notes?: string;
    @IsOptional() @IsString() secondControllerId?: string;
}

// update'te findingId/riskId/controlId KASITLI OLARAK yok — bir aksiyonun bağlı olduğu
// kaynak (finding/risk/control) update ile değiştirilemez (iş kuralı + mass-assignment koruması).
export class UpdateStandaloneActionDto {
    @IsOptional() @IsString() @MaxLength(2000) description?: string;
    @IsOptional() @IsString() ownerId?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() dueDate?: string;
    @IsOptional() @IsIn(['BEKLIYOR', 'DEVAM_EDIYOR', 'YETERSIZ', 'OPEN', 'IN_PROGRESS']) status?: ActionStatus;
    // Servis notları zaten iletiyordu; DTO'da olmadığı için sorumlu ilerleme notu giremiyordu.
    @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class ExtendActionDto {
    @IsDateString() newDueDate: string;
    @IsString() @IsNotEmpty() reason: string;
}

export class CreateEffectivenessReviewDto {
    @IsOptional() riskScoreBefore?: number;
    @IsOptional() riskScoreAfter?: number;
    @IsOptional() controlEffectiveness?: string;
    @IsOptional() isEffective?: boolean;
    @IsOptional() @IsString() notes?: string;
}
