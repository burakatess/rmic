import { Module } from '@nestjs/common';
import { RiskControlsController } from './risk-controls.controller';
import { RiskControlsService } from './risk-controls.service';

@Module({
    controllers: [RiskControlsController],
    providers: [RiskControlsService],
    exports: [RiskControlsService],
})
export class RiskControlsModule {}
