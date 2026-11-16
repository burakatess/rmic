import { Module } from '@nestjs/common';
import { GmysController } from './gmys.controller';
import { GmysService } from './gmys.service';

@Module({
    controllers: [GmysController],
    providers: [GmysService],
})
export class GmysModule { }
