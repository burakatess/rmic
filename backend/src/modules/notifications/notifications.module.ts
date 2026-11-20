import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
    imports: [ApprovalsModule],
    controllers: [NotificationsController],
    providers: [NotificationsService],
})
export class NotificationsModule { }
