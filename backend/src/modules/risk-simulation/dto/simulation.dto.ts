import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
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
