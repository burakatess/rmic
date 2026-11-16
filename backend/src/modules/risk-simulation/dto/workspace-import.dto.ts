import { Type } from 'class-transformer';
import {
    ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString,
    Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';

/**
 * Excel'den çalışma alanı. Excel dosyası TARAYICIDA okunur (sunucuda xlsx ayrıştırılmaz);
 * frontend GRC kolon başlıklarını bu alanlara eşleyip JSON gönderir. Metin alanları GRC
 * hücre değerleridir — P1–P5, statü ve etki alanı metinleri backend'de eşlenir.
 * Boş hücre = alan gönderilmez veya null.
 */
const S = 300;   // kısa metin
const L = 10000; // uzun metin (tanım, özet)

const nullableImpact = () => (target: object, key: string) => {
    ValidateIf((o: any) => o[key] !== null && o[key] !== undefined)(target, key);
    IsInt()(target, key); Min(1)(target, key); Max(5)(target, key);
};

export class ImportRiskRowDto {
    /** Excel satır numarası (yalnız rapor mesajları için). */
    @IsOptional() @IsInt() @Min(1) rowNumber?: number;
    @IsString() @MaxLength(100) riskId!: string;
    @IsOptional() @IsString() @MaxLength(S) kayitId?: string | null;
    @IsOptional() @IsString() @MaxLength(S) status?: string | null;
    @IsOptional() @IsString() @MaxLength(S) ilgiliGmy?: string | null;
    @IsOptional() @IsString() @MaxLength(S) riskSahibi?: string | null;
    @IsOptional() @IsString() @MaxLength(S) surec?: string | null;
    @IsOptional() @IsString() @MaxLength(S) altSurec?: string | null;
    @IsOptional() @IsString() @MaxLength(L) tanim?: string | null;
    @IsOptional() @IsBoolean() flagForIT?: boolean | null;

    @nullableImpact() finansalEtki?: number | null;
    @nullableImpact() itibarEtkisi?: number | null;
    @nullableImpact() regulasyonEtkisi?: number | null;
    @nullableImpact() musteriEtkisi?: number | null;
    @nullableImpact() gizlilikEtkisi?: number | null;
    @nullableImpact() butunlukEtkisi?: number | null;
    @nullableImpact() erisilebilirlikEtkisi?: number | null;
    @nullableImpact() olasilik?: number | null;

    // Excel'deki KAYITLI sonuçlar — yalnız "kayıttan sapma" karşılaştırması için saklanır.
    @ValidateIf((o: any) => o.dogalRiskPuani != null) @IsNumber() @Min(0) @Max(25) dogalRiskPuani?: number | null;
    @IsOptional() @IsString() @MaxLength(50) dogalRiskSeviyesi?: string | null;
    @ValidateIf((o: any) => o.kalintiRiskPuani != null) @IsNumber() @Min(0) @Max(25) kalintiRiskPuani?: number | null;
    @IsOptional() @IsString() @MaxLength(50) kalintiRiskSeviyesi?: string | null;

    @IsOptional() @IsString() @MaxLength(S) riskIsleme?: string | null;
    @IsOptional() @IsDateString() mutabakatTarihi?: string | null;
    @IsOptional() @IsDateString() olusturmaTarihi?: string | null;
    @IsOptional() @IsDateString() guncelleme?: string | null;
    @IsOptional() @IsString() @MaxLength(S) riskSorumlusu?: string | null;
    @IsOptional() @IsString() @MaxLength(L) ozet?: string | null;
}

export class ImportControlRowDto {
    @IsOptional() @IsInt() @Min(1) rowNumber?: number;
    @IsString() @MaxLength(100) kontrolId!: string;
    @IsString() @MaxLength(100) riskId!: string;
    @IsOptional() @IsString() @MaxLength(S) kayitId?: string | null;
    @IsOptional() @IsString() @MaxLength(S) status?: string | null;
    @IsOptional() @IsString() @MaxLength(L) tanim?: string | null;
    @IsOptional() @IsString() @MaxLength(S) kontrolTuru?: string | null;
    @IsOptional() @IsString() @MaxLength(S) kontrolIslevi?: string | null;
    @IsOptional() @IsString() @MaxLength(S) isletimSekli?: string | null;
    @IsOptional() @IsString() @MaxLength(S) isletimDenetimi?: string | null;
    @IsOptional() @IsString() @MaxLength(S) isletimRaporlama?: string | null;
    @IsOptional() @IsString() @MaxLength(S) siklik?: string | null;
    @IsOptional() @IsDateString() mutabakatTarihi?: string | null;
    @IsOptional() @IsDateString() olusturmaTarihi?: string | null;
    @IsOptional() @IsDateString() guncelleme?: string | null;
    @IsOptional() @IsString() @MaxLength(S) riskSorumlusu?: string | null;
    @IsOptional() @IsString() @MaxLength(L) ozet?: string | null;
    @IsOptional() @IsString() @MaxLength(L) lastComment?: string | null;
    @IsOptional() @IsString() @MaxLength(S) outwardLink?: string | null;

    // Ek kolonlar (GRC'de yok; simülasyon girdisi).
    @IsOptional() @IsBoolean() onayli?: boolean | null;
    @ValidateIf((o: any) => o.kts != null) @IsNumber() @Min(0) @Max(100) kts?: number | null;
    @ValidateIf((o: any) => o.agirlik != null) @IsNumber() @Min(0) @Max(100) agirlik?: number | null;
    @IsOptional() @IsString() @MaxLength(50) etkiAlani?: string | null;
}

export class ImportWorkspaceDto {
    @IsString() @MaxLength(200) name!: string;
    @IsOptional() @IsString() @MaxLength(5000) description?: string;
    @IsOptional() @IsString() @MaxLength(255) sourceFileName?: string;
    /** true: yalnız kontrol raporu döner, hiçbir şey yazılmaz. */
    @IsOptional() @IsBoolean() dryRun?: boolean;

    @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => ImportRiskRowDto)
    risks!: ImportRiskRowDto[];

    @IsArray() @ArrayMaxSize(10000) @ValidateNested({ each: true }) @Type(() => ImportControlRowDto)
    controls!: ImportControlRowDto[];
}
