import { Type } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';
import { SIM_FINAL_IMPACT_CHOICE_VALUES, SIM_SCENARIO_SOURCE_TYPE_VALUES } from './methodology-types';

export class CreateScenarioDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsEnum(SIM_SCENARIO_SOURCE_TYPE_VALUES)
  sourceType!: (typeof SIM_SCENARIO_SOURCE_TYPE_VALUES)[number];

  @ValidateIf(o => o.sourceType === 'EXISTING_RISK')
  @IsString()
  sourceRiskId?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  naturalProbability!: number;

  @IsOptional() @IsInt() @Min(1) @Max(5) finansalEtki?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) itibarEtkisi?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) regulasyonEtkisi?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) musteriEtkisi?: number;

  @IsOptional() @IsInt() @Min(1) @Max(5) gizlilikEtkisi?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) butunlukEtkisi?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) erisilebilirlikEtkisi?: number;

  @IsEnum(SIM_FINAL_IMPACT_CHOICE_VALUES)
  finalImpactChoice!: (typeof SIM_FINAL_IMPACT_CHOICE_VALUES)[number];
}

export class UpdateScenarioDto {
  @Type(() => Number)
  @IsInt()
  expectedContentVersion!: number;

  @IsOptional() @IsString() @MaxLength(200) name?: string;

  @IsOptional() @IsInt() @Min(1) @Max(5) naturalProbability?: number;

  @IsOptional() @IsInt() @Min(1) @Max(5) finansalEtki?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) itibarEtkisi?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) regulasyonEtkisi?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) musteriEtkisi?: number;

  @IsOptional() @IsInt() @Min(1) @Max(5) gizlilikEtkisi?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) butunlukEtkisi?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) erisilebilirlikEtkisi?: number;

  @IsOptional()
  @IsEnum(SIM_FINAL_IMPACT_CHOICE_VALUES)
  finalImpactChoice?: (typeof SIM_FINAL_IMPACT_CHOICE_VALUES)[number];

  // Artık risk manuel override — ikisi birlikte veya hiçbiri (servis katmanında kontrol edilir).
  @IsOptional() @IsInt() @Min(1) @Max(5) residualOverrideProbability?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) residualOverrideImpact?: number;
  @IsOptional() @IsString() @MaxLength(2000) residualOverrideReason?: string;
  @IsOptional() @IsBoolean() clearResidualOverride?: boolean;
}

export class ScenarioIdempotencyDto {
  @Type(() => Number)
  @IsInt()
  expectedContentVersion!: number;
}
