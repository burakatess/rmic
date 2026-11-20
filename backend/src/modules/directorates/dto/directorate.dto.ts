import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { EmptyToUndefined } from '../../../common/decorators';

export class CreateDirectorateDto {
    @IsString() @IsNotEmpty() @MaxLength(200) name: string;
    @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(50) code?: string;
    @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(200) gmy?: string;
}

export class UpdateDirectorateDto {
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
    @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(50) code?: string;
    @IsOptional() @EmptyToUndefined() @IsString() @MaxLength(200) gmy?: string;
    @IsOptional() @IsBoolean() isActive?: boolean;
}
