import { ArrayUnique, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateAttachmentDto {
    @IsString() @IsNotEmpty() uploadId: string;
    @IsString() @IsNotEmpty() @MaxLength(255) fileName: string;
    @IsString() @IsNotEmpty() @MaxLength(255) originalName: string;
    @IsString() @IsNotEmpty() @MaxLength(160) mimeType: string;
    @IsInt() @Min(1) @Max(10 * 1024 * 1024) sizeBytes: number;
    @IsOptional() @IsString() @MaxLength(255) displayName?: string;
    @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class UpdateAttachmentDto {
    @IsOptional() @IsString() @MaxLength(255) displayName?: string;
    @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class CompleteActionDto {
    @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true })
    evidenceIds?: string[];
}
