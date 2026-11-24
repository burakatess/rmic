import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { nextCounterValue, formatRecordId } from '../../common/util/sequential-id';
import { computeRiskScores } from '../risks/risk-scoring.util';
import { getBkpLevel, type MethodologyConfig } from './calculation-engine';
import { calculateScenarioRow } from './risk-simulation.service';
import { matchPOptions, P_LABELS } from './p-option-match';

/**
 * Çalışma alanından envantere aktarım (iki aşamalı).
 *  1. Talep: Risk Yönetimi'ni gören herkes önizlemeyle talep oluşturur (yazma yok).
 *  2. Onay: Risk ve Kontrol Yöneticisi / Sistem Yöneticisi onaylayınca talepteki değerler
 *     Risk Envanteri ve Kontrol Alanı'na yazılır. Talep eden kendi talebini onaylayamaz.
 *
 * Risk'e yazılanlar: etki boyutları, olasılık, Flag for IT (doğal risk ENVANTERİN kendi
 * formülüyle yeniden hesaplanır) + simülasyonun bütünleşik kontrol ve kalıntı risk sonucu.
 * Kontrol Alanı: bağlı kontrollerin P1–P5 metinleri, tanımı ve statüsü güncellenir;
 * simülasyonda eklenen kontroller oluşturulup riske bağlanır; simülasyonda silinen (başlangıçta
 * bağlı olan) kontrollerin risk bağlantısı kaldırılır. KTS ve ağırlık Kontrol Alanı'nda
 * bulunmadığından yazılmaz.
 */

const RISK_FIELD_LABELS: Record<string, string> = {
    flagForIT: 'Flag for IT', finansalEtki: 'Finansal etki', itibarEtkisi: 'İtibar etkisi', regulasyonEtkisi: 'Regülasyon etkisi',
    musteriEtkisi: 'Müşteri etkisi', gizlilikEtkisi: 'Gizlilik etkisi', butunlukEtkisi: 'Bütünlük etkisi', erisilebilirlikEtkisi: 'Erişilebilirlik etkisi',
    olasilik: 'Olasılık', etki: 'Etki (envanter formülü)', dogalRiskPuani: 'Doğal risk puanı', dogalRiskSkoru: 'Doğal risk skoru', dogalRiskSeviyesi: 'Doğal risk seviyesi',
    butunlesikKontrolPuani: 'Bütünleşik kontrol puanı', butunlesikKontrolSkoru: 'Bütünleşik kontrol skoru', butunlesikKontrolSeviyesi: 'Bütünleşik kontrol seviyesi',
    kalintiRiskPuani: 'Kalıntı risk puanı', kalintiRiskSkoru: 'Kalıntı risk skoru', kalintiRiskSeviyesi: 'Kalıntı risk seviyesi',
};
const CONTROL_FIELD_LABELS: Record<string, string> = {
    kontrolTanimi: 'Kontrol tanımı', kontrolIslevi: 'Kontrol işlevi (P1)', kontrolTuru: 'Kontrol türü (P2)', kontrolIsletimeSekli: 'İşletilme şekli (P3)',
    kontrolIsletimDenetimi: 'İşletimin denetimi (P4)', kontrolIsletimRaporlama: 'İşletimin raporlanması (P5)', status: 'Statü',
};
/** Simülasyon seviyesi → envanter seviyesi (envanter 4 kademe kullanır). */
const INVENTORY_LEVEL: Record<string, string> = { 'Çok Yüksek': 'KRİTİK', 'Yüksek': 'YÜKSEK', 'Orta': 'ORTA', 'Düşük': 'DÜŞÜK', 'Çok Düşük': 'DÜŞÜK' };
/** Kontrol Alanı seçenekleri: İşlev = Manuel / Otomatik / Yarı Otomatik; Tür = Önleyici / Düzeltici / Tespit Edici. */
const P1_TO_ISLEV: Record<string, string> = { MANUEL: 'Manuel', BT_MANUEL: 'Yarı Otomatik', OTOMATIK: 'Otomatik' };

const r2 = (x: number) => Math.round(x * 100) / 100;
const same = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : (a ?? null) === (b ?? null));

type FieldDiff = { field: string; label: string; before: unknown; after: unknown };
type ControlPlan =
    | { action: 'UPDATE'; simControlId: string; riskControlId: string; kontrolId: string; liveUpdatedAt: string; fields: FieldDiff[]; data: Record<string, unknown>; warning?: string }
    | { action: 'CREATE'; simControlId: string; name: string; data: Record<string, unknown> }
    | { action: 'UNLINK'; riskControlId: string; kontrolId: string };
export interface TransferRow {
    scenarioId: string; riskDbId: string; riskId: string; riskName: string; liveVersion: number;
    fields: FieldDiff[]; riskData: Record<string, unknown>; controls: ControlPlan[]; warnings: string[]; hasChanges: boolean;
}

@Injectable()
export class WorkspaceTransferService {
    constructor(private prisma: PrismaService) { }

    async preview(simulationId: string, scenarioIds?: string[]) {
        const sim = await this.prisma.riskSimulation.findUnique({ where: { id: simulationId }, select: { id: true, simulationId: true, name: true, mode: true, isDraft: true } });
        if (!sim) throw new NotFoundException('Risk simülasyonu bulunamadı');
        if (sim.mode !== 'WORKSPACE') throw new BadRequestException('Envantere aktarım yalnız simülasyon çalışma alanından yapılabilir.');
        if (sim.isDraft) throw new BadRequestException('Envantere aktarmadan önce simülasyonu kaydedin.');
        const scenarios = await this.prisma.riskSimulationScenario.findMany({
            where: { simulationId, ...(scenarioIds?.length ? { id: { in: scenarioIds } } : {}) },
            include: { controls: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }, actions: true, methodology: true },
            orderBy: { name: 'asc' },
        });
        const riskIds = scenarios.map(s => s.sourceRiskId).filter((x): x is string => !!x);
        const risks = await this.prisma.risk.findMany({
            where: { id: { in: riskIds } },
            include: { riskControls: { include: { riskControl: { include: { _count: { select: { risks: true } } } } } } },
        });
        const riskMap = new Map(risks.map(r => [r.id, r]));
        const rows: TransferRow[] = [];
        const skipped: { scenarioId: string; riskId: string; reason: string }[] = [];

        for (const s of scenarios) {
            const snap = (s.sourceRiskSnapshot ?? {}) as any;
            const code = snap.riskId ?? s.name;
            const live = s.sourceRiskId ? riskMap.get(s.sourceRiskId) : undefined;
            if (!live) { skipped.push({ scenarioId: s.id, riskId: code, reason: s.sourceRiskId ? 'Risk envanterde artık yok.' : 'Envanterde karşılığı yok (Excel\'den gelen yeni risk).' }); continue; }
            const cfg = s.methodology.config as unknown as MethodologyConfig;
            const calc = calculateScenarioRow(s);
            const warnings: string[] = [];

            // ── Risk alanları ──
            const inputs = {
                flagForIT: s.finalImpactChoice === 'INFOSEC',
                finansalEtki: s.finansalEtki, itibarEtkisi: s.itibarEtkisi, regulasyonEtkisi: s.regulasyonEtkisi, musteriEtkisi: s.musteriEtkisi,
                gizlilikEtkisi: s.gizlilikEtkisi, butunlukEtkisi: s.butunlukEtkisi, erisilebilirlikEtkisi: s.erisilebilirlikEtkisi,
                olasilik: s.naturalProbability,
            };
            // Yalnız simülasyonda DEĞİŞTİRİLEN girdiler aktarılır (başlangıç durumuna göre). Envanterde
            // boş olup simülasyonun varsayılanla doldurduğu alanlar (ör. olasılık 3) kullanıcı değişikliği değildir.
            const init = (s.initialStateSnapshot ?? {}) as any;
            const initInputs: Record<string, unknown> = {
                flagForIT: init.finalImpactChoice === 'INFOSEC',
                finansalEtki: init.finansalEtki ?? null, itibarEtkisi: init.itibarEtkisi ?? null, regulasyonEtkisi: init.regulasyonEtkisi ?? null, musteriEtkisi: init.musteriEtkisi ?? null,
                gizlilikEtkisi: init.gizlilikEtkisi ?? null, butunlukEtkisi: init.butunlukEtkisi ?? null, erisilebilirlikEtkisi: init.erisilebilirlikEtkisi ?? null,
                olasilik: init.naturalProbability ?? null,
            };
            const changedInputs = Object.fromEntries(Object.entries(inputs).filter(([k, v]) => !same(initInputs[k], v)));
            const sig = (c: any) => [c.sourceRiskControlId ?? '', c.name, c.description ?? '', c.p1, c.p2, c.p3, c.p4, c.p5, c.isApproved !== false].join('|');
            // Aday tespiti KTS / ağırlık / etki alanını da kapsar (kalıntı sonucunu değiştirirler);
            // Kontrol Alanı'na yazılan alanlar ise yalnız `sig` ile karşılaştırılır.
            const sigAll = (c: any) => [sig(c), c.ktsManualValue ?? '', Math.round((c.weight ?? 0) * 10000), c.impactArea].join('|');
            const initialSigs = new Set<string>(((init.controls ?? []) as any[]).map(sig));
            const initialAll = new Set<string>(((init.controls ?? []) as any[]).map(sigAll));
            const currentAll = new Set<string>(s.controls.map(sigAll));
            const controlsChanged = initialAll.size !== currentAll.size || [...currentAll].some(x => !initialAll.has(x));
            if (!Object.keys(changedInputs).length && !controlsChanged) continue; // simülasyonda değiştirilmemiş risk aktarılmaz

            const riskData: Record<string, unknown> = { ...changedInputs };
            if (Object.keys(changedInputs).length) Object.assign(riskData, computeRiskScores({ ...live, ...changedInputs } as any)); // envanterin kendi formülü
            const bkp = calc.target.bkp.bkp;
            if (bkp !== null && calc.residual.risk !== null && calc.residual.level) {
                Object.assign(riskData, {
                    butunlesikKontrolPuani: r2(bkp), butunlesikKontrolSkoru: Math.round(bkp), butunlesikKontrolSeviyesi: getBkpLevel(bkp, cfg).label,
                    kalintiRiskPuani: calc.residual.risk, kalintiRiskSkoru: Math.round(calc.residual.risk), kalintiRiskSeviyesi: INVENTORY_LEVEL[calc.residual.level.label] ?? calc.residual.level.label,
                });
            } else {
                warnings.push('Bütünleşik kontrol / kalıntı risk hesaplanamıyor (etki boyutu eksik veya aktif kontrolün KTS değeri yok); bu alanlar yazılmaz.');
            }
            const fields = Object.entries(riskData)
                .filter(([k, v]) => !same((live as any)[k], v))
                .map(([k, v]) => ({ field: k, label: RISK_FIELD_LABELS[k] ?? k, before: (live as any)[k] ?? null, after: v }));
            const changedData = Object.fromEntries(fields.map(f => [f.field, f.after]));

            // ── Kontroller ──
            const liveLinks = new Map(live.riskControls.map(l => [l.riskControlId, l.riskControl]));
            const controls: ControlPlan[] = [];
            const keptIds = new Set<string>();
            for (const c of s.controls) {
                if (initialSigs.has(sig(c))) { if (c.sourceRiskControlId) keptIds.add(c.sourceRiskControlId); continue; } // değişmemiş kontrol
                const want = {
                    kontrolTanimi: c.description ?? c.name,
                    kontrolIslevi: P1_TO_ISLEV[c.p1], kontrolTuru: P_LABELS.p2[c.p2],
                    kontrolIsletimeSekli: P_LABELS.p3[c.p3], kontrolIsletimDenetimi: P_LABELS.p4[c.p4], kontrolIsletimRaporlama: P_LABELS.p5[c.p5],
                    status: c.isApproved ? 'AKTIF' : 'PASIF',
                };
                const rc = c.sourceRiskControlId ? liveLinks.get(c.sourceRiskControlId) : undefined;
                if (rc) {
                    keptIds.add(rc.id);
                    // P alanları anlam olarak karşılaştırılır: kayıtlı metin aynı seçeneğe eşleniyorsa yeniden yazılmaz.
                    const m = matchPOptions(rc);
                    const diffs: FieldDiff[] = [];
                    const check = (field: keyof typeof want, differs: boolean) => { if (differs) diffs.push({ field, label: CONTROL_FIELD_LABELS[field], before: (rc as any)[field] ?? null, after: want[field] }); };
                    check('kontrolTanimi', (rc.kontrolTanimi ?? '') !== want.kontrolTanimi);
                    check('kontrolIslevi', m.p1 !== c.p1 || !rc.kontrolIslevi);
                    check('kontrolTuru', m.p2 !== c.p2 || !rc.kontrolTuru);
                    check('kontrolIsletimeSekli', m.p3 !== c.p3 || !rc.kontrolIsletimeSekli);
                    check('kontrolIsletimDenetimi', m.p4 !== c.p4 || !rc.kontrolIsletimDenetimi);
                    check('kontrolIsletimRaporlama', m.p5 !== c.p5 || !rc.kontrolIsletimRaporlama);
                    check('status', rc.status !== want.status);
                    if (diffs.length) {
                        const others = rc._count.risks - 1;
                        controls.push({
                            action: 'UPDATE', simControlId: c.id, riskControlId: rc.id, kontrolId: rc.kontrolId, liveUpdatedAt: rc.updatedAt.toISOString(),
                            fields: diffs, data: Object.fromEntries(diffs.map(d => [d.field, d.after])),
                            ...(others > 0 ? { warning: `Bu kontrol ${others} başka riske de bağlı; değişiklik onları da etkiler.` } : {}),
                        });
                    }
                } else if (!c.sourceRiskControlId || !liveLinks.has(c.sourceRiskControlId)) {
                    controls.push({ action: 'CREATE', simControlId: c.id, name: c.name, data: { ...want, surec: live.surec, altSurec: live.altSurec, riskTanimi: live.description } });
                }
            }
            // Başlangıçta bağlı olup simülasyonda silinen kontrollerin bağlantısı kaldırılır.
            const initialIds = new Set(((s.initialStateSnapshot as any)?.controls ?? []).map((c: any) => c.sourceRiskControlId).filter(Boolean));
            for (const [id, rc] of liveLinks) {
                if (initialIds.has(id) && !keptIds.has(id) && !s.controls.some(c => c.sourceRiskControlId === id)) controls.push({ action: 'UNLINK', riskControlId: id, kontrolId: rc.kontrolId });
            }
            if (live.version !== s.sourceCapturedVersion) warnings.push(`Risk, simülasyon oluşturulduktan sonra envanterde değişmiş (v${s.sourceCapturedVersion} → v${live.version}); önizleme güncel envanter değerleriyle karşılaştırır.`);

            rows.push({
                scenarioId: s.id, riskDbId: live.id, riskId: live.riskId, riskName: live.name, liveVersion: live.version,
                fields, riskData: changedData, controls, warnings, hasChanges: fields.length > 0 || controls.length > 0,
            });
        }
        return { simulation: { id: sim.id, simulationId: sim.simulationId, name: sim.name }, rows, skipped };
    }

    async createRequest(simulationId: string, scenarioIds: string[], note: string | undefined, userId: string) {
        const pending = await this.prisma.riskSimulationTransferRequest.findFirst({ where: { simulationId, status: 'PENDING' }, select: { requestNo: true } });
        if (pending) throw new ConflictException(`Bu simülasyon için bekleyen bir aktarım talebi var (${pending.requestNo}). Önce sonuçlanmalı veya iptal edilmeli.`);
        const pv = await this.preview(simulationId, scenarioIds);
        const rows = pv.rows.filter(r => r.hasChanges);
        if (!rows.length) throw new BadRequestException('Seçilen risklerde envantere aktarılacak bir değişiklik yok.');
        const requestNo = formatRecordId('TRQ', await nextCounterValue(this.prisma, 'sim-transfer-request'));
        const req = await this.prisma.riskSimulationTransferRequest.create({
            data: {
                requestNo, simulationId, simulationLabel: `${pv.simulation.simulationId} · ${pv.simulation.name}`,
                scenarioIds: rows.map(r => r.scenarioId), preview: { rows, skipped: pv.skipped } as unknown as Prisma.InputJsonValue,
                note: note ?? null, requestedById: userId,
            },
        });
        await this.prisma.auditLog.create({
            data: { userId, action: 'SIM_TRANSFER_REQUEST', entityType: 'RiskSimulationTransferRequest', entityId: req.id, newValue: { requestNo, simulationId, risks: rows.map(r => r.riskId) } },
        });
        return req;
    }

    async list(status?: string) {
        return this.prisma.riskSimulationTransferRequest.findMany({
            where: status ? { status: status as any } : {},
            select: {
                id: true, requestNo: true, simulationId: true, simulationLabel: true, status: true, scenarioIds: true, note: true,
                requestedAt: true, decidedAt: true, decisionNote: true,
                requestedBy: { select: { id: true, firstName: true, lastName: true } }, decidedBy: { select: { firstName: true, lastName: true } },
            },
            orderBy: { requestedAt: 'desc' }, take: 200,
        });
    }

    async get(id: string) {
        const r = await this.prisma.riskSimulationTransferRequest.findUnique({
            where: { id },
            include: { requestedBy: { select: { id: true, firstName: true, lastName: true } }, decidedBy: { select: { firstName: true, lastName: true } } },
        });
        if (!r) throw new NotFoundException('Aktarım talebi bulunamadı');
        return r;
    }

    private async pendingOr404(id: string) {
        const r = await this.prisma.riskSimulationTransferRequest.findUnique({ where: { id } });
        if (!r) throw new NotFoundException('Aktarım talebi bulunamadı');
        if (r.status !== 'PENDING') throw new BadRequestException('Bu talep zaten sonuçlanmış.');
        return r;
    }

    async approve(id: string, note: string | undefined, userId: string) {
        const req = await this.pendingOr404(id);
        if (req.requestedById === userId) throw new ForbiddenException('Kendi aktarım talebinizi onaylayamazsınız.');
        const rows = ((req.preview as any)?.rows ?? []) as TransferRow[];
        const result = { risksUpdated: 0, controlsUpdated: 0, controlsCreated: 0, linksRemoved: 0 };
        await this.prisma.$transaction(async (tx) => {
            for (const row of rows) {
                const live = await tx.risk.findUnique({ where: { id: row.riskDbId } });
                if (!live) throw new ConflictException(`${row.riskId} envanterde bulunamadı; talebi reddedip yeniden oluşturun.`);
                if (live.version !== row.liveVersion) throw new ConflictException(`${row.riskId} talepten sonra envanterde değişti (v${row.liveVersion} → v${live.version}); talebi reddedip yeniden oluşturun.`);
                let newVersion = live.version;
                if (Object.keys(row.riskData).length) {
                    const updated = await tx.risk.update({ where: { id: live.id }, data: { ...(row.riskData as any), version: { increment: 1 } } });
                    newVersion = updated.version;
                    result.risksUpdated++;
                    await tx.auditLog.create({
                        data: { userId, action: 'UPDATE', entityType: 'Risk', entityId: live.id, oldValue: Object.fromEntries(row.fields.map(f => [f.field, f.before])) as Prisma.InputJsonValue, newValue: { ...row.riskData, source: req.requestNo } as Prisma.InputJsonValue },
                    });
                }
                for (const c of row.controls) {
                    if (c.action === 'UPDATE') {
                        const rc = await tx.riskControl.findUnique({ where: { id: c.riskControlId } });
                        if (!rc) throw new ConflictException(`${c.kontrolId} Kontrol Alanı'nda bulunamadı; talebi reddedip yeniden oluşturun.`);
                        if (rc.updatedAt.toISOString() !== c.liveUpdatedAt) throw new ConflictException(`${c.kontrolId} talepten sonra Kontrol Alanı'nda değişti; talebi reddedip yeniden oluşturun.`);
                        await tx.riskControl.update({ where: { id: rc.id }, data: c.data as any });
                        result.controlsUpdated++;
                        await tx.auditLog.create({ data: { userId, action: 'UPDATE', entityType: 'RiskControl', entityId: rc.id, oldValue: Object.fromEntries(c.fields.map(f => [f.field, f.before])) as Prisma.InputJsonValue, newValue: { ...c.data, source: req.requestNo } as Prisma.InputJsonValue } });
                    } else if (c.action === 'CREATE') {
                        const kontrolId = await this.uniqueKontrolId(tx);
                        const created = await tx.riskControl.create({ data: { ...(c.data as any), kontrolId, risks: { create: [{ riskId: row.riskDbId }] } } });
                        await tx.riskSimulationControl.updateMany({ where: { id: c.simControlId }, data: { sourceRiskControlId: created.id } });
                        result.controlsCreated++;
                        await tx.auditLog.create({ data: { userId, action: 'CREATE', entityType: 'RiskControl', entityId: created.id, newValue: { kontrolId, riskId: row.riskId, source: req.requestNo } } });
                    } else {
                        await tx.riskControlRisk.deleteMany({ where: { riskId: row.riskDbId, riskControlId: c.riskControlId } });
                        result.linksRemoved++;
                        await tx.auditLog.create({ data: { userId, action: 'UNLINK', entityType: 'RiskControl', entityId: c.riskControlId, oldValue: { riskId: row.riskId, kontrolId: c.kontrolId, source: req.requestNo } } });
                    }
                }
                // Simülasyondaki kaynak anlık görüntüsü güncellenir: sapma yeni envanter değerlerine göre hesaplanır.
                const sc = await tx.riskSimulationScenario.findUnique({ where: { id: row.scenarioId }, select: { sourceRiskSnapshot: true } });
                if (sc) {
                    const fresh = await tx.risk.findUnique({ where: { id: row.riskDbId } });
                    const snap = (sc.sourceRiskSnapshot ?? {}) as any;
                    await tx.riskSimulationScenario.update({
                        where: { id: row.scenarioId },
                        data: {
                            sourceCapturedVersion: newVersion, sourceCapturedAt: new Date(),
                            sourceRiskSnapshot: { ...snap, record: { dogalRiskPuani: fresh?.dogalRiskPuani ?? null, dogalRiskSeviyesi: fresh?.dogalRiskSeviyesi ?? null, kalintiRiskPuani: fresh?.kalintiRiskPuani ?? null, kalintiRiskSeviyesi: fresh?.kalintiRiskSeviyesi ?? null } } as Prisma.InputJsonValue,
                        },
                    });
                }
            }
            await tx.riskSimulationTransferRequest.update({
                where: { id }, data: { status: 'APPROVED', decidedById: userId, decidedAt: new Date(), decisionNote: note ?? null, result: result as Prisma.InputJsonValue },
            });
            await tx.auditLog.create({ data: { userId, action: 'SIM_TRANSFER_APPROVE', entityType: 'RiskSimulationTransferRequest', entityId: id, newValue: { requestNo: req.requestNo, ...result } } });
        }, { timeout: 120_000 });
        return { status: 'APPROVED', ...result };
    }

    async reject(id: string, note: string | undefined, userId: string) {
        const req = await this.pendingOr404(id);
        await this.prisma.riskSimulationTransferRequest.update({ where: { id }, data: { status: 'REJECTED', decidedById: userId, decidedAt: new Date(), decisionNote: note ?? null } });
        await this.prisma.auditLog.create({ data: { userId, action: 'SIM_TRANSFER_REJECT', entityType: 'RiskSimulationTransferRequest', entityId: id, newValue: { requestNo: req.requestNo, note: note ?? null } } });
        return { status: 'REJECTED' };
    }

    async cancel(id: string, userId: string) {
        const req = await this.pendingOr404(id);
        if (req.requestedById !== userId) throw new ForbiddenException('Yalnız talebi oluşturan kişi iptal edebilir.');
        await this.prisma.riskSimulationTransferRequest.update({ where: { id }, data: { status: 'CANCELLED', decidedAt: new Date() } });
        await this.prisma.auditLog.create({ data: { userId, action: 'SIM_TRANSFER_CANCEL', entityType: 'RiskSimulationTransferRequest', entityId: id, newValue: { requestNo: req.requestNo } } });
        return { status: 'CANCELLED' };
    }

    private async uniqueKontrolId(tx: Prisma.TransactionClient) {
        const year = new Date().getFullYear();
        for (let i = 0; i < 50; i++) {
            const id = `RC-${year}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
            if (!(await tx.riskControl.findUnique({ where: { kontrolId: id }, select: { id: true } }))) return id;
        }
        throw new ConflictException('Kontrol kimliği üretilemedi; tekrar deneyin.');
    }
}
