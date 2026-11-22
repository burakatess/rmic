'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '@/lib/api';
import { classifyLoadError, type LoadError } from '@/lib/load-error';
import { LoadingState, ErrorState } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import {
    RISK_COLUMNS, CONTROL_COLUMNS, downloadRiskWorkbook, downloadControlWorkbook,
    downloadBlankRiskTemplate, downloadBlankControlTemplate, runDownload, type SimCol,
} from '@/lib/sim-excel';

/*
 * Çalışma alanının GRC kolonlarıyla Risk ve Kontrol tabloları. Hesaplanan kolonlar backend'deki
 * simülasyon sonucudur. Düzenleme simülatör sekmesinde yapılır; ID'ye tıklayınca orada açılır.
 */

type Rec = Record<string, unknown> & { scenarioId: string };
interface Tables { simulation: { simulationId: string; name: string }; risks: Rec[]; controls: Rec[] }

const HEAD_TONE: Record<SimCol['kind'], string> = {
    input: 'text-slate-900',
    computed: 'text-teal-700',
    record: 'text-slate-400',
};

function display(col: SimCol, v: unknown): string {
    if (v === null || v === undefined || v === '') return '';
    if (col.type === 'bool') return v ? (col.key === 'onayli' ? 'Evet' : '1') : (col.key === 'onayli' ? 'Hayır' : '');
    if (col.type === 'date') { const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('tr-TR'); }
    if (typeof v === 'number') return v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    return String(v);
}

export function ExcelTables({ simulationId, onOpenRisk }: { simulationId: string; onOpenRisk: (scenarioId: string) => void }) {
    const { error: showError } = useToast();
    const [data, setData] = useState<Tables | null>(null);
    const [error, setError] = useState<LoadError | null>(null);
    const [which, setWhich] = useState<'risk' | 'control'>('risk');
    const [search, setSearch] = useState('');
    const seq = useRef(0);

    const load = useCallback(async () => {
        const my = ++seq.current;
        try {
            const res = await api.getSimWorkspaceTables(simulationId) as Tables;
            if (my === seq.current) { setData(res); setError(null); }
        } catch (e) { if (my === seq.current) setError(classifyLoadError(e, 'Excel tabloları')); }
    }, [simulationId]);
    useEffect(() => { load(); }, [load]);

    const cols = which === 'risk' ? RISK_COLUMNS : CONTROL_COLUMNS;
    const rows = useMemo(() => {
        const all = (which === 'risk' ? data?.risks : data?.controls) ?? [];
        const q = search.trim().toLocaleLowerCase('tr');
        if (!q) return all;
        return all.filter(r => cols.some(col => col.key && display(col, r[col.key]).toLocaleLowerCase('tr').includes(q)));
    }, [data, which, search, cols]);

    if (error) return <ErrorState title={error.title} description={error.description} onRetry={error.retryable ? load : undefined} />;
    if (!data) return <LoadingState message="Tablolar hazırlanıyor..." />;
    const base = `${data.simulation.simulationId}_${data.simulation.name}`;
    const total = which === 'risk' ? data.risks.length : data.controls.length;

    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3">
                <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
                    {([['risk', 'Risk Excel\'i', data.risks.length], ['control', 'Kontrol Excel\'i', data.controls.length]] as const).map(([k, label, n]) => (
                        <button key={k} type="button" onClick={() => setWhich(k)}
                            className={`rounded-md px-3 py-1.5 font-medium ${which === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                            {label} <span className="font-mono opacity-70">{n}</span>
                        </button>
                    ))}
                </div>
                <span className="text-xs text-slate-500">Kolonlar {cols.length}</span>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tabloda ara" className="ml-auto w-52 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                <button type="button" onClick={() => runDownload(() => (which === 'risk' ? downloadRiskWorkbook(data.risks, base) : downloadControlWorkbook(data.controls, base)), m => showError('Hata', m))}
                    className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800">
                    {which === 'risk' ? 'Risk Excel\'ini indir' : 'Kontrol Excel\'ini indir'}
                </button>
                <button type="button" onClick={() => runDownload(which === 'risk' ? downloadBlankRiskTemplate : downloadBlankControlTemplate, m => showError('Hata', m))}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Boş şablon</button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-[11px] text-slate-500">
                <span><b className="text-slate-900">Siyah başlık</b> hesap girdisi</span>
                <span><b className="text-teal-700">Renkli başlık</b> simülasyonla hesaplanır</span>
                <span><b className="text-slate-400">Gri başlık</b> GRC kayıt bilgisi</span>
                <span>· ID&apos;ye tıklayınca simülatörde açılır; düzenleme simülatörde yapılır</span>
                <span className="ml-auto font-mono">{rows.length} / {total} satır</span>
            </div>
            <div className="max-h-[70vh] overflow-auto border-t border-slate-200">
                <table className="min-w-max text-[12px]">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                        <tr>
                            {cols.map((col, i) => (
                                <th key={col.header} title={col.help}
                                    className={`border-b border-r border-slate-200 px-2 py-2 text-left text-[10.5px] font-bold uppercase tracking-wide whitespace-nowrap ${HEAD_TONE[col.kind]} ${i === 0 ? 'sticky left-0 bg-slate-50' : ''}`}>
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && <tr><td colSpan={cols.length} className="px-4 py-8 text-center text-slate-500">{total ? 'Aramaya uyan satır yok.' : 'Tablo boş.'}</td></tr>}
                        {rows.map((r, ri) => (
                            <tr key={`${r.scenarioId}-${ri}`} className="hover:bg-slate-50">
                                {cols.map((col, i) => {
                                    const text = col.key ? display(col, r[col.key]) : '';
                                    const isId = col.key === 'riskId' || (i === 0);
                                    const long = col.type === 'longtext';
                                    return (
                                        <td key={col.header} title={long && text ? text : undefined}
                                            className={`border-b border-r border-slate-100 px-2 py-1.5 align-top ${i === 0 ? 'sticky left-0 bg-white' : ''} ${col.kind === 'computed' ? 'font-mono text-teal-800' : col.kind === 'record' ? 'text-slate-500' : 'text-slate-800'}`}>
                                            {isId && text ? (
                                                <button type="button" onClick={() => onOpenRisk(r.scenarioId)} className="font-mono text-blue-700 hover:underline whitespace-nowrap">{text}</button>
                                            ) : (
                                                <div className={long ? 'w-72 line-clamp-2' : 'whitespace-nowrap'}>{text}</div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
