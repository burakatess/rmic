import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma';
import { AuthModule } from './modules/auth';
import { RisksModule } from './modules/risks/risks.module';
import { ControlsModule } from './modules/controls/controls.module';
import { AuditsModule } from './modules/audits/audits.module';
import { ActionsModule } from './modules/actions/actions.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { AdminModule } from './modules/admin/admin.module';
import { RiskEntryModule } from './modules/risk-entry/risk-entry.module';
import { RiskManagementControlsModule } from './modules/risk-management-controls/risk-management-controls.module';
import { TestsModule } from './modules/tests/tests.module';
import { DirectoratesModule } from './modules/directorates/directorates.module';
import { RiskControlsModule } from './modules/risk-controls/risk-controls.module';
import { RiskActionsModule } from './modules/risk-actions/risk-actions.module';
import { JwtAuthGuard } from './common/guards';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    RisksModule,
    ControlsModule,
    AuditsModule,
    ActionsModule,
    ReportsModule,
    ComplianceModule,
    AdminModule,
    RiskEntryModule,
    RiskManagementControlsModule,
    TestsModule,
    DirectoratesModule,
    RiskControlsModule,
    RiskActionsModule,
  ],
  providers: [
    // Apply JWT auth guard globally
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule { }
