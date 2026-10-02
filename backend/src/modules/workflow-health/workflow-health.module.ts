import { Module } from '@nestjs/common';
import { DirectorateScopeService } from '../../common/services/directorate-scope.service';
import { WorkflowHealthController } from './workflow-health.controller';
import { WorkflowHealthService } from './workflow-health.service';

@Module({
    controllers: [WorkflowHealthController],
    providers: [WorkflowHealthService, DirectorateScopeService],
})
export class WorkflowHealthModule { }
