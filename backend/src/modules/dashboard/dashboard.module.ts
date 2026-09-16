import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DirectorateScopeService } from '../../common/services/directorate-scope.service';
import { ControlsModule } from '../controls/controls.module';

@Module({
    imports: [ControlsModule],
    controllers: [DashboardController],
    providers: [DashboardService, DirectorateScopeService],
})
export class DashboardModule { }
