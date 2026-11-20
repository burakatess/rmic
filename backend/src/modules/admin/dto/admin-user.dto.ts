import {
    ArrayMaxSize, IsArray, IsBoolean, IsDefined, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';

/** Şifre kuralı: değiştirme ekranıyla (ChangePasswordDto) aynı alt sınır. */
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128; // bcrypt 72 baytı aşanı yok sayar; aşırı uzun girdiye karşı üst sınır

export class AdminCreateUserDto {
    @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin' }) @MaxLength(254) email: string;
    @IsString() @MinLength(PASSWORD_MIN, { message: `Şifre en az ${PASSWORD_MIN} karakter olmalı` }) @MaxLength(PASSWORD_MAX) password: string;
    @IsString() @IsNotEmpty() @MaxLength(100) firstName: string;
    @IsString() @IsNotEmpty() @MaxLength(100) lastName: string;
    @IsOptional() @IsString() @MaxLength(200) department?: string;
    @IsString() @IsNotEmpty() roleId: string;
}

export class AdminUpdateUserDto {
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) firstName?: string;
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) lastName?: string;
    @IsOptional() @IsString() @MaxLength(200) department?: string;
    @IsOptional() @IsString() @IsNotEmpty() roleId?: string;
    @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SetUserDirectoratesDto {
    @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) directorateIds: string[];
}

export class AdminResetPasswordDto {
    @IsString() @MinLength(PASSWORD_MIN, { message: `Şifre en az ${PASSWORD_MIN} karakter olmalı` }) @MaxLength(PASSWORD_MAX) newPassword: string;
}

/** Parametre değeri türü parametre tanımına göre serviste denetlenir; burada yalnız varlığı. */
export class UpdateParameterDto {
    @IsDefined() value: unknown;
}

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class CreateRiskCategoryDto {
    @IsString() @IsNotEmpty() @MaxLength(100) name: string;
    @IsOptional() @IsString() @MaxLength(1000) description?: string;
    @IsOptional() @Matches(HEX_COLOR, { message: 'Renk #RGB veya #RRGGBB biçiminde olmalı' }) color?: string;
}

export class UpdateRiskCategoryDto {
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
    @IsOptional() @IsString() @MaxLength(1000) description?: string;
    @IsOptional() @Matches(HEX_COLOR, { message: 'Renk #RGB veya #RRGGBB biçiminde olmalı' }) color?: string;
}

export class CreateSystemOptionDto {
    @IsString() @IsNotEmpty() @MaxLength(64) @Matches(/^[A-Za-z0-9_.-]+$/, { message: 'Kategori harf, rakam, _ . - içerebilir' }) category: string;
    @IsString() @IsNotEmpty() @MaxLength(100) value: string;
    @IsString() @IsNotEmpty() @MaxLength(200) label: string;
    @IsOptional() @IsString() @MaxLength(200) labelEn?: string;
    @IsOptional() @IsString() @MaxLength(50) color?: string;
    @IsOptional() @IsString() @MaxLength(50) icon?: string;
    @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
    @IsOptional() @IsBoolean() isActive?: boolean;
    @IsOptional() @IsBoolean() isDefault?: boolean;
}

/** category/value oluşturulduktan sonra değişmez (kayıtlar bu değere bağlanır). */
export class UpdateSystemOptionDto {
    @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) label?: string;
    @IsOptional() @IsString() @MaxLength(200) labelEn?: string;
    @IsOptional() @IsString() @MaxLength(50) color?: string;
    @IsOptional() @IsString() @MaxLength(50) icon?: string;
    @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
    @IsOptional() @IsBoolean() isActive?: boolean;
    @IsOptional() @IsBoolean() isDefault?: boolean;
}
