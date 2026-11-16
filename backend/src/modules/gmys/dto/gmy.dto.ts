import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class CreateGmyDto {
    @IsString() @IsNotEmpty() @MaxLength(200) name: string;
    @IsOptional() @IsString() @MaxLength(50) code?: string;
    @IsOptional() @IsString() @MaxLength(64) responsibleUserId?: string;
}

export class UpdateGmyDto {
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
    @IsOptional() @ValidateIf(o => o.code !== null) @IsString() @MaxLength(50) code?: string | null;
    @IsOptional() @ValidateIf(o => o.responsibleUserId !== null) @IsString() @MaxLength(64) responsibleUserId?: string | null;
    @IsOptional() @IsBoolean() isActive?: boolean;
}
