import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import type { MethodologyConfig } from './calculation-engine';
import type { MethodologySettingsDto } from './dto/methodology-settings.dto';

/**
 * Simülasyon metodolojisi ayarları.
 *  - Resmî ayar: yalnız Sistem Yöneticisi; her yayın yeni bir sürüm olur ve yeni simülasyonlar
 *    onu kullanır. Mevcut simülasyonlar kendi sürümünde kalır (sessizce yeniden hesaplanmaz).
 *  - Deneme ayarı: herkes, yalnız bir simülasyonun içinde. O simülasyonun tüm riskleri deneme
 *    sürümüne bağlanır; "Resmî ayara dön" ile güncel resmî sürüme geri bağlanır.
 */

const LEVEL_LABELS = ['Çok Düşük', 'Düşük', 'Orta', 'Yüksek', 'Çok Yüksek'];
const BKP_LABELS = ['Çok Zayıf', 'Zayıf', 'Orta', 'Güçlü', 'Çok Güçlü'];
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Formdaki ayarları motor yapılandırmasına çevirir; tutarsızlıkta okunur hata fırlatır. */
export function settingsToConfig(s: MethodologySettingsDto, version: number): MethodologyConfig {
    const errors: string[] = [];
    const sum = (o: object) => Object.values(o).reduce((a: number, b) => a + Number(b), 0);
    if (Math.abs(sum(s.businessWeightsPct) - 100) > 0.01) errors.push(`İş etkisi ağırlıkları toplamı %100 olmalı (şu an %${r2(sum(s.businessWeightsPct))}).`);
    if (Math.abs(sum(s.infosecWeightsPct) - 100) > 0.01) errors.push(`BT etkisi ağırlıkları toplamı %100 olmalı (şu an %${r2(sum(s.infosecWeightsPct))}).`);
    const u = s.riskLevelUpperBounds;
    if (!u.every((v, i) => i === 0 || v > u[i - 1])) errors.push('Risk seviye üst sınırları artan sırada olmalı.');
    const b = s.bkpUpperBounds;
    if (!b.every((v, i) => i === 0 || v > b[i - 1]) || b[3] >= 100 || b[0] <= 0) errors.push('Bütünleşik kontrol sınırları 0 ile 100 arasında, artan sırada olmalı.');
    const t = s.bkpTierReductions;
    if (!t.every((v, i) => i === 0 || v >= t[i - 1])) errors.push('Kademe düşürme değerleri güçlü seviyelere doğru azalmamalı.');
    const ps = [s.p1, s.p2, s.p3, s.p4, s.p5];
    const kypDivisor = r2(ps.reduce((a, p) => a + Math.max(...Object.values(p).map(Number)), 0));
    if (kypDivisor <= 0) errors.push('P parametrelerinin en yüksek puanları toplamı sıfırdan büyük olmalı.');
    if (errors.length) throw new BadRequestException(errors.join(' '));

    const bands = [0, ...u, 25];
    return {
        version,
        p1: { ...s.p1 }, p2: { ...s.p2 }, p3: { ...s.p3 }, p4: { ...s.p4 }, p5: { ...s.p5 },
        kypDivisor,
        kepWeights: { kyp: r2(s.kypWeightPct) / 100, kts: r2(100 - s.kypWeightPct) / 100 },
        businessImpactWeights: {
            financial: s.businessWeightsPct.financial / 100, reputation: s.businessWeightsPct.reputation / 100,
            regulatory: s.businessWeightsPct.regulatory / 100, customer: s.businessWeightsPct.customer / 100,
        },
        infosecImpactWeights: {
            confidentiality: s.infosecWeightsPct.confidentiality / 100, integrity: s.infosecWeightsPct.integrity / 100, availability: s.infosecWeightsPct.availability / 100,
        },
        riskLevels: LEVEL_LABELS.map((label, i) => ({ min: i === 0 ? 0 : bands[i] + 1, max: bands[i + 1], score: i + 1, label })),
        bkpLevels: BKP_LABELS.map((label, i) => ({ min: i === 0 ? 0 : b[i - 1], max: i === 4 ? 100 : b[i], label, tierReduction: t[i] })),
        rounding: s.rounding,
    };
}

/** Motor yapılandırmasını form ayarlarına çevirir. */
export function configToSettings(c: MethodologyConfig): MethodologySettingsDto {
    const pct = (x: number) => r2(x * 100);
    return {
        p1: { ...c.p1 }, p2: { ...c.p2 }, p3: { ...c.p3 }, p4: { ...c.p4 }, p5: { ...c.p5 },
        kypWeightPct: pct(c.kepWeights.kyp),
        businessWeightsPct: { financial: pct(c.businessImpactWeights.financial), reputation: pct(c.businessImpactWeights.reputation), regulatory: pct(c.businessImpactWeights.regulatory), customer: pct(c.businessImpactWeights.customer) },
        infosecWeightsPct: { confidentiality: pct(c.infosecImpactWeights.confidentiality), integrity: pct(c.infosecImpactWeights.integrity), availability: pct(c.infosecImpactWeights.availability) },
        riskLevelUpperBounds: c.riskLevels.slice(0, 4).map(l => l.max),
        bkpUpperBounds: c.bkpLevels.slice(0, 4).map(l => l.max),
        bkpTierReductions: c.bkpLevels.map(l => l.tierReduction),
        rounding: c.rounding ?? 'ROUND_HALF_UP',
    } as MethodologySettingsDto;
}

@Injectable()
export class MethodologyService {
    constructor(private prisma: PrismaService) { }

    private async active() {
        const m = await this.prisma.simulationMethodology.findFirst({ where: { isActive: true, isTrial: false } });
        if (!m) throw new BadRequestException('Aktif bir simülasyon metodolojisi bulunamadı.');
        return m;
    }

    async listOfficial() {
        const [versions, active] = await Promise.all([
            this.prisma.simulationMethodology.findMany({
                where: { isTrial: false }, orderBy: { version: 'desc' },
                select: { id: true, version: true, isActive: true, changeNote: true, createdAt: true, config: true, createdBy: { select: { firstName: true, lastName: true } } },
            }),
            this.active(),
        ]);
        return {
            active: { id: active.id, version: active.version, settings: configToSettings(active.config as unknown as MethodologyConfig) },
            versions: versions.map(({ config, ...v }) => ({ ...v, settings: configToSettings(config as unknown as MethodologyConfig) })),
        };
    }

    async publish(settings: MethodologySettingsDto, changeNote: string, userId: string) {
        const last = await this.prisma.simulationMethodology.aggregate({ where: { isTrial: false }, _max: { version: true } });
        const version = (last._max.version ?? 0) + 1;
        const config = settingsToConfig(settings, version);
        const created = await this.prisma.$transaction(async (tx) => {
            const prev = await tx.simulationMethodology.findFirst({ where: { isActive: true, isTrial: false }, select: { id: true, version: true } });
            await tx.simulationMethodology.updateMany({ where: { isActive: true, isTrial: false }, data: { isActive: false } });
            const m = await tx.simulationMethodology.create({
                data: { version, config: config as unknown as Prisma.InputJsonValue, isActive: true, changeNote, createdById: userId },
            });
            await tx.auditLog.create({
                data: { userId, action: 'SIM_METHODOLOGY_PUBLISH', entityType: 'SimulationMethodology', entityId: m.id, oldValue: prev ? { version: prev.version } : undefined, newValue: { version, changeNote, config } as unknown as Prisma.InputJsonValue },
            });
            return m;
        });
        return { id: created.id, version: created.version };
    }

    /** Simülasyonun kullandığı metodoloji (resmî sürüm mü, deneme mi) ve güncel resmî sürüm. */
    async forSimulation(simulationId: string) {
        const sc = await this.prisma.riskSimulationScenario.findFirst({ where: { simulationId }, include: { methodology: true } });
        if (!sc) throw new NotFoundException('Simülasyonda risk bulunamadı');
        const active = await this.active();
        const m = sc.methodology;
        return {
            current: { id: m.id, version: m.version, isTrial: m.isTrial, basedOnVersion: m.basedOnVersion, changeNote: m.changeNote, settings: configToSettings(m.config as unknown as MethodologyConfig) },
            official: { id: active.id, version: active.version, settings: configToSettings(active.config as unknown as MethodologyConfig) },
            usesLatestOfficial: m.id === active.id,
        };
    }

    private async repin(simulationId: string, methodologyId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
        await db.riskSimulationScenario.updateMany({ where: { simulationId }, data: { methodologyVersionId: methodologyId, contentVersion: { increment: 1 } } });
        // Artık kullanılmayan deneme sürümleri temizlenir.
        await db.simulationMethodology.deleteMany({ where: { trialSimulationId: simulationId, isTrial: true, id: { not: methodologyId }, scenarios: { none: {} } } });
    }

    async setTrial(simulationId: string, settings: MethodologySettingsDto, note: string | undefined, userId: string) {
        const sim = await this.prisma.riskSimulation.findUnique({ where: { id: simulationId }, select: { id: true, mode: true } });
        if (!sim) throw new NotFoundException('Risk simülasyonu bulunamadı');
        if (sim.mode !== 'WORKSPACE') throw new BadRequestException('Deneme ayarı yalnız simülasyon çalışma alanında kullanılabilir.');
        const active = await this.active();
        const config = settingsToConfig(settings, active.version ?? 0);
        await this.prisma.$transaction(async (tx) => {
            const trial = await tx.simulationMethodology.create({
                data: { version: null, isTrial: true, trialSimulationId: simulationId, basedOnVersion: active.version, config: config as unknown as Prisma.InputJsonValue, changeNote: note ?? null, createdById: userId },
            });
            await this.repin(simulationId, trial.id, tx);
            await tx.auditLog.create({
                data: { userId, action: 'SIM_METHODOLOGY_TRIAL', entityType: 'RiskSimulation', entityId: simulationId, newValue: { methodologyId: trial.id, basedOnVersion: active.version, note: note ?? null, config } as unknown as Prisma.InputJsonValue },
            });
        });
        return this.forSimulation(simulationId);
    }

    /** Simülasyonu güncel resmî sürüme bağlar (deneme ayarını kaldırır). */
    async useOfficial(simulationId: string, userId: string) {
        const active = await this.active();
        await this.prisma.$transaction(async (tx) => {
            await this.repin(simulationId, active.id, tx);
            await tx.auditLog.create({ data: { userId, action: 'SIM_METHODOLOGY_OFFICIAL', entityType: 'RiskSimulation', entityId: simulationId, newValue: { version: active.version } } });
        });
        return this.forSimulation(simulationId);
    }

    /** Simülasyon silinince deneme sürümlerini temizler. */
    async cleanupTrials(simulationId: string) {
        await this.prisma.simulationMethodology.deleteMany({ where: { trialSimulationId: simulationId, isTrial: true, scenarios: { none: {} } } });
    }
}
