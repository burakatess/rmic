import { Transform, Type } from 'class-transformer';
import {
    IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

export type DashboardScopeRequest = 'MINE' | 'UNIT' | 'ORG';
export type DashboardWorkTab = 'ALL' | 'TESTS' | 'ACTIONS' | 'FOLLOWUPS' | 'RECONCILIATION';

const toStringArray = ({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Array.isArray(value) ? value : [value];
};

/** Tüm Çalışma Panosu uç noktalarının paylaştığı kapsam/tarih sözleşmesi. */
export class DashboardScopeQueryDto {
    @IsOptional()
    @IsIn(['MINE', 'UNIT', 'ORG'])
    scope?: DashboardScopeRequest;

    @IsOptional()
    @Transform(toStringArray)
    @IsArray()
    @IsString({ each: true })
    @MaxLength(40, { each: true })
    directorateId?: string[];

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(2000)
    @Max(2100)
    year?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(12)
    month?: number;

    @IsOptional()
    // `obj[key]` ile HAM değeri okur — `enableImplicitConversion` global ayarı
    // bu alanı transform'dan ÖNCE `Boolean('false') === true` şeklinde bozarak
    // "false" string'ini true'ya çeviriyordu (yaşanmış hata, testle doğrulandı).
    @Transform(({ obj, key }) => obj[key] === undefined ? undefined : (obj[key] === 'true' || obj[key] === true))
    @IsBoolean()
    includeCarryover?: boolean;
}

export class DashboardWorkItemsQueryDto extends DashboardScopeQueryDto {
    @IsOptional()
    @IsIn(['ALL', 'TESTS', 'ACTIONS', 'FOLLOWUPS', 'RECONCILIATION'])
    tab?: DashboardWorkTab;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number;
}

export class DashboardUpcomingQueryDto extends DashboardScopeQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsIn([7, 30])
    days?: number;
}
