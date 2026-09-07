import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, MaxLength } from 'class-validator';
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
    @IsOptional() @IsEnum(ActionStatus) status?: ActionStatus;
    @IsOptional() @IsString() source?: string;
}

// update'te findingId/riskId/controlId KASITLI OLARAK yok — bir aksiyonun bağlı olduğu
// kaynak (finding/risk/control) update ile değiştirilemez (iş kuralı + mass-assignment koruması).
export class UpdateStandaloneActionDto {
    @IsOptional() @IsString() @MaxLength(2000) description?: string;
    @IsOptional() @IsString() ownerId?: string;
    @IsOptional() @EmptyToUndefined() @IsDateString() dueDate?: string;
    @IsOptional() @IsEnum(ActionStatus) status?: ActionStatus;
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
