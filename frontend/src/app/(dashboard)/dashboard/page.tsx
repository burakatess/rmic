'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api, { ApiError } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthProvider';
import { PermissionGate } from '@/components/auth';
import {
    PageShell, PageHeader, KpiCard, KpiGrid, Tabs, DataTable, StatusBadge,
    LoadingState, EmptyState, ErrorState, Button,
} from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import type {
    DashboardScope, DashboardScopeOptions, DashboardSummary, DashboardWorkItem, DashboardWorkItemsResponse,
    DashboardApprovals, DashboardCriticalIssue, DashboardAnnualPlan, DashboardUpcoming, DashboardWorkTab,
} from '@/types/dashboard';

// ─── Ortak veri kaynağı hook'u ──────────────────────────────────────────────
// Hızlı filtre değişiminde geç dönen eski cevap yeni kapsamı EZMEMELİ (Madde
// 15) — istek sırası (reqId) ile korunur. Güncellenme zamanı yalnızca
// BAŞARILI yüklemede ilerler (Madde 16).

function useDashboardResource<T>(fetcher: () => Promise<T>, deps: React.DependencyList) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    const reqId = useRef(0);
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    const load = useCallback(() => {
        const id = ++reqId.current;
        setLoading(true);
        setError(null);
        fetcherRef.current()
            .then((d) => {
                if (id !== reqId.current) return;
                setData(d);
                setUpdatedAt(new Date());
            })
            .catch((err) => {
                if (id !== reqId.current) return;
                setError(err instanceof ApiError ? err.message : 'Veri alınamadı');
            })
            .finally(() => {
                if (id === reqId.current) setLoading(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => { load(); }, [load]);

    return { data, loading, error, updatedAt, reload: load };
}

// ─── Sabitler ────────────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<DashboardScope, string> = { MINE: 'İşlerim', UNIT: 'Birimim', ORG: 'Kurum' };
const BASE_TAB_LABELS: { key: DashboardWorkTab; label: string }[] = [
    { key: 'ALL', label: 'Tümü' },
    { key: 'TESTS', label: 'Testler' },
    { key: 'ACTIONS', label: 'Aksiyonlar' },
    { key: 'FOLLOWUPS', label: 'Takipler' },
];
// Mutabakatlar sekmesi yalnızca model destekliyor (Finding.workflowStatus) VE
// kullanıcının finding:view izni varsa gösterilir (Madde 6 — mevcut model
// destekliyorsa Mutabakatlar).
const RECONCILIATION_TAB = { key: 'RECONCILIATION' as const, label: 'Mutabakatlar' };
const TYPE_LABELS: Record<string, string> = { TEST: 'Test', ACTION: 'Aksiyon', FOLLOWUP: 'Takip', RECONCILIATION: 'Mutabakat' };
const OPEN_LABELS: Record<string, string> = { TEST: 'Testi Aç', ACTION: 'Aksiyonu Aç', FOLLOWUP: 'Takibi Aç', RECONCILIATION: 'Mutabakatı Aç' };
const SEVERITY_VARIANT: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
    CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low',
};
const SEVERITY_LABEL: Record<string, string> = { CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük' };
const ISSUE_SEVERITY_VARIANT: Record<string, 'critical' | 'high' | 'medium'> = { critical: 'critical', high: 'high', medium: 'medium' };

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];
const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function fmtDate(d?: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('tr-TR');
}

function daysOverdue(dueDate: string): number {
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((today.getTime() - due.getTime()) / 86_400_000);
}

const inputCls = 'px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400';

export default function DashboardPage() {
    return (
        <Suspense fallback={<PageShell><LoadingState message="Çalışma Panosu yükleniyor..." /></PageShell>}>
            <DashboardPageContent />
        </Suspense>
    );
}

function DashboardPageContent() {
    const { user, hasPermission } = useAuth();
    const tabDefs = useMemo(
        () => hasPermission('finding:view') ? [...BASE_TAB_LABELS, RECONCILIATION_TAB] : BASE_TAB_LABELS,
        [hasPermission],
    );
    const router = useRouter();
    const searchParams = useSearchParams();

    // ─── URL ile senkronize filtre durumu ──────────────────────────────────
    const [scope, setScope] = useState<DashboardScope>((searchParams.get('scope') as DashboardScope) || 'MINE');
    const [directorateIds, setDirectorateIds] = useState<string[]>(searchParams.getAll('dir'));
    const [year, setYear] = useState<number>(Number(searchParams.get('year')) || CURRENT_YEAR);
    const [month, setMonth] = useState<number | null>(searchParams.get('month') ? Number(searchParams.get('month')) : null);
    const [includeCarryover, setIncludeCarryover] = useState<boolean>(searchParams.get('carry') !== '0');
    const [tab, setTab] = useState<DashboardWorkTab>((searchParams.get('tab') as DashboardWorkTab) || 'ALL');
    const [page, setPage] = useState<number>(Number(searchParams.get('page')) || 1);
    const [calendarDays, setCalendarDays] = useState<7 | 30>(searchParams.get('days') === '30' ? 30 : 7);

    useEffect(() => {
        const params = new URLSearchParams();
        params.set('scope', scope);
        directorateIds.forEach(d => params.append('dir', d));
        params.set('year', String(year));
        if (month) params.set('month', String(month));
        if (!includeCarryover) params.set('carry', '0');
        if (tab !== 'ALL') params.set('tab', tab);
        if (page !== 1) params.set('page', String(page));
        if (calendarDays !== 7) params.set('days', String(calendarDays));
        router.replace(`/dashboard?${params.toString()}`, { scroll: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope, directorateIds, year, month, includeCarryover, tab, page, calendarDays]);

    // Sekme/kapsam değişince sayfa başa dönsün.
    useEffect(() => { setPage(1); }, [tab, scope, directorateIds, year, month, includeCarryover]);

    const scopeParams = useMemo(() => ({
        scope, directorateId: scope === 'UNIT' ? directorateIds : undefined,
        year, month: month ?? undefined, includeCarryover,
    }), [scope, directorateIds, year, month, includeCarryover]);

    // ─── Kapsam seçenekleri ─────────────────────────────────────────────────
    const scopeOptions = useDashboardResource<DashboardScopeOptions>(
        () => api.getDashboardScopeOptions(), [],
    );

    // Kullanıcı Birimim'i seçtiyse ama hiç direktörlük seçilmediyse, mevcut
    // olan tüm yetkili birimleri varsayılan olarak işaretle (backend zaten
    // aynısını server-side uygular; burada yalnızca UI checkbox durumu için).
    useEffect(() => {
        if (scope === 'UNIT' && directorateIds.length === 0 && scopeOptions.data?.unit.directorates.length) {
            setDirectorateIds(scopeOptions.data.unit.directorates.map(d => d.id));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope, scopeOptions.data]);

    // ─── Kaynaklar ──────────────────────────────────────────────────────────
    const summary = useDashboardResource<DashboardSummary>(
        () => api.getDashboardSummary(scopeParams),
        [scope, JSON.stringify(directorateIds)],
    );
    const workItems = useDashboardResource<DashboardWorkItemsResponse>(
        () => api.getDashboardWorkItems({ ...scopeParams, tab, page, pageSize: 20 }),
        [scope, JSON.stringify(directorateIds), tab, page, year, month, includeCarryover],
    );
    const approvals = useDashboardResource<DashboardApprovals>(() => api.getDashboardApprovals(), []);
    const criticalIssues = useDashboardResource<DashboardCriticalIssue[]>(
        () => api.getDashboardCriticalIssues(scopeParams),
        [scope, JSON.stringify(directorateIds)],
    );
    const annualPlan = useDashboardResource<DashboardAnnualPlan>(
        () => api.getDashboardAnnualPlan({ ...scopeParams, month: undefined }),
        [scope, JSON.stringify(directorateIds), year],
    );
    const upcoming = useDashboardResource<DashboardUpcoming>(
        () => api.getDashboardUpcoming({ ...scopeParams, days: calendarDays }),
        [scope, JSON.stringify(directorateIds), calendarDays],
    );

    const lastUpdated = useMemo(() => {
        const dates = [summary.updatedAt, workItems.updatedAt, approvals.updatedAt, criticalIssues.updatedAt, annualPlan.updatedAt, upcoming.updatedAt].filter(Boolean) as Date[];
        if (dates.length === 0) return null;
        return new Date(Math.max(...dates.map(d => d.getTime())));
    }, [summary.updatedAt, workItems.updatedAt, approvals.updatedAt, criticalIssues.updatedAt, annualPlan.updatedAt, upcoming.updatedAt]);

    const refreshAll = useCallback(() => {
        summary.reload(); workItems.reload(); approvals.reload(); criticalIssues.reload(); annualPlan.reload(); upcoming.reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleDirectorate = (id: string) => setDirectorateIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

    const availableScopes: DashboardScope[] = useMemo(() => {
        const opts = scopeOptions.data;
        const list: DashboardScope[] = ['MINE'];
        if (opts?.unit.available) list.push('UNIT');
        if (opts?.org.available) list.push('ORG');
        return list;
    }, [scopeOptions.data]);

    // ─── Kolonlar ───────────────────────────────────────────────────────────
    const columns: ColumnDef<DashboardWorkItem>[] = useMemo(() => [
        {
            key: 'ref', header: 'Kayıt No / İş', defaultWidth: 260,
            render: (item) => (
                <Link href={item.expectedAction.href} className="block hover:text-blue-600">
                    <p className="text-xs font-mono font-bold text-blue-700">{item.ref}</p>
                    <p className="text-sm text-slate-700 truncate max-w-[220px]" title={item.title}>{item.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                        {item.carriedOver && <StatusBadge variant="neutral" size="sm">Devreden</StatusBadge>}
                        {item.isAdHoc && <StatusBadge variant="info" size="sm">Plansız / Ad Hoc</StatusBadge>}
                    </div>
                </Link>
            ),
        },
        { key: 'type', header: 'Tür', defaultWidth: 90, render: (item) => <span className="text-xs text-slate-500">{TYPE_LABELS[item.type]}</span> },
        {
            key: 'assignee', header: 'Sorumlu', defaultWidth: 150,
            render: (item) => <span className="text-sm text-slate-600">{scope === 'MINE' ? 'Ben' : (item.assigneeName || '—')}</span>,
        },
        {
            key: 'dueDate', header: 'Son Tarih', defaultWidth: 140,
            render: (item) => {
                if (!item.dueDate) return <span className="text-sm text-slate-400">—</span>;
                const overdue = daysOverdue(item.dueDate);
                return (
                    <div>
                        <p className="text-sm text-slate-700">{fmtDate(item.dueDate)}</p>
                        {overdue > 0 && <p className="text-xs font-semibold text-red-600">{overdue} gün gecikmiş</p>}
                    </div>
                );
            },
        },
        {
            key: 'severity', header: 'Önem', defaultWidth: 100,
            render: (item) => item.severity
                ? <StatusBadge variant={SEVERITY_VARIANT[item.severity] || 'neutral'}>{SEVERITY_LABEL[item.severity] || item.severity}</StatusBadge>
                : <span className="text-sm text-slate-400">—</span>,
        },
        {
            key: 'expected', header: scope === 'MINE' ? 'Benden Beklenen' : 'Beklenen İşlem', defaultWidth: 160,
            render: (item) => <span className="text-sm text-slate-600">{item.expectedAction.label}</span>,
        },
        {
            key: 'action', header: 'İşlem', defaultWidth: 120,
            render: (item) => (
                <Link href={item.expectedAction.href}>
                    <Button size="sm" variant="outline">{OPEN_LABELS[item.type]}</Button>
                </Link>
            ),
        },
    ], [scope]);

    return (
        <PageShell>
            <PageHeader
                title="Çalışma Panosu"
                description="Önceliklerimiz, bekleyen onaylar ve kritik konular"
                breadcrumbs={[{ label: 'Ana Sayfa' }, { label: 'Dashboard' }]}
                actions={
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        {lastUpdated && <span>Güncellendi: {lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
                        <Button size="sm" variant="outline" onClick={refreshAll}
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                        >
                            Yenile
                        </Button>
                    </div>
                }
            />

            {/* Kapsam + tarih filtreleri */}
            <div className="flex flex-wrap items-center gap-3 mb-5 bg-white border border-slate-200 rounded-xl px-4 py-3">
                <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                    {availableScopes.map(s => (
                        <button
                            key={s}
                            onClick={() => setScope(s)}
                            className={`px-3 py-1.5 text-sm font-medium transition-colors ${scope === s ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                            {SCOPE_LABELS[s]}
                        </button>
                    ))}
                </div>

                {scope === 'UNIT' && (scopeOptions.data?.unit.directorates.length ?? 0) > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {scopeOptions.data!.unit.directorates.map(d => (
                            <button
                                key={d.id}
                                onClick={() => toggleDirectorate(d.id)}
                                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${directorateIds.includes(d.id) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}
                            >
                                {d.name}
                            </button>
                        ))}
                    </div>
                )}

                <div className="h-5 w-px bg-slate-200" />

                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputCls}>
                    {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={month ?? ''} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                    <option value="">Tüm Yıl</option>
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>

                <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={includeCarryover} onChange={(e) => setIncludeCarryover(e.target.checked)} className="rounded border-slate-300 text-blue-600" />
                    Devredenleri dahil et
                </label>
            </div>

            {/* Özet göstergeler */}
            <SummarySection summary={summary} scope={scope} router={router} />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
                {/* Ana gövde — öncelikli işler (2/3) */}
                <div className="xl:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="px-2 pt-2">
                            <Tabs
                                tabs={tabDefs.map(t => ({ key: t.key, label: t.label }))}
                                activeTab={tab}
                                onChange={(k) => setTab(k as DashboardWorkTab)}
                            />
                        </div>
                        <div className="p-4">
                            <PageResource resource={workItems} onRetry={workItems.reload} emptyTitle="Öncelikli iş bulunmuyor" emptyDescription="Seçili kapsam ve dönemde bekleyen bir işiniz yok.">
                                {(data) => (
                                    <>
                                        <DataTable
                                            columns={columns}
                                            data={data.data}
                                            rowKey={(i) => `${i.type}-${i.id}`}
                                            emptyTitle="Öncelikli iş bulunmuyor"
                                            storageKey="work-dashboard-items"
                                        />
                                        <div className="flex items-center justify-between px-1 pt-3 text-sm text-slate-500">
                                            <span>{Math.min(data.data.length, data.pageSize)} / {data.totalCount} kayıt</span>
                                            <div className="flex items-center gap-2">
                                                {data.totalCount > data.pageSize && (
                                                    <>
                                                        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Önceki</Button>
                                                        <span>{page} / {Math.max(1, Math.ceil(data.totalCount / data.pageSize))}</span>
                                                        <Button size="sm" variant="outline" disabled={page >= Math.ceil(data.totalCount / data.pageSize)} onClick={() => setPage(p => p + 1)}>Sonraki</Button>
                                                    </>
                                                )}
                                                <Link href={`/controls/agenda?year=${year}`} className="text-blue-600 font-semibold hover:underline ml-3">Tüm İşleri Gör →</Link>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </PageResource>
                        </div>
                    </div>

                    <AnnualPlanSection resource={annualPlan} year={year} />
                </div>

                {/* Sağ panel — onaylar + kritik konular + takvim (1/3) */}
                <div className="space-y-6">
                    <ApprovalsPanel resource={approvals} />
                    <CriticalIssuesPanel resource={criticalIssues} />
                    <UpcomingPanel resource={upcoming} days={calendarDays} onDaysChange={setCalendarDays} />
                </div>
            </div>
        </PageShell>
    );
}

// ─── Ortak "yükleniyor/hata/boş" sarmalayıcı ────────────────────────────────

function PageResource<T>({ resource, onRetry, emptyTitle, emptyDescription, children }: {
    resource: { data: T | null; loading: boolean; error: string | null };
    onRetry: () => void;
    emptyTitle: string;
    emptyDescription?: string;
    children: (data: T) => React.ReactNode;
}) {
    if (resource.loading && !resource.data) return <LoadingState compact message="Yükleniyor..." />;
    if (resource.error) return <ErrorState compact description={resource.error} onRetry={onRetry} />;
    if (!resource.data) return <EmptyState title={emptyTitle} description={emptyDescription} />;
    return <>{children(resource.data)}</>;
}

// ─── Özet göstergeler ────────────────────────────────────────────────────────

function SummarySection({ summary, scope, router }: {
    summary: ReturnType<typeof useDashboardResource<DashboardSummary>>;
    scope: DashboardScope;
    router: ReturnType<typeof useRouter>;
}) {
    if (summary.loading && !summary.data) {
        return <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><LoadingState compact message="Göstergeler yükleniyor..." /></div>;
    }
    if (summary.error) {
        return <ErrorState compact description={summary.error} onRetry={summary.reload} />;
    }
    const d = summary.data;
    if (!d) return null;
    void scope;

    return (
        <KpiGrid columns={4}>
            <KpiCard
                title="Gecikmiş İşler" value={d.overdue?.total ?? '—'} variant="critical"
                subtitle={d.overdue ? `Test: ${d.overdue.tests ?? 0} · Aksiyon: ${d.overdue.actions ?? 0} · Takip: ${d.overdue.followUps ?? 0}` : 'Yetkiniz yok'}
                onClick={() => router.push('/controls/agenda?overdue=true')}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <KpiCard
                title="Onay Bekleyen" value={d.pendingApproval.total} variant="warning"
                subtitle="Onaylar sayfasına git"
                onClick={() => router.push('/approvals')}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <KpiCard
                title="Bu Hafta Vadesi Gelen" value={d.dueThisWeek?.total ?? '—'} variant="info"
                subtitle={d.dueThisWeek ? `${fmtDate(d.dueThisWeek.from)} – ${fmtDate(d.dueThisWeek.to)}` : 'Yetkiniz yok'}
                onClick={() => router.push('/controls/agenda?days=7')}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
            />
            <KpiCard
                title="Kritik / Yüksek Açık Bulgu" value={d.criticalHighFindings.total ?? '—'} variant="violet"
                subtitle={d.criticalHighFindings.total === null ? (d.criticalHighFindings.reason || 'Yetkiniz yok') : 'Detay için tıklayın'}
                onClick={() => router.push('/findings?severity=CRITICAL')}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
            />
        </KpiGrid>
    );
}

// ─── Onay Bekleyenler ────────────────────────────────────────────────────────

function ApprovalsPanel({ resource }: { resource: ReturnType<typeof useDashboardResource<DashboardApprovals>> }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800">Onay Bekleyenler</h3>
                {resource.data && <StatusBadge variant="warning">{resource.data.total}</StatusBadge>}
            </div>
            <PageResource resource={resource} onRetry={resource.reload} emptyTitle="Onay bekleyen kayıt yok">
                {(d) => (
                    <>
                        <div className="space-y-1">
                            <ApprovalRow label="Kontrol testi onayı" count={d.byType.controlTest.count} href={d.byType.controlTest.href} />
                            <ApprovalRow label="Takip değerlendirmesi" count={d.byType.followUp.count} href={d.byType.followUp.href} />
                            <ApprovalRow label="Bulgu mutabakatı" count={d.byType.reconciliation.count} href={d.byType.reconciliation.href} />
                        </div>
                        <Link href="/approvals" className="block text-center mt-3 text-sm font-semibold text-blue-600 hover:underline">Onayları İncele →</Link>
                    </>
                )}
            </PageResource>
        </div>
    );
}

function ApprovalRow({ label, count, href }: { label: string; count: number; href: string }) {
    return (
        <Link href={href} className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-50 text-sm">
            <span className="text-slate-600">{label}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>{count}</span>
        </Link>
    );
}

// ─── Kritik Konular ─────────────────────────────────────────────────────────

function CriticalIssuesPanel({ resource }: { resource: ReturnType<typeof useDashboardResource<DashboardCriticalIssue[]>> }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Kritik Konular</h3>
            <PageResource resource={resource} onRetry={resource.reload} emptyTitle="Kritik konu yok" emptyDescription="Şu an işlem gerektiren bir durum bulunmuyor.">
                {(issues) => issues.length === 0 ? (
                    <EmptyState title="Kritik konu yok" description="Şu an işlem gerektiren bir durum bulunmuyor." />
                ) : (
                    <div className="space-y-1">
                        {issues.map(issue => (
                            <Link key={issue.key} href={issue.href} className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50">
                                <span className={`w-1 self-stretch rounded-full ${issue.severity === 'critical' ? 'bg-red-500' : issue.severity === 'high' ? 'bg-orange-500' : 'bg-amber-400'}`} />
                                <span className="text-sm text-slate-600 flex-1">{issue.count} {issue.label}</span>
                                <StatusBadge variant={ISSUE_SEVERITY_VARIANT[issue.severity]} size="sm" dot>{issue.count}</StatusBadge>
                            </Link>
                        ))}
                    </div>
                )}
            </PageResource>
        </div>
    );
}

// ─── Yıllık Kontrol Planı ────────────────────────────────────────────────────

function AnnualPlanSection({ resource, year }: { resource: ReturnType<typeof useDashboardResource<DashboardAnnualPlan>>; year: number }) {
    const manageLink = (
        <PermissionGate permission="control:*">
            <Link href="/controls" className="text-xs font-semibold text-blue-600 hover:underline">Yıllık Kapsamı Yönet →</Link>
        </PermissionGate>
    );

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h3 className="text-sm font-bold text-slate-800">Yıllık Kontrol Planı</h3>
                    <p className="text-xs text-slate-400">{year} · Ay filtresinden bağımsız, seçili kapsamın tüm yılı</p>
                </div>
                <Link href={`/controls/agenda?year=${year}`} className="text-sm font-semibold text-blue-600 hover:underline">Kontrol Takip Panosu →</Link>
            </div>
            <PageResource resource={resource} onRetry={resource.reload} emptyTitle="Veri yok">
                {(d) => {
                    // Veri yükleme HATASI zaten PageResource/ErrorState tarafından ayrı
                    // gösteriliyor (retry'lı) — buraya yalnızca BAŞARILI ama boş/kısmi
                    // sonuçlar düşer, üç ayrı durum olarak ele alınır (Madde 2).
                    if (d.controlCount === 0) {
                        return (
                            <div>
                                <EmptyState
                                    title="Bu yıl için kontrol kapsamı henüz oluşturulmamış"
                                    description="Seçili kapsamda hiçbir kontrol bu yılın planına eklenmemiş."
                                    className="py-6"
                                />
                                <div className="text-center -mt-2 mb-2">{manageLink}</div>
                            </div>
                        );
                    }
                    if (d.plannedTaskCount === 0) {
                        return (
                            <div className="py-4">
                                <EmptyState
                                    title="Kapsamdaki kontroller için task planlaması eksik"
                                    description={`${d.controlCount} kontrol yıl kapsamına alınmış ama henüz hiçbir dönem task'ı oluşmamış.`}
                                    className="py-2"
                                />
                                <div className="text-center mt-1">{manageLink}</div>
                            </div>
                        );
                    }

                    const total = d.notStarted + d.inProgress + d.pendingApproval + d.completed;
                    const seg = (n: number) => total > 0 ? (n / total) * 100 : 0;
                    return (
                        <div>
                            <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                                <div className="bg-emerald-500" style={{ width: `${seg(d.completed)}%` }} />
                                <div className="bg-amber-400" style={{ width: `${seg(d.pendingApproval)}%` }} />
                                <div className="bg-blue-500" style={{ width: `${seg(d.inProgress)}%` }} />
                                <div className="bg-slate-300" style={{ width: `${seg(d.notStarted)}%` }} />
                            </div>
                            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs">
                                <Legend color="bg-emerald-500" label="Onaylandı" value={d.completed} />
                                <Legend color="bg-amber-400" label="Onayda" value={d.pendingApproval} />
                                <Legend color="bg-blue-500" label="Devam ediyor" value={d.inProgress} />
                                <Legend color="bg-slate-300" label="Başlamadı" value={d.notStarted} />
                                {d.cancelled > 0 && <Legend color="bg-slate-100 border border-slate-300" label="İptal/Kapsam Dışı" value={d.cancelled} />}
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <p className="text-xs text-slate-400">
                                    {d.controlCount} kontrol · {d.plannedTaskCount} task
                                    {d.completionRate !== null && ` · %${d.completionRate} tamamlanma`}
                                </p>
                                {manageLink}
                            </div>
                        </div>
                    );
                }}
            </PageResource>
        </div>
    );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
    return (
        <span className="flex items-center gap-1.5 text-slate-600">
            <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
            {label} <span className="font-bold text-slate-800">{value}</span>
        </span>
    );
}

// ─── Yaklaşan Takvim ─────────────────────────────────────────────────────────

function UpcomingPanel({ resource, days, onDaysChange }: {
    resource: ReturnType<typeof useDashboardResource<DashboardUpcoming>>;
    days: 7 | 30;
    onDaysChange: (d: 7 | 30) => void;
}) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800">Yaklaşan Takvim</h3>
                <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-xs">
                    {[7, 30].map(n => (
                        <button key={n} onClick={() => onDaysChange(n as 7 | 30)}
                            className={`px-2 py-1 font-medium ${days === n ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>
                            {n} gün
                        </button>
                    ))}
                </div>
            </div>
            <PageResource resource={resource} onRetry={resource.reload} emptyTitle="Yaklaşan iş yok">
                {(d) => (
                    <>
                        <p className="text-xs text-slate-400 mb-2">{fmtDate(d.range.from)} – {fmtDate(d.range.to)}</p>
                        {d.days.length === 0 ? (
                            <EmptyState title="Yaklaşan iş yok" description={`Önümüzdeki ${days} günde planlanmış iş bulunmuyor.`} />
                        ) : (
                            <div className="space-y-2">
                                {d.days.map(group => (
                                    <div key={group.date} className="flex items-start gap-3">
                                        <span className="text-xs font-semibold text-slate-500 w-20 pt-0.5">{new Date(group.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</span>
                                        <div className="flex-1 space-y-1">
                                            {group.items.map(item => (
                                                <Link key={`${item.type}-${item.ref}`} href={item.href} className="flex items-center gap-2 text-sm hover:text-blue-600">
                                                    <span className="text-slate-400">{TYPE_LABELS[item.type]}</span>
                                                    <span className="text-slate-700 truncate">{item.title}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </PageResource>
        </div>
    );
}
