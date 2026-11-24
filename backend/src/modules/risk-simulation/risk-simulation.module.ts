import { Module } from '@nestjs/common';
import { AuditsModule } from '../audits/audits.module';
import { RiskSimulationController } from './risk-simulation.controller';
import { RiskSimulationService } from './risk-simulation.service';
import { TransferService } from './transfer.service';
import { WorkspaceService } from './workspace.service';
import { WorkspaceExcelService } from './workspace-excel.service';
import { WorkspaceTestService } from './workspace-test.service';
import { MethodologyService } from './methodology.service';
import { WorkspaceTransferService } from './workspace-transfer.service';

@Module({
    imports: [AuditsModule],
    controllers: [RiskSimulationController],
    providers: [RiskSimulationService, TransferService, WorkspaceService, WorkspaceExcelService, WorkspaceTestService, MethodologyService, WorkspaceTransferService],
    exports: [RiskSimulationService, TransferService],
})
export class RiskSimulationModule { }
