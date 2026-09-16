import { Module } from '@nestjs/common';
import { ControlsController } from './controls.controller';
import { ApprovalsController } from './approvals.controller';
import { ControlScopeController } from './control-scope.controller';
import { AnnualPlanController } from './annual-plan.controller';
import { ControlsService } from './controls.service';
import { ControlScopeService } from './control-scope.service';
import { ControlDashboardService } from './control-dashboard.service';
import { AnnualPlanService } from './annual-plan.service';
import { DirectorateScopeService } from '../../common/services/directorate-scope.service';

@Module({
    // Sıra önemli: literal rotalar (scope-years, dashboard, scope/bulk,
    // scope/copy, annual-plan/*) ControlsController'ın `:id` catch-all
    // rotalarından ÖNCE eşleşmelidir.
    controllers: [ControlScopeController, AnnualPlanController, ControlsController, ApprovalsController],
    providers: [ControlsService, ControlScopeService, ControlDashboardService, AnnualPlanService, DirectorateScopeService],
    exports: [ControlsService, ControlScopeService, ControlDashboardService],
})
export class ControlsModule { }
