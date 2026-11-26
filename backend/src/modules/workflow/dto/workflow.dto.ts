import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, IsDateString, IsNotEmpty } from 'class-validator';

export const ENTITY_TYPE_VALUES = ['CONTROL_TEST', 'FOLLOW_UP', 'FINDING', 'PERIOD_CONTROL', 'ACTION'] as const;
export const ACTION_VALUES = ['START', 'COMPLETE', 'APPROVE', 'RETURN', 'REVERT', 'CANCEL', 'REOPEN', 'WITHDRAW'] as const;
export const STAGE_VALUES = ['BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'ONAYLANDI'] as const;

export class WorkflowTransitionDto {
    @IsIn(ACTION_VALUES) action: typeof ACTION_VALUES[number];
    @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class WorkflowMoveDto {
    @IsIn(ENTITY_TYPE_VALUES) entityType: typeof ENTITY_TYPE_VALUES[number];
    @IsString() @IsNotEmpty() @MaxLength(64) entityId: string;
    @IsIn(STAGE_VALUES) toStage: typeof STAGE_VALUES[number];
    @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class WorkflowBoardQueryDto {
    @IsOptional() @IsString() @MaxLength(200) type?: string;
    @IsOptional() @IsString() @MaxLength(64) assigneeId?: string;
    @IsOptional() @IsIn(STAGE_VALUES) stage?: string;
    @IsOptional() @IsDateString() from?: string;
    @IsOptional() @IsDateString() to?: string;
    @IsOptional() @IsIn(['MINE', 'ORG']) scope?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
}

export const DELETION_TYPES = ['CONTROL', 'CONTROL_TEST', 'PERIOD_CONTROL', 'FINDING', 'ACTION', 'FOLLOW_UP', 'RISK', 'RISK_CONTROL', 'RISK_ACTION'] as const;

export class DeletionRequestDto {
    @IsIn(DELETION_TYPES) entityType: typeof DELETION_TYPES[number];
    @IsString() @IsNotEmpty() @MaxLength(64) entityId: string;
    @IsString() @IsNotEmpty() @MaxLength(2000) reason: string;
}

export class DeletionDecisionDto {
    @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}
