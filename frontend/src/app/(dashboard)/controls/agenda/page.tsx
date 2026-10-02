'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { PageHeader, PageShell, KpiCard, KpiGrid, StatusBadge, LoadingState, EmptyState, ErrorState, MultiSelectField } from '@/components/ui';
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'panel';

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

interface PeriodControlRow {
    scopeId: string;
    code: string; // "2027.BTK.0042"
    controlId: string;
    controlCode: string; // "BTK.0042"
    controlName: string;
    directorateId: string | null;
    frequency: string;
    referenceMonth: number | null;
    selectedMonths: string[];
    assignee: { id: string; firstName: string; lastName: string } | null;
    secondController: { id: string; firstName: string; lastName: string } | null;
    hasNewControlVersion: boolean;
    totalTaskCount: number;
    completedTaskCount: number;
    pendingApprovalCount: number;
    overdueCount: number;
    findingsCount: number;
    nextTestDate: string | null;
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
    secondControllerId?: string | null;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const frequencyLabel: Record<string, string> = {
    DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık',
    QUARTERLY: '3 Aylık', SEMI_ANNUAL: '6 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi',
};
const MONTH_LABELS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

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

const fmt = (d?: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('tr-TR');
};

const describeMonths = (row: PeriodControlRow) => {
    if (row.frequency === 'MONTHLY') return 'Her ay';
    if (row.frequency === 'WEEKLY') return 'Her Cuma';
    if (row.frequency === 'DAILY') return 'Otomatik task üretilmiyor';
    if (row.selectedMonths.length > 0) return row.selectedMonths.join(', ');
    return '—';
};

const emptyFilters = {
    year: String(new Date().getFullYear()),
    month: '',
    search: '',
    directorateId: '',
    assigneeId: '',
    secondControllerId: '',
    frequency: '',
    onlyOverdue: false,
    onlyPendingApproval: false,
    onlyWithFindings: false,
};

type Filters = typeof emptyFilters;

// ─── Görünüm İkon Butonları ────────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
    return (
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200">
            <button type="button" title="Liste Görünümü" aria-pressed={view === 'list'} onClick={() => onChange('list')}
                className={`p-2 rounded-lg transition-colors ${view === 'list' ? 'bg-white text-emerald-700 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <button type="button" title="Özet Görünümü" aria-pressed={view === 'panel'} onClick={() => onChange('panel')}
                className={`p-2 rounded-lg transition-colors ${view === 'panel' ? 'bg-white text-emerald-700 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
            </button>
        </div>
    );
}

export default function PeriodControlsPage() {
    const [view, setView] = useState<ViewMode>('list'); // Madde 13: varsayılan görünüm Liste
    const [filters, setFilters] = useState<Filters>(emptyFilters);
    const [years, setYears] = useState<number[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [users, setUsers] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [directorates, setDirectorates] = useState<any[]>([]);

    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);

    const [rows, setRows] = useState<PeriodControlRow[]>([]);
    const [rowsLoading, setRowsLoading] = useState(true);
    const [rowsError, setRowsError] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [urlReady, setUrlReady] = useState(false);
    const initialFilterLoad = useRef(true);
    const pageSize = 25;

    // Filtreler yenileme/geri dönüşte korunur ve paylaşılabilir URL üretir.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setFilters(prev => ({
            ...prev,
            year: params.get('year') || prev.year,
            month: params.get('month') || '', search: params.get('search') || '',
            directorateId: params.get('directorateId') || '', frequency: params.get('frequency') || '',
            assigneeId: params.get('assigneeIds') || '', secondControllerId: params.get('secondControllerIds') || '',
            onlyOverdue: params.get('onlyOverdue') === 'true',
            onlyPendingApproval: params.get('onlyPendingApproval') === 'true',
            onlyWithFindings: params.get('onlyWithFindings') === 'true',
        }));
        const urlPage = Number(params.get('page'));
        if (Number.isInteger(urlPage) && urlPage > 0) setPage(urlPage);
        setUrlReady(true);
    }, []);

    useEffect(() => {
        if (!urlReady) return;
        const params = new URLSearchParams();
        params.set('year', filters.year);
        if (filters.month) params.set('month', filters.month);
        if (filters.search) params.set('search', filters.search);
        if (filters.directorateId) params.set('directorateId', filters.directorateId);
        if (filters.frequency) params.set('frequency', filters.frequency);
        if (filters.assigneeId) params.set('assigneeIds', filters.assigneeId);
        if (filters.secondControllerId) params.set('secondControllerIds', filters.secondControllerId);
        if (filters.onlyOverdue) params.set('onlyOverdue', 'true');
        if (filters.onlyPendingApproval) params.set('onlyPendingApproval', 'true');
        if (filters.onlyWithFindings) params.set('onlyWithFindings', 'true');
        if (page > 1) params.set('page', String(page));
        window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    }, [filters, page, urlReady]);

    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [testsByScope, setTestsByScope] = useState<Map<string, TaskRow[]>>(new Map());
    const [testsLoading, setTestsLoading] = useState<Set<string>>(new Set());
    const [showAllYearTests, setShowAllYearTests] = useState<Set<string>>(new Set());

    useEffect(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('period-controls-view') : null;
        if (saved === 'panel' || saved === 'list') setView(saved);
    }, []);
    const changeView = (v: ViewMode) => {
        setView(v);
        if (typeof window !== 'undefined') localStorage.setItem('period-controls-view', v);
    };

    useEffect(() => {
        api.getScopeYears().then(r => setYears(r.years)).catch(() => { });
        api.getUserOptions({ limit: 500 }).then(r => setUsers(r.data)).catch(() => { });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        api.getDirectorates({ isActive: 'true' }).then((r: any) => setDirectorates(Array.isArray(r) ? r : [])).catch(() => { });
    }, []);

    const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters(p => ({ ...p, [key]: value }));

    const dashboardQuery = useMemo(() => ({
        year: filters.year || 'all',
        ...(filters.frequency && { frequency: filters.frequency }),
        ...(filters.assigneeId && { assigneeId: filters.assigneeId }),
    }), [filters.year, filters.frequency, filters.assigneeId]);

    const periodQuery = useMemo(() => ({
        year: filters.year || String(new Date().getFullYear()),
        page: String(page), pageSize: String(pageSize),
        ...(filters.month && { month: filters.month }),
        ...(filters.search && { search: filters.search }),
        ...(filters.directorateId && { directorateId: filters.directorateId }),
        ...(filters.assigneeId && { assigneeId: filters.assigneeId }),
        ...(filters.secondControllerId && { secondControllerId: filters.secondControllerId }),
        ...(filters.frequency && { frequency: filters.frequency }),
        ...(filters.onlyOverdue && { onlyOverdue: 'true' }),
        ...(filters.onlyPendingApproval && { onlyPendingApproval: 'true' }),
        ...(filters.onlyWithFindings && { onlyWithFindings: 'true' }),
    }), [filters, page]);

    const loadStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const r = await api.getControlDashboard(dashboardQuery as any);
            setStats(r);
        } catch {
            setStats(null);
        } finally {
            setStatsLoading(false);
        }
    }, [dashboardQuery]);

    const loadRows = useCallback(async () => {
        setRowsLoading(true);
        setRowsError(null);
        try {
            const r = await api.getPeriodControls(periodQuery as any);
            setRows(r.data || []);
            setTotalCount(r.totalCount || 0);
        } catch (err) {
            setRowsError(err instanceof Error ? err.message : 'Dönem kontrolleri yüklenemedi.');
            setRows([]);
        } finally {
            setRowsLoading(false);
        }
    }, [periodQuery]);

    useEffect(() => { if (view === 'panel') loadStats(); }, [view, loadStats]);
    useEffect(() => { if (view === 'list') loadRows(); }, [view, loadRows]);
    useEffect(() => {
        if (!urlReady) return;
        if (initialFilterLoad.current) { initialFilterLoad.current = false; return; }
        setPage(1);
    }, [urlReady, filters.year, filters.month, filters.search, filters.directorateId, filters.assigneeId, filters.secondControllerId, filters.frequency, filters.onlyOverdue, filters.onlyPendingApproval, filters.onlyWithFindings]);

    const userLabel = (id?: string | null) => {
        if (!id) return '—';
        const u = users.find((x) => x.id === id);
        return u ? `${u.firstName} ${u.lastName}` : '—';
    };

    const toggleExpand = (row: PeriodControlRow, showAllYear = false) => {
        const isOpen = expanded.has(row.scopeId);
        setExpanded(prev => {
            const n = new Set(prev);
            if (isOpen) n.delete(row.scopeId); else n.add(row.scopeId);
            return n;
        });
        if (showAllYear) setShowAllYearTests(prev => new Set(prev).add(row.scopeId));
        if (!isOpen && !testsByScope.has(row.scopeId)) {
            setTestsLoading(prev => new Set(prev).add(row.scopeId));
            api.getAllControlTests({ controlId: row.controlId, year: filters.year, limit: 100, includeOutOfScope: 'true' } as any)
                .then((r: any) => {
                    setTestsByScope(prev => new Map(prev).set(row.scopeId, r?.data || []));
                })
                .catch(() => setTestsByScope(prev => new Map(prev).set(row.scopeId, [])))
                .finally(() => setTestsLoading(prev => { const n = new Set(prev); n.delete(row.scopeId); return n; }));
        }
    };

    const resultChartData = stats ? Object.entries(stats.resultDistribution).map(([key, value]) => ({ name: resultLabel[key]?.label || key, value })) : [];
    const anyFilterActive = filters.month || filters.search || filters.directorateId || filters.assigneeId || filters.secondControllerId || filters.frequency || filters.onlyOverdue || filters.onlyPendingApproval || filters.onlyWithFindings;

    return (
        <PageShell>
            <PageHeader
                title="Dönem Kontrolleri"
                description="Uygulanmış yıllık plan kapsamında oluşan yıl bazlı kontrol kayıtlarını ve testlerini izleyin"
                breadcrumbs={[{ label: 'Kontrol Yönetimi', href: '/controls' }, { label: 'Dönem Kontrolleri' }]}
                actions={<ViewToggle view={view} onChange={changeView} />}
            />

            {/* Filtreler */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-5 flex flex-wrap items-end gap-3">
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Yıl</label>
                    <select value={filters.year} onChange={(e) => setFilter('year', e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                {view === 'list' && (
                    <>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Uygulama Ayı</label>
                            <select value={filters.month} onChange={(e) => setFilter('month', e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                                <option value="">Tüm Aylar</option>
                                {MONTH_LABELS_TR.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kod / Tanım</label>
                            <input value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="ör. BTK.0042"
                                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white w-36" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Birim</label>
                            <select value={filters.directorateId} onChange={(e) => setFilter('directorateId', e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white max-w-[160px]">
                                <option value="">Tümü</option>
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {directorates.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                    </>
                )}
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Periyodiklik</label>
                    <select value={filters.frequency} onChange={(e) => setFilter('frequency', e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                        <option value="">Tümü</option>
                        {Object.entries(frequencyLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </div>
                <div className="w-52">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Birinci Kontrolcü</label>
                    <MultiSelectField field={{ type: 'multiselect', key: 'assigneeIds', label: 'Kişi seç', value: filters.assigneeId.split(',').filter(Boolean), onChange: v => setFilter('assigneeId', v.join(',')), options: [{ value: '__MINE__', label: 'Bana atananlar' }, { value: '__UNASSIGNED__', label: 'Atanmamış' }, ...users.map((u: any) => ({ value: u.id, label: `${u.firstName} ${u.lastName}${u.isActive === false ? ' (pasif)' : ''}` }))] }} />
                </div>
                {view === 'list' && (
                    <div className="w-52">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">İkinci Kontrolcü</label>
                        <MultiSelectField field={{ type: 'multiselect', key: 'secondControllerIds', label: 'Kişi seç', value: filters.secondControllerId.split(',').filter(Boolean), onChange: v => setFilter('secondControllerId', v.join(',')), options: [{ value: '__MINE__', label: 'Bana atananlar' }, { value: '__UNASSIGNED__', label: 'Atanmamış' }, ...users.map((u: any) => ({ value: u.id, label: `${u.firstName} ${u.lastName}${u.isActive === false ? ' (pasif)' : ''}` }))] }} />
                    </div>
                )}
                {view === 'list' && (
                    <>
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 pb-1.5">
                            <input type="checkbox" checked={filters.onlyOverdue} onChange={(e) => setFilter('onlyOverdue', e.target.checked)} /> Gecikmiş testi olanlar
                        </label>
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 pb-1.5">
                            <input type="checkbox" checked={filters.onlyPendingApproval} onChange={(e) => setFilter('onlyPendingApproval', e.target.checked)} /> Onay bekleyen testi olanlar
                        </label>
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 pb-1.5">
                            <input type="checkbox" checked={filters.onlyWithFindings} onChange={(e) => setFilter('onlyWithFindings', e.target.checked)} /> Bulgulu testi olanlar
                        </label>
                        {anyFilterActive && (
                            <button onClick={() => setFilters({ ...emptyFilters, year: filters.year })} className="text-xs font-bold text-slate-400 hover:text-slate-700 underline pb-1.5">Filtreleri Temizle</button>
                        )}
                    </>
                )}
            </div>

            {view === 'panel' ? (
                statsLoading ? <LoadingState /> : !stats ? (
                    <p className="text-sm text-slate-400 p-6">Veri yüklenemedi.</p>
                ) : (
                    <div className="space-y-6">
                        <p className="text-xs text-slate-400 -mt-1">Özet, {filters.year} yılının UYGULANMIŞ planına göre hesaplanır — taslak değişiklikleri bu sayılara yansımaz.</p>
                        <KpiGrid columns={4}>
                            <KpiCard title="Kapsamdaki Kontrol" value={stats.controlCount} variant="default" />
                            <KpiCard title="Planlanan Task" value={stats.plannedTaskCount} variant="default" />
                            <KpiCard title="Başlamamış" value={stats.notStarted} variant="default" />
                            <KpiCard title="Devam Eden" value={stats.inProgress} variant="warning" />
                            <KpiCard title="Onay Bekleyen" value={stats.pendingApproval} variant="info" />
                            <KpiCard title="Tamamlanan" value={stats.completed} variant="success" />
                            <KpiCard title="Gecikmiş" value={stats.overdue} variant="critical" />
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
                                        <BarChart data={stats.byPeriod}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                            <XAxis dataKey="periodKey" tick={{ fontSize: 11 }} />
                                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                            <Tooltip />
                                            <Bar dataKey="planned" name="Planlanan" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="completed" name="Tamamlanan" fill="#059669" radius={[4, 4, 0, 0]} />
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
            ) : rowsError ? (
                <ErrorState description={rowsError} onRetry={loadRows} />
            ) : rowsLoading && rows.length === 0 ? (
                <LoadingState message="Dönem kontrolleri yükleniyor..." />
            ) : rows.length === 0 ? (
                <EmptyState title="Kayıt bulunamadı" description="Filtre kriterlerinizi değiştirin veya bu yıl için henüz uygulanmış bir plan olmayabilir." />
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {filters.month && (
                        <p className="text-xs text-amber-700 bg-amber-50 border-b border-amber-100 px-4 py-2">
                            Yalnızca <b>{MONTH_LABELS_TR[Number(filters.month) - 1]}</b> ayında uygulaması bulunan dönem kontrolleri gösteriliyor. Sayılar (test gerçekleşmesi, gecikme) yıl genelini yansıtır — yalnızca bu ay için değil.
                        </p>
                    )}
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3 w-8"></th>
                                <th className="px-4 py-3">Dönem Kontrol Kodu</th>
                                <th className="px-4 py-3">Kontrol Tanımı</th>
                                <th className="px-4 py-3">Sıklık</th>
                                <th className="px-4 py-3">Uygulama Ayları</th>
                                <th className={`px-4 py-3 ${filters.assigneeId ? 'text-blue-700' : ''}`}>Atanan Kontrolcü <span title="Kişi filtresi" aria-label="Atanan kontrolcü filtresi">⌄</span></th>
                                <th className={`px-4 py-3 ${filters.secondControllerId ? 'text-blue-700' : ''}`}>İkinci Kontrolcü <span title="Kişi filtresi" aria-label="İkinci kontrolcü filtresi">⌄</span></th>
                                <th className="px-4 py-3">Test Gerçekleşmesi</th>
                                <th className="px-4 py-3">Gecikmiş</th>
                                <th className="px-4 py-3">Sonraki Test</th>
                                <th className="px-4 py-3">İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => {
                                const isOpen = expanded.has(row.scopeId);
                                const tests = testsByScope.get(row.scopeId) ?? [];
                                const isTestsLoading = testsLoading.has(row.scopeId);
                                const showAllYear = showAllYearTests.has(row.scopeId);
                                const visibleTests = filters.month && !showAllYear
                                    ? tests.filter(t => new Date(t.plannedDate).getMonth() + 1 === Number(filters.month))
                                    : tests;
                                return (
                                    <RowGroup
                                        key={row.scopeId}
                                        row={row} isOpen={isOpen} tests={visibleTests} isTestsLoading={isTestsLoading}
                                        monthFiltered={!!filters.month && !showAllYear}
                                        onToggle={() => toggleExpand(row)}
                                        onShowAllYear={() => toggleExpand(row, true)}
                                        userLabel={userLabel}
                                    />
                                );
                            })}
                        </tbody>
                    </table>
                    <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-500 border-t border-slate-100">
                        <span>{rows.length} / {totalCount} kayıt</span>
                        <div className="flex items-center gap-2">
                            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40">Önceki</button>
                            <span>{page} / {Math.max(1, Math.ceil(totalCount / pageSize))}</span>
                            <button disabled={page >= Math.ceil(totalCount / pageSize)} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40">Sonraki</button>
                        </div>
                    </div>
                </div>
            )}
        </PageShell>
    );
}

// ─── Satır grubu: Dönem Kontrolü + genişleyince testleri ──────────────────────
function RowGroup({ row, isOpen, tests, isTestsLoading, monthFiltered, onToggle, onShowAllYear, userLabel }: {
    row: PeriodControlRow; isOpen: boolean; tests: TaskRow[]; isTestsLoading: boolean; monthFiltered: boolean;
    onToggle: () => void; onShowAllYear: () => void; userLabel: (id?: string | null) => string;
}) {
    return (
        <>
            <tr className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                    <button onClick={onToggle} className="text-slate-400 hover:text-slate-700" aria-label="Testleri göster/gizle">
                        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </td>
                <td className="px-4 py-3">
                    <Link href={`/controls/agenda/${row.scopeId}`} className="font-mono font-bold text-emerald-700 hover:underline" target="_blank">{row.code}</Link>
                    {row.hasNewControlVersion && <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Yeni sürüm var</span>}
                </td>
                <td className="px-4 py-3">
                    <Link href={`/controls/${row.controlId}`} className="text-slate-700 hover:underline hover:text-emerald-700 truncate block max-w-[220px]" title={row.controlName} target="_blank">{row.controlName}</Link>
                </td>
                <td className="px-4 py-3"><span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">{frequencyLabel[row.frequency] || row.frequency}</span></td>
                <td className="px-4 py-3 text-xs text-slate-600">{describeMonths(row)}</td>
                <td className="px-4 py-3">{row.assignee ? `${row.assignee.firstName} ${row.assignee.lastName}` : <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3">{row.secondController ? `${row.secondController.firstName} ${row.secondController.lastName}` : <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-xs font-semibold">{row.completedTaskCount}/{row.totalTaskCount} onaylandı{row.pendingApprovalCount > 0 && <span className="block text-blue-600 font-normal">{row.pendingApprovalCount} onay bekliyor</span>}{row.findingsCount > 0 && <span className="block text-rose-600 font-normal">{row.findingsCount} bulgu</span>}</td>
                <td className="px-4 py-3">{row.overdueCount > 0 ? <StatusBadge variant="critical">{row.overdueCount} gecikmiş</StatusBadge> : <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{fmt(row.nextTestDate)}</td>
                <td className="px-4 py-3"><Link href={`/controls/agenda/${row.scopeId}`} target="_blank" className="text-xs font-bold text-emerald-700 hover:underline">Detay →</Link></td>
            </tr>
            {isOpen && (
                <tr className="bg-slate-50/50">
                    <td colSpan={11} className="px-8 py-3">
                        {isTestsLoading ? (
                            <p className="text-xs text-slate-400 py-2">Testler yükleniyor...</p>
                        ) : tests.length === 0 ? (
                            <p className="text-xs text-slate-400 py-2">{monthFiltered ? 'Bu ayda test yok.' : 'Bu dönem için test bulunamadı.'}</p>
                        ) : (
                            <>
                                {monthFiltered && (
                                    <button onClick={onShowAllYear} className="text-xs font-bold text-blue-600 hover:underline mb-2">Yılın tüm testlerini göster →</button>
                                )}
                                <table className="w-full text-xs">
                                    <thead className="text-left text-[10px] font-bold text-slate-400 uppercase">
                                        <tr>
                                            <th className="py-1.5 pr-3">Test Kodu</th>
                                            <th className="py-1.5 pr-3">Hedef Tarih</th>
                                            <th className="py-1.5 pr-3">Test Sorumlusu</th>
                                            <th className="py-1.5 pr-3">İkinci Kontrolcü</th>
                                            <th className="py-1.5 pr-3">İş Akışı Durumu</th>
                                            <th className="py-1.5 pr-3">Kontrol Sonucu</th>
                                            <th className="py-1.5 pr-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tests.map(t => {
                                            const statusInfo = taskStatusLabel[t.status];
                                            const resultInfo = t.findingStatus ? resultLabel[t.findingStatus] : null;
                                            return (
                                                <tr key={t.id} className="border-t border-slate-100">
                                                    <td className="py-1.5 pr-3 font-mono font-semibold text-slate-700">{t.testNo}</td>
                                                    <td className="py-1.5 pr-3 text-slate-600">{fmt(t.plannedDate)}</td>
                                                    <td className="py-1.5 pr-3 text-slate-600">{userLabel(t.assigneeId)}</td>
                                                    <td className="py-1.5 pr-3 text-slate-600">{userLabel(t.secondControllerId)}</td>
                                                    <td className="py-1.5 pr-3">{statusInfo ? <StatusBadge variant={statusInfo.variant} size="sm">{statusInfo.label}</StatusBadge> : t.status}</td>
                                                    <td className="py-1.5 pr-3">{resultInfo ? <StatusBadge variant={resultInfo.variant} size="sm">{resultInfo.label}</StatusBadge> : <span className="text-slate-300">—</span>}</td>
                                                    <td className="py-1.5 pr-3"><Link href={`/controls/testing/${t.id}`} target="_blank" className="font-bold text-emerald-700 hover:underline">Testi Aç →</Link></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
}
