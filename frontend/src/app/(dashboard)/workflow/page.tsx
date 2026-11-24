'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import api, { ApiError } from '@/lib/api';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { ENTITY_LABELS, type BoardItem, type BoardResponse, type WorkflowEntityType, type WorkflowStage } from '@/types/workflow';

const STAGES: WorkflowStage[] = ['BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'ONAYLANDI'];
const COLUMN_STYLE: Record<string, string> = {
    BEKLIYOR: 'border-t-slate-400', DEVAM_EDIYOR: 'border-t-blue-500', TAMAMLANDI: 'border-t-amber-500', ONAYLANDI: 'border-t-emerald-500',
};
const TYPE_STYLE: Record<WorkflowEntityType, string> = {
    CONTROL_TEST: 'bg-blue-50 text-blue-700', FOLLOW_UP: 'bg-violet-50 text-violet-700', FINDING: 'bg-orange-50 text-orange-700', PERIOD_CONTROL: 'bg-emerald-50 text-emerald-700',
};
const FLAG_LABEL: Record<string, { label: string; cls: string }> = {
    GECIKMIS: { label: 'Gecikmiş', cls: 'bg-red-50 text-red-700 border-red-200' },
    YENI_SURUM: { label: 'Yeni kontrol sürümü', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    SILME_TALEBI: { label: 'Silme talebi', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};
/** Geri yönlü taşımalar (iade / geri al) gerekçe ister. */
const isBackward = (from: WorkflowStage, to: WorkflowStage) => STAGES.indexOf(to) < STAGES.indexOf(from);
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('tr-TR') : null);

export default function WorkflowBoardPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [board, setBoard] = useState<BoardResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const thisYear = new Date().getFullYear();
    const [filters, setFilters] = useState({ type: '', assigneeId: '', stage: '', from: '', to: '', scope: 'MINE', year: String(thisYear) });
    const [dragging, setDragging] = useState<BoardItem | null>(null);
    const [overStage, setOverStage] = useState<WorkflowStage | null>(null);
    const [reasonFor, setReasonFor] = useState<{ item: BoardItem; to: WorkflowStage } | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const p: Record<string, string> = {};
            Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
            setBoard(await api.getWorkflowBoard(p));
        } catch (e) {
            showError('Yüklenemedi', (e as Error).message);
        } finally { setLoading(false); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);
    useEffect(() => { load(); }, [load]);

    const people = useMemo(() => {
        const m = new Map<string, string>();
        board?.columns.forEach(c => c.items.forEach(i => { if (i.assignee) m.set(i.assignee.id, i.assignee.name); if (i.checker) m.set(i.checker.id, i.checker.name); }));
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr'));
    }, [board]);

    const doMove = async (item: BoardItem, to: WorkflowStage, r?: string) => {
        setBusy(true);
        try {
            await api.moveWorkflowCard(item.entityType, item.entityId, to, r);
            success('Taşındı', `${item.code}: ${board?.columns.find(c => c.stage === to)?.label}`);
            setReasonFor(null); setReason('');
            await load();
        } catch (e) {
            const body = e instanceof ApiError ? (e.body as { message?: unknown } | undefined) : undefined;
            const inner = typeof body?.message === 'object' && body?.message ? body.message as { code?: string; message?: string; href?: string } : null;
            if (inner?.code === 'WORKFLOW_FORM_REQUIRED' && inner.href) {
                showError('Form gerekli', inner.message ?? 'Bu adım kayıt ekranındaki form ile tamamlanır.');
                router.push(inner.href);
                return;
            }
            showError('Taşınamadı', inner?.message ?? (e as Error).message);
        } finally { setBusy(false); }
    };

    const onDrop = (to: WorkflowStage) => {
        const item = dragging;
        setDragging(null); setOverStage(null);
        if (!item || item.stage === to) return;
        // Sıralı ilerleme: yalnız komşu aşama (sunucu da doğrular; 2. kontrolcü onayı atlanamaz).
        if (Math.abs(STAGES.indexOf(to) - STAGES.indexOf(item.stage)) !== 1) {
            showError('Geçersiz geçiş', 'Aşamalar sırayla ilerler; bir aşama atlanamaz.');
            return;
        }
        if (isBackward(item.stage, to)) { setReason(''); setReasonFor({ item, to }); return; }
        doMove(item, to);
    };

    const setF = (k: keyof typeof filters) => (v: string) => setFilters(p => ({ ...p, [k]: v }));
    const total = board?.columns.reduce((n, c) => n + c.total, 0) ?? 0;

    return (
        <div className="flex flex-col gap-4 pb-8 text-[13px]" data-testid="workflow-board">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="text-xs text-slate-500 mb-1.5">İş Akışı / <span className="text-slate-900 font-medium">İşlem Durumları</span></div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">İşlem Durumları</h1>
                    <p className="mt-1 text-sm text-slate-500">{total} işlem · Kartları sürükleyerek bir sonraki/önceki aşamaya taşıyın. Aşamalar atlanamaz; onay yalnız 2. kontrolcüdedir.</p>
                </div>
                {board?.canOrg && (
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden" role="tablist">
                        {(['MINE', 'ORG'] as const).map(s => (
                            <button key={s} type="button" role="tab" aria-selected={filters.scope === s} onClick={() => setF('scope')(s)}
                                className={`px-3 py-1.5 text-sm font-medium ${filters.scope === s ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                                {s === 'MINE' ? 'İşlerim' : 'Kurum'}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                <select aria-label="Yıl" value={filters.year} onChange={e => setF('year')(e.target.value)} className="h-8 px-2 rounded-lg border border-slate-200 bg-white">
                    {[thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select aria-label="İşlem türü" value={filters.type} onChange={e => setF('type')(e.target.value)} className="h-8 px-2 rounded-lg border border-slate-200 bg-white">
                    <option value="">Tüm işlem türleri</option>
                    {(Object.keys(ENTITY_LABELS) as WorkflowEntityType[]).map(t => <option key={t} value={t}>{ENTITY_LABELS[t]}</option>)}
                </select>
                <select aria-label="Sorumlu" value={filters.assigneeId} onChange={e => setF('assigneeId')(e.target.value)} className="h-8 px-2 rounded-lg border border-slate-200 bg-white max-w-[200px]">
                    <option value="">Tüm sorumlular</option>
                    {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <select aria-label="Durum" value={filters.stage} onChange={e => setF('stage')(e.target.value)} className="h-8 px-2 rounded-lg border border-slate-200 bg-white">
                    <option value="">Tüm durumlar</option>
                    {board?.columns.map(c => <option key={c.stage} value={c.stage}>{c.label}</option>)}
                </select>
                <label className="flex items-center gap-1 text-slate-500">Başlangıç <input type="date" aria-label="Başlangıç tarihi" value={filters.from} onChange={e => setF('from')(e.target.value)} className="h-8 px-2 rounded-lg border border-slate-200" /></label>
                <label className="flex items-center gap-1 text-slate-500">Bitiş <input type="date" aria-label="Bitiş tarihi" value={filters.to} onChange={e => setF('to')(e.target.value)} className="h-8 px-2 rounded-lg border border-slate-200" /></label>
                {(filters.type || filters.assigneeId || filters.stage || filters.from || filters.to) && (
                    <button type="button" onClick={() => setFilters(p => ({ ...p, type: '', assigneeId: '', stage: '', from: '', to: '' }))} className="text-slate-500 underline">Temizle</button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
                {(board?.columns ?? STAGES.map(st => ({ stage: st, label: st, total: 0, items: [] as BoardItem[] }))).map(col => (
                    <section key={col.stage} aria-label={`${col.label} sütunu`} data-testid={`column-${col.stage}`}
                        onDragOver={e => { if (dragging) { e.preventDefault(); setOverStage(col.stage); } }}
                        onDragLeave={() => setOverStage(s => (s === col.stage ? null : s))}
                        onDrop={e => { e.preventDefault(); onDrop(col.stage); }}
                        className={`rounded-xl border border-slate-200 border-t-4 ${COLUMN_STYLE[col.stage]} bg-slate-50/80 min-h-[320px] transition-colors ${overStage === col.stage ? 'bg-blue-50 ring-2 ring-blue-200' : ''}`}>
                        <header className="flex items-center justify-between px-3 py-2.5">
                            <h2 className="text-[12px] font-bold uppercase tracking-wider text-slate-600">{col.label}</h2>
                            <span className="text-[12px] font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-2" data-testid={`count-${col.stage}`}>{col.total}</span>
                        </header>
                        <div className="flex flex-col gap-2 px-2 pb-3">
                            {loading && !board && <div className="h-20 rounded-lg bg-white animate-pulse" />}
                            {col.items.map(item => (
                                <article key={`${item.entityType}:${item.entityId}`} draggable={!busy}
                                    onDragStart={() => setDragging(item)} onDragEnd={() => { setDragging(null); setOverStage(null); }}
                                    onClick={() => router.push(item.href)} onKeyDown={e => { if (e.key === 'Enter') router.push(item.href); }} tabIndex={0}
                                    data-testid="board-card" data-entity={`${item.entityType}:${item.entityId}`}
                                    className={`cursor-grab active:cursor-grabbing rounded-lg bg-white border border-slate-200 p-3 shadow-sm hover:border-blue-300 ${dragging?.entityId === item.entityId ? 'opacity-50' : ''}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10.5px] font-semibold rounded px-1.5 py-0.5 ${TYPE_STYLE[item.entityType]}`}>{ENTITY_LABELS[item.entityType]}</span>
                                        <span className="font-mono text-[11px] text-slate-500 truncate">{item.code}</span>
                                    </div>
                                    <p className="font-semibold text-slate-900 leading-snug line-clamp-2">{item.title}</p>
                                    <div className="mt-2 text-[11.5px] text-slate-500 space-y-0.5">
                                        <p>Sorumlu: <span className="text-slate-700">{item.assignee?.name ?? 'Atanmamış'}</span></p>
                                        <p>2. kontrolcü: <span className="text-slate-700">{item.checker?.name ?? 'Atanmamış'}</span></p>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <span className="text-[10.5px] font-medium text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">{col.label}</span>
                                        {(item.flags ?? []).map(f => <span key={f} className={`text-[10.5px] font-semibold border rounded px-1.5 py-0.5 ${FLAG_LABEL[f].cls}`}>{FLAG_LABEL[f].label}</span>)}
                                        {fmtDate(item.plannedDate) && <span className="ml-auto text-[11px] text-slate-400">{fmtDate(item.plannedDate)}</span>}
                                    </div>
                                </article>
                            ))}
                            {!loading && col.items.length === 0 && <p className="text-center text-slate-400 text-[12px] py-6">Bu aşamada işlem yok</p>}
                            {col.total > col.items.length && <p className="text-center text-slate-400 text-[11.5px]">+{col.total - col.items.length} işlem daha (filtreyi daraltın)</p>}
                        </div>
                    </section>
                ))}
            </div>

            <Modal open={!!reasonFor} onClose={() => !busy && setReasonFor(null)} size="md"
                title={reasonFor ? `${reasonFor.item.code}: ${reasonFor.to === 'DEVAM_EDIYOR' && reasonFor.item.stage === 'TAMAMLANDI' ? 'İade et' : 'Önceki aşamaya geri al'}` : ''}
                description="Geri yönlü taşıma gerekçe ister ve durum geçmişine yazılır."
                footer={<div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setReasonFor(null)} disabled={busy}>Vazgeç</Button>
                    <Button variant="primary" size="sm" loading={busy} disabled={!reason.trim()} onClick={() => reasonFor && doMove(reasonFor.item, reasonFor.to, reason.trim())}>Taşı</Button>
                </div>}>
                <label htmlFor="move-reason" className="block text-xs font-semibold text-slate-600 mb-1">Gerekçe *</label>
                <textarea id="move-reason" value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={2000} autoFocus className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </Modal>
        </div>
    );
}
