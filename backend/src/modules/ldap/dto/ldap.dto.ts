import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const HOST = /^[A-Za-z0-9.-]+$/; // ana bilgisayar adı veya IP (şema/port/yol yok)

/** LDAP bağlantı ayarları. Protokol LDAP (389) veya LDAPS (636); port seçilebilir. */
export class LdapConnectionDto {
    @IsString() @IsNotEmpty() @MaxLength(100) name: string;
    @IsString() @IsNotEmpty() @MaxLength(253) @Matches(HOST, { message: 'Sunucu yalnız ana bilgisayar adı veya IP olmalı (ldap:// veya port yazmayın).' }) host: string;
    @IsIn(['LDAP', 'LDAPS']) protocol: 'LDAP' | 'LDAPS';
    @Type(() => Number) @IsInt() @Min(1) @Max(65535) port: number;
    @IsOptional() @IsBoolean() startTls?: boolean;
    @IsOptional() @IsBoolean() tlsRejectUnauthorized?: boolean;
    @IsOptional() @IsString() @MaxLength(20000) caCertificate?: string;
    @IsString() @IsNotEmpty() @MaxLength(500) baseDn: string;
    @IsOptional() @IsString() @MaxLength(500) bindDn?: string;
    /** Boş bırakılırsa güncellemede mevcut şifre korunur; `clearBindPassword` ile silinir. */
    @IsOptional() @IsString() @MaxLength(500) bindPassword?: string;
    @IsOptional() @IsBoolean() clearBindPassword?: boolean;
    @IsOptional() @IsString() @MaxLength(1000) @Matches(/\{\{username\}\}/, { message: 'Kullanıcı filtresi {{username}} yer tutucusunu içermeli.' }) userFilter?: string;
    @IsOptional() @IsString() @MaxLength(100) usernameAttribute?: string;
    @IsOptional() @IsString() @MaxLength(100) emailAttribute?: string;
    @IsOptional() @IsString() @MaxLength(100) firstNameAttribute?: string;
    @IsOptional() @IsString() @MaxLength(100) lastNameAttribute?: string;
    @IsOptional() @IsString() @MaxLength(100) departmentAttribute?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1000) @Max(60000) timeoutMs?: number;
    @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Kaydetmeden test (formdaki ayarlarla). `connectionId` verilirse kayıtlı şifre kullanılabilir. */
export class LdapTestDto extends LdapConnectionDto {
    @IsOptional() @IsString() connectionId?: string;
}

export class LdapSearchQueryDto {
    @IsString() @MaxLength(100) q: string;
}

/** Dizinden kullanıcı ekleme (yönetici). */
export class CreateLdapUserDto {
    @IsString() @IsNotEmpty() connectionId: string;
    @IsString() @IsNotEmpty() @MaxLength(200) username: string;
    @IsString() @IsNotEmpty() roleId: string;
    @IsOptional() @IsString() @MaxLength(200) department?: string;
}
