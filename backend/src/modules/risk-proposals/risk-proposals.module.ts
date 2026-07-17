import { Module } from '@nestjs/common';
import { RiskProposalsController } from './risk-proposals.controller';
import { RiskProposalsService } from './risk-proposals.service';

@Module({
    controllers: [RiskProposalsController],
    providers: [RiskProposalsService],
})
export class RiskProposalsModule {}
