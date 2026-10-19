import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export enum GlobalSearchCategory {
    ALL = 'all',
    RISK = 'risk',
    CONTROL = 'control',
    PERIOD_CONTROL = 'period-control',
    CONTROL_TEST = 'control-test',
    FINDING = 'finding',
    ACTION = 'action',
    FOLLOW_UP = 'follow-up',
}

export class GlobalSearchQueryDto {
    @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    q!: string;

    @IsOptional()
    @IsEnum(GlobalSearchCategory)
    category: GlobalSearchCategory = GlobalSearchCategory.ALL;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(30)
    limit = 12;
}
