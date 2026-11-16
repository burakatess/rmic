'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '@/lib/api';
import { classifyLoadError, type LoadError } from '@/lib/load-error';
import { LoadingState, ErrorState } from '@/components/ui';
import { downloadTestReport, type TestReportData } from '@/lib/sim-excel';
import { LevelBadge, DistributionBar, fmt } from './ws-ui';

/*
 * Simülasyon testi raporu: testin başlangıç anı ile şimdiki (bitmişse bitiş anındaki) durum
 * arasındaki farklar — risk girdileri, kontroller ve doğal / bütünleşik / kalıntı riske etkisi —
 * ve test süresince yapılan değişikliklerin günlüğü.
 */

interface TestRow { id: string; name: string; status: 'ACTIVE' | 'FINISHED'; startedAt: string; finishedAt?: string | null }
type Report = TestReportData;
type RiskDiff = Report['risks'][number];

const STATUS: Record<string, [string, string]> = {
    added: ['Eklendi', 'bg-blue-50 text-blue-700 border-blue-200'],
    deleted: ['Silindi', 'bg-slate-100 text-slate-600 border-slate-300'],
    changed: ['Değişti', 'bg-amber-50 text-amber-800 border-amber-200'],
};
const FILTERS = [['all', 'Tüm farklar'], ['down', 'Kalıntısı düşenler'], ['up', 'Kalıntısı yükselenler'], ['same', 'Kalıntısı aynı kalanlar'], ['addDel', 'Eklenen / silinen']] as const;
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function Arrow({ before, after, render }: { before: unknown; after: unknown; render: (v: any) => React.ReactNode }) {
    if (before === undefined && after === undefined) return null;
    const changed = JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
    return <span className="inline-flex items-center gap-1">{changed && <>{render(before)}<span className="text-slate-400">→</span></>}{render(after)}</span>;
}

function RiskDiffRow({ r, onOpen }: { r: RiskDiff; onOpen: (id: string) => void }) {
    const [label, tone] = STATUS[r.status];
    const b = r.before, a = r.after;
    const dirTone = r.direction === 'down' ? 'border-l-emerald-500' : r.direction === 'up' ? 'border-l-red-500' : 'border-l-slate-200';
    return (
        <div className={`border-b border-slate-100 border-l-4 ${dirTone} px-4 py-3`}>
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={r.status === 'deleted'} onClick={() => onOpen(r.scenarioId)} className="font-mono text-sm font-semibold text-blue-700 hover:underline disabled:text-slate-500 disabled:no-underline">{r.riskId}</button>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${tone}`}>{label}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700" title={r.desc ?? ''}>{r.desc}</span>
                <span className="text-[11px] text-slate-500">Kalıntı</span>
                <Arrow before={b?.residual?.level} after={a?.residual?.level} render={v => <LevelBadge label={v} />} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-slate-600">
                <span>Doğal <Arrow before={b?.natural?.puan} after={a?.natural?.puan} render={v => <b className="font-mono">{v ?? '—'}</b>} /></span>
                <span>Bütünleşik kontrol <Arrow before={b?.bkp?.value} after={a?.bkp?.value} render={v => <b className="font-mono">{v == null ? '—' : `%${fmt(v, 1)}`}</b>} /></span>
                <span>Kalıntı puan <Arrow before={b?.residual?.risk} after={a?.residual?.risk} render={v => <b className="font-mono">{v ?? '—'}</b>} /></span>
            </div>
            {(r.changes.length > 0 || r.controls.length > 0) && (
                <ul className="mt-2 space-y-0.5 text-[12px]">
                    {r.changes.map(c => <li key={c.field} className="text-slate-700"><span className="text-slate-500">{c.label}:</span> {c.before} <span className="text-slate-400">→</span> <b>{c.after}</b></li>)}
                    {r.controls.map(c => (
                        <li key={c.id} className="text-slate-700">
                            <span className="font-mono font-semibold">{c.name}</span>{' '}
                            {c.status === 'added' && <span className="text-blue-700">eklendi</span>}
                            {c.status === 'deleted' && <span className="text-slate-500">silindi</span>}
                            {c.changes.map(ch => <span key={ch.field} className="ml-2"><span className="text-slate-500">{ch.label}:</span> {ch.before} <span className="text-slate-400">→</span> <b>{ch.after}</b></span>)}
                            {c.kepBefore !== c.kepAfter && <span className="ml-2 text-slate-500">· Kontrol skoru {fmt(c.kepBefore, 1)} → {fmt(c.kepAfter, 1)}</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function TestReport({ simulationId, activeTestId, refreshKey, onOpenRisk }: {
    simulationId: string; activeTestId: string | null; refreshKey: number; onOpenRisk: (scenarioId: string) => void;
}) {
    const [tests, setTests] = useState<TestRow[] | null>(null);
    const [testId, setTestId] = useState<string | null>(null);
    const [report, setReport] = useState<Report | null>(null);
    const [error, setError] = useState<LoadError | null>(null);
    const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
    const [q, setQ] = useState('');
    const [logQ, setLogQ] = useState('');
    const seq = useRef(0);

    const load = useCallback(async () => {
        const my = ++seq.current;
        try {
            const list = await api.listSimTests(simulationId) as TestRow[];
            if (my !== seq.current) return;
            setTests(list);
            const id = testId && list.some(t => t.id === testId) ? testId : (activeTestId ?? list[0]?.id ?? null);
            setTestId(id);
            if (id) {
                const r = await api.getSimTestReport(simulationId, id) as Report;
                if (my === seq.current) setReport(r);
            } else setReport(null);
            if (my === seq.current) setError(null);
        } catch (e) { if (my === seq.current) setError(classifyLoadError(e, 'Test raporu')); }
    }, [simulationId, testId, activeTestId]);
    // refreshKey: çalışma alanında veri değişince rapor yeniden okunur.
    useEffect(() => { load(); }, [load, refreshKey]);

    const risks = useMemo(() => {
        const all = report?.risks ?? [];
        const s = q.trim().toLocaleLowerCase('tr');
        return all.filter(r =>
            (filter === 'all' || (filter === 'addDel' ? r.status !== 'changed' : r.direction === filter)) &&
            (!s || [r.riskId, r.desc ?? '', ...r.controls.map(c => c.name), ...r.changes.map(c => c.label), ...r.controls.flatMap(c => c.changes.map(x => x.label))]
                .join(' ').toLocaleLowerCase('tr').includes(s)));
    }, [report, filter, q]);
    const log = useMemo(() => {
        const s = logQ.trim().toLocaleLowerCase('tr');
        const all = report?.log.entries ?? [];
        return s ? all.filter(e => [e.recordId, e.riskId ?? '', e.field ?? '', e.action, e.user ?? ''].join(' ').toLocaleLowerCase('tr').includes(s)) : all;
    }, [report, logQ]);

    if (error) return <ErrorState title={error.title} description={error.description} onRetry={error.retryable ? load : undefined} />;
    if (!tests) return <LoadingState message="Test raporu hazırlanıyor..." />;
    if (!tests.length || !report) return (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
            <div className="text-base font-semibold text-slate-800">Henüz simülasyon testi yok</div>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                Üstteki &quot;Simülasyon testi başlat&quot; düğmesiyle şu anki durumu başlangıç olarak kaydedin. Sonra simülatörde yaptığınız
                değişiklikler ve bunların doğal, bütünleşik ve kalıntı riske etkisi burada raporlanır.
            </p>
        </div>
    );
    const s = report.summary;
    const cards: [string, React.ReactNode, string?][] = [
        ['Değişen risk', s.changedRisks],
        ['Kalıntısı düşen', <span key="d" className={s.resDown ? 'text-emerald-700' : ''}>{s.resDown}</span>],
        ['Kalıntısı yükselen', <span key="u" className={s.resUp ? 'text-red-700' : ''}>{s.resUp}</span>],
        ['Risk eklenen / silinen', `${s.risksAdded} / ${s.risksDeleted}`],
        ['Kontrol eklenen / silinen / değişen', `${s.ctrlsAdded} / ${s.ctrlsDeleted} / ${s.ctrlsChanged}`],
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <select value={testId ?? ''} onChange={e => { setTestId(e.target.value); setReport(null); }} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
                    {tests.map(t => <option key={t.id} value={t.id}>{t.name}{t.status === 'ACTIVE' ? ' (devam ediyor)' : ''}</option>)}
                </select>
                <div className="text-[12px] text-slate-500">
                    Başlangıç <b className="text-slate-700">{dt(report.test.startedAt)}</b>
                    {report.test.startedBy ? ` · ${report.test.startedBy.firstName} ${report.test.startedBy.lastName}` : ''}
                    {' · '}{report.test.status === 'FINISHED' ? <>Bitiş <b className="text-slate-700">{dt(report.test.finishedAt)}</b></> : <>Karşılaştırma <b className="text-slate-700">{dt(report.comparedAt)}</b> (şimdiki durum)</>}
                </div>
                <button type="button" onClick={() => downloadTestReport(report)} className="ml-auto rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800">Raporu indir (.xlsx)</button>
            </div>
            {s.methodChanged && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-800">Test süresince metodoloji sürümü değişti; farkların bir kısmı metodoloji değişikliğinden kaynaklanabilir.</div>}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {cards.map(([t, v]) => (
                    <div key={t} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t}</div>
                        <div className="mt-1 font-mono text-[22px] font-bold text-slate-900">{v}</div>
                    </div>
                ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Kalıntı dağılımı · başlangıç</div>
                    <DistributionBar dist={s.distBefore} unknown={s.distBefore.unknown} />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Kalıntı dağılımı · {report.test.status === 'FINISHED' ? 'bitiş' : 'şimdi'}</div>
                    <DistributionBar dist={s.distAfter} unknown={s.distAfter.unknown} />
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <div className="text-[15px] text-slate-900"><b>Risk bazında farklar</b> <span className="text-slate-500">{report.risks.length}</span></div>
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Risk, kontrol veya alan ara" className="ml-auto w-60 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                    <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" aria-label="Fark türü">
                        {FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                </div>
                <div className="border-t border-slate-200">
                    {report.risks.length === 0
                        ? <p className="px-4 py-8 text-center text-sm text-slate-500">Başlangıçtan bu yana veri değişmedi. Simülatörde bir değişiklik yapın; burada görünecek.</p>
                        : risks.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">Filtreye uyan fark yok.</p>
                            : risks.map(r => <RiskDiffRow key={r.scenarioId} r={r} onOpen={onOpenRisk} />)}
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <div className="text-[15px] text-slate-900"><b>Değişiklik günlüğü</b> <span className="text-slate-500">{report.log.entries.length}</span></div>
                    <input value={logQ} onChange={e => setLogQ(e.target.value)} placeholder="Günlükte ara" className="ml-auto w-60 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                </div>
                <div className="max-h-[420px] overflow-auto border-t border-slate-200">
                    <table className="w-full text-[12px]">
                        <thead className="sticky top-0 bg-slate-50 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                            <tr>{['Zaman', 'Kullanıcı', 'Kayıt türü', 'Kayıt', 'Risk ID', 'İşlem', 'Alan', 'Önce', 'Sonra'].map(h => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                            {log.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-500">Kayıt yok.</td></tr>}
                            {log.map((e, i) => (
                                <tr key={i} className="border-t border-slate-100 align-top">
                                    <td className="px-3 py-1.5 whitespace-nowrap font-mono">{dt(e.t)}</td>
                                    <td className="px-3 py-1.5 whitespace-nowrap">{e.user ?? '—'}</td>
                                    <td className="px-3 py-1.5">{e.recordType}</td>
                                    <td className="px-3 py-1.5 font-mono whitespace-nowrap">{e.recordId}</td>
                                    <td className="px-3 py-1.5 font-mono whitespace-nowrap">{e.riskId ?? '—'}</td>
                                    <td className="px-3 py-1.5 whitespace-nowrap">{e.action}</td>
                                    <td className="px-3 py-1.5">{e.field ?? '—'}</td>
                                    <td className="px-3 py-1.5 max-w-xs truncate" title={e.before}>{e.before}</td>
                                    <td className="px-3 py-1.5 max-w-xs truncate" title={e.after}>{e.after}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {report.log.truncated && <p className="px-4 py-2 text-xs text-slate-500">Günlük ilk 5000 kayıtla sınırlı.</p>}
            </div>
        </div>
    );
}
