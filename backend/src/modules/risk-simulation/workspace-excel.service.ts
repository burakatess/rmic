import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { nextCounterValue, formatRecordId } from '../../common/util/sequential-id';
import { AccessScopeService, and, riskWhere, type AccessActor } from '../../common/services/access-scope.service';
import { calcControlKep, getBkpLevel, type MethodologyConfig } from './calculation-engine';
import { calculateScenarioRow, RiskSimulationService } from './risk-simulation.service';
import { matchPOptions, P_LABELS } from './p-option-match';
import type { ImportControlRowDto, ImportRiskRowDto, ImportWorkspaceDto } from './dto';

/**
 * Çalışma alanı ↔ GRC Excel tabloları.
 *  - `importWorkspace`: tarayıcıda okunan Risk/Kontrol Excel satırlarından YENİ bir çalışma
 *    alanı oluşturur (mevcut çalışma alanlarına dokunmaz). `dryRun` yalnız kontrol raporu döner.
 *  - `getTables`: çalışma alanını GRC kolonlarıyla (simülasyon sonuçları hesaplanmış) döner;
 *    Excel dosyası tarayıcıda üretilir.
 * Metodoloji uygulamanın mevcut simülasyon metodolojisidir; Excel'deki kayıtlı sonuçlar
 * yalnız "kayıttan sapma" karşılaştırması için saklanır, hesaba girmez.
 */

export type ImportIssue = { sheet: 'Risk' | 'Kontrol'; row: number | null; id: string | null; level: 'error' | 'warning'; message: string };
const MAX_ISSUES = 500;

const norm = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
const blank = (s: string | null | undefined) => !s || !s.trim();
const clean = (s: string | null | undefined) => (blank(s) ? null : s!.trim());

const IMPACT_AREA_LABELS: Record<'BOTH' | 'PROBABILITY' | 'IMPACT', string> = {
    BOTH: 'Olasılık ve etki', PROBABILITY: 'Yalnız olasılık', IMPACT: 'Yalnız etki',
};

export function parseImpactArea(text: string | null | undefined): 'BOTH' | 'PROBABILITY' | 'IMPACT' | null {
    const n = norm(text);
    if (!n || n.includes(' ve ') || n.includes('ikisi') || n === 'both') return 'BOTH';
    if (n.includes('olasılık') || n === 'probability') return 'PROBABILITY';
    if (n.includes('etki') || n === 'impact') return 'IMPACT';
    return null;
}

/** Kontrol statüsü → hesaba dahil mi. Tanınmayan/boş statü dahil sayılır. */
export function statusApproved(text: string | null | undefined): boolean {
    // Büyük harfli kayıtlar ("PASIF", "IPTAL") tr küçültmede "ı" verir; i ile eşitlenir.
    const n = norm(text).replace(/ı/g, 'i');
    return !(n.includes('iptal') || n.includes('pasif') || n.includes('kapal') || n.includes('cancel') || n.includes('reddedil'));
}
const riskCancelled = (text: string | null | undefined) => norm(text).replace(/ı/g, 'i').includes('iptal');

function riskSnapshotFromExcel(r: ImportRiskRowDto, controlRecords: Record<string, unknown>) {
    return {
        source: 'EXCEL',
        riskId: r.riskId.trim(), kayitId: clean(r.kayitId), name: clean(r.tanim)?.slice(0, 200) ?? r.riskId.trim(), description: clean(r.tanim),
        status: clean(r.status), surec: clean(r.surec), altSurec: clean(r.altSurec), ilgiliGmy: clean(r.ilgiliGmy),
        riskSahibi: clean(r.riskSahibi), riskSorumlusu: clean(r.riskSorumlusu), riskIsleme: clean(r.riskIsleme), ozet: clean(r.ozet),
        flagForIT: !!r.flagForIT, directorate: null,
        mutabakatTarihi: r.mutabakatTarihi ?? null, createdAt: r.olusturmaTarihi ?? null, updatedAt: r.guncelleme ?? null,
        finansalEtki: r.finansalEtki ?? null, itibarEtkisi: r.itibarEtkisi ?? null, regulasyonEtkisi: r.regulasyonEtkisi ?? null, musteriEtkisi: r.musteriEtkisi ?? null,
        gizlilikEtkisi: r.gizlilikEtkisi ?? null, butunlukEtkisi: r.butunlukEtkisi ?? null, erisilebilirlikEtkisi: r.erisilebilirlikEtkisi ?? null,
        olasilik: r.olasilik ?? null,
        record: {
            dogalRiskPuani: r.dogalRiskPuani ?? null, dogalRiskSeviyesi: clean(r.dogalRiskSeviyesi),
            kalintiRiskPuani: r.kalintiRiskPuani ?? null, kalintiRiskSeviyesi: clean(r.kalintiRiskSeviyesi),
        },
        controlRecords,
        capturedAt: new Date().toISOString(),
    };
}

function controlRecordFromExcel(c: ImportControlRowDto) {
    return {
        kayitId: clean(c.kayitId), status: clean(c.status), siklik: clean(c.siklik),
        mutabakatTarihi: c.mutabakatTarihi ?? null, createdAt: c.olusturmaTarihi ?? null, updatedAt: c.guncelleme ?? null,
        riskSorumlusu: clean(c.riskSorumlusu), ozet: clean(c.ozet), lastComment: clean(c.lastComment), outwardLink: clean(c.outwardLink),
    };
}

@Injectable()
export class WorkspaceExcelService {
    constructor(private prisma: PrismaService, private scope: AccessScopeService, private sims: RiskSimulationService) { }

    async importWorkspace(dto: ImportWorkspaceDto, actor: AccessActor) {
        const issues: ImportIssue[] = [];
        const issue = (i: ImportIssue) => { if (issues.length < MAX_ISSUES) issues.push(i); };

        // ── Riskler ──
        const risks = new Map<string, ImportRiskRowDto>();
        let skippedRisks = 0, cancelledRisks = 0;
        for (const r of dto.risks) {
            const id = clean(r.riskId);
            const at = { sheet: 'Risk' as const, row: r.rowNumber ?? null, id };
            if (!id) { issue({ ...at, level: 'error', message: 'Risk ID boş; satır alınmadı.' }); skippedRisks++; continue; }
            if (risks.has(id)) { issue({ ...at, level: 'error', message: 'Risk ID tekrar ediyor; ilk satır alındı.' }); skippedRisks++; continue; }
            if (riskCancelled(r.status)) { issue({ ...at, level: 'warning', message: 'İptal statüsündeki risk simülasyona alınmadı.' }); cancelledRisks++; continue; }
            if (r.olasilik == null) { issue({ ...at, level: 'error', message: 'Olasılık boş; risk hesaplanamayacağı için alınmadı.' }); skippedRisks++; continue; }
            const set = r.flagForIT ? [r.gizlilikEtkisi, r.butunlukEtkisi, r.erisilebilirlikEtkisi] : [r.finansalEtki, r.itibarEtkisi, r.regulasyonEtkisi, r.musteriEtkisi];
            if (set.some(v => v == null)) {
                issue({ ...at, level: 'warning', message: `${r.flagForIT ? 'BT' : 'İş'} etkisi boyutlarından biri boş; doğal ve kalıntı risk hesaplanamaz (simülatörde doldurulabilir).` });
            }
            risks.set(id, { ...r, riskId: id });
        }

        // ── Kontroller ──
        const byRisk = new Map<string, ImportControlRowDto[]>();
        let skippedControls = 0, unmatchedTexts = 0;
        const seen = new Set<string>();
        for (const c of dto.controls) {
            const kid = clean(c.kontrolId), rid = clean(c.riskId);
            const at = { sheet: 'Kontrol' as const, row: c.rowNumber ?? null, id: kid };
            if (!kid || !rid) { issue({ ...at, level: 'error', message: 'Kontrol ID veya Risk ID boş; satır alınmadı.' }); skippedControls++; continue; }
            if (!risks.has(rid)) { issue({ ...at, level: 'error', message: `Risk ID (${rid}) risk listesinde yok; satır alınmadı.` }); skippedControls++; continue; }
            const key = `${rid}\u0000${kid}`;
            if (seen.has(key)) { issue({ ...at, level: 'error', message: `Aynı risk için (${rid}) kontrol tekrar ediyor; ilk satır alındı.` }); skippedControls++; continue; }
            seen.add(key);
            if (!byRisk.has(rid)) byRisk.set(rid, []);
            byRisk.get(rid)!.push({ ...c, kontrolId: kid, riskId: rid });
        }

        // Kontrol satırlarını simülasyon kontrollerine çevir (P eşleme, onay, ağırlık, etki alanı).
        const built = new Map<string, { controls: any[]; records: Record<string, unknown> }>();
        for (const [rid] of risks) {
            const rows = byRisk.get(rid) ?? [];
            const approvedOf = (c: ImportControlRowDto) => (c.onayli ?? null) !== null ? !!c.onayli : statusApproved(c.status);
            const approvedRows = rows.filter(approvedOf);
            const anyWeight = approvedRows.some(c => c.agirlik != null);
            const share = approvedRows.length > 0 ? Math.floor(10000 / approvedRows.length) / 10000 : 0;
            let weightSum = 0;
            const records: Record<string, unknown> = {};
            const controls = rows.map((c, i) => {
                const at = { sheet: 'Kontrol' as const, row: c.rowNumber ?? null, id: c.kontrolId };
                const m = matchPOptions({
                    kontrolTuru: c.kontrolTuru, kontrolIslevi: c.kontrolIslevi, kontrolIsletimeSekli: c.isletimSekli,
                    kontrolIsletimDenetimi: c.isletimDenetimi, kontrolIsletimRaporlama: c.isletimRaporlama,
                });
                for (const u of m.unmatched) {
                    unmatchedTexts++;
                    issue({ ...at, level: 'warning', message: `${u.param} metni tanınmadı ("${u.text.slice(0, 80)}"); en düşük seçenek alındı.` });
                }
                const missingP = [c.kontrolTuru, c.kontrolIslevi, c.isletimSekli, c.isletimDenetimi, c.isletimRaporlama].filter(blank).length;
                if (missingP) issue({ ...at, level: 'warning', message: `${missingP} P alanı boş; en düşük seçenek alındı.` });
                const area = parseImpactArea(c.etkiAlani);
                if (!area) issue({ ...at, level: 'warning', message: `Etki alanı tanınmadı ("${c.etkiAlani}"); "Olasılık ve etki" alındı.` });
                const approved = approvedOf(c);
                let weight: number;
                if (c.agirlik != null) weight = c.agirlik / 100;
                else if (!approved) weight = 0;
                else if (anyWeight) { weight = 0; issue({ ...at, level: 'warning', message: 'Ağırlık boş (aynı riskin diğer kontrollerinde dolu); 0 alındı.' }); }
                else weight = share;
                if (approved) weightSum += weight;
                records[c.kontrolId] = controlRecordFromExcel(c);
                return {
                    name: c.kontrolId, description: clean(c.tanim),
                    p1: m.p1, p2: m.p2, p3: m.p3, p4: m.p4, p5: m.p5,
                    ktsMode: 'MANUAL' as const, ktsManualValue: c.kts ?? null, weight, impactArea: area ?? 'BOTH',
                    isApproved: approved, sortOrder: i,
                };
            });
            if (weightSum > 1.0001) {
                issue({ sheet: 'Kontrol', row: null, id: rid, level: 'warning', message: `${rid} kontrollerinin ağırlık toplamı %${Math.round(weightSum * 1000) / 10}; %100'ü aşıyor.` });
            }
            built.set(rid, { controls, records });
        }

        const acceptedControls = [...built.values()].reduce((s, b) => s + b.controls.length, 0);
        const report = {
            risks: { total: dto.risks.length, accepted: risks.size, skipped: skippedRisks, cancelled: cancelledRisks },
            controls: {
                total: dto.controls.length, accepted: acceptedControls, skipped: skippedControls,
                approved: [...built.values()].reduce((s, b) => s + b.controls.filter(c => c.isApproved).length, 0),
                withKts: [...built.values()].reduce((s, b) => s + b.controls.filter(c => c.ktsManualValue !== null).length, 0),
                unmatchedTexts,
            },
            errorCount: issues.filter(i => i.level === 'error').length,
            warningCount: issues.filter(i => i.level === 'warning').length,
            issues, issuesTruncated: issues.length >= MAX_ISSUES,
        };
        if (dto.dryRun) return { dryRun: true, report };
        if (risks.size === 0) throw new BadRequestException('Dosyada simülasyona alınabilecek risk yok.');

        // Kayıt kapsamındaki platform riskleri/kontrolleri ile Risk ID / Kontrol ID üzerinden eşleşme
        // (yalnız iz bağlantısı; envantere hiçbir şey yazılmaz).
        const ctx = await this.scope.context(actor);
        const platformRisks = await this.prisma.risk.findMany({
            where: and<Prisma.RiskWhereInput>({ riskId: { in: [...risks.keys()] }, deletedAt: null }, riskWhere(ctx)),
            select: { id: true, riskId: true, version: true },
        });
        const riskByCode = new Map(platformRisks.map(r => [r.riskId, r]));
        const kontrolIds = [...new Set([...built.values()].flatMap(b => b.controls.map(c => c.name)))];
        const platformControls = await this.prisma.riskControl.findMany({ where: { kontrolId: { in: kontrolIds }, deletedAt: null }, select: { id: true, kontrolId: true } });
        const controlByCode = new Map(platformControls.map(c => [c.kontrolId, c.id]));

        const methodology = await this.sims.getActiveMethodology();
        const simulationId = formatRecordId('SIM', await nextCounterValue(this.prisma, 'risk-simulation'));
        const sim = await this.prisma.$transaction(async (tx) => {
            const created = await tx.riskSimulation.create({
                data: { simulationId, name: dto.name, description: dto.description, mode: 'WORKSPACE', createdById: actor.id },
            });
            for (const [rid, r] of risks) {
                const { controls, records } = built.get(rid)!;
                const linked = riskByCode.get(rid);
                const withLinks = controls.map(c => ({ ...c, sourceRiskControlId: controlByCode.get(c.name) ?? null }));
                const riskFields = {
                    naturalProbability: r.olasilik as number,
                    finansalEtki: r.finansalEtki ?? null, itibarEtkisi: r.itibarEtkisi ?? null, regulasyonEtkisi: r.regulasyonEtkisi ?? null, musteriEtkisi: r.musteriEtkisi ?? null,
                    gizlilikEtkisi: r.gizlilikEtkisi ?? null, butunlukEtkisi: r.butunlukEtkisi ?? null, erisilebilirlikEtkisi: r.erisilebilirlikEtkisi ?? null,
                    finalImpactChoice: (r.flagForIT ? 'INFOSEC' : 'BUSINESS') as 'INFOSEC' | 'BUSINESS',
                };
                const scenario = await tx.riskSimulationScenario.create({
                    data: {
                        simulationId: created.id, name: rid, methodologyVersionId: methodology.id,
                        sourceType: linked ? 'EXISTING_RISK' : 'HYPOTHETICAL', sourceRiskId: linked?.id ?? null,
                        sourceRiskSnapshot: riskSnapshotFromExcel(r, records) as Prisma.InputJsonValue,
                        sourceCapturedVersion: linked?.version ?? null, sourceCapturedAt: new Date(),
                        ...riskFields,
                        initialStateSnapshot: { ...riskFields, controls: withLinks } as Prisma.InputJsonValue,
                        createdById: actor.id,
                    },
                });
                if (withLinks.length) await tx.riskSimulationControl.createMany({ data: withLinks.map(c => ({ ...c, scenarioId: scenario.id })) });
            }
            await tx.auditLog.create({
                data: {
                    userId: actor.id, action: 'IMPORT', entityType: 'RiskSimulation', entityId: created.id,
                    newValue: {
                        simulationId: created.simulationId, name: created.name, mode: 'WORKSPACE', source: 'EXCEL',
                        sourceFileName: dto.sourceFileName ?? null, risks: report.risks, controls: report.controls,
                    } as Prisma.InputJsonValue,
                },
            });
            return created;
        }, { timeout: 120_000 });
        return { dryRun: false, simulation: sim, report, linkedRisks: platformRisks.length };
    }

    async getTables(simulationId: string) {
        const sim = await this.prisma.riskSimulation.findUnique({ where: { id: simulationId }, select: { id: true, simulationId: true, name: true, mode: true } });
        if (!sim) throw new NotFoundException('Risk simülasyonu bulunamadı');
        if (sim.mode !== 'WORKSPACE') throw new BadRequestException('Bu simülasyon bir çalışma alanı değil.');
        const scenarios = await this.prisma.riskSimulationScenario.findMany({
            where: { simulationId },
            include: {
                controls: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
                actions: true, methodology: true,
            },
            orderBy: { name: 'asc' },
        });
        // Platformdan oluşturulmuş eski çalışma alanlarında kontrol kayıt bilgisi snapshot'ta yoksa
        // Kontrol Alanı'ndan okunur (salt okunur gösterim).
        const missingIds = scenarios.flatMap(s => {
            const recs = (s.sourceRiskSnapshot as any)?.controlRecords ?? {};
            return s.controls.filter(c => !recs[c.name] && c.sourceRiskControlId).map(c => c.sourceRiskControlId as string);
        });
        const live = missingIds.length
            ? new Map((await this.prisma.riskControl.findMany({ where: { id: { in: [...new Set(missingIds)] } } })).map(c => [c.id, c]))
            : new Map();

        const risks: any[] = [];
        const controls: any[] = [];
        for (const s of scenarios) {
            const cfg = s.methodology.config as unknown as MethodologyConfig;
            const snap = (s.sourceRiskSnapshot ?? {}) as any;
            const calc = calculateScenarioRow(s);
            const bkp = calc.target.bkp.bkp;
            const bkpLevel = bkp !== null ? getBkpLevel(bkp, cfg).label : null;
            const res = calc.residual;
            const base = {
                riskId: snap.riskId ?? s.name, ilgiliGmy: snap.ilgiliGmy ?? null, riskSahibi: snap.riskSahibi ?? null,
                surec: snap.surec ?? null, altSurec: snap.altSurec ?? null,
            };
            risks.push({
                scenarioId: s.id, ...base, kayitId: snap.kayitId ?? null, status: snap.status ?? null,
                tanim: snap.description ?? snap.name ?? null, flagForIT: s.finalImpactChoice === 'INFOSEC',
                finansalEtki: s.finansalEtki, itibarEtkisi: s.itibarEtkisi, regulasyonEtkisi: s.regulasyonEtkisi, musteriEtkisi: s.musteriEtkisi,
                gizlilikEtkisi: s.gizlilikEtkisi, butunlukEtkisi: s.butunlukEtkisi, erisilebilirlikEtkisi: s.erisilebilirlikEtkisi,
                etki: calc.finalImpactTier, olasilik: s.naturalProbability,
                dogalRiskPuani: calc.naturalRisk?.puan ?? null, dogalRiskSkoru: calc.naturalRisk?.skor ?? null, dogalRiskSeviyesi: calc.naturalRisk?.seviye ?? null,
                bkpPuani: bkp, bkpSeviyesi: bkpLevel,
                kalintiRiskPuani: res.risk, kalintiRiskSkoru: res.level?.score ?? null, kalintiRiskSeviyesi: res.level?.label ?? null,
                riskIsleme: snap.riskIsleme ?? null, mutabakatTarihi: snap.mutabakatTarihi ?? null,
                olusturmaTarihi: snap.createdAt ?? null, guncelleme: snap.updatedAt ?? null,
                riskSorumlusu: snap.riskSorumlusu ?? null, ozet: snap.ozet ?? null,
                record: { dogalRiskPuani: snap.record?.dogalRiskPuani ?? null, kalintiRiskPuani: snap.record?.kalintiRiskPuani ?? null },
            });
            for (const c of s.controls) {
                const rec = snap.controlRecords?.[c.name] ?? (c.sourceRiskControlId ? fromRiskControl(live.get(c.sourceRiskControlId)) : null) ?? {};
                const k = calcControlKep({ id: c.id, p1: c.p1, p2: c.p2, p3: c.p3, p4: c.p4, p5: c.p5, kts: c.ktsManualValue, weight: c.weight, impactArea: c.impactArea }, cfg);
                controls.push({
                    scenarioId: s.id, controlId: c.id, kontrolId: c.name, kayitId: rec.kayitId ?? null, status: rec.status ?? null,
                    ...base, riskTanimi: snap.description ?? snap.name ?? null, tanim: c.description,
                    kontrolTuru: P_LABELS.p1[c.p1], kontrolIslevi: P_LABELS.p2[c.p2], isletimSekli: P_LABELS.p3[c.p3],
                    isletimDenetimi: P_LABELS.p4[c.p4], isletimRaporlama: P_LABELS.p5[c.p5], siklik: rec.siklik ?? null,
                    kontrolPuani: k.raw, kontrolSkoru: k.kep,
                    bkpPuani: bkp, bkpSeviyesi: bkpLevel,
                    mutabakatTarihi: rec.mutabakatTarihi ?? null, olusturmaTarihi: rec.createdAt ?? null, guncelleme: rec.updatedAt ?? null,
                    riskSorumlusu: rec.riskSorumlusu ?? null, ozet: rec.ozet ?? null, lastComment: rec.lastComment ?? null, outwardLink: rec.outwardLink ?? null,
                    onayli: c.isApproved, kts: c.ktsManualValue, agirlik: Math.round(c.weight * 10000) / 100, etkiAlani: IMPACT_AREA_LABELS[c.impactArea],
                });
            }
        }
        return { simulation: sim, risks, controls };
    }
}

function fromRiskControl(rc: any) {
    if (!rc) return null;
    return {
        kayitId: rc.kayitId, status: rc.status, siklik: rc.birSeviyeKontrolSikligi, mutabakatTarihi: rc.mutabakatTarihi,
        createdAt: rc.createdAt, updatedAt: rc.updatedAt, riskSorumlusu: rc.riskSorumlusu, ozet: rc.ozet,
    };
}
