'use client';

import { useState } from 'react';
import { LEVELS, LevelBadge, fmt } from './ws-ui';

/*
 * Isı haritası: etki (dikey, 5→1) × olasılık (yatay, 1→5). Hücre rengi, hücre puanının
 * (etki × olasılık) metodolojideki seviye sınırlarına göre seviyesidir. Riskler doğal veya
 * kalıntı konumlarıyla yerleştirilir; bir riske tıklayınca simülatörde açılır.
 */

export interface HeatRow {
    scenarioId: string; riskId: string; name: string;
    natural: { probability: number; impact: number; puan: number; level: string } | null;
    residual: { probability: number; impact: number; risk: number; level: string | null } | null;
    bkp: { value: number | null; level: string | null };
    record: { residual: number | null; residualLevel?: string | null };
}
export interface RiskLevelBand { min: number; max: number; score: number; label: string }

const CELL_TONE: Record<string, string> = {
    'Çok Yüksek': 'bg-red-100 border-red-200', 'Yüksek': 'bg-orange-100 border-orange-200', 'Orta': 'bg-amber-50 border-amber-200',
    'Düşük': 'bg-emerald-50 border-emerald-200', 'Çok Düşük': 'bg-teal-50 border-teal-200',
};
const CHIP_TONE: Record<string, string> = {
    'Çok Yüksek': 'border-red-300 text-red-800', 'Yüksek': 'border-orange-300 text-orange-800', 'Orta': 'border-amber-300 text-amber-800',
    'Düşük': 'border-emerald-300 text-emerald-800', 'Çok Düşük': 'border-teal-300 text-teal-800',
};

function levelOf(puan: number, bands: RiskLevelBand[]) {
    return bands.find(b => puan >= b.min && puan <= b.max)?.label ?? (puan < (bands[0]?.min ?? 0) ? bands[0]?.label : bands[bands.length - 1]?.label) ?? '';
}

export function HeatMap({ rows, riskLevels, recordLabel, onOpenRisk }: { rows: HeatRow[]; riskLevels: RiskLevelBand[]; recordLabel: string; onOpenRisk: (scenarioId: string) => void }) {
    const [mode, setMode] = useState<'natural' | 'residual'>('natural');
    const pos = (r: HeatRow) => (mode === 'natural' ? (r.natural ? { p: r.natural.probability, i: r.natural.impact } : null) : (r.residual ? { p: r.residual.probability, i: r.residual.impact } : null));
    const placed = rows.map(r => ({ r, at: pos(r) }));
    const unplaced = placed.filter(x => !x.at).map(x => x.r);
    const changed = rows.filter(r => r.record.residualLevel && r.residual?.level && r.record.residualLevel !== r.residual.level);
    const byLevel = Object.fromEntries(LEVELS.map(l => [l, rows.filter(r => r.residual?.level === l)]));
    const unknownResidual = rows.filter(r => !r.residual?.level);

    return (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                    <div className="text-[15px] text-slate-900"><b>{mode === 'natural' ? 'Doğal' : 'Kalıntı'} risk ısı haritası</b></div>
                    <span className="text-xs text-slate-500">Etki (dikey) × Olasılık (yatay)</span>
                    <div className="ml-auto flex rounded-lg border border-slate-300 p-0.5 text-sm">
                        {([['natural', 'Doğal'], ['residual', 'Kalıntı']] as const).map(([k, l]) => (
                            <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-md px-3 py-1 font-medium ${mode === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-[28px_repeat(5,minmax(0,1fr))] gap-1">
                    <div />
                    {[1, 2, 3, 4, 5].map(p => <div key={p} className="text-center text-[11px] font-bold text-slate-500">O{p}</div>)}
                    {[5, 4, 3, 2, 1].map(i => (
                        <div key={i} className="contents">
                            <div className="flex items-center justify-center text-[11px] font-bold text-slate-500">E{i}</div>
                            {[1, 2, 3, 4, 5].map(p => {
                                const puan = i * p;
                                const lvl = levelOf(puan, riskLevels);
                                const here = placed.filter(x => x.at && x.at.p === p && x.at.i === i).map(x => x.r);
                                return (
                                    <div key={p} className={`min-h-[78px] rounded-md border p-1.5 ${CELL_TONE[lvl] ?? 'bg-slate-50 border-slate-200'}`} title={`Etki ${i} × Olasılık ${p} = ${puan} · ${lvl}`}>
                                        <div className="font-mono text-[11px] text-slate-500">{puan}</div>
                                        <div className="mt-0.5 flex flex-wrap gap-1">
                                            {here.map(r => (
                                                <button key={r.scenarioId} type="button" onClick={() => onOpenRisk(r.scenarioId)} title={r.name}
                                                    className={`rounded border bg-white px-1.5 py-0.5 font-mono text-[10.5px] font-semibold hover:shadow ${CHIP_TONE[lvl] ?? 'border-slate-300 text-slate-700'}`}>{r.riskId}</button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
                <p className="mt-3 text-[12px] text-slate-500">
                    Hücre rengi, hücre puanının (etki × olasılık) metodolojideki seviye sınırlarına göre seviyesini gösterir. Bir riske tıklayınca simülatörde açılır.
                    {unplaced.length > 0 && <> {unplaced.length} risk yerleştirilemedi ({mode === 'natural' ? 'etki boyutu eksik' : 'kalıntı hesaplanamıyor'}): {unplaced.slice(0, 12).map(r => r.riskId).join(', ')}{unplaced.length > 12 ? '…' : ''}.</>}
                </p>
            </div>

            <div className="space-y-4">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="px-4 pt-4 pb-2">
                        <div className="text-[15px] text-slate-900"><b>Kalıntı risk değişimi</b></div>
                        <div className="text-xs text-slate-500">{recordLabel} → simülasyon</div>
                    </div>
                    <table className="w-full text-[12px]">
                        <thead className="border-y border-slate-200 bg-slate-50 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                            <tr><th className="px-4 py-2">Risk</th><th className="px-2 py-2">Kayıt</th><th className="px-2 py-2">Simülasyon</th><th className="px-4 py-2 text-right">Bütünleşik kontrol</th></tr>
                        </thead>
                        <tbody>
                            {changed.length === 0 && <tr><td colSpan={4} className="px-4 py-5 text-center text-slate-500">Kayıtlı kalıntı seviyesinden farklı sonuç yok.</td></tr>}
                            {changed.map(r => (
                                <tr key={r.scenarioId} className="border-t border-slate-100">
                                    <td className="px-4 py-1.5"><button type="button" onClick={() => onOpenRisk(r.scenarioId)} className="font-mono font-semibold text-blue-700 hover:underline">{r.riskId}</button></td>
                                    <td className="px-2 py-1.5"><LevelBadge label={r.record.residualLevel} /></td>
                                    <td className="px-2 py-1.5"><LevelBadge label={r.residual?.level} /></td>
                                    <td className="px-4 py-1.5 text-right font-mono">{r.bkp.value === null ? '—' : `%${fmt(r.bkp.value, 1)}`}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 text-[15px] text-slate-900"><b>Kalıntı seviyesine göre riskler</b></div>
                    <div className="space-y-2.5">
                        {[...LEVELS, null].map(l => {
                            const list = l ? byLevel[l] : unknownResidual;
                            if (!l && list.length === 0) return null;
                            return (
                                <div key={l ?? 'unknown'}>
                                    <div className="text-[12px] font-semibold text-slate-700">{l ?? 'Hesaplanamayan'} · {list.length}</div>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {list.map(r => (
                                            <button key={r.scenarioId} type="button" onClick={() => onOpenRisk(r.scenarioId)} title={r.name}
                                                className={`rounded border bg-white px-1.5 py-0.5 font-mono text-[10.5px] font-semibold hover:shadow ${l ? CHIP_TONE[l] : 'border-slate-300 text-slate-600'}`}>{r.riskId}</button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
