import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AuditsService } from '../audits/audits.service';
import { nextCounterValue, formatRecordId } from '../../common/util/sequential-id';
import { RiskSimulationService } from './risk-simulation.service';
import type { TransferDto } from './dto';

function severityFromRiskLevel(level: string | undefined | null): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    switch (level) {
        case 'Çok Yüksek': return 'CRITICAL';
        case 'Yüksek': return 'HIGH';
        case 'Orta': return 'MEDIUM';
        default: return 'LOW';
    }
}

/** Simülasyonun P1/P2'sinden gerçek Control alanlarına EN-YAKIN-EŞLEME öneri —
 * kesin/onaylı bir dönüşüm değil, yalnızca kullanıcının başlangıç noktası.
 * P1→automation kayıpsız (3'e 3 birebir). P2→nature KAYIPLI: ControlNature'da
 * yalnızca PREVENTIVE/DETECTIVE var, "Düzeltici" (DUZELTICI) karşılığı YOK —
 * bu durumda natureIsApproximate:true ile açıkça işaretlenir, kullanıcı onaylamalı. */
function suggestControlMapping(p1: string, p2: string): { automation: 'MANUAL' | 'AUTOMATED' | 'SEMI_AUTOMATED'; nature: 'PREVENTIVE' | 'DETECTIVE'; natureIsApproximate: boolean } {
    const automation = p1 === 'OTOMATIK' ? 'AUTOMATED' : p1 === 'BT_MANUEL' ? 'SEMI_AUTOMATED' : 'MANUAL';
    if (p2 === 'ONLEYICI') return { automation, nature: 'PREVENTIVE', natureIsApproximate: false };
    if (p2 === 'TESPIT_EDICI') return { automation, nature: 'DETECTIVE', natureIsApproximate: false };
    return { automation, nature: 'DETECTIVE', natureIsApproximate: true }; // DUZELTICI — karşılığı yok, en yakın DETECTIVE önerilir
}

export interface TransferPreviewRow {
    kind: string;
    classification: 'CREATE' | 'UPDATE' | 'LINK_EXISTS' | 'REMOVE' | 'SKIP';
    label: string;
    reason?: string;
    fields?: { field: string; oldValue: unknown; newValue: unknown }[];
    refId?: string; // ilgili scenario-yerel id (control/action)
    /** Yalnızca CONTROL/SKIP satırlarında: kullanıcı isterse bu kontrolü de gerçek
     * envantere eklemeyi seçebilir (opt-in) — bkz. NewControlAssignmentDto. */
    optInAvailable?: boolean;
    suggestedMapping?: { automation: string; nature: string; natureIsApproximate: boolean };
}

@Injectable()
export class TransferService {
    constructor(
        private prisma: PrismaService,
        private simService: RiskSimulationService,
        private auditsService: AuditsService,
    ) { }

    /**
     * Aktarım için tam sınıflandırma — YAZMAZ. `blocked=true` ise `apply()`
     * çağrılamaz (kullanıcı önce engelleyen durumu çözmeli: çakışan aksiyon,
     * %100'ü aşan ağırlık, bayat kaynak snapshot'ı).
     */
    async preview(scenarioId: string) {
        const scenario = await this.simService.getScenario(scenarioId);
        const calc = await this.simService.calculate(scenarioId);

        const blockReasons: string[] = [];
        let needsResidualConfirmation = false;
        if (calc.target.conflicts.length > 0) {
            blockReasons.push(`${calc.target.conflicts.length} çözülmemiş aksiyon çakışması var — aktarım öncesi senaryoda çözülmeli.`);
        }
        if (calc.weightCheck.isOverAllocated) {
            blockReasons.push(`Kontrol ağırlıkları toplamı %100'ü aşıyor (${(calc.weightCheck.totalWeight * 100).toFixed(1)}%).`);
        }

        const rows: TransferPreviewRow[] = [];

        // ── Risk ──
        let riskRow: TransferPreviewRow;
        let liveRisk: any = null;
        if (scenario.sourceType === 'EXISTING_RISK' && scenario.sourceRiskId) {
            liveRisk = await this.prisma.risk.findUnique({ where: { id: scenario.sourceRiskId } });
            if (!liveRisk) {
                blockReasons.push('Kaynak risk artık gerçek envanterde bulunamıyor.');
                riskRow = { kind: 'RISK', classification: 'SKIP', label: 'Kaynak risk bulunamadı', reason: 'Silinmiş olabilir.' };
            } else if (liveRisk.version !== scenario.sourceCapturedVersion) {
                blockReasons.push(`Kaynak risk aktarım önizlemesinden sonra değişmiş (v${scenario.sourceCapturedVersion} → v${liveRisk.version}) — "Envanterden Yenile" ile yeniden önizleyin.`);
                riskRow = { kind: 'RISK', classification: 'SKIP', label: 'Kaynak risk bayat (stale)', reason: 'Yeniden önizleme gerekli.' };
            } else {
                const newResidual = calc.residual;
                const residualWouldChange = newResidual.probability !== null &&
                    (liveRisk.residualProbability !== newResidual.probability || liveRisk.residualImpact !== newResidual.impact);
                const residualAlreadySet = liveRisk.residualProbability !== null && liveRisk.residualImpact !== null;
                const fields = [
                    { field: 'inherentProbability', oldValue: liveRisk.inherentProbability, newValue: scenario.naturalProbability },
                    { field: 'inherentImpact', oldValue: liveRisk.inherentImpact, newValue: calc.finalImpactTier },
                    { field: 'residualProbability', oldValue: liveRisk.residualProbability, newValue: newResidual.probability },
                    { field: 'residualImpact', oldValue: liveRisk.residualImpact, newValue: newResidual.impact },
                ];
                riskRow = {
                    kind: 'RISK', classification: 'UPDATE', label: `Gerçek risk güncellenecek: ${liveRisk.riskId}`,
                    fields,
                    refId: liveRisk.id,
                    reason: residualAlreadySet && residualWouldChange
                        ? 'UYARI: Bu riskin zaten onaylı bir artık risk değeri var — aktarım bunu değiştirecek, açık onay gerektirir (apply çağrısında confirmResidualOverwrite:true).'
                        : undefined,
                };
                if (residualAlreadySet && residualWouldChange) needsResidualConfirmation = true;
            }
        } else {
            riskRow = {
                kind: 'RISK', classification: 'CREATE', label: 'Yeni gerçek risk oluşturulacak',
                fields: [
                    { field: 'inherentProbability', oldValue: null, newValue: scenario.naturalProbability },
                    { field: 'inherentImpact', oldValue: null, newValue: calc.finalImpactTier },
                    { field: 'residualProbability', oldValue: null, newValue: calc.residual.probability },
                    { field: 'residualImpact', oldValue: null, newValue: calc.residual.impact },
                ],
            };
        }
        rows.push(riskRow);

        // ── Kontrol-Risk bağlantıları ──
        const transferableControlIds = new Set<string>();
        for (const c of scenario.controls) {
            if (!c.sourceControlId) {
                const suggestedMapping = suggestControlMapping(c.p1, c.p2);
                rows.push({
                    kind: 'CONTROL', classification: 'SKIP', refId: c.id,
                    label: `"${c.name}" gerçek envantere aktarılmayacak (isterseniz ekleyebilirsiniz)`,
                    reason: suggestedMapping.natureIsApproximate
                        ? 'Bu kontrolün P2 değeri "Düzeltici" — gerçek Control şemasındaki İşlev (ControlNature) alanında karşılığı yok, en yakın öneri "Tespit Edici". Eklemek isterseniz bu alanı gözden geçirip onaylamalısınız.'
                        : 'Varsayılan olarak aktarılmaz (yalnızca simülasyonda kalır) — isterseniz aşağıdaki alanları doldurup gerçek envantere de ekleyebilirsiniz.',
                    optInAvailable: true,
                    suggestedMapping,
                });
                continue;
            }
            transferableControlIds.add(c.sourceControlId);
            const existingMapping = liveRisk
                ? await this.prisma.controlRiskMapping.findUnique({ where: { controlId_riskId: { controlId: c.sourceControlId, riskId: liveRisk.id } } })
                : null;
            rows.push({
                kind: 'CONTROL_MAPPING', classification: existingMapping ? 'LINK_EXISTS' : 'CREATE', refId: c.id,
                label: existingMapping ? `"${c.name}" bağlantısı zaten mevcut` : `"${c.name}" için risk-kontrol bağlantısı oluşturulacak`,
            });
        }
        if (scenario.sourceType === 'EXISTING_RISK' && scenario.sourceRiskSnapshot) {
            const originalControlIds: string[] = ((scenario.sourceRiskSnapshot as any).controls ?? []).map((c: any) => c.controlId);
            for (const origId of originalControlIds) {
                if (!transferableControlIds.has(origId)) {
                    rows.push({
                        kind: 'CONTROL_MAPPING', classification: 'REMOVE', refId: origId,
                        label: `Kontrol bağlantısı kaldırılacak (senaryoda çıkarılmış): ${origId}`,
                    });
                }
            }
        }

        // ── Aksiyonlar ──
        const controlById = new Map(scenario.controls.map(c => [c.id, c]));
        for (const a of scenario.actions) {
            const targetControl = controlById.get(a.targetControlSimId);
            if (!a.isApplied) {
                rows.push({ kind: 'ACTION', classification: 'SKIP', refId: a.id, label: `"${a.name}" aktarılmayacak`, reason: 'Senaryoda uygulanmamış (isApplied=false).' });
                continue;
            }
            if (a.sourceActionId) {
                rows.push({ kind: 'ACTION', classification: 'LINK_EXISTS', refId: a.id, label: `"${a.name}" zaten gerçek bir aksiyona bağlı`, reason: 'Yeniden oluşturulmayacak.' });
                continue;
            }
            if (!targetControl?.sourceControlId) {
                rows.push({ kind: 'ACTION', classification: 'SKIP', refId: a.id, label: `"${a.name}" aktarılmayacak`, reason: 'Hedef kontrol gerçek envanterde yok (yukarıdaki CONTROL SKIP nedeniyle).' });
                continue;
            }
            rows.push({
                kind: 'ACTION', classification: 'CREATE', refId: a.id,
                label: `Yeni gerçek aksiyon oluşturulacak: "${a.name}" (BEKLIYOR durumunda — asla tamamlanmış olarak aktarılmaz)`,
                reason: 'Sorumlu (ownerId) ve termin (dueDate) apply çağrısında actionAssignments ile sağlanmalı.',
            });
        }

        return {
            blocked: blockReasons.length > 0,
            blockReasons,
            needsResidualConfirmation,
            scenarioContentVersion: scenario.contentVersion,
            rows,
            calculation: calc,
        };
    }

    async apply(scenarioId: string, dto: TransferDto, userId: string) {
        const scenario = await this.simService.getScenario(scenarioId);
        if (dto.expectedContentVersion !== scenario.contentVersion) {
            throw new ConflictException({
                message: 'Senaryo, önizlemeden sonra değişti. Yeniden önizleme (preview) alıp tekrar deneyin.',
                currentVersion: scenario.contentVersion,
            });
        }

        // İdempotency: aynı senaryo+sürüm için tekrarlanan/eşzamanlı istek mevcut
        // kaydı döner — mükerrer gerçek kayıt asla oluşturmaz.
        const existingTransfer = await this.prisma.riskSimulationTransfer.findUnique({
            where: { scenarioId_scenarioVersionAtTransfer: { scenarioId, scenarioVersionAtTransfer: scenario.contentVersion } },
        });
        if (existingTransfer) return existingTransfer;

        const preview = await this.preview(scenarioId);
        if (preview.blocked) {
            throw new BadRequestException({ message: 'Aktarım engellendi — önce aşağıdaki durumlar çözülmeli.', reasons: preview.blockReasons });
        }
        if (preview.needsResidualConfirmation && !dto.confirmResidualOverwrite) {
            throw new BadRequestException({
                message: 'Hedef riskin zaten onaylı bir artık risk değeri var. Devam etmek için confirmResidualOverwrite:true göndermelisiniz.',
                requiresConfirmation: 'confirmResidualOverwrite',
            });
        }
        const calc = preview.calculation;

        try {
            return await this.prisma.$transaction(async (tx) => {
                const resultSummary: Record<string, unknown> = {
                    createdRiskId: null, updatedRiskId: null,
                    createdMappingIds: [] as string[], removedMappingCount: 0,
                    createdControlIds: [] as string[],
                    createdActionIds: [] as string[], createdFindingIds: [] as string[],
                };

                // ── Risk ──
                let riskId: string;
                const riskRow = preview.rows.find(r => r.kind === 'RISK')!;
                if (riskRow.classification === 'UPDATE') {
                    const liveRisk = await tx.risk.findUnique({ where: { id: scenario.sourceRiskId! } });
                    if (!liveRisk) throw new BadRequestException('Kaynak risk aktarım sırasında bulunamadı.');
                    const updated = await tx.risk.update({
                        where: { id: liveRisk.id },
                        data: {
                            inherentProbability: scenario.naturalProbability,
                            inherentImpact: calc.finalImpactTier ?? liveRisk.inherentImpact,
                            inherentRiskScore: scenario.naturalProbability * (calc.finalImpactTier ?? liveRisk.inherentImpact),
                            ...(calc.residual.probability !== null ? {
                                residualProbability: calc.residual.probability,
                                residualImpact: calc.residual.impact,
                                residualRiskScore: calc.residual.risk,
                            } : {}),
                            version: { increment: 1 },
                        },
                    });
                    riskId = updated.id;
                    resultSummary.updatedRiskId = riskId;
                    await tx.riskHistory.create({
                        data: { riskId, version: updated.version, changeType: 'RISK_SIMULATION_TRANSFER', changeData: updated as any, changedBy: userId },
                    });
                    await tx.auditLog.create({
                        data: { userId, action: 'UPDATE', entityType: 'Risk', entityId: riskId, oldValue: liveRisk as any, newValue: updated as any },
                    });
                } else {
                    if (!dto.newRisk) throw new BadRequestException('Yeni risk oluşturmak için newRisk alanları (name, description, categoryId, ownerId) zorunludur.');
                    const category = await tx.riskCategory.findUnique({ where: { id: dto.newRisk.categoryId } });
                    if (!category) throw new BadRequestException('Geçersiz kategori: seçilen risk kategorisi bulunamadı');
                    const owner = await tx.user.findUnique({ where: { id: dto.newRisk.ownerId } });
                    if (!owner) throw new BadRequestException('Geçersiz kullanıcı: seçilen risk sorumlusu bulunamadı');
                    const riskId2 = formatRecordId('R', await nextCounterValue(tx as any, 'risk'));
                    const inherentImpact = calc.finalImpactTier ?? 1;
                    const created = await tx.risk.create({
                        data: {
                            riskId: riskId2, name: dto.newRisk.name, description: dto.newRisk.description,
                            categoryId: dto.newRisk.categoryId, ownerId: dto.newRisk.ownerId,
                            inherentProbability: scenario.naturalProbability, inherentImpact,
                            inherentRiskScore: scenario.naturalProbability * inherentImpact,
                            ...(calc.residual.probability !== null ? {
                                residualProbability: calc.residual.probability,
                                residualImpact: calc.residual.impact,
                                residualRiskScore: calc.residual.risk,
                            } : {}),
                        },
                    });
                    riskId = created.id;
                    resultSummary.createdRiskId = riskId;
                    await tx.riskHistory.create({
                        data: { riskId, version: 1, changeType: 'RISK_SIMULATION_TRANSFER', changeData: created as any, changedBy: userId },
                    });
                    await tx.auditLog.create({
                        data: { userId, action: 'CREATE', entityType: 'Risk', entityId: riskId, newValue: created as any },
                    });
                }

                // ── Kontrol-Risk bağlantıları ──
                for (const row of preview.rows.filter(r => r.kind === 'CONTROL_MAPPING')) {
                    const control = scenario.controls.find(c => c.id === row.refId);
                    if (row.classification === 'CREATE' && control?.sourceControlId) {
                        const mapping = await tx.controlRiskMapping.upsert({
                            where: { controlId_riskId: { controlId: control.sourceControlId, riskId } },
                            update: {}, create: { controlId: control.sourceControlId, riskId, mappingType: 'PRIMARY' },
                        });
                        (resultSummary.createdMappingIds as string[]).push(mapping.id);
                        await tx.auditLog.create({
                            data: { userId, action: 'CREATE', entityType: 'ControlRiskMapping', entityId: mapping.id, newValue: mapping as any },
                        });
                    } else if (row.classification === 'REMOVE' && row.refId) {
                        await tx.controlRiskMapping.deleteMany({ where: { controlId: row.refId, riskId } });
                        resultSummary.removedMappingCount = (resultSummary.removedMappingCount as number) + 1;
                        await tx.auditLog.create({
                            data: { userId, action: 'REMOVE_CONTROL_RISK_MAPPING', entityType: 'ControlRiskMapping', entityId: `${row.refId}:${riskId}` },
                        });
                    }
                }

                // ── Kullanıcının açıkça seçtiği (opt-in) yeni gerçek kontroller ──
                // Yalnızca dto.newControlAssignments'ta AÇIKÇA listelenen hipotetik
                // kontroller gerçek envantere eklenir — geri kalanı SKIP olarak kalır.
                if (dto.newControlAssignments && dto.newControlAssignments.length > 0) {
                    // K-YYYY-XXXX: controls.service.ts::generateControlId ile AYNI legacy
                    // (findFirst tabanlı) şema — Finding/Action'da yaşanan RecordCounter
                    // senkron-dışı kalma sorununu tekrarlamamak için burada da tx içinde
                    // tek seferde okunup bellekte artırılıyor (control-scope.service.ts
                    // deseniyle aynı gerekçe).
                    const controlYear = new Date().getFullYear();
                    const controlPrefix = `K-${controlYear}-`;
                    const lastControl = await tx.control.findFirst({
                        where: { controlId: { startsWith: controlPrefix } }, orderBy: { controlId: 'desc' }, select: { controlId: true },
                    });
                    let nextControlSeq = 1;
                    if (lastControl) {
                        const n = parseInt(lastControl.controlId.split('-')[2], 10);
                        if (!isNaN(n)) nextControlSeq = n + 1;
                    }

                    for (const assignment of dto.newControlAssignments) {
                        const simControl = scenario.controls.find(c => c.id === assignment.scenarioControlId);
                        if (!simControl) throw new BadRequestException(`Geçersiz kontrol: senaryoda "${assignment.scenarioControlId}" id'li kontrol yok.`);
                        if (simControl.sourceControlId) throw new BadRequestException(`"${simControl.name}" zaten gerçek envanterden — yeniden oluşturulamaz.`);
                        const owner = await tx.user.findUnique({ where: { id: assignment.ownerId } });
                        if (!owner) throw new BadRequestException('Geçersiz kullanıcı: kontrol sorumlusu bulunamadı');
                        if (assignment.directorateId) {
                            const dir = await tx.directorate.findUnique({ where: { id: assignment.directorateId } });
                            if (!dir) throw new BadRequestException('Geçersiz direktörlük: seçilen direktörlük bulunamadı');
                        }

                        const controlId = `${controlPrefix}${(nextControlSeq++).toString().padStart(4, '0')}`;
                        const createdControl = await tx.control.create({
                            data: {
                                controlId, name: simControl.name,
                                description: simControl.description || `Risk Simülasyonu aktarımı — "${scenario.name}" senaryosundan aktarıldı.`,
                                type: assignment.type, nature: assignment.nature, automation: assignment.automation, frequency: assignment.frequency,
                                ownerId: assignment.ownerId, directorateId: assignment.directorateId ?? null,
                                status: 'ACTIVE', selectedMonths: [],
                            },
                        });
                        (resultSummary.createdControlIds as string[]).push(createdControl.id);
                        await tx.auditLog.create({
                            data: { userId, action: 'CREATE', entityType: 'Control', entityId: createdControl.id, newValue: createdControl as any },
                        });

                        const mapping = await tx.controlRiskMapping.upsert({
                            where: { controlId_riskId: { controlId: createdControl.id, riskId } },
                            update: {}, create: { controlId: createdControl.id, riskId, mappingType: 'PRIMARY' },
                        });
                        (resultSummary.createdMappingIds as string[]).push(mapping.id);
                        await tx.auditLog.create({
                            data: { userId, action: 'CREATE', entityType: 'ControlRiskMapping', entityId: mapping.id, newValue: mapping as any },
                        });
                    }
                }

                // ── Aksiyonlar ──
                // Finding.findingId (B-YYYY-NNNN) hâlâ audits.service.ts::createFinding'in
                // LEGACY findFirst-tabanlı sırasıyla üretiliyor (RecordCounter'a henüz
                // taşınmadı) — burada nextCounterValue('finding') kullanmak, mevcut
                // seed/legacy kayıtlarla ÇAKIŞIR (aynı B-2026-0001 tekrar üretilir).
                // Bu yüzden AYNI legacy şema (prefix + findFirst) tx içinde, tek seferde
                // okunup bellekte artırılarak kullanılıyor (control-scope.service.ts'teki
                // testNo deseniyle aynı gerekçe: tx içi ardışık findFirst aynı değeri döner).
                const findingYear = new Date().getFullYear();
                const findingPrefix = `B-${findingYear}-`;
                const lastFinding = await tx.finding.findFirst({
                    where: { findingId: { startsWith: findingPrefix } }, orderBy: { findingId: 'desc' }, select: { findingId: true },
                });
                let nextFindingSeq = 1;
                if (lastFinding) {
                    const n = parseInt(lastFinding.findingId.split('-')[2], 10);
                    if (!isNaN(n)) nextFindingSeq = n + 1;
                }

                const assignmentByActionId = new Map((dto.actionAssignments ?? []).map(a => [a.scenarioActionId, a]));
                for (const row of preview.rows.filter(r => r.kind === 'ACTION' && r.classification === 'CREATE')) {
                    const simAction = scenario.actions.find(a => a.id === row.refId)!;
                    const assignment = assignmentByActionId.get(simAction.id);
                    if (!assignment) throw new BadRequestException(`"${simAction.name}" aksiyonu için actionAssignments içinde sorumlu/termin bulunamadı.`);
                    const owner = await tx.user.findUnique({ where: { id: assignment.ownerId } });
                    if (!owner) throw new BadRequestException('Geçersiz kullanıcı: aksiyon sorumlusu bulunamadı');
                    const targetControl = scenario.controls.find(c => c.id === simAction.targetControlSimId)!;

                    const findingId = `${findingPrefix}${(nextFindingSeq++).toString().padStart(4, '0')}`;
                    const finding = await tx.finding.create({
                        data: {
                            findingId,
                            description: `Risk Simülasyonu aktarımı — "${scenario.name}" senaryosundan aktarılan aksiyon için otomatik oluşturuldu.`,
                            impact: simAction.description || 'Simülasyon senaryosunda tanımlanan hipotetik aksiyonun gerçek envantere aktarımı.',
                            severity: severityFromRiskLevel(calc.residual.level?.label),
                            riskId, controlId: targetControl.sourceControlId,
                            source: 'OTHER',
                            workflowStatus: 'TASLAK', resolutionStatus: 'DEVAM_EDIYOR',
                        },
                    });
                    (resultSummary.createdFindingIds as string[]).push(finding.id);

                    const action = await this.auditsService.createAction(
                        finding.id,
                        { description: simAction.name + (simAction.description ? ` — ${simAction.description}` : ''), ownerId: assignment.ownerId, dueDate: assignment.dueDate, status: 'BEKLIYOR' },
                        userId,
                        tx as any,
                    );
                    (resultSummary.createdActionIds as string[]).push(action.id);
                }

                const transferId = formatRecordId('TRF', await nextCounterValue(tx as any, 'risk-simulation-transfer'));
                const transfer = await tx.riskSimulationTransfer.create({
                    data: {
                        scenarioId, transferId, scenarioVersionAtTransfer: scenario.contentVersion,
                        performedById: userId, resultSummary: resultSummary as any,
                    },
                });

                await tx.auditLog.create({
                    data: { userId, action: 'TRANSFER', entityType: 'RiskSimulationScenario', entityId: scenarioId, newValue: { transferId, resultSummary } as any },
                });

                return transfer;
            });
        } catch (e: any) {
            if (e?.code === 'P2002') {
                // Eşzamanlı ikinci istek aynı anda aynı transferi yazmaya çalıştı — mevcut kaydı döndür.
                const existing = await this.prisma.riskSimulationTransfer.findUnique({
                    where: { scenarioId_scenarioVersionAtTransfer: { scenarioId, scenarioVersionAtTransfer: scenario.contentVersion } },
                });
                if (existing) return existing;
            }
            throw e;
        }
    }
}
