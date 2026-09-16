import { Module } from '@nestjs/common';
import { AuditsModule } from '../audits/audits.module';
import { RiskSimulationController } from './risk-simulation.controller';
import { RiskSimulationService } from './risk-simulation.service';
import { TransferService } from './transfer.service';

@Module({
    imports: [AuditsModule],
    controllers: [RiskSimulationController],
    providers: [RiskSimulationService, TransferService],
    exports: [RiskSimulationService, TransferService],
})
export class RiskSimulationModule { }
