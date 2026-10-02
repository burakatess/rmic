import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const toStringArray = ({ value }: { value: unknown }) => value == null || value === '' ? undefined : Array.isArray(value) ? value : [value];

export class WorkflowHealthQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
    @IsOptional() @IsIn(['MINE', 'UNIT', 'ORG']) scope?: 'MINE' | 'UNIT' | 'ORG';
    @IsOptional() @Transform(toStringArray) @IsArray() @IsString({ each: true }) directorateId?: string[];
    @IsOptional() @IsString() code?: string;
    @IsOptional() @IsIn(['CRITICAL', 'WARNING', 'INFO']) severity?: 'CRITICAL' | 'WARNING' | 'INFO';
    @IsOptional() @IsIn(['ANNUAL_PLAN', 'CONTROL', 'CONTROL_TEST', 'FINDING', 'ACTION', 'FOLLOW_UP']) entityType?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}
