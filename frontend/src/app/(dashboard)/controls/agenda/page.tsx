'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { PageHeader, PageShell, KpiCard, KpiGrid, DataTable, StatusBadge, LoadingState } from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = 'panel' | 'list';

interface DashboardStats {
    year: number;
    controlCount: number;
    plannedTaskCount: number;
    notStarted: number;
    inProgress: number;
    pendingApproval: number;
    completed: number;
    cancelled: number;
    overdue: number;
    completionRate: number | null;
    resultDistribution: Record<string, number>;
    byPeriod: { periodKey: string; planned: number; completed: number }[];
}

interface TaskRow {
    id: string;
    testNo: string;
    plannedDate: string;
    status: string;
    findingStatus?: string | null;
    year?: number | null;
    periodLabel?: string | null;
    control: { id: string; controlId: string; name: string; frequency: string };
    assigneeId?: string | null;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const frequencyLabel: Record<string, string> = {
    DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık',
    QUARTERLY: '3 Aylık', SEMI_ANNUAL: '6 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi',
};

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const taskStatusLabel: Record<string, { label: string; variant: BV }> = {
    BEKLIYOR: { label: 'Bekliyor', variant: 'neutral' },
    DEVAM_EDIYOR: { label: 'Devam Ediyor', variant: 'warning' },
    TAMAMLANDI: { label: 'Onay Bekliyor', variant: 'info' },
    GERI_GONDERILDI: { label: 'Geri Gönderildi', variant: 'critical' },
    ONAYLANDI: { label: 'Onaylandı', variant: 'success' },
    IPTAL: { label: 'İptal', variant: 'neutral' },
    KAPSAM_DISI: { label: 'Kapsam Dışı', variant: 'neutral' },
};

const resultLabel: Record<string, { label: string; variant: BV }> = {
    BULGUSU_YOK: { label: 'Uygun', variant: 'success' },
    BULGUSU_VAR: { label: 'Bulgu Var', variant: 'critical' },
};

const CHART_COLORS = ['#059669', '#e11d48'];

const isOverdueTask = (t: TaskRow) =>
    ['BEKLIYOR', 'DEVAM_EDIYOR', 'GERI_GONDERILDI'].includes(t.status) && new Date(t.plannedDate) < new Date();

const fmt = (d?: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('tr-TR');
};

const emptyFilters = {
    year: String(new Date().getFullYear()),
    period: '',
    assigneeId: '',
    controlId: '',
    frequency: '',
    taskStatus: '',
    result: '',
    overdue: false,
    includeOutOfScope: false,
};

type Filters = typeof emptyFilters;

// ─── Görünüm İkon Butonları ────────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
    return (
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200">
            <button
                type="button"
                title="Panel Görünümü"
                aria-label="Panel görünümüne geç"
                aria-pressed={view === 'panel'}
                onClick={() => onChange('panel')}
                className={`p-2 rounded-lg transition-colors ${view === 'panel' ? 'bg-white text-emerald-700 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
            </button>
            <button
                type="button"
                title="Liste Görünümü"
                aria-label="Liste görünümüne geç"
                aria-pressed={view === 'list'}
                onClick={() => onChange('list')}
                className={`p-2 rounded-lg transition-colors ${view === 'list' ? 'bg-white text-emerald-700 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
        </div>
    );
}

export default function ControlDashboardPage() {
    const [view, setView] = useState<ViewMode>('panel');
    const [filters, setFilters] = useState<Filters>(emptyFilters);
    const [years, setYears] = useState<number[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [users, setUsers] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [controlOptions, setControlOptions] = useState<any[]>([]);

    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [tasks, setTasks] = useState<TaskRow[]>([]);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [page, setPage] = useState(1);
    const pageSize = 25;
    const [searchQuery, setSearchQuery] = useState('');

    // Görünüm tercihi hatırlanır
    useEffect(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('control-dashboard-view') : null;
        if (saved === 'panel' || saved === 'list') setView(saved);
    }, []);
    const changeView = (v: ViewMode) => {
        setView(v);
        if (typeof window !== 'undefined') localStorage.setItem('control-dashboard-view', v);
    };

    useEffect(() => {
        api.getScopeYears().then(r => setYears(r.years)).catch(() => { });
        api.getUsers().then(r => setUsers(Array.isArray(r) ? r : [])).catch(() => { });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        api.getControls({ limit: 500 }).then((r: any) => setControlOptions(Array.isArray(r) ? r : (r?.data || []))).catch(() => { });
    }, []);

    const dashboardQuery = useMemo(() => ({
        year: filters.year || 'all',
        ...(filters.period && { period: filters.period }),
        ...(filters.assigneeId && { assigneeId: filters.assigneeId }),
        ...(filters.controlId && { controlId: filters.controlId }),
        ...(filters.frequency && { frequency: filters.frequency }),
        ...(filters.taskStatus && { taskStatus: filters.taskStatus }),
        ...(filters.result && { result: filters.result }),
        ...(filters.overdue && { overdue: true }),
        ...(filters.includeOutOfScope && { includeOutOfScope: true }),
    }), [filters]);

    const tasksQuery = useMemo(() => ({
        limit: 500,
        year: filters.year || 'all',
        ...(filters.period && { period: filters.period }),
        ...(filters.assigneeId && { assigneeId: filters.assigneeId }),
        ...(filters.controlId && { controlId: filters.controlId }),
        ...(filters.frequency && { frequency: filters.frequency }),
        ...(filters.taskStatus && { status: filters.taskStatus }),
        ...(filters.result && { findingStatus: filters.result }),
        ...(filters.overdue && { overdue: true }),
        ...(filters.includeOutOfScope && { includeOutOfScope: true }),
    }), [filters]);

    const loadStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await api.getControlDashboard(dashboardQuery as any);
            setStats(r);
        } catch {
            setStats(null);
        } finally {
            setStatsLoading(false);
        }
    }, [dashboardQuery]);

    const loadTasks = useCallback(async () => {
        setTasksLoading(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await api.getAllControlTests(tasksQuery as any) as any;
            setTasks(r?.data || []);
        } catch {
            setTasks([]);
        } finally {
            setTasksLoading(false);
        }
    }, [tasksQuery]);

    useEffect(() => { loadStats(); }, [loadStats]);
    useEffect(() => { loadTasks(); setPage(1); }, [loadTasks]);

    const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters(p => ({ ...p, [key]: value }));

    const filteredTasks = useMemo(() => {
        if (!searchQuery) return tasks;
        const q = searchQuery.toLowerCase();
        return tasks.filter(t => [t.testNo, t.control.controlId, t.control.name].filter(Boolean).join(' ').toLowerCase().includes(q));
    }, [tasks, searchQuery]);

    const paginatedTasks = useMemo(() => filteredTasks.slice((page - 1) * pageSize, page * pageSize), [filteredTasks, page]);

    const userLabel = (id?: string | null) => {
        if (!id) return '—';
        const u = users.find((x) => x.id === id);
        return u ? `${u.firstName} ${u.lastName}` : '—';
    };

    // Grafiğe/göstergeye tıklama → ilgili filtre uygulanarak liste görünümüne geç
    const applyPeriodAndGoToList = (periodKey: string) => {
        setFilter('period', periodKey);
        changeView('list');
    };
    const applyStatusAndGoToList = (status: string) => {
        setFilter('taskStatus', status);
        changeView('list');
    };
    const applyOverdueAndGoToList = () => {
        setFilter('overdue', true);
        changeView('list');
    };

    const columns: ColumnDef<TaskRow>[] = useMemo(() => [
        {
            key: 'controlId', header: 'Kontrol ID', defaultWidth: 120,
            render: (t) => <Link href={`/controls/${t.control.id}`} className="font-mono font-semibold text-emerald-700 hover:underline">{t.control.controlId}</Link>,
        },
        { key: 'name', header: 'Kontrol Adı', defaultWidth: 200, render: (t) => <span className="text-slate-700 truncate block max-w-[190px]" title={t.control.name}>{t.control.name}</span> },
        { key: 'year', header: 'Yıl', defaultWidth: 70, render: (t) => t.year ?? '—' },
        { key: 'period', header: 'Dönem', defaultWidth: 130, render: (t) => t.periodLabel || '—' },
        { key: 'frequency', header: 'Periyodiklik', defaultWidth: 100, render: (t) => <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">{frequencyLabel[t.control.frequency] || t.control.frequency}</span> },
        { key: 'assignee', header: 'Sorumlu', defaultWidth: 140, render: (t) => userLabel(t.assigneeId) },
        { key: 'plannedDate', header: 'Hedef Tarih', defaultWidth: 100, render: (t) => fmt(t.plannedDate) },
        { key: 'status', header: 'Task Durumu', defaultWidth: 120, render: (t) => { const c = taskStatusLabel[t.status]; return c ? <StatusBadge variant={c.variant}>{c.label}</StatusBadge> : t.status; } },
        { key: 'result', header: 'Kontrol Sonucu', defaultWidth: 110, render: (t) => { const c = t.findingStatus ? resultLabel[t.findingStatus] : null; return c ? <StatusBadge variant={c.variant}>{c.label}</StatusBadge> : <span className="text-slate-300">—</span>; } },
        { key: 'overdue', header: 'Gecikme', defaultWidth: 90, render: (t) => isOverdueTask(t) ? <StatusBadge variant="critical">Gecikmiş</StatusBadge> : <span className="text-slate-300">—</span> },
        { key: 'actions', header: 'İşlem', defaultWidth: 100, render: (t) => <Link href={`/controls/testing/${t.id}`} className="text-xs font-bold text-emerald-700 hover:underline">Teste Git →</Link> },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [users]);

    const resultChartData = stats ? Object.entries(stats.resultDistribution).map(([key, value]) => ({ name: resultLabel[key]?.label || key, value })) : [];

    return (
        <PageShell>
            <PageHeader
                title="Kontrol Takip Panosu"
                description="Yıllık kapsamdaki kontrol tasklarının durumunu panel veya liste görünümünde izleyin"
                breadcrumbs={[{ label: 'Kontrol Yönetimi', href: '/controls' }, { label: 'Takip Panosu' }]}
                actions={<ViewToggle view={view} onChange={changeView} />}
            />

            {/* Ortak Filtreler */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-5 flex flex-wrap items-end gap-3">
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Yıl</label>
                    <select value={filters.year} onChange={(e) => setFilter('year', e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                        <option value="all">Tüm Yıllar</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Periyodiklik</label>
                    <select value={filters.frequency} onChange={(e) => setFilter('frequency', e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                        <option value="">Tümü</option>
                        {Object.entries(frequencyLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dönem</label>
                    <input value={filters.period} onChange={(e) => setFilter('period', e.target.value)} placeholder="ör. M03, Q2, H1"
                        className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white w-28" />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Sorumlu</label>
                    <select value={filters.assigneeId} onChange={(e) => setFilter('assigneeId', e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white max-w-[160px]">
                        <option value="">Tümü</option>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {users.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kontrol</label>
                    <select value={filters.controlId} onChange={(e) => setFilter('controlId', e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white max-w-[180px]">
                        <option value="">Tümü</option>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {controlOptions.map((c: any) => <option key={c.id} value={c.id}>{c.controlId}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Task Durumu</label>
                    <select value={filters.taskStatus} onChange={(e) => setFilter('taskStatus', e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                        <option value="">Tümü</option>
                        {Object.entries(taskStatusLabel).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kontrol Sonucu</label>
                    <select value={filters.result} onChange={(e) => setFilter('result', e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                        <option value="">Tümü</option>
                        {Object.entries(resultLabel).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                </div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 pb-1.5">
                    <input type="checkbox" checked={filters.overdue} onChange={(e) => setFilter('overdue', e.target.checked)} /> Yalnızca Gecikmiş
                </label>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 pb-1.5">
                    <input type="checkbox" checked={filters.includeOutOfScope} onChange={(e) => setFilter('includeOutOfScope', e.target.checked)} /> İptal/Kapsam Dışı Dahil Et
                </label>
                {view === 'list' && (
                    <div className="ml-auto">
                        <input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} placeholder="Ara..."
                            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white w-48" />
                    </div>
                )}
                {(filters.period || filters.assigneeId || filters.controlId || filters.frequency || filters.taskStatus || filters.result || filters.overdue || filters.includeOutOfScope) && (
                    <button onClick={() => setFilters({ ...emptyFilters, year: filters.year })} className="text-xs font-bold text-slate-400 hover:text-slate-700 underline pb-1.5">Filtreleri Temizle</button>
                )}
            </div>

            {view === 'panel' ? (
                statsLoading ? <LoadingState /> : !stats ? (
                    <p className="text-sm text-slate-400 p-6">Veri yüklenemedi.</p>
                ) : (
                    <div className="space-y-6">
                        <KpiGrid columns={4}>
                            <KpiCard title="Kapsamdaki Kontrol" value={stats.controlCount} variant="default" />
                            <KpiCard title="Planlanan Task" value={stats.plannedTaskCount} variant="default" />
                            <KpiCard title="Başlamamış" value={stats.notStarted} variant="default" onClick={() => applyStatusAndGoToList('BEKLIYOR')} />
                            <KpiCard title="Devam Eden" value={stats.inProgress} variant="warning" onClick={() => applyStatusAndGoToList('DEVAM_EDIYOR')} />
                            <KpiCard title="Onay Bekleyen" value={stats.pendingApproval} variant="info" onClick={() => applyStatusAndGoToList('TAMAMLANDI')} />
                            <KpiCard title="Tamamlanan" value={stats.completed} variant="success" onClick={() => applyStatusAndGoToList('ONAYLANDI')} />
                            <KpiCard title="Gecikmiş" value={stats.overdue} variant="critical" onClick={applyOverdueAndGoToList} />
                            <KpiCard title="Tamamlanma Oranı" value={stats.completionRate === null ? '—' : `%${stats.completionRate}`} variant="primary" />
                        </KpiGrid>
                        <p className="text-[11px] text-slate-400 -mt-3">
                            İptal/kapsam dışı tasklar ({stats.cancelled}) aktif iş yükü ve tamamlanma oranına dahil edilmez. Kontrol sayısı ile task sayısı farklı kavramlardır.
                        </p>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
                                <p className="text-sm font-bold text-slate-700 mb-3">Dönemlere Göre Planlanan / Tamamlanan Tasklar</p>
                                {stats.byPeriod.length === 0 ? (
                                    <p className="text-sm text-slate-400 py-8 text-center">Bu filtrelerle veri bulunamadı.</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={280}>
                                        <BarChart data={stats.byPeriod} onClick={(e: any) => { const key = e?.activeLabel ?? e?.activePayload?.[0]?.payload?.periodKey; if (key) applyPeriodAndGoToList(key); }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                            <XAxis dataKey="periodKey" tick={{ fontSize: 11 }} />
                                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                            <Tooltip />
                                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                            <Bar dataKey="planned" name="Planlanan" fill="#94a3b8" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(data: any) => applyPeriodAndGoToList(data.periodKey)} />
                                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                            <Bar dataKey="completed" name="Tamamlanan" fill="#059669" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(data: any) => applyPeriodAndGoToList(data.periodKey)} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                            <div className="bg-white rounded-2xl border border-slate-200 p-5">
                                <p className="text-sm font-bold text-slate-700 mb-3">Kontrol Sonuçlarının Dağılımı</p>
                                {resultChartData.length === 0 ? (
                                    <p className="text-sm text-slate-400 py-8 text-center">Onaylanmış sonuç yok — sonucu olmayan tasklar &quot;uygun&quot; sayılmaz.</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={220}>
                                        <PieChart>
                                            <Pie data={resultChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                                {resultChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    </div>
                )
            ) : (
                <DataTable
                    columns={columns}
                    data={paginatedTasks}
                    rowKey={(t) => t.id}
                    loading={tasksLoading}
                    totalCount={filteredTasks.length}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    storageKey="control-dashboard-list"
                    emptyTitle="Task bulunamadı"
                    emptyDescription="Seçili filtrelerle eşleşen kontrol taskı yok."
                    stickyFirstColumn
                    onRefresh={loadTasks}
                />
            )}
        </PageShell>
    );
}
