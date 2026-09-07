import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AiProviderService } from './ai-provider.service';
import { AI_PROMPT_VERSION, QUERY } from './prompts';

/**
 * Faz 3 — Doğal dil sorgu. SQL üretmez; sabit, sınırlı bir "veri paketi"
 * (özet sayımlar + kullanıcının kendi kalemleri) hazırlar ve model bunun
 * üzerinden yanıtlar. Salt okunur. Sonuç AiAssessment olarak saklanmaz.
 */
@Injectable()
export class AiQueryService {
    constructor(
        private prisma: PrismaService,
        private provider: AiProviderService,
    ) {}

    async ask(question: string, userId: string) {
        const bundle = await this.buildBundle(userId);
        const resp = await this.provider.chat({
            tier: 'heavy',
            json: true,
            system: QUERY.system,
            user: QUERY.user({ question, dataJson: JSON.stringify(bundle, null, 2) }),
        });

        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'AI_QUERY',
                entityType: 'AiQuery',
                entityId: userId,
                newValue: { question: question.slice(0, 500), model: resp.model },
            },
        });

        const parsed = resp.parsed as
            | { cevap?: string; kullanilanVeri?: string[]; elimdeYok?: boolean }
            | null;

        return {
            question,
            answer: parsed?.cevap ?? resp.text,
            usedData: parsed?.kullanilanVeri ?? [],
            notInData: parsed?.elimdeYok ?? false,
            model: resp.model,
            promptVersion: AI_PROMPT_VERSION,
        };
    }

    private async buildBundle(userId: string) {
        const now = new Date();
        const yearStart = new Date(now.getFullYear(), 0, 1);

        const [
            findingBySeverity,
            findingByStatus,
            overdueFindings,
            controlByEffectiveness,
            testByStatus,
            myOpenTests,
            myOpenFindings,
            recentFindings,
        ] = await Promise.all([
            this.prisma.finding.groupBy({ by: ['severity'], _count: true }),
            this.prisma.finding.groupBy({ by: ['status'], _count: true }),
            this.prisma.finding.count({
                where: { status: { not: 'CLOSED' }, targetResolutionDate: { lt: now } },
            }),
            this.prisma.control.groupBy({ by: ['effectivenessStatus'], _count: true }),
            this.prisma.controlTest.groupBy({
                by: ['status'],
                _count: true,
                where: { plannedDate: { gte: yearStart } },
            }),
            this.prisma.controlTest.findMany({
                where: { assigneeId: userId, status: { in: ['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'] } },
                select: { testNo: true, status: true, plannedDate: true, control: { select: { name: true } } },
                take: 30,
            }),
            this.prisma.finding.findMany({
                where: { assigneeId: userId, status: { not: 'CLOSED' } },
                select: { findingId: true, severity: true, status: true, summary: true, targetResolutionDate: true },
                take: 30,
            }),
            this.prisma.finding.findMany({
                orderBy: { createdAt: 'desc' },
                take: 15,
                select: { findingId: true, severity: true, status: true, summary: true, createdAt: true },
            }),
        ]);

        return {
            aciklama: 'RMIC GRC özet verisi. Sayımlar tüm kayıtlar üzerinden; "benim" kalemler sadece bu kullanıcıya ait.',
            tarih: now.toISOString().slice(0, 10),
            bulguSayimlari: {
                onemDerecesineGore: findingBySeverity,
                statuyeGore: findingByStatus,
                gecikmisAcikBulgu: overdueFindings,
            },
            kontrolEtkinligi: controlByEffectiveness,
            buYilTestleri: testByStatus,
            benimAcikTestlerim: myOpenTests,
            benimAcikBulgularim: myOpenFindings,
            sonBulgular: recentFindings,
        };
    }
}
