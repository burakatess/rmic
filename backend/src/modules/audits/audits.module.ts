import { Module } from '@nestjs/common';
import { AuditsController } from './audits.controller';
import { FollowUpsController } from './follow-ups.controller';
import { AuditsService } from './audits.service';
import { FollowUpSchedulerService } from './followup-scheduler.service';

@Module({
    controllers: [AuditsController, FollowUpsController],
    providers: [AuditsService, FollowUpSchedulerService],
    exports: [AuditsService],
})
export class AuditsModule { }
