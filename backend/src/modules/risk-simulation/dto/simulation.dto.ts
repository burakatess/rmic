import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SIM_STATUS_VALUES } from './methodology-types';

export class CreateRiskSimulationDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}

export class UpdateRiskSimulationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(SIM_STATUS_VALUES)
  status?: (typeof SIM_STATUS_VALUES)[number];
}

export class StartSimulationTestDto {
  @IsString()
  @MaxLength(200)
  name!: string;
}

export class OpenLiveWorkspaceDto {
  /** true: kaydedilmemiş değişiklikler atılır, güncel veriyle yeniden kurulur. */
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}

export class SaveWorkspaceDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}

export class DeleteSimulationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  ids!: string[];
}

export class TransferPreviewDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  scenarioIds?: string[];
}

export class CreateTransferRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  scenarioIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class TransferDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
