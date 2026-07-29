import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { UploadsModule } from './modules/uploads/uploads.module';
import { RiskProposalsModule } from './modules/risk-proposals/risk-proposals.module';
import { JwtAuthGuard } from './common/guards';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Genel rate limit — dashboard gibi sayfaların paralel GET isteklerini rahatça
    // karşılayacak kadar geniş; hassas auth route'ları kendi @Throttle override'larıyla
    // (login/register/refresh: 5 istek/60sn) çok daha sıkı sınırlanır.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
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
    UploadsModule,
    RiskProposalsModule,
  ],
  providers: [
    // Rate limit önce, sonra JWT auth
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Prisma hatalarının çıplak sızmasını önle — bkz. common/filters/prisma-exception.filter.ts
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },
    // Kalan tüm hatalar için son çare + Sentry raporlama — bkz. common/filters/all-exceptions.filter.ts
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule { }
