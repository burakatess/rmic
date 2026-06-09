import { Module } from '@nestjs/common';
import { RiskActionsController } from './risk-actions.controller';
import { RiskActionsService } from './risk-actions.service';

@Module({
    controllers: [RiskActionsController],
    providers: [RiskActionsService],
    exports: [RiskActionsService],
})
export class RiskActionsModule {}
