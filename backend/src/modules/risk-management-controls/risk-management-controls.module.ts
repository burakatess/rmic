import { Module } from '@nestjs/common';
import { RiskManagementControlsController } from './risk-management-controls.controller';
import { RiskManagementControlsService } from './risk-management-controls.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [RiskManagementControlsController],
    providers: [RiskManagementControlsService],
    exports: [RiskManagementControlsService],
})
export class RiskManagementControlsModule { }
