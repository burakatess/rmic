import { Module } from '@nestjs/common';
import { WorkflowApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
    controllers: [WorkflowApprovalsController],
    providers: [ApprovalsService],
    exports: [ApprovalsService],
})
export class ApprovalsModule { }
