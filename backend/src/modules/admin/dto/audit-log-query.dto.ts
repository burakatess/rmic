import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { EmptyToUndefined } from '../../../common/decorators';

// GET /admin/audit-logs — sunucu taraflı sayfalama ve filtreler.
export class AuditLogQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
    @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(64) userId?: string;
    @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(64) entityType?: string;
    @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(64) entityId?: string;
    @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(64) action?: string;
    @IsOptional() @EmptyToUndefined() @IsIn(['USER', 'SYSTEM', 'UNKNOWN']) actorType?: 'USER' | 'SYSTEM' | 'UNKNOWN';
    @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(64) ipAddress?: string;
    /** YYYY-MM-DD veya ISO; tarih-yalnız değerde gün başı (dahil). */
    @IsOptional() @EmptyToUndefined() @IsDateString() startDate?: string;
    /** YYYY-MM-DD veya ISO; tarih-yalnız değerde o günün TAMAMI dahildir. */
    @IsOptional() @EmptyToUndefined() @IsDateString() endDate?: string;
}

// GET /admin/audit-logs/export — liste ile aynı filtreler + format ve üst sınır.
export class AuditLogExportQueryDto extends AuditLogQueryDto {
    @IsOptional() @IsIn(['cef', 'leef', 'json']) format?: 'cef' | 'leef' | 'json';
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50000) limit?: number;
}
