import { IsString, IsNotEmpty, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { FollowUpResult } from './follow-up.dto';

// POST findings/:id/status-history — kullanıcı yalnız serbest not ekleyebilir.
// workflowStatus, oldValue/newValue, operation gibi denetim alanları SUNUCUDA
// üretilir; istemciden kabul edilmez (sahte statü geçmişi yazılamaz).
export class AppendStatusNoteDto {
    @IsString() @IsNotEmpty() @MaxLength(5000) explanation: string;
    @IsOptional() @IsString() @MaxLength(2000) evidenceLinks?: string;
    @IsOptional() @IsEnum(FollowUpResult) result?: FollowUpResult;
}

// POST findings/:id/actions/:actionId/follow-ups — takip her zaman BEKLIYOR açılır;
// istemci durum (ör. ONAYLANDI) belirleyemez.
export class CreateActionFollowUpDto {
    @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class LinkRiskDto {
    @IsString() @IsNotEmpty() riskId: string;
}
