import { Module } from '@nestjs/common';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';
import { AuditsModule } from '../audits/audits.module';

@Module({
    imports: [AuditsModule], // bulguya bağlı aksiyonlar ortak domain servisine (AuditsService) delege edilir
    controllers: [ActionsController],
    providers: [ActionsService],
    exports: [ActionsService],
})
export class ActionsModule { }
