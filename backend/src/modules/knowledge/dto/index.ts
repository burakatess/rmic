import { KnowledgeDocKind } from '@prisma/client';
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export class CreateKnowledgeDocDto {
    @IsEnum(KnowledgeDocKind)
    kind!: KnowledgeDocKind;

    @IsString()
    @MinLength(2)
    @MaxLength(40)
    code!: string;

    @IsString()
    @MinLength(3)
    @MaxLength(300)
    title!: string;

    @IsString()
    @MinLength(3)
    @MaxLength(20000)
    body!: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    category?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @MaxLength(40, { each: true })
    tags?: string[];

    @IsOptional()
    @IsString()
    @MaxLength(200)
    sourceRef?: string;

    @IsOptional()
    @IsDateString()
    effectiveDate?: string;
}

export class UpdateKnowledgeDocDto {
    @IsOptional()
    @IsEnum(KnowledgeDocKind)
    kind?: KnowledgeDocKind;

    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(40)
    code?: string;

    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(300)
    title?: string;

    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(20000)
    body?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    category?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @MaxLength(40, { each: true })
    tags?: string[];

    @IsOptional()
    @IsString()
    @MaxLength(200)
    sourceRef?: string;

    @IsOptional()
    @IsDateString()
    effectiveDate?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
