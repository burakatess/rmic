import {
  IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';
import {
  SIM_ACTION_EFFECT_MODE_VALUES, SIM_P1_VALUES, SIM_P2_VALUES, SIM_P3_VALUES, SIM_P4_VALUES, SIM_P5_VALUES,
} from './methodology-types';

export class CreateScenarioActionDto {
  @IsOptional() @IsString() sourceActionId?: string;

  @IsString() targetControlSimId!: string;

  @IsString() @MaxLength(300) name!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;

  @IsEnum(SIM_ACTION_EFFECT_MODE_VALUES) effectMode!: (typeof SIM_ACTION_EFFECT_MODE_VALUES)[number];

  @ValidateIf(o => o.effectMode === 'P1P5_KTS')
  @IsOptional() @IsEnum(SIM_P1_VALUES) targetP1?: (typeof SIM_P1_VALUES)[number];
  @ValidateIf(o => o.effectMode === 'P1P5_KTS')
  @IsOptional() @IsEnum(SIM_P2_VALUES) targetP2?: (typeof SIM_P2_VALUES)[number];
  @ValidateIf(o => o.effectMode === 'P1P5_KTS')
  @IsOptional() @IsEnum(SIM_P3_VALUES) targetP3?: (typeof SIM_P3_VALUES)[number];
  @ValidateIf(o => o.effectMode === 'P1P5_KTS')
  @IsOptional() @IsEnum(SIM_P4_VALUES) targetP4?: (typeof SIM_P4_VALUES)[number];
  @ValidateIf(o => o.effectMode === 'P1P5_KTS')
  @IsOptional() @IsEnum(SIM_P5_VALUES) targetP5?: (typeof SIM_P5_VALUES)[number];
  @ValidateIf(o => o.effectMode === 'P1P5_KTS')
  @IsOptional() @IsNumber() @Min(0) @Max(100) targetKts?: number;

  @ValidateIf(o => o.effectMode === 'TARGET_KEP')
  @IsNumber() @Min(0) @Max(100)
  targetKep?: number;

  @ValidateIf(o => o.effectMode === 'TARGET_KEP')
  @IsString() @MaxLength(2000)
  targetKepReason?: string;

  @IsOptional() @IsBoolean() isApplied?: boolean;
  @IsOptional() @IsInt() priority?: number;
}

export class UpdateScenarioActionDto {
  @IsOptional() @IsString() @MaxLength(300) name?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;

  @IsOptional() @IsEnum(SIM_P1_VALUES) targetP1?: (typeof SIM_P1_VALUES)[number];
  @IsOptional() @IsEnum(SIM_P2_VALUES) targetP2?: (typeof SIM_P2_VALUES)[number];
  @IsOptional() @IsEnum(SIM_P3_VALUES) targetP3?: (typeof SIM_P3_VALUES)[number];
  @IsOptional() @IsEnum(SIM_P4_VALUES) targetP4?: (typeof SIM_P4_VALUES)[number];
  @IsOptional() @IsEnum(SIM_P5_VALUES) targetP5?: (typeof SIM_P5_VALUES)[number];
  @IsOptional() @IsNumber() @Min(0) @Max(100) targetKts?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100) targetKep?: number;
  @IsOptional() @IsString() @MaxLength(2000) targetKepReason?: string;

  @IsOptional() @IsInt() priority?: number;
}

export class ToggleScenarioActionDto {
  @IsBoolean()
  isApplied!: boolean;
}
