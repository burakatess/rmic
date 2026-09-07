import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AuditsService } from './audits.service';

/**
 * Süresi geçmiş aksiyonlar için otomatik takip üretimi — periyodik çalıştırıcı.
 *
 * VARSAYILAN: KAPALI. Üretimde etkinleştirmek AYRI bir karardır (deployment onayı):
 *   FOLLOWUP_CRON_ENABLED=true
 *   FOLLOWUP_CRON_EXPRESSION="0 8 * * *"   (varsayılan: her gün 08:00)
 *   FOLLOWUP_CRON_TZ="Europe/Istanbul"     (varsayılan)
 *
 * Manuel tetikleme (POST /findings/generate-due-followups) yetkili yönetici işlemi
 * olarak KALIR ve aynı domain metodunu (AuditsService.generateDueFollowUps) çağırır.
 * Çoklu instance / cron-manuel çakışması advisory lock ile korunur.
 */
@Injectable()
export class FollowUpSchedulerService implements OnModuleInit {
    private readonly logger = new Logger('FollowUpScheduler');

    constructor(
        private readonly audits: AuditsService,
        private readonly registry: SchedulerRegistry,
    ) {}

    onModuleInit() {
        const enabled = (process.env.FOLLOWUP_CRON_ENABLED || 'false').toLowerCase() === 'true';
        if (!enabled) {
            this.logger.log('Otomatik takip üretimi cron\'u KAPALI (FOLLOWUP_CRON_ENABLED!=true).');
            return;
        }
        const expression = process.env.FOLLOWUP_CRON_EXPRESSION || '0 8 * * *';
        const timeZone = process.env.FOLLOWUP_CRON_TZ || 'Europe/Istanbul';

        const job = new CronJob(
            expression,
            () => {
                void this.run();
            },
            null,
            false,
            timeZone,
        );
        this.registry.addCronJob('followup-generate-due', job);
        job.start();
        this.logger.log(`Otomatik takip üretimi cron'u AKTİF — "${expression}" (${timeZone}).`);
    }

    private async run() {
        try {
            const res = await this.audits.generateDueFollowUps('cron');
            this.logger.log(`Cron çalıştı: ${JSON.stringify(res)}`);
        } catch (e) {
            this.logger.error(`Cron hatası: ${(e as Error).message}`, (e as Error).stack);
        }
    }
}
