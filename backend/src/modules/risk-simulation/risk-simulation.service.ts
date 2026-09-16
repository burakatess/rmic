import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { nextCounterValue, formatRecordId } from '../../common/util/sequential-id';
import {
    calculateScenario, type ActionInput, type ControlInput, type MethodologyConfig, type ScenarioCalcResult,
} from './calculation-engine';
import type {
    CreateRiskSimulationDto, UpdateRiskSimulationDto, CreateScenarioDto, UpdateScenarioDto,
    CreateScenarioControlDto, UpdateScenarioControlDto, CreateScenarioActionDto, UpdateScenarioActionDto,
} from './dto';

// İkincil sıralama anahtarı (createdAt) KASITLI: sortOrder/priority alanları
// eşit değerli birden fazla satırda çakışabiliyor (örn. bir kontrol silinip
// yenisi eklendiğinde) — PostgreSQL eşit değerlerde SABİT bir sıra GARANTİ
// ETMEZ, tek anahtarla sıralarsak her yeniden çekişte satırlar yer değiştirip
// kullanıcıya "düzenlediğim satır sıfırlandı" izlenimi verebilir.
const SCENARIO_INCLUDE = {
    controls: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
    actions: { orderBy: [{ priority: 'asc' as const }, { createdAt: 'asc' as const }] },
    methodology: true,
    simulation: true,
};

/** Bir DB satırını hesaplama motorunun ControlInput'una çevirir.
 * ktsMode=FROM_TEST ise KTS her zaman null döner — gerçek ControlTest şemasında
 * onaylı bir sayısal test sonucu alanı YOK (yalnızca kategorik findingStatus var);
 * kategorik→sayısal dönüşüm için onaylı bir kural bulunmadığından (spec'in kendi
 * uyarısı) motor "KTS bilinmiyor" (null) davranışına düşer — bu KASITLI, eksik
 * değil (bkz. teslim raporu). */
function toControlInput(row: any): ControlInput {
    return {
        id: row.id,
        p1: row.p1, p2: row.p2, p3: row.p3, p4: row.p4, p5: row.p5,
        kts: row.ktsMode === 'MANUAL' ? (row.ktsManualValue ?? null) : null,
        weight: row.weight,
        impactArea: row.impactArea,
    };
}

function toActionInput(row: any): ActionInput {
    return {
        id: row.id,
        targetControlId: row.targetControlSimId,
        isApplied: row.isApplied,
        priority: row.priority,
        effect: row.effectMode === 'TARGET_KEP'
            ? { mode: 'TARGET_KEP', targetKep: row.targetKep as number }
            : {
                mode: 'P1P5_KTS',
                p1: row.targetP1 ?? undefined, p2: row.targetP2 ?? undefined, p3: row.targetP3 ?? undefined,
                p4: row.targetP4 ?? undefined, p5: row.targetP5 ?? undefined, kts: row.targetKts ?? undefined,
            },
    };
}

const RISK_SCALAR_FIELDS = [
    'naturalProbability', 'finansalEtki', 'itibarEtkisi', 'regulasyonEtkisi', 'musteriEtkisi',
    'gizlilikEtkisi', 'butunlukEtkisi', 'erisilebilirlikEtkisi',
] as const;

function serializeRiskSnapshot(risk: any) {
    return {
        riskId: risk.riskId, name: risk.name, description: risk.description,
        categoryId: risk.categoryId, ownerId: risk.ownerId,
        finansalEtki: risk.finansalEtki, itibarEtkisi: risk.itibarEtkisi,
        regulasyonEtkisi: risk.regulasyonEtkisi, musteriEtkisi: risk.musteriEtkisi,
        gizlilikEtkisi: risk.gizlilikEtkisi, butunlukEtkisi: risk.butunlukEtkisi,
        erisilebilirlikEtkisi: risk.erisilebilirlikEtkisi,
        olasilik: risk.olasilik,
        inherentProbability: risk.inherentProbability, inherentImpact: risk.inherentImpact,
        residualProbability: risk.residualProbability, residualImpact: risk.residualImpact,
        residualRiskScore: risk.residualRiskScore,
        version: risk.version,
        controls: (risk.controls ?? []).map((m: any) => ({
            controlId: m.controlId, controlName: m.control?.name, mappingType: m.mappingType,
        })),
        capturedAt: new Date().toISOString(),
    };
}

/** Gerçek Control.automation/nature'dan simülasyonun P1/P2'sine en-yakın-eşleşme
 * (kayıpsız yön: gerçek şemada DUZELTICI/BT_MANUEL karşılığı olmayan bir değer
 * YOK — kayıp yalnızca TERS yönde, gerçek Control oluştururken oluşur, bu round
 * kapsamına alınmadı, bkz. transfer.service.ts). P3-P5'in gerçek Control'de hiç
 * karşılığı yok — en düşük (0 puanlı) seçenekle başlatılır, kullanıcı senaryoda doldurur. */
function seedP1FromAutomation(automation: string): 'MANUEL' | 'BT_MANUEL' | 'OTOMATIK' {
    if (automation === 'AUTOMATED') return 'OTOMATIK';
    if (automation === 'SEMI_AUTOMATED') return 'BT_MANUEL';
    return 'MANUEL';
}
function seedP2FromNature(nature: string): 'TESPIT_EDICI' | 'ONLEYICI' {
    return nature === 'PREVENTIVE' ? 'ONLEYICI' : 'TESPIT_EDICI';
}

@Injectable()
export class RiskSimulationService {
    constructor(private prisma: PrismaService) { }

    // ─── Metodoloji ───────────────────────────────────────────────────────

    async getActiveMethodology() {
        const m = await this.prisma.simulationMethodology.findFirst({ where: { isActive: true } });
        if (!m) throw new BadRequestException('Aktif bir SIM_METHODOLOGY sürümü bulunamadı — seed çalıştırılmamış olabilir.');
        return m;
    }

    // ─── RiskSimulation CRUD ──────────────────────────────────────────────

    async listSimulations(query: { status?: string; search?: string }) {
        return this.prisma.riskSimulation.findMany({
            where: {
                status: query.status as any,
                ...(query.search ? {
                    OR: [
                        { name: { contains: query.search, mode: 'insensitive' } },
                        { simulationId: { contains: query.search, mode: 'insensitive' } },
                    ],
                } : {}),
            },
            include: { _count: { select: { scenarios: true } }, createdBy: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getSimulation(id: string) {
        const sim = await this.prisma.riskSimulation.findUnique({
            where: { id },
            include: {
                scenarios: { orderBy: { createdAt: 'desc' }, include: { methodology: { select: { version: true } }, _count: { select: { controls: true, actions: true } } } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        if (!sim) throw new NotFoundException('Risk simülasyonu bulunamadı');
        return sim;
    }

    async createSimulation(dto: CreateRiskSimulationDto, userId: string) {
        const simulationId = formatRecordId('SIM', await nextCounterValue(this.prisma as any, 'risk-simulation'));
        const sim = await this.prisma.riskSimulation.create({
            data: { simulationId, name: dto.name, description: dto.description, createdById: userId },
        });
        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'RiskSimulation', entityId: sim.id, newValue: sim },
        });
        return sim;
    }

    async updateSimulation(id: string, dto: UpdateRiskSimulationDto, userId: string) {
        const existing = await this.prisma.riskSimulation.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Risk simülasyonu bulunamadı');
        const updated = await this.prisma.riskSimulation.update({ where: { id }, data: dto });
        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'RiskSimulation', entityId: id, oldValue: existing, newValue: updated },
        });
        return updated;
    }

    // ─── Scenario ──────────────────────────────────────────────────────────

    async getScenario(scenarioId: string) {
        const scenario = await this.prisma.riskSimulationScenario.findUnique({ where: { id: scenarioId }, include: SCENARIO_INCLUDE });
        if (!scenario) throw new NotFoundException('Senaryo bulunamadı');
        return scenario;
    }

    async createScenario(simulationId: string, dto: CreateScenarioDto, userId: string) {
        const simulation = await this.prisma.riskSimulation.findUnique({ where: { id: simulationId } });
        if (!simulation) throw new NotFoundException('Risk simülasyonu bulunamadı');
        const methodology = await this.getActiveMethodology();

        let sourceRiskSnapshot: any = null;
        let sourceCapturedVersion: number | null = null;
        let sourceCapturedAt: Date | null = null;
        let riskFields = {
            naturalProbability: dto.naturalProbability,
            finansalEtki: dto.finansalEtki ?? null, itibarEtkisi: dto.itibarEtkisi ?? null,
            regulasyonEtkisi: dto.regulasyonEtkisi ?? null, musteriEtkisi: dto.musteriEtkisi ?? null,
            gizlilikEtkisi: dto.gizlilikEtkisi ?? null, butunlukEtkisi: dto.butunlukEtkisi ?? null,
            erisilebilirlikEtkisi: dto.erisilebilirlikEtkisi ?? null,
        };
        let seedControls: { sourceControlId: string; name: string; description: string | null; p1: any; p2: any }[] = [];

        if (dto.sourceType === 'EXISTING_RISK') {
            if (!dto.sourceRiskId) throw new BadRequestException('EXISTING_RISK için sourceRiskId zorunludur');
            const risk = await this.prisma.risk.findUnique({
                where: { id: dto.sourceRiskId },
                include: { controls: { include: { control: true } } },
            });
            if (!risk) throw new BadRequestException('Geçersiz risk: seçilen risk bulunamadı');

            sourceRiskSnapshot = serializeRiskSnapshot(risk);
            sourceCapturedVersion = risk.version;
            sourceCapturedAt = new Date();
            riskFields = {
                naturalProbability: dto.naturalProbability ?? risk.olasilik ?? risk.inherentProbability ?? 3,
                finansalEtki: dto.finansalEtki ?? risk.finansalEtki ?? null,
                itibarEtkisi: dto.itibarEtkisi ?? risk.itibarEtkisi ?? null,
                regulasyonEtkisi: dto.regulasyonEtkisi ?? risk.regulasyonEtkisi ?? null,
                musteriEtkisi: dto.musteriEtkisi ?? risk.musteriEtkisi ?? null,
                gizlilikEtkisi: dto.gizlilikEtkisi ?? risk.gizlilikEtkisi ?? null,
                butunlukEtkisi: dto.butunlukEtkisi ?? risk.butunlukEtkisi ?? null,
                erisilebilirlikEtkisi: dto.erisilebilirlikEtkisi ?? risk.erisilebilirlikEtkisi ?? null,
            };
            seedControls = risk.controls.map((m: any) => ({
                sourceControlId: m.controlId,
                name: m.control.name,
                description: m.control.description ?? null,
                p1: seedP1FromAutomation(m.control.automation),
                p2: seedP2FromNature(m.control.nature),
            }));
        }

        return this.prisma.$transaction(async (tx) => {
            const scenario = await tx.riskSimulationScenario.create({
                data: {
                    simulationId, name: dto.name, methodologyVersionId: methodology.id,
                    sourceType: dto.sourceType,
                    sourceRiskId: dto.sourceType === 'EXISTING_RISK' ? dto.sourceRiskId : null,
                    sourceRiskSnapshot, sourceCapturedVersion, sourceCapturedAt,
                    ...riskFields,
                    finalImpactChoice: dto.finalImpactChoice,
                    initialStateSnapshot: {},
                    createdById: userId,
                },
            });

            const createdControls = [];
            for (let i = 0; i < seedControls.length; i++) {
                const c = seedControls[i];
                createdControls.push(await tx.riskSimulationControl.create({
                    data: {
                        scenarioId: scenario.id, sourceControlId: c.sourceControlId, name: c.name, description: c.description,
                        p1: c.p1, p2: c.p2, p3: 'IZ_KAYDI_YOK', p4: 'YOK', p5: 'YOK',
                        // MANUAL (değersiz) ile başlar — FROM_TEST ile değil: gerçek ControlTest
                        // şemasında sayısal bir sonuç alanı hiç yok, o yüzden FROM_TEST kalıcı bir
                        // çıkmaz sokak olurdu (kullanıcı asla bir sayı giremez). MANUAL, kullanıcının
                        // hemen düzenleyebileceği boş bir alan sunar — "KTS bilinmiyor" durumu
                        // (ktsManualValue null olduğu sürece) aynı şekilde korunur, hiçbir değer
                        // uydurulmaz.
                        ktsMode: 'MANUAL', weight: 0, impactArea: 'BOTH', sortOrder: i,
                    },
                }));
            }

            const initialStateSnapshot = {
                ...riskFields,
                finalImpactChoice: dto.finalImpactChoice,
                controls: createdControls.map(c => ({
                    sourceControlId: c.sourceControlId, name: c.name, description: c.description,
                    p1: c.p1, p2: c.p2, p3: c.p3, p4: c.p4, p5: c.p5,
                    ktsMode: c.ktsMode, ktsManualValue: c.ktsManualValue, ktsSourceTestId: c.ktsSourceTestId,
                    weight: c.weight, impactArea: c.impactArea, sortOrder: c.sortOrder,
                })),
            };

            const updated = await tx.riskSimulationScenario.update({
                where: { id: scenario.id }, data: { initialStateSnapshot }, include: SCENARIO_INCLUDE,
            });
            await tx.auditLog.create({
                data: { userId, action: 'CREATE', entityType: 'RiskSimulationScenario', entityId: scenario.id, newValue: updated },
            });
            return updated;
        });
    }

    async updateScenario(scenarioId: string, dto: UpdateScenarioDto, userId: string) {
        const existing = await this.prisma.riskSimulationScenario.findUnique({ where: { id: scenarioId } });
        if (!existing) throw new NotFoundException('Senaryo bulunamadı');
        if (dto.expectedContentVersion !== existing.contentVersion) {
            throw new ConflictException({
                message: 'Bu senaryo başka bir oturumda güncellendi. Sayfayı yenileyip devam edin.',
                currentVersion: existing.contentVersion,
            });
        }
        if ((dto.residualOverrideProbability !== undefined) !== (dto.residualOverrideImpact !== undefined)) {
            throw new BadRequestException('Artık risk override için hem olasılık hem etki birlikte verilmelidir.');
        }
        if (dto.residualOverrideProbability !== undefined && !dto.residualOverrideReason) {
            throw new BadRequestException('Manuel artık risk override için gerekçe zorunludur.');
        }

        const { expectedContentVersion, clearResidualOverride, ...rest } = dto;
        const data: any = { ...rest, contentVersion: { increment: 1 } };
        if (dto.residualOverrideProbability !== undefined) data.residualIsOverridden = true;
        if (clearResidualOverride) {
            data.residualOverrideProbability = null;
            data.residualOverrideImpact = null;
            data.residualOverrideReason = null;
            data.residualIsOverridden = false;
        }

        const updated = await this.prisma.riskSimulationScenario.update({ where: { id: scenarioId }, data, include: SCENARIO_INCLUDE });
        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'RiskSimulationScenario', entityId: scenarioId, oldValue: existing, newValue: updated },
        });
        return updated;
    }

    /** Senaryoyu OLUŞTURULDUĞU ANDAKİ kendi başlangıç durumuna döndürür — gerçek
     * envantere ASLA dokunmaz, yalnızca initialStateSnapshot'ı yeniden uygular. */
    async resetScenario(scenarioId: string, userId: string) {
        const scenario = await this.prisma.riskSimulationScenario.findUnique({ where: { id: scenarioId } });
        if (!scenario) throw new NotFoundException('Senaryo bulunamadı');
        const snap = scenario.initialStateSnapshot as any;

        return this.prisma.$transaction(async (tx) => {
            await tx.riskSimulationAction.deleteMany({ where: { scenarioId } });
            await tx.riskSimulationControl.deleteMany({ where: { scenarioId } });
            for (let i = 0; i < (snap.controls ?? []).length; i++) {
                const c = snap.controls[i];
                await tx.riskSimulationControl.create({ data: { scenarioId, ...c, sortOrder: c.sortOrder ?? i } });
            }
            const updated = await tx.riskSimulationScenario.update({
                where: { id: scenarioId },
                data: {
                    naturalProbability: snap.naturalProbability, finansalEtki: snap.finansalEtki, itibarEtkisi: snap.itibarEtkisi,
                    regulasyonEtkisi: snap.regulasyonEtkisi, musteriEtkisi: snap.musteriEtkisi,
                    gizlilikEtkisi: snap.gizlilikEtkisi, butunlukEtkisi: snap.butunlukEtkisi, erisilebilirlikEtkisi: snap.erisilebilirlikEtkisi,
                    finalImpactChoice: snap.finalImpactChoice,
                    residualOverrideProbability: null, residualOverrideImpact: null, residualOverrideReason: null, residualIsOverridden: false,
                    contentVersion: { increment: 1 },
                },
                include: SCENARIO_INCLUDE,
            });
            await tx.auditLog.create({
                data: { userId, action: 'RESET', entityType: 'RiskSimulationScenario', entityId: scenarioId, newValue: updated },
            });
            return updated;
        });
    }

    /** Canlı envanterle senaryonun ham risk girdileri arasındaki farkı gösterir —
     * YAZMAZ. Kontrol seti senkronizasyonu bu turun kapsamı dışında (bkz. rapor);
     * yalnızca risk seviyesi skaler alanlar karşılaştırılır. */
    async previewRefreshFromInventory(scenarioId: string) {
        const scenario = await this.getScenario(scenarioId);
        if (scenario.sourceType !== 'EXISTING_RISK' || !scenario.sourceRiskId) {
            throw new BadRequestException('Yalnızca gerçek bir riskten başlatılan senaryolar için envanterden yenileme yapılabilir.');
        }
        const risk = await this.prisma.risk.findUnique({ where: { id: scenario.sourceRiskId } });
        if (!risk) throw new BadRequestException('Kaynak risk artık bulunamıyor — silinmiş olabilir.');

        const fieldMap: Record<string, keyof typeof risk> = {
            naturalProbability: 'olasilik', finansalEtki: 'finansalEtki', itibarEtkisi: 'itibarEtkisi',
            regulasyonEtkisi: 'regulasyonEtkisi', musteriEtkisi: 'musteriEtkisi', gizlilikEtkisi: 'gizlilikEtkisi',
            butunlukEtkisi: 'butunlukEtkisi', erisilebilirlikEtkisi: 'erisilebilirlikEtkisi',
        };
        const diffs = RISK_SCALAR_FIELDS.map(f => {
            const liveValue = (risk as any)[fieldMap[f]] ?? (f === 'naturalProbability' ? risk.inherentProbability : null);
            const scenarioValue = (scenario as any)[f];
            return { field: f, scenarioValue, liveValue, changed: liveValue !== null && liveValue !== scenarioValue };
        });

        return {
            isStale: risk.version !== scenario.sourceCapturedVersion,
            capturedVersion: scenario.sourceCapturedVersion,
            liveVersion: risk.version,
            fields: diffs,
            note: 'Kontrol listesi senkronizasyonu bu sürümde desteklenmiyor — yalnızca risk girdi alanları karşılaştırılır.',
        };
    }

    async applyRefreshFromInventory(scenarioId: string, acceptFields: string[], userId: string) {
        const preview = await this.previewRefreshFromInventory(scenarioId);
        const scenario = await this.getScenario(scenarioId);
        const risk = await this.prisma.risk.findUnique({ where: { id: scenario.sourceRiskId! }, include: { controls: { include: { control: true } } } });
        if (!risk) throw new BadRequestException('Kaynak risk artık bulunamıyor.');

        const data: any = { contentVersion: { increment: 1 } };
        for (const f of acceptFields) {
            const match = preview.fields.find(d => d.field === f);
            if (match && match.changed) data[f] = match.liveValue;
        }
        data.sourceRiskSnapshot = serializeRiskSnapshot(risk);
        data.sourceCapturedVersion = risk.version;
        data.sourceCapturedAt = new Date();

        const updated = await this.prisma.riskSimulationScenario.update({ where: { id: scenarioId }, data, include: SCENARIO_INCLUDE });
        await this.prisma.auditLog.create({
            data: { userId, action: 'REFRESH_FROM_INVENTORY', entityType: 'RiskSimulationScenario', entityId: scenarioId, oldValue: { fields: preview.fields, accepted: acceptFields } },
        });
        return updated;
    }

    // ─── Controls ──────────────────────────────────────────────────────────

    private async assertScenarioExists(scenarioId: string) {
        const scenario = await this.prisma.riskSimulationScenario.findUnique({ where: { id: scenarioId } });
        if (!scenario) throw new NotFoundException('Senaryo bulunamadı');
        return scenario;
    }

    async addControl(scenarioId: string, dto: CreateScenarioControlDto, userId: string) {
        await this.assertScenarioExists(scenarioId);
        if (dto.sourceControlId) {
            const exists = await this.prisma.control.findUnique({ where: { id: dto.sourceControlId }, select: { id: true } });
            if (!exists) throw new BadRequestException('Geçersiz kontrol: seçilen kontrol bulunamadı');
        }
        if (dto.ktsSourceTestId) {
            const exists = await this.prisma.controlTest.findUnique({ where: { id: dto.ktsSourceTestId }, select: { id: true } });
            if (!exists) throw new BadRequestException('Geçersiz test kaydı: seçilen kontrol testi bulunamadı');
        }
        // count() DEĞİL: bir kontrol silinip yeni bir tane eklendiğinde count()
        // zaten var olan bir sortOrder ile ÇAKIŞIR (örn. 3 kontrol varken 1'i
        // silinir → count()=2, ama kalan kontrollerin sortOrder'ı 1 ve 2'dir —
        // yeni kontrol de sortOrder=2 alır, mevcut bir satırla çakışır). Var olan
        // en yüksek sortOrder'ın bir fazlası kullanılmalı.
        const maxSortOrder = await this.prisma.riskSimulationControl.aggregate({
            where: { scenarioId }, _max: { sortOrder: true },
        });
        const nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;
        const control = await this.prisma.riskSimulationControl.create({
            data: { scenarioId, ...dto, sortOrder: nextSortOrder },
        });
        await this.prisma.riskSimulationScenario.update({ where: { id: scenarioId }, data: { contentVersion: { increment: 1 } } });
        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'RiskSimulationControl', entityId: control.id, newValue: control },
        });
        return control;
    }

    async updateControl(scenarioId: string, controlId: string, dto: UpdateScenarioControlDto, userId: string) {
        const existing = await this.prisma.riskSimulationControl.findFirst({ where: { id: controlId, scenarioId } });
        if (!existing) throw new NotFoundException('Senaryo kontrolü bulunamadı');
        if (dto.ktsSourceTestId) {
            const exists = await this.prisma.controlTest.findUnique({ where: { id: dto.ktsSourceTestId }, select: { id: true } });
            if (!exists) throw new BadRequestException('Geçersiz test kaydı: seçilen kontrol testi bulunamadı');
        }
        const updated = await this.prisma.riskSimulationControl.update({ where: { id: controlId }, data: dto });
        await this.prisma.riskSimulationScenario.update({ where: { id: scenarioId }, data: { contentVersion: { increment: 1 } } });
        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'RiskSimulationControl', entityId: controlId, oldValue: existing, newValue: updated },
        });
        return updated;
    }

    async removeControl(scenarioId: string, controlId: string, userId: string) {
        const existing = await this.prisma.riskSimulationControl.findFirst({ where: { id: controlId, scenarioId } });
        if (!existing) throw new NotFoundException('Senaryo kontrolü bulunamadı');
        // Kaldırılan kontrolün ağırlığı DİĞER kontrollere otomatik dağıtılmaz —
        // boşalan pay "kontrolsüz pay" olarak ayrı kalır (motor bunu weightCheck
        // ile hesaplar); kullanıcı isterse ayrı "Yeniden Dağıt" eylemini çağırır.
        await this.prisma.$transaction([
            this.prisma.riskSimulationAction.deleteMany({ where: { targetControlSimId: controlId } }),
            this.prisma.riskSimulationControl.delete({ where: { id: controlId } }),
            this.prisma.riskSimulationScenario.update({ where: { id: scenarioId }, data: { contentVersion: { increment: 1 } } }),
        ]);
        await this.prisma.auditLog.create({
            data: { userId, action: 'DELETE', entityType: 'RiskSimulationControl', entityId: controlId, oldValue: existing },
        });
        return { deleted: true };
    }

    async redistributeWeights(scenarioId: string, weights: Record<string, number>, userId: string) {
        const controls = await this.prisma.riskSimulationControl.findMany({ where: { scenarioId } });
        const ids = new Set(controls.map(c => c.id));
        for (const id of Object.keys(weights)) {
            if (!ids.has(id)) throw new BadRequestException(`Geçersiz kontrol id: ${id}`);
        }
        const oldValue = controls.map(c => ({ id: c.id, weight: c.weight }));
        await this.prisma.$transaction([
            ...Object.entries(weights).map(([id, weight]) => this.prisma.riskSimulationControl.update({ where: { id }, data: { weight } })),
            this.prisma.riskSimulationScenario.update({ where: { id: scenarioId }, data: { contentVersion: { increment: 1 } } }),
        ]);
        await this.prisma.auditLog.create({
            data: { userId, action: 'REDISTRIBUTE_WEIGHTS', entityType: 'RiskSimulationScenario', entityId: scenarioId, oldValue, newValue: weights },
        });
        return this.getScenario(scenarioId);
    }

    // ─── Actions ───────────────────────────────────────────────────────────

    async addAction(scenarioId: string, dto: CreateScenarioActionDto, userId: string) {
        await this.assertScenarioExists(scenarioId);
        const control = await this.prisma.riskSimulationControl.findFirst({ where: { id: dto.targetControlSimId, scenarioId } });
        if (!control) throw new BadRequestException('Geçersiz hedef kontrol: senaryoda böyle bir kontrol yok');
        if (dto.effectMode === 'TARGET_KEP' && !dto.targetKepReason) {
            throw new BadRequestException('Hedef KEP girişleri için gerekçe zorunludur.');
        }
        const action = await this.prisma.riskSimulationAction.create({ data: { scenarioId, ...dto } });
        await this.prisma.riskSimulationScenario.update({ where: { id: scenarioId }, data: { contentVersion: { increment: 1 } } });
        await this.prisma.auditLog.create({
            data: { userId, action: 'CREATE', entityType: 'RiskSimulationAction', entityId: action.id, newValue: action },
        });
        return action;
    }

    async updateAction(scenarioId: string, actionId: string, dto: UpdateScenarioActionDto, userId: string) {
        const existing = await this.prisma.riskSimulationAction.findFirst({ where: { id: actionId, scenarioId } });
        if (!existing) throw new NotFoundException('Senaryo aksiyonu bulunamadı');
        const updated = await this.prisma.riskSimulationAction.update({ where: { id: actionId }, data: dto });
        await this.prisma.riskSimulationScenario.update({ where: { id: scenarioId }, data: { contentVersion: { increment: 1 } } });
        await this.prisma.auditLog.create({
            data: { userId, action: 'UPDATE', entityType: 'RiskSimulationAction', entityId: actionId, oldValue: existing, newValue: updated },
        });
        return updated;
    }

    async toggleAction(scenarioId: string, actionId: string, isApplied: boolean, userId: string) {
        const existing = await this.prisma.riskSimulationAction.findFirst({ where: { id: actionId, scenarioId } });
        if (!existing) throw new NotFoundException('Senaryo aksiyonu bulunamadı');
        const updated = await this.prisma.riskSimulationAction.update({ where: { id: actionId }, data: { isApplied } });
        await this.prisma.riskSimulationScenario.update({ where: { id: scenarioId }, data: { contentVersion: { increment: 1 } } });
        await this.prisma.auditLog.create({
            data: { userId, action: isApplied ? 'APPLY' : 'UNAPPLY', entityType: 'RiskSimulationAction', entityId: actionId },
        });
        return updated;
    }

    async removeAction(scenarioId: string, actionId: string, userId: string) {
        const existing = await this.prisma.riskSimulationAction.findFirst({ where: { id: actionId, scenarioId } });
        if (!existing) throw new NotFoundException('Senaryo aksiyonu bulunamadı');
        await this.prisma.$transaction([
            this.prisma.riskSimulationAction.delete({ where: { id: actionId } }),
            this.prisma.riskSimulationScenario.update({ where: { id: scenarioId }, data: { contentVersion: { increment: 1 } } }),
        ]);
        await this.prisma.auditLog.create({
            data: { userId, action: 'DELETE', entityType: 'RiskSimulationAction', entityId: actionId, oldValue: existing },
        });
        return { deleted: true };
    }

    // ─── Hesaplama (canlı önizleme VE kayıt/aktarım sırasında yeniden hesaplama) ──

    async calculate(scenarioId: string): Promise<ScenarioCalcResult> {
        const scenario = await this.getScenario(scenarioId);
        const cfg = scenario.methodology.config as unknown as MethodologyConfig;
        const controls = scenario.controls.map(toControlInput);
        const actions = scenario.actions.map(toActionInput);
        const residualOverride = scenario.residualIsOverridden && scenario.residualOverrideProbability != null && scenario.residualOverrideImpact != null
            ? { probability: scenario.residualOverrideProbability, impact: scenario.residualOverrideImpact, reason: scenario.residualOverrideReason ?? '' }
            : null;
        return calculateScenario({
            cfg,
            naturalProbability: scenario.naturalProbability,
            businessImpactInputs: {
                financial: scenario.finansalEtki, reputation: scenario.itibarEtkisi,
                regulatory: scenario.regulasyonEtkisi, customer: scenario.musteriEtkisi,
            },
            infosecImpactInputs: {
                confidentiality: scenario.gizlilikEtkisi, integrity: scenario.butunlukEtkisi, availability: scenario.erisilebilirlikEtkisi,
            },
            finalImpactChoice: scenario.finalImpactChoice as 'BUSINESS' | 'INFOSEC',
            controls, actions, residualOverride,
        });
    }

    async compare(scenarioIdA: string, scenarioIdB: string) {
        const [a, b] = await Promise.all([this.getScenario(scenarioIdA), this.getScenario(scenarioIdB)]);
        const [calcA, calcB] = await Promise.all([this.calculate(scenarioIdA), this.calculate(scenarioIdB)]);
        return { a: { scenario: a, result: calcA }, b: { scenario: b, result: calcB } };
    }
}
