import { Module } from '@nestjs/common';
import { ControlsModule } from '../controls/controls.module';
import { AuditsModule } from '../audits/audits.module';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { DeletionRequestsService } from './deletion-requests.service';

@Module({
    imports: [ControlsModule, AuditsModule],
    controllers: [WorkflowController],
    providers: [WorkflowService, DeletionRequestsService],
    exports: [WorkflowService, DeletionRequestsService],
})
export class WorkflowModule { }
