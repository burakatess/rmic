import {
  IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import {
  SIM_IMPACT_AREA_VALUES, SIM_KTS_MODE_VALUES, SIM_P1_VALUES, SIM_P2_VALUES,
  SIM_P3_VALUES, SIM_P4_VALUES, SIM_P5_VALUES,
} from './methodology-types';

export class CreateScenarioControlDto {
  @IsOptional() @IsString() sourceControlId?: string;

  @IsString() @MaxLength(300) name!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;

  @IsEnum(SIM_P1_VALUES) p1!: (typeof SIM_P1_VALUES)[number];
  @IsEnum(SIM_P2_VALUES) p2!: (typeof SIM_P2_VALUES)[number];
  @IsEnum(SIM_P3_VALUES) p3!: (typeof SIM_P3_VALUES)[number];
  @IsEnum(SIM_P4_VALUES) p4!: (typeof SIM_P4_VALUES)[number];
  @IsEnum(SIM_P5_VALUES) p5!: (typeof SIM_P5_VALUES)[number];

  @IsEnum(SIM_KTS_MODE_VALUES) ktsMode!: (typeof SIM_KTS_MODE_VALUES)[number];

  // ktsMode seçilmiş olması, değerin/test bağlantısının O ANDA girilmiş olmasını
  // ZORUNLU KILMAZ — "MANUAL ama henüz sayı girilmedi" veya "FROM_TEST ama henüz
  // test seçilmedi" geçerli, geçici durumlardır (ikisi de motor tarafında "KTS
  // bilinmiyor" olarak ele alınır, asla 0/100 varsayılmaz).
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  ktsManualValue?: number;

  @IsOptional() @IsString()
  ktsSourceTestId?: string;

  @IsNumber() @Min(0) @Max(1) weight!: number;

  @IsEnum(SIM_IMPACT_AREA_VALUES) impactArea!: (typeof SIM_IMPACT_AREA_VALUES)[number];

  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateScenarioControlDto {
  @IsOptional() @IsString() @MaxLength(300) name?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;

  @IsOptional() @IsEnum(SIM_P1_VALUES) p1?: (typeof SIM_P1_VALUES)[number];
  @IsOptional() @IsEnum(SIM_P2_VALUES) p2?: (typeof SIM_P2_VALUES)[number];
  @IsOptional() @IsEnum(SIM_P3_VALUES) p3?: (typeof SIM_P3_VALUES)[number];
  @IsOptional() @IsEnum(SIM_P4_VALUES) p4?: (typeof SIM_P4_VALUES)[number];
  @IsOptional() @IsEnum(SIM_P5_VALUES) p5?: (typeof SIM_P5_VALUES)[number];

  @IsOptional() @IsEnum(SIM_KTS_MODE_VALUES) ktsMode?: (typeof SIM_KTS_MODE_VALUES)[number];
  @IsOptional() @IsNumber() @Min(0) @Max(100) ktsManualValue?: number;
  @IsOptional() @IsString() ktsSourceTestId?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(1) weight?: number;
  @IsOptional() @IsEnum(SIM_IMPACT_AREA_VALUES) impactArea?: (typeof SIM_IMPACT_AREA_VALUES)[number];
  @IsOptional() @IsInt() sortOrder?: number;
}

export class RedistributeWeightsDto {
  // Kontrol id → yeni ağırlık (0-1) haritası. Toplamın 1'i aşmaması servis katmanında kontrol edilir.
  @IsOptional()
  weights?: Record<string, number>;
}
