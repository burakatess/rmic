import { Module } from '@nestjs/common';
import { RiskEntryController } from './risk-entry.controller';
import { RiskEntryService } from './risk-entry.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [RiskEntryController],
    providers: [RiskEntryService],
    exports: [RiskEntryService],
})
export class RiskEntryModule { }
