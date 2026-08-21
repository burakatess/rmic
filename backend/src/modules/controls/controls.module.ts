import { Module } from '@nestjs/common';
import { ControlsController } from './controls.controller';
import { ApprovalsController } from './approvals.controller';
import { ControlsService } from './controls.service';

@Module({
    controllers: [ControlsController, ApprovalsController],
    providers: [ControlsService],
    exports: [ControlsService],
})
export class ControlsModule { }
