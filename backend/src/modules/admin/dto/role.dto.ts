import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// Anahtar biçimi: "*", "kaynak:eylem", "kaynak:eylem:alt", "kaynak:*". Bilinen anahtar
// kontrolü serviste kanonik kataloğa göre yapılır (permission-catalog.ts).
const PERMISSION_FORMAT = /^(\*|[a-z_]+:(\*|[a-z_]+(:[a-z_]+)?))$/;

export class CreateRoleDto {
    @IsString() @IsNotEmpty() @MaxLength(64) @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'Rol adı BÜYÜK_HARF_ALT_ÇİZGİ biçiminde olmalı' })
    name: string;
    @IsOptional() @IsString() @MaxLength(500) description?: string;
    @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @Matches(PERMISSION_FORMAT, { each: true, message: 'Geçersiz izin anahtarı biçimi' })
    permissions: string[];
}

export class UpdateRoleDto {
    @IsOptional() @IsString() @MaxLength(500) description?: string;
    @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @Matches(PERMISSION_FORMAT, { each: true, message: 'Geçersiz izin anahtarı biçimi' })
    permissions?: string[];
}
