import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { calcControlKep, getBkpLevel, type MethodologyConfig } from './calculation-engine';
import { calculateScenarioRow } from './risk-simulation.service';
import { P_LABELS } from './p-option-match';

/**
 * Simülasyon testi (çalışma alanı). "Başlat" anındaki durum (risk girdileri, kontroller ve
 * mevcut metodolojiyle hesaplanmış sonuçlar) `baseline` olarak saklanır. Rapor, başlangıç ile
 * şimdiki (test bitmişse bitiş anındaki) durumu karşılaştırır; değişiklik günlüğü denetim
 * izinden (AuditLog) okunur. "Başlangıca dön" yalnız simülasyon verisini geri yükler —
 * gerçek envantere hiçbir şey yazılmaz.
 */

const RISK_FIELDS = [
    ['naturalProbability', 'Olasılık'], ['finalImpactChoice', 'Flag for IT'],
    ['finansalEtki', 'Finansal etki'], ['itibarEtkisi', 'İtibar etkisi'], ['regulasyonEtkisi', 'Regülasyon etkisi'], ['musteriEtkisi', 'Müşteri etkisi'],
    ['gizlilikEtkisi', 'Gizlilik etkisi'], ['butunlukEtkisi', 'Bütünlük etkisi'], ['erisilebilirlikEtkisi', 'Erişilebilirlik etkisi'],
] as const;
const CONTROL_FIELDS = [
    ['name', 'Kontrol ID'], ['description', 'Kontrol tanımı'], ['isApproved', 'Onaylı'],
    ['p1', 'P1 · Kontrol türü'], ['p2', 'P2 · Kontrol işlevi'], ['p3', 'P3 · İşletilme şekli'], ['p4', 'P4 · İşletimin denetimi'], ['p5', 'P5 · İşletimin raporlanması'],
    ['ktsManualValue', 'KTS'], ['weight', 'Ağırlık'], ['impactArea', 'Etki alanı'],
] as const;
const RISK_FIELD_KEYS = RISK_FIELDS.map(f => f[0]) as string[];
const CONTROL_FIELD_KEYS = CONTROL_FIELDS.map(f => f[0]) as string[];
const LABEL: Record<string, string> = Object.fromEntries([...RISK_FIELDS, ...CONTROL_FIELDS]);
const IMPACT_AREA: Record<string, string> = { BOTH: 'Olasılık ve etki', PROBABILITY: 'Yalnız olasılık', IMPACT: 'Yalnız etki' };
const LEVELS = ['Çok Yüksek', 'Yüksek', 'Orta', 'Düşük', 'Çok Düşük'];
const MAX_LOG = 5000;

/** Rapor/günlük için okunur değer. */
export function displayValue(field: string, v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    if (field === 'finalImpactChoice') return v === 'INFOSEC' ? '1 (BT etkisi)' : 'Boş (İş etkisi)';
    if (field === 'isApproved') return v ? 'Evet' : 'Hayır';
    if (field === 'weight') return `%${Math.round(Number(v) * 10000) / 100}`;
    if (field === 'impactArea') return IMPACT_AREA[String(v)] ?? String(v);
    if (/^p[1-5]$/.test(field)) return (P_LABELS as any)[field][String(v)] ?? String(v);
    if (typeof v === 'number') return String(Math.round(v * 100) / 100);
    return String(v);
}

const same = (a: unknown, b: unknown) => {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
    return (a ?? null) === (b ?? null);
};

interface ControlState { id: string; name: string; description: string | null; isApproved: boolean; p1: string; p2: string; p3: string; p4: string; p5: string; ktsManualValue: number | null; weight: number; impactArea: string; sortOrder: number; kyp: number; kep: number | null }
type FieldChange = { field: string; label: string; before: string; after: string };
type ControlDiff = { id: string; name: string; status: 'added' | 'deleted' | 'changed'; changes: FieldChange[]; kepBefore: number | null; kepAfter: number | null };
interface ScenarioState {
    scenarioId: string; riskId: string; desc: string | null; methodologyVersionId: string;
    inputs: Record<string, unknown>;
    controls: ControlState[];
    result: {
        natural: { puan: number; level: string } | null;
        bkp: { value: number; level: string } | null;
        residual: { risk: number; level: string | null } | null;
    };
}
type Snapshot = { capturedAt: string; scenarios: ScenarioState[] };

function scenarioState(s: any): ScenarioState {
    const cfg = s.methodology.config as MethodologyConfig;
    const calc = calculateScenarioRow(s);
    const snap = (s.sourceRiskSnapshot ?? {}) as any;
    const bkp = calc.target.bkp.bkp;
    return {
        scenarioId: s.id, riskId: snap.riskId ?? s.name, desc: snap.description ?? snap.name ?? null, methodologyVersionId: s.methodologyVersionId,
        inputs: Object.fromEntries(RISK_FIELD_KEYS.map(k => [k, s[k] ?? null])),
        controls: s.controls.map((c: any) => {
            const k = calcControlKep({ id: c.id, p1: c.p1, p2: c.p2, p3: c.p3, p4: c.p4, p5: c.p5, kts: c.ktsManualValue, weight: c.weight, impactArea: c.impactArea }, cfg);
            return {
                id: c.id, name: c.name, description: c.description ?? null, isApproved: c.isApproved, p1: c.p1, p2: c.p2, p3: c.p3, p4: c.p4, p5: c.p5,
                ktsManualValue: c.ktsManualValue ?? null, weight: c.weight, impactArea: c.impactArea, sortOrder: c.sortOrder, kyp: k.raw, kep: k.kep,
            };
        }),
        result: {
            natural: calc.naturalRisk ? { puan: calc.naturalRisk.puan, level: calc.naturalRisk.seviye } : null,
            bkp: bkp !== null ? { value: bkp, level: getBkpLevel(bkp, cfg).label } : null,
            residual: calc.residual.risk !== null ? { risk: calc.residual.risk, level: calc.residual.level?.label ?? null } : null,
        },
    };
}

/** Sonuç karşılaştırması alan alan (JSONB anahtar sırasını değiştirir; JSON.stringify kullanılamaz). */
function sameResult(x: ScenarioState['result'], y: ScenarioState['result']) {
    return same(x.natural?.puan, y.natural?.puan) && same(x.natural?.level, y.natural?.level)
        && same(x.bkp?.value, y.bkp?.value) && same(x.bkp?.level, y.bkp?.level)
        && same(x.residual?.risk, y.residual?.risk) && same(x.residual?.level, y.residual?.level);
}

function distribution(states: ScenarioState[]) {
    const d: Record<string, number> = Object.fromEntries(LEVELS.map(l => [l, 0]));
    let unknown = 0;
    for (const s of states) { const l = s.result.residual?.level; if (l) d[l] = (d[l] ?? 0) + 1; else unknown++; }
    return { ...d, unknown };
}

@Injectable()
export class WorkspaceTestService {
    constructor(private prisma: PrismaService) { }

    private async assertWorkspace(simulationId: string) {
        const sim = await this.prisma.riskSimulation.findUnique({ where: { id: simulationId }, select: { id: true, mode: true, name: true, simulationId: true } });
        if (!sim) throw new NotFoundException('Risk simülasyonu bulunamadı');
        if (sim.mode !== 'WORKSPACE') throw new BadRequestException('Bu simülasyon bir çalışma alanı değil.');
        return sim;
    }

    private async snapshot(simulationId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<Snapshot> {
        const scenarios = await tx.riskSimulationScenario.findMany({
            where: { simulationId },
            include: { controls: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }, actions: true, methodology: true },
            orderBy: { name: 'asc' },
        });
        return { capturedAt: new Date().toISOString(), scenarios: scenarios.map(scenarioState) };
    }

    private async getTest(simulationId: string, testId: string) {
        const test = await this.prisma.riskSimulationTest.findFirst({ where: { id: testId, simulationId } });
        if (!test) throw new NotFoundException('Simülasyon testi bulunamadı');
        return test;
    }

    async list(simulationId: string) {
        await this.assertWorkspace(simulationId);
        return this.prisma.riskSimulationTest.findMany({
            where: { simulationId },
            select: {
                id: true, name: true, status: true, startedAt: true, finishedAt: true,
                startedBy: { select: { firstName: true, lastName: true } }, finishedBy: { select: { firstName: true, lastName: true } },
            },
            orderBy: { startedAt: 'desc' },
        });
    }

    async start(simulationId: string, name: string, userId: string) {
        await this.assertWorkspace(simulationId);
        const baseline = await this.snapshot(simulationId);
        try {
            const test = await this.prisma.riskSimulationTest.create({
                data: { simulationId, name, activeFor: simulationId, baseline: baseline as unknown as Prisma.InputJsonValue, startedById: userId },
                select: { id: true, name: true, status: true, startedAt: true },
            });
            await this.prisma.auditLog.create({
                data: { userId, action: 'SIM_TEST_START', entityType: 'RiskSimulationTest', entityId: test.id, newValue: { simulationId, name, riskCount: baseline.scenarios.length } },
            });
            return test;
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException('Bu çalışma alanında zaten devam eden bir simülasyon testi var.');
            }
            throw e;
        }
    }

    async finish(simulationId: string, testId: string, userId: string) {
        const test = await this.getTest(simulationId, testId);
        if (test.status !== 'ACTIVE') throw new BadRequestException('Bu test zaten bitirilmiş.');
        const finalState = await this.snapshot(simulationId);
        const updated = await this.prisma.riskSimulationTest.update({
            where: { id: testId },
            data: { status: 'FINISHED', activeFor: null, finalState: finalState as unknown as Prisma.InputJsonValue, finishedById: userId, finishedAt: new Date() },
            select: { id: true, name: true, status: true, startedAt: true, finishedAt: true },
        });
        await this.prisma.auditLog.create({ data: { userId, action: 'SIM_TEST_FINISH', entityType: 'RiskSimulationTest', entityId: testId, newValue: { simulationId } } });
        return updated;
    }

    /** Simülasyon verisini testin başlangıç anına döndürür (risk girdileri ve kontroller). */
    async reset(simulationId: string, testId: string, userId: string) {
        const test = await this.getTest(simulationId, testId);
        if (test.status !== 'ACTIVE') throw new BadRequestException('Bitirilmiş bir test başlangıcına dönülemez.');
        const baseline = test.baseline as unknown as Snapshot;
        let restoredRisks = 0;
        await this.prisma.$transaction(async (tx) => {
            const current = await tx.riskSimulationScenario.findMany({ where: { simulationId }, include: { controls: true } });
            const byId = new Map(current.map(s => [s.id, s]));
            for (const b of baseline.scenarios) {
                const cur = byId.get(b.scenarioId);
                if (!cur) continue; // silinmiş risk geri getirilmez; raporda "silindi" görünür
                restoredRisks++;
                await tx.riskSimulationScenario.update({ where: { id: cur.id }, data: { ...(b.inputs as any), contentVersion: { increment: 1 } } });
                const baseIds = new Set(b.controls.map(c => c.id));
                const extra = cur.controls.filter(c => !baseIds.has(c.id)).map(c => c.id);
                if (extra.length) {
                    await tx.riskSimulationAction.deleteMany({ where: { targetControlSimId: { in: extra } } });
                    await tx.riskSimulationControl.deleteMany({ where: { id: { in: extra } } });
                }
                const curIds = new Set(cur.controls.map(c => c.id));
                for (const c of b.controls) {
                    const data = {
                        name: c.name, description: c.description, isApproved: c.isApproved, p1: c.p1 as any, p2: c.p2 as any, p3: c.p3 as any, p4: c.p4 as any, p5: c.p5 as any,
                        ktsManualValue: c.ktsManualValue, weight: c.weight, impactArea: c.impactArea as any, sortOrder: c.sortOrder,
                    };
                    if (curIds.has(c.id)) await tx.riskSimulationControl.update({ where: { id: c.id }, data });
                    else await tx.riskSimulationControl.create({ data: { id: c.id, scenarioId: cur.id, ktsMode: 'MANUAL', ...data } });
                }
            }
            await tx.auditLog.create({ data: { userId, action: 'SIM_TEST_RESET', entityType: 'RiskSimulationTest', entityId: testId, newValue: { simulationId, restoredRisks } } });
        }, { timeout: 120_000 });
        return { restoredRisks };
    }

    async report(simulationId: string, testId: string) {
        const sim = await this.assertWorkspace(simulationId);
        const test = await this.prisma.riskSimulationTest.findFirst({
            where: { id: testId, simulationId },
            include: { startedBy: { select: { firstName: true, lastName: true } }, finishedBy: { select: { firstName: true, lastName: true } } },
        });
        if (!test) throw new NotFoundException('Simülasyon testi bulunamadı');
        const before = test.baseline as unknown as Snapshot;
        const after = (test.finalState as unknown as Snapshot | null) ?? await this.snapshot(simulationId);
        const bMap = new Map(before.scenarios.map(s => [s.scenarioId, s]));
        const aMap = new Map(after.scenarios.map(s => [s.scenarioId, s]));
        const ids = [...new Set([...bMap.keys(), ...aMap.keys()])];

        let ctrlsAdded = 0, ctrlsDeleted = 0, ctrlsChanged = 0, risksAdded = 0, risksDeleted = 0, resDown = 0, resUp = 0;
        const risks = ids.map(id => {
            const b = bMap.get(id) ?? null, a = aMap.get(id) ?? null;
            const ref = (a ?? b)!;
            const changes = b && a ? RISK_FIELD_KEYS.filter(k => !same(b.inputs[k], a.inputs[k]))
                .map(k => ({ field: k, label: LABEL[k], before: displayValue(k, b.inputs[k]), after: displayValue(k, a.inputs[k]) })) : [];
            const bc = new Map((b?.controls ?? []).map(c => [c.id, c])), ac = new Map((a?.controls ?? []).map(c => [c.id, c]));
            const controls = [...new Set([...bc.keys(), ...ac.keys()])].flatMap((cid): ControlDiff[] => {
                const x = bc.get(cid), y = ac.get(cid);
                if (x && y) {
                    const ch = CONTROL_FIELD_KEYS.filter(k => !same((x as any)[k], (y as any)[k]))
                        .map(k => ({ field: k, label: LABEL[k], before: displayValue(k, (x as any)[k]), after: displayValue(k, (y as any)[k]) }));
                    if (!ch.length) return [];
                    return [{ id: cid, name: y.name, status: 'changed', changes: ch, kepBefore: x.kep, kepAfter: y.kep }];
                }
                if (y) return [{ id: cid, name: y.name, status: 'added', changes: [], kepBefore: null, kepAfter: y.kep }];
                return [{ id: cid, name: x!.name, status: 'deleted', changes: [], kepBefore: x!.kep, kepAfter: null }];
            });
            const resultChanged = !!b && !!a && !sameResult(b.result, a.result);
            const status = !b ? 'added' : !a ? 'deleted' : (changes.length || controls.length || resultChanged) ? 'changed' : 'unchanged';
            const rb = b?.result.residual?.risk ?? null, ra = a?.result.residual?.risk ?? null;
            const direction = rb !== null && ra !== null ? (ra < rb ? 'down' : ra > rb ? 'up' : 'same') : (rb === ra ? 'same' : 'unknown');
            if (status !== 'unchanged') {
                if (status === 'added') risksAdded++;
                if (status === 'deleted') risksDeleted++;
                if (direction === 'down') resDown++;
                if (direction === 'up') resUp++;
                for (const c of controls) { if (c.status === 'added') ctrlsAdded++; else if (c.status === 'deleted') ctrlsDeleted++; else ctrlsChanged++; }
            }
            return {
                scenarioId: id, riskId: ref.riskId, desc: ref.desc, status, direction,
                before: b?.result ?? null, after: a?.result ?? null, changes, controls,
            };
        }).filter(r => r.status !== 'unchanged');

        const log = await this.changeLog(simulationId, before, after, test.startedAt, test.finishedAt);
        return {
            simulation: sim,
            test: { id: test.id, name: test.name, status: test.status, startedAt: test.startedAt, finishedAt: test.finishedAt, startedBy: test.startedBy, finishedBy: test.finishedBy },
            comparedAt: after.capturedAt,
            summary: {
                changedRisks: risks.length, resDown, resUp, risksAdded, risksDeleted, ctrlsAdded, ctrlsDeleted, ctrlsChanged,
                distBefore: distribution(before.scenarios), distAfter: distribution(after.scenarios),
                methodChanged: before.scenarios.some(s => aMap.get(s.scenarioId) && aMap.get(s.scenarioId)!.methodologyVersionId !== s.methodologyVersionId),
            },
            risks, log,
        };
    }

    /** Test süresince yapılan simülasyon değişiklikleri (denetim izinden). */
    private async changeLog(simulationId: string, before: Snapshot, after: Snapshot, from: Date, to: Date | null) {
        const scenarioIds = new Set([...before.scenarios, ...after.scenarios].map(s => s.scenarioId));
        const riskOf = new Map([...before.scenarios, ...after.scenarios].map(s => [s.scenarioId, s.riskId]));
        const ctrlName = new Map([...before.scenarios, ...after.scenarios].flatMap(s => s.controls.map(c => [c.id, c.name] as const)));
        const window = { gte: from, ...(to ? { lte: to } : {}) };
        // Sorgu bu çalışma alanının kimlikleriyle daraltılır. Test sırasında eklenip silinen
        // kontroller hiçbir anlık görüntüde yoktur; kimlikleri oluşturma kayıtlarından bulunur.
        const created = await this.prisma.auditLog.findMany({
            where: { entityType: 'RiskSimulationControl', action: 'CREATE', createdAt: window },
            select: { entityId: true, newValue: true },
        });
        const controlIds = new Set([...ctrlName.keys()]);
        for (const c of created) if (scenarioIds.has((c.newValue as any)?.scenarioId)) controlIds.add(c.entityId);
        const rows = await this.prisma.auditLog.findMany({
            where: {
                createdAt: window,
                OR: [
                    { entityType: 'RiskSimulationScenario', entityId: { in: [...scenarioIds] } },
                    { entityType: 'RiskSimulationControl', entityId: { in: [...controlIds] } },
                ],
            },
            include: { user: { select: { firstName: true, lastName: true } } },
            orderBy: { createdAt: 'asc' }, take: MAX_LOG,
        });
        const out: { t: Date; user: string | null; recordType: 'Risk' | 'Kontrol'; recordId: string; riskId: string | null; action: string; field: string | null; before: string; after: string }[] = [];
        for (const r of rows) {
            const oldV = (r.oldValue ?? {}) as any, newV = (r.newValue ?? {}) as any;
            const user = r.user ? `${r.user.firstName} ${r.user.lastName}` : null;
            if (r.entityType === 'RiskSimulationScenario') {
                if (!scenarioIds.has(r.entityId)) continue;
                const riskId = riskOf.get(r.entityId) ?? null;
                if (r.action === 'REDISTRIBUTE_WEIGHTS' && Array.isArray(oldV)) {
                    for (const o of oldV) {
                        if (newV[o.id] === undefined || same(o.weight, newV[o.id])) continue;
                        out.push({ t: r.createdAt, user, recordType: 'Kontrol', recordId: ctrlName.get(o.id) ?? o.id, riskId, action: 'Değişti', field: LABEL.weight, before: displayValue('weight', o.weight), after: displayValue('weight', newV[o.id]) });
                    }
                    continue;
                }
                if (r.action !== 'UPDATE') continue;
                for (const k of RISK_FIELD_KEYS) {
                    if (!(k in oldV) || !(k in newV) || same(oldV[k], newV[k])) continue;
                    out.push({ t: r.createdAt, user, recordType: 'Risk', recordId: riskId ?? r.entityId, riskId, action: 'Değişti', field: LABEL[k], before: displayValue(k, oldV[k]), after: displayValue(k, newV[k]) });
                }
            } else {
                const sid = newV.scenarioId ?? oldV.scenarioId;
                if (!sid || !scenarioIds.has(sid)) continue;
                const riskId = riskOf.get(sid) ?? null;
                const name = newV.name ?? oldV.name ?? ctrlName.get(r.entityId) ?? r.entityId;
                if (r.action === 'CREATE') out.push({ t: r.createdAt, user, recordType: 'Kontrol', recordId: name, riskId, action: 'Eklendi', field: null, before: '—', after: '—' });
                else if (r.action === 'DELETE') out.push({ t: r.createdAt, user, recordType: 'Kontrol', recordId: name, riskId, action: 'Silindi', field: null, before: '—', after: '—' });
                else if (r.action === 'UPDATE') {
                    for (const k of CONTROL_FIELD_KEYS) {
                        if (!(k in oldV) || !(k in newV) || same(oldV[k], newV[k])) continue;
                        out.push({ t: r.createdAt, user, recordType: 'Kontrol', recordId: name, riskId, action: 'Değişti', field: LABEL[k], before: displayValue(k, oldV[k]), after: displayValue(k, newV[k]) });
                    }
                }
            }
        }
        // Başlangıca dönüş kayıtları da günlükte görünür.
        const resets = await this.prisma.auditLog.findMany({
            where: { action: 'SIM_TEST_RESET', createdAt: { gte: from, ...(to ? { lte: to } : {}) } },
            include: { user: { select: { firstName: true, lastName: true } } },
        });
        for (const r of resets) {
            if ((r.newValue as any)?.simulationId !== simulationId) continue;
            out.push({ t: r.createdAt, user: r.user ? `${r.user.firstName} ${r.user.lastName}` : null, recordType: 'Risk', recordId: '—', riskId: null, action: 'Başlangıca dönüldü', field: null, before: '—', after: '—' });
        }
        out.sort((a, b) => a.t.getTime() - b.t.getTime());
        return { entries: out, truncated: rows.length >= MAX_LOG };
    }
}

