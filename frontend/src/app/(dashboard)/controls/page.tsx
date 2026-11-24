'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import ImportControlModal from '@/components/modals/ImportControlModal';
import ScopeAddModal from '@/components/modals/ScopeAddModal';
import { PermissionGate } from '@/components/auth/AuthProvider';
import { FREQUENCY_LABELS } from '@/lib/control-labels';
import { Button, Modal } from '@/components/ui';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Control {
    id: string;
    controlId: string;
    name: string;
    mehaz: string;
    type: string;
    frequency: string;
    directorate: string;
    owner: { id: string; name: string };
    lastTestDate: string | null;
    effectivenessStatus: string;
    status: 'ACTIVE' | 'PASSIVE';
    scopeYears: number[];
    /** Bu yılın test uyumu (sunucu özeti) */
    tests: { year: number; planned: number; completed: number; overdue: number; nextPlannedDate: string | null };
    openFindingCount: number;
    /** Bekleyen yönetici onaylı silme talebi */
    deletionPending: boolean;
}

// Kontrol silme talebini kontrol oluşturabilen roller açar; kararı yönetici verir (sunucu da denetler).
const CONTROL_DELETE_REQUESTERS = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR'];

type TabKey = 'all' | 'active' | 'overdue' | 'findings' | 'mine';
type SortKey = 'controlId' | 'name' | 'lastTestDate' | 'nextPlannedDate';

const PAGE_SIZE = 20;
const SOLID = { blue: '#2563eb', green: '#16a34a', red: '#dc2626', amber: '#d97706', violet: '#7c3aed' } as const;

const effectivenessLabel: Record<string, { label: string; cls: string }> = {
    PARTIALLY_EFFECTIVE: { label: 'Kısmen Etkin', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
    INEFFECTIVE: { label: 'Etkin Değil', cls: 'text-red-700 bg-red-50 border-red-200' },
};

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
};
const dayDiff = (d: string) => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    return Math.round((x.getTime() - t.getTime()) / 86400000);
};
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

// ─── Küçük bileşenler ────────────────────────────────────────────────────────

function Kpi({ label, value, sub, color, percent, active, onClick }: {
    label: string; value: number | string; sub?: string; color: string; percent: number; active?: boolean; onClick?: () => void;
}) {
    return (
        <button type="button" onClick={onClick}
            className={`text-left bg-white border rounded-xl px-4 py-3.5 transition-shadow hover:shadow-sm ${active ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2 text-[11.5px] font-medium text-slate-500">
                <span className="w-2 h-2 rounded-sm" style={{ background: color }} />{label}
            </div>
            <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-[26px] font-bold leading-none text-slate-900 tabular-nums">{value}</span>
                {sub && <span className="text-[11.5px] text-slate-500">{sub}</span>}
            </div>
            <div className="h-1 rounded bg-slate-100 mt-2.5 overflow-hidden">
                <div className="h-full rounded" style={{ width: `${Math.min(100, percent)}%`, background: color }} />
            </div>
        </button>
    );
}

function Select({ value, onChange, label, options }: {
    value: string; onChange: (v: string) => void; label: string; options: Array<{ value: string; label: string }>;
}) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}
            className={`h-8 max-w-[150px] px-2 rounded-lg border bg-white text-[12.5px] cursor-pointer ${value ? 'border-blue-300 text-blue-700' : 'border-slate-200 text-slate-700'}`}>
            <option value="">{label}</option>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default function ControlInventoryPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const { user: currentUser } = useAuth();
    const canRequestDelete = CONTROL_DELETE_REQUESTERS.includes(currentUser?.role?.name ?? '');

    const [controls, setControls] = useState<Control[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [scopeModalOpen, setScopeModalOpen] = useState(false);
    // Seçili kontroller için toplu silme talebi (üst araç çubuğu).
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteReason, setDeleteReason] = useState('');
    const [deleting, setDeleting] = useState(false);

    const [tab, setTab] = useState<TabKey>('all');
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState({ directorate: '', frequency: '', owner: '', type: '' });
    const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'controlId', dir: 'asc' });
    const [page, setPage] = useState(1);

    const fetchControls = useCallback(async () => {
        try {
            setLoading(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = await api.getControls() as any;
            const list = Array.isArray(data) ? data : (data.data || []);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setControls(list.map((c: any): Control => ({
                id: String(c.id),
                controlId: String(c.controlId || ''),
                name: String(c.name || ''),
                mehaz: String(c.mehaz || ''),
                type: String(c.type || 'IT_GENERAL'),
                frequency: String(c.frequency || 'MONTHLY'),
                directorate: String(c.directorateRel?.name || c.directorate || ''),
                owner: { id: String(c.owner?.id || ''), name: `${c.owner?.firstName || ''} ${c.owner?.lastName || ''}`.trim() || 'Atanmamış' },
                lastTestDate: c.lastTestDate ? String(c.lastTestDate) : null,
                effectivenessStatus: String(c.effectivenessStatus || 'NOT_TESTED'),
                status: c.displayStatus === 'AKTIF' ? 'ACTIVE' : 'PASSIVE',
                scopeYears: Array.isArray(c.scopeYears) ? c.scopeYears : [],
                tests: {
                    year: c.testSummary?.year ?? new Date().getFullYear(),
                    planned: c.testSummary?.planned ?? 0, completed: c.testSummary?.completed ?? 0,
                    overdue: c.testSummary?.overdue ?? 0, nextPlannedDate: c.testSummary?.nextPlannedDate ?? null,
                },
                openFindingCount: c.openFindingCount ?? 0,
                deletionPending: !!c.deletionRequestedAt,
            })));
        } catch (err) {
            console.error(err);
            showError('Hata', 'Kontroller yüklenemedi.');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => { fetchControls(); }, [fetchControls]);

    // ── Sekmeler / sayaçlar ────────────────────────────────────────────────────
    const tabFns: Record<TabKey, (c: Control) => boolean> = useMemo(() => ({
        all: () => true,
        active: c => c.status === 'ACTIVE',
        overdue: c => c.tests.overdue > 0,
        findings: c => c.openFindingCount > 0,
        mine: c => !!currentUser && c.owner.id === currentUser.id,
    }), [currentUser]);
    const tabCounts = useMemo(() => Object.fromEntries((Object.keys(tabFns) as TabKey[]).map(k => [k, controls.filter(tabFns[k]).length])) as Record<TabKey, number>, [controls, tabFns]);

    const options = useMemo(() => {
        const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'tr')).map(v => ({ value: v, label: v }));
        return {
            directorate: uniq(controls.map(c => c.directorate)),
            owner: uniq(controls.map(c => c.owner.name)),
            frequency: Object.entries(FREQUENCY_LABELS).filter(([k]) => controls.some(c => c.frequency === k)).map(([value, label]) => ({ value, label })),
        };
    }, [controls]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const isBT = (t: string) => ['IT_GENERAL', 'IT_APPLICATION', 'BT'].includes(t);
        const rows = controls.filter(c =>
            tabFns[tab](c)
            && (!q || c.name.toLowerCase().includes(q) || c.controlId.toLowerCase().includes(q) || c.owner.name.toLowerCase().includes(q) || c.mehaz.toLowerCase().includes(q))
            && (!filters.directorate || c.directorate === filters.directorate)
            && (!filters.frequency || c.frequency === filters.frequency)
            && (!filters.owner || c.owner.name === filters.owner)
            && (!filters.type || (filters.type === 'BT' ? isBT(c.type) : !isBT(c.type))));
        const val = (c: Control) => (sort.key === 'nextPlannedDate' ? c.tests.nextPlannedDate : c[sort.key]) ?? '';
        rows.sort((a, b) => {
            const A = String(val(a)); const B = String(val(b));
            if (!A && B) return 1; if (A && !B) return -1; // boşlar hep sonda
            return sort.dir === 'asc' ? A.localeCompare(B, 'tr') : B.localeCompare(A, 'tr');
        });
        return rows;
    }, [controls, tab, tabFns, search, filters, sort]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    // ── KPI'lar ────────────────────────────────────────────────────────────────
    const total = controls.length;
    const overdueControls = tabCounts.overdue;
    const withFindings = tabCounts.findings;
    const openFindings = controls.reduce((s, c) => s + c.openFindingCount, 0);
    const planned = controls.reduce((s, c) => s + c.tests.planned, 0);
    const completed = controls.reduce((s, c) => s + c.tests.completed, 0);
    const year = controls[0]?.tests.year ?? new Date().getFullYear();

    const hasFilter = !!search || Object.values(filters).some(Boolean) || tab !== 'all';
    const clearAll = () => { setSearch(''); setFilters({ directorate: '', frequency: '', owner: '', type: '' }); setTab('all'); setPage(1); };
    const setF = (k: keyof typeof filters) => (v: string) => { setFilters(p => ({ ...p, [k]: v })); setPage(1); };
    const toggleSort = (key: SortKey) => setSort(p => (p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

    // Her kontrol ayrı talep edilir: geçmişi olan kontrol sunucuda reddedilir (gerekçesiyle), diğerleri onaya gider.
    const submitDeleteRequests = async () => {
        if (!deleteReason.trim()) return;
        setDeleting(true);
        const ok: string[] = [];
        const failed: string[] = [];
        for (const c of controls.filter(x => selectedRows.has(x.id))) {
            if (c.deletionPending) { failed.push(`${c.controlId}: zaten bekleyen talep var`); continue; }
            try { await api.requestDeletion('CONTROL', c.id, deleteReason.trim()); ok.push(c.controlId); }
            catch (err) { failed.push(`${c.controlId}: ${err instanceof Error ? err.message : 'talep açılamadı'}`); }
        }
        setDeleting(false);
        setDeleteOpen(false);
        setSelectedRows(new Set());
        if (ok.length) success('Silme talebi gönderildi', `${ok.join(', ')} yönetici onayına gitti.`);
        if (failed.length) showError(`${failed.length} kontrol için talep açılamadı`, failed.join('\n'));
        fetchControls();
    };

    const allSelected = pageRows.length > 0 && pageRows.every(c => selectedRows.has(c.id));
    const toggleRow = (id: string) => setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const toggleAll = () => setSelectedRows(prev => {
        const n = new Set(prev);
        if (allSelected) pageRows.forEach(c => n.delete(c.id)); else pageRows.forEach(c => n.add(c.id));
        return n;
    });

    const th = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100 whitespace-nowrap';
    const sortable = (key: SortKey, label: string) => (
        <th className={th} aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button type="button" onClick={() => toggleSort(key)} className="uppercase tracking-wider font-semibold hover:text-slate-800">
                {label}{sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
        </th>
    );

    const tabs: Array<{ key: TabKey; label: string }> = [
        { key: 'all', label: 'Tümü' }, { key: 'active', label: 'Etkin' }, { key: 'overdue', label: 'Test gecikmiş' },
        { key: 'findings', label: 'Bulgulu' }, { key: 'mine', label: 'Benim' },
    ];

    return (
        <div className="flex flex-col gap-4 pb-10 text-[13px]" data-testid="control-inventory">
            {/* Başlık */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <div className="text-xs text-slate-500 mb-1.5">Kontrol Yönetimi <span className="mx-1">/</span> <span className="text-slate-900 font-medium">Kontrol Envanteri</span></div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Kontrol Envanteri</h1>
                    <p className="mt-1 text-sm text-slate-500">{total} ana kontrol · {year} test dönemi</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {selectedRows.size > 0 && (
                        <PermissionGate permission="control:*">
                            <button type="button" onClick={() => setScopeModalOpen(true)} className="h-9 px-3.5 rounded-lg border border-blue-300 bg-blue-50 text-[13px] font-medium text-blue-700">
                                {selectedRows.size} Kontrolü Kapsama Al
                            </button>
                        </PermissionGate>
                    )}
                    {canRequestDelete && (
                        <button type="button" onClick={() => { setDeleteReason(''); setDeleteOpen(true); }} disabled={selectedRows.size === 0}
                            title={selectedRows.size === 0 ? 'Silmek istediğiniz kontrolleri listeden seçin' : undefined}
                            data-testid="control-delete-request"
                            className="h-9 px-3.5 rounded-lg border border-rose-300 bg-white text-[13px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white">
                            {selectedRows.size > 0 ? `${selectedRows.size} Kontrol İçin Silme Talebi` : 'Silme Talebi'}
                        </button>
                    )}
                    <button type="button" onClick={() => setImportModalOpen(true)} className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50">İçe Aktar</button>
                    <Link href="/controls/new" className="h-9 px-4 inline-flex items-center rounded-lg bg-blue-600 text-[13px] font-semibold text-white hover:bg-blue-700">+ Yeni Kontrol</Link>
                </div>
            </div>

            {/* KPI'lar */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Kpi label="Toplam kontrol" value={total} sub="envanterde" color={SOLID.blue} percent={total ? 100 : 0} active={tab === 'all' && !hasFilter} onClick={clearAll} />
                <Kpi label="Etkin" value={tabCounts.active} sub={`%${pct(tabCounts.active, total)}`} color={SOLID.green} percent={pct(tabCounts.active, total)} active={tab === 'active'} onClick={() => { setTab('active'); setPage(1); }} />
                <Kpi label="Testi geciken" value={overdueControls} sub={`%${pct(overdueControls, total)}`} color={SOLID.red} percent={pct(overdueControls, total)} active={tab === 'overdue'} onClick={() => { setTab('overdue'); setPage(1); }} />
                <Kpi label="Bulgulu kontrol" value={withFindings} sub={`${openFindings} açık bulgu`} color={SOLID.amber} percent={pct(withFindings, total)} active={tab === 'findings'} onClick={() => { setTab('findings'); setPage(1); }} />
                <Kpi label="Test uyumu" value={`%${pct(completed, planned)}`} sub={`${completed} / ${planned} tamamlanan`} color={SOLID.violet} percent={pct(completed, planned)} />
            </div>

            {/* Liste */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-slate-100">
                    <div className="flex gap-1 bg-slate-100 p-[3px] rounded-lg" role="tablist" aria-label="Kontrol görünümü">
                        {tabs.map(t => (
                            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setPage(1); }}
                                className={`h-7 px-3 rounded-md text-[12.5px] font-medium ${tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                                {t.label} <span className="ml-1 text-slate-400">{tabCounts[t.key]}</span>
                            </button>
                        ))}
                    </div>
                    <div className="flex-1" />
                    <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Kod, isim veya sahip ara"
                        aria-label="Kontrol ara" className="h-8 w-[200px] px-3 rounded-lg border border-slate-200 text-[12.5px] outline-none focus:border-blue-400" />
                    <Select value={filters.directorate} onChange={setF('directorate')} label="Direktörlük" options={options.directorate} />
                    <Select value={filters.frequency} onChange={setF('frequency')} label="Sıklık" options={options.frequency} />
                    <Select value={filters.owner} onChange={setF('owner')} label="Sahip" options={options.owner} />
                    <Select value={filters.type} onChange={setF('type')} label="Tip" options={[{ value: 'BT', label: 'BT' }, { value: 'BT_DISI', label: 'BT Dışı' }]} />
                    {hasFilter && <button type="button" onClick={clearAll} className="h-8 px-2 text-[12.5px] text-slate-500 hover:text-slate-800 underline">Temizle</button>}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse min-w-[1180px]">
                        <thead>
                            <tr>
                                <th className={`${th} w-8 pl-4`}><input type="checkbox" aria-label="Sayfadakileri seç" checked={allSelected} onChange={toggleAll} /></th>
                                {sortable('controlId', 'Kod')}{sortable('name', 'Kontrol')}
                                <th className={th}>Direktörlük</th><th className={th}>Sıklık</th><th className={th}>Sahip</th>
                                <th className={th}>Test uyumu</th>{sortable('lastTestDate', 'Son test')}{sortable('nextPlannedDate', 'Sonraki test')}
                                <th className={th}>Bulgu</th><th className={th}>Durum</th><th className={`${th} w-16`} />
                            </tr>
                        </thead>
                        <tbody>
                            {loading && Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i}><td colSpan={12} className="px-4 py-5"><div className="h-4 rounded bg-slate-100 animate-pulse" /></td></tr>
                            ))}
                            {!loading && pageRows.length === 0 && (
                                <tr><td colSpan={12} className="px-4 py-14 text-center text-sm text-slate-500">
                                    Bu görünümde kontrol yok.{hasFilter && <> <button type="button" onClick={clearAll} className="underline text-blue-600">Filtreleri temizle</button></>}
                                </td></tr>
                            )}
                            {!loading && pageRows.map(c => {
                                const next = c.tests.nextPlannedDate;
                                const nd = next ? dayDiff(next) : null;
                                const eff = effectivenessLabel[c.effectivenessStatus];
                                return (
                                    <tr key={c.id} onClick={() => router.push(`/controls/${c.id}`)} className="group cursor-pointer border-b border-slate-100 hover:bg-slate-50/70">
                                        <td className="pl-4 py-3" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`${c.controlId} seç`} checked={selectedRows.has(c.id)} onChange={() => toggleRow(c.id)} /></td>
                                        <td className="px-3 py-3 align-top" onClick={e => e.stopPropagation()}><Link href={`/controls/${c.id}`} className="font-mono text-[11.5px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 whitespace-nowrap hover:bg-blue-50 hover:text-blue-700">{c.controlId}</Link></td>
                                        <td className="px-3 py-3 min-w-[240px] max-w-[320px]">
                                            <Link href={`/controls/${c.id}`} onClick={e => e.stopPropagation()} className="font-semibold text-slate-900 hover:text-blue-700 leading-snug block">{c.name}</Link>
                                            {c.mehaz && <div className="text-[11.5px] text-slate-500 mt-0.5 truncate">{c.mehaz}</div>}
                                        </td>
                                        <td className="px-3 py-3 text-slate-700 min-w-[130px]">{c.directorate || '—'}</td>
                                        <td className="px-3 py-3"><span className="text-[11.5px] font-medium text-blue-700 bg-blue-50 rounded px-2 py-0.5 whitespace-nowrap">{FREQUENCY_LABELS[c.frequency] ?? c.frequency}</span></td>
                                        <td className="px-3 py-3">
                                            <div className="flex items-center gap-2 whitespace-nowrap">
                                                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center">{initials(c.owner.name)}</span>
                                                <span className="text-slate-800 text-[12.5px]">{c.owner.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 min-w-[110px]">
                                            {c.tests.planned > 0 ? (
                                                <div className="flex items-center gap-2" title={`${c.tests.year}: ${c.tests.completed} tamamlanan / ${c.tests.planned} planlanan`}>
                                                    <div className="h-1.5 w-16 rounded bg-slate-100 overflow-hidden">
                                                        <div className="h-full rounded" style={{ width: `${pct(c.tests.completed, c.tests.planned)}%`, background: c.tests.overdue > 0 ? SOLID.red : pct(c.tests.completed, c.tests.planned) >= 80 ? SOLID.green : SOLID.amber }} />
                                                    </div>
                                                    <span className="text-[11.5px] text-slate-600 tabular-nums">{c.tests.completed}/{c.tests.planned}</span>
                                                </div>
                                            ) : <span className="text-slate-400 text-[12px]">Planlı test yok</span>}
                                        </td>
                                        <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{formatDate(c.lastTestDate)}</td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            {next && nd !== null ? (
                                                <>
                                                    <div className={`font-semibold ${nd < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatDate(next)}</div>
                                                    <div className={`text-[11px] ${nd < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                                                        {nd < 0 ? `${Math.abs(nd)} gün gecikmiş` : nd === 0 ? 'bugün' : `${nd} gün sonra`}
                                                    </div>
                                                </>
                                            ) : <span className="text-slate-400">—</span>}
                                        </td>
                                        <td className="px-3 py-3">
                                            {c.openFindingCount > 0
                                                ? <span className="text-[11.5px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5 whitespace-nowrap">{c.openFindingCount} açık</span>
                                                : <span className="text-[11.5px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">Yok</span>}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-700">
                                                <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'}`} />{c.status === 'ACTIVE' ? 'Aktif' : 'Pasif'}
                                            </span>
                                            {eff && <div className={`mt-1 w-fit text-[10.5px] font-semibold border rounded px-1.5 py-0.5 ${eff.cls}`}>{eff.label}</div>}
                                        </td>
                                        <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-2">
                                                {c.deletionPending && <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 whitespace-nowrap" title="Yönetici onayı bekleniyor">Silme onayı bekliyor</span>}
                                                <Link href={`/controls/${c.id}/edit`} title="Düzenle" className="text-[12px] font-medium text-slate-400 hover:text-blue-600">Düzenle</Link>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between px-4 py-3 text-[12.5px] text-slate-500 border-t border-slate-100" data-testid="inventory-pager">
                    <span>{filtered.length === 0 ? '0 kayıt' : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)} / ${filtered.length} kayıt`}</span>
                    <div className="flex items-center gap-2">
                        <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="h-8 px-3 rounded-lg border border-slate-200 disabled:opacity-40">Önceki</button>
                        <span>{safePage} / {pageCount}</span>
                        <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="h-8 px-3 rounded-lg border border-slate-200 disabled:opacity-40">Sonraki</button>
                    </div>
                </div>
            </section>

            <ScopeAddModal
                open={scopeModalOpen}
                onClose={() => setScopeModalOpen(false)}
                controlIds={Array.from(selectedRows)}
                onSuccess={() => { setSelectedRows(new Set()); fetchControls(); }}
            />
            <Modal open={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} size="md"
                title={`${selectedRows.size} kontrol için silme talebi`}
                description="Yalnız geçmişi olmayan kontrol silinebilir (başlamış/tamamlanmış testi, bulgusu veya aksiyonu yok); öyleyse kontrolü pasifleştirin. Talep yönetici onayına gider; onaylanınca başlamamış testler ve dönem kontrolleri iptal edilir, kayıt denetim için korunur."
                footer={<div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} disabled={deleting}>Vazgeç</Button>
                    <Button variant="danger" size="sm" loading={deleting} disabled={!deleteReason.trim()} onClick={submitDeleteRequests}>Silme talebi gönder</Button>
                </div>}>
                <p className="text-xs text-slate-600 mb-2">
                    {controls.filter(c => selectedRows.has(c.id)).map(c => c.controlId).join(', ')}
                </p>
                <label htmlFor="control-delete-reason" className="block text-xs font-semibold text-slate-600 mb-1">Silme gerekçesi *</label>
                <textarea id="control-delete-reason" value={deleteReason} onChange={e => setDeleteReason(e.target.value)} rows={3} maxLength={2000} autoFocus
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </Modal>
            <ImportControlModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                onImportSuccess={() => { success('Başarılı', 'Kontroller başarıyla içeri aktarıldı.'); fetchControls(); }}
            />
        </div>
    );
}
