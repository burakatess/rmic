import { Type } from 'class-transformer';
import {
    ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

/**
 * Metodoloji ayarları (puanlar ve sınırlar). Seçenek listesi sabittir; yalnız puanlar,
 * ağırlıklar ve sınırlar değişir. Tutarlılık (toplamların %100 olması, sınırların artan
 * olması) serviste ayrıca denetlenir.
 */
const score = () => (t: object, k: string) => { IsNumber({ maxDecimalPlaces: 2 })(t, k); Min(0)(t, k); Max(5)(t, k); };
const pct = () => (t: object, k: string) => { IsNumber({ maxDecimalPlaces: 2 })(t, k); Min(0)(t, k); Max(100)(t, k); };

export class P1ScoresDto { @score() MANUEL!: number; @score() BT_MANUEL!: number; @score() OTOMATIK!: number }
export class P2ScoresDto { @score() TESPIT_EDICI!: number; @score() DUZELTICI!: number; @score() ONLEYICI!: number }
export class P3ScoresDto { @score() IZ_KAYDI_YOK!: number; @score() KULLANICI_SIFRE_SES_EMAIL!: number; @score() SISTEM_LOG_ISLAK_IMZA!: number; @score() ELEKTRONIK_IMZA!: number }
export class P4ScoresDto { @score() YOK!: number; @score() AYNI_EKIP!: number; @score() FARKLI_EKIP!: number; @score() HER_IKISI!: number }
export class P5ScoresDto { @score() YOK!: number; @score() DUZENSIZ_UST_AMIR!: number; @score() DUZENLI_UST_AMIR!: number; @score() FARKLI_BIRIM_GOZETIM!: number }
export class BusinessWeightsDto { @pct() financial!: number; @pct() reputation!: number; @pct() regulatory!: number; @pct() customer!: number }
export class InfosecWeightsDto { @pct() confidentiality!: number; @pct() integrity!: number; @pct() availability!: number }

export class MethodologySettingsDto {
    @ValidateNested() @Type(() => P1ScoresDto) p1!: P1ScoresDto;
    @ValidateNested() @Type(() => P2ScoresDto) p2!: P2ScoresDto;
    @ValidateNested() @Type(() => P3ScoresDto) p3!: P3ScoresDto;
    @ValidateNested() @Type(() => P4ScoresDto) p4!: P4ScoresDto;
    @ValidateNested() @Type(() => P5ScoresDto) p5!: P5ScoresDto;

    /** Kontrol etkinlik puanında kontrol puanının (P toplamı) payı, %; KTS payı = 100 − bu. */
    @pct() kypWeightPct!: number;

    @ValidateNested() @Type(() => BusinessWeightsDto) businessWeightsPct!: BusinessWeightsDto;
    @ValidateNested() @Type(() => InfosecWeightsDto) infosecWeightsPct!: InfosecWeightsDto;

    /** Doğal risk seviye üst sınırları: Çok Düşük, Düşük, Orta, Yüksek (Çok Yüksek = üstü, en çok 25). */
    @IsArray() @ArrayMinSize(4) @ArrayMaxSize(4) @IsInt({ each: true }) @Min(1, { each: true }) @Max(24, { each: true })
    riskLevelUpperBounds!: number[];

    /** Bütünleşik kontrol seviye üst sınırları (0–100): Çok Zayıf, Zayıf, Orta, Güçlü (Çok Güçlü = üstü). */
    @IsArray() @ArrayMinSize(4) @ArrayMaxSize(4) @IsNumber({ maxDecimalPlaces: 2 }, { each: true }) @Min(0, { each: true }) @Max(100, { each: true })
    bkpUpperBounds!: number[];

    /** Seviyelere göre kalıntı kademe düşürme (Çok Zayıf … Çok Güçlü), 0–4. */
    @IsArray() @ArrayMinSize(5) @ArrayMaxSize(5) @IsInt({ each: true }) @Min(0, { each: true }) @Max(4, { each: true })
    bkpTierReductions!: number[];

    @IsIn(['ROUND_HALF_UP', 'CEIL', 'FLOOR']) rounding!: 'ROUND_HALF_UP' | 'CEIL' | 'FLOOR';
}

export class PublishMethodologyDto {
    @ValidateNested() @Type(() => MethodologySettingsDto) settings!: MethodologySettingsDto;
    @IsString() @MaxLength(2000) changeNote!: string;
}

export class TrialMethodologyDto {
    @ValidateNested() @Type(() => MethodologySettingsDto) settings!: MethodologySettingsDto;
    @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
