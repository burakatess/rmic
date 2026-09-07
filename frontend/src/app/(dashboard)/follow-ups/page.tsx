'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import {
    PageShell,
    PageHeader,
    DataTable,
    StatusBadge,
    Button,
    ConfirmDialog,
    KpiCard,
    KpiGrid,
    AdvancedFilterPanel,
    ActiveFilterChips,
    SavedViewMenu,
} from '@/components/ui';
import type { ColumnDef, ActiveFilterChip, AdvancedFilterField } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

interface FollowUp {
    id: string;
    followUpId: string;
    status: string;
    resolutionOutcome?: string | null;
    result?: string | null;
    plannedDate?: string | null;
    newFollowUpDate?: string | null;
    currentStatusDetail?: string | null;
    newActionRequired?: boolean;
    createdAt: string;
    updatedAt?: string;
    finding: {
        id: string;
        findingId: string;
        summary?: string | null;
        description: string;
        severity: string;
        relatedDepartment?: string | null;
        resolutionStatus: string;
    };
    action?: {
        id: string;
        actionId: string;
        description: string;
        dueDate: string;
        owner?: { id: string; firstName: string; lastName: string; department?: string };
    } | null;
    attachments?: { id: string; originalName: string }[];
}

// ─── Config Maps ──────────────────────────────────────────────────────────────

const followUpStatusConfig: Record<string, { label: string; variant: BV }> = {
    BEKLIYOR:     { label: 'Bekliyor',     variant: 'neutral' },
    DEVAM_EDIYOR: { label: 'Devam Ediyor', variant: 'warning' },
    TAMAMLANDI:   { label: 'Tamamlandı',   variant: 'info' },
    ONAYLANDI:    { label: 'Onaylandı',    variant: 'success' },
};

const resolutionConfig: Record<string, { label: string; variant: BV }> = {
    DEVAM_EDIYOR:         { label: 'Devam Ediyor',        variant: 'warning' },
    KISMEN_KAPATILDI:     { label: 'Kısmen Kapatıldı',    variant: 'info' },
    KAPATILDI:            { label: 'Kapatıldı',           variant: 'success' },
    ERTELENDI:            { label: 'Ertelendi',           variant: 'neutral' },
    YENI_AKSIYON_GEREKLI: { label: 'Yeni Aksiyon Gerekli', variant: 'high' },
};

const severityConfig: Record<string, { label: string; variant: BV }> = {
    CRITICAL: { label: 'KZ', variant: 'critical' },
    HIGH:     { label: 'KD', variant: 'high' },
    MEDIUM:   { label: 'ÖK', variant: 'medium' },
    LOW:      { label: 'Düşük', variant: 'low' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d?: string | null) => {
    if (!d) return '—';
    const date = new Date(d);
    return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('tr-TR');
};

const getDaysLeft = (d?: string | null) => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
};

const isOverdue = (f: FollowUp) => {
    if (f.status === 'ONAYLANDI' || f.status === 'TAMAMLANDI') return false;
    const dl = getDaysLeft(f.plannedDate);
    return dl !== null && dl < 0;
};

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1].map(y => String(y));

// ─── Icons (inline SVG — emoji yasak) ─────────────────────────────────────────

const iconProps = { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' } as const;

const ClipboardIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
);
const PauseIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const RefreshIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
);
const CheckCircleIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const WarningIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
);
const BoltIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FollowUpsPage() {
    const { success, error: showError } = useToast();
    const [followUps, setFollowUps] = useState<FollowUp[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [colFilters, setColFilters] = useState<Record<string, string>>({});
    const [quickFilter, setQuickFilter] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const pageSize = 25;

    // Toplu seçim
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.getAllFollowUps({ limit: 500 }) as { data: FollowUp[] };
            setFollowUps(res?.data || []);
        } catch {
            showError('Hata', 'Takip çalışmaları yüklenemedi.');
            setFollowUps([]);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { load(); }, [load]);

    // ── KPIs ─────────────────────────────────────────────────────────────────

    const kpis = useMemo(() => {
        const total     = followUps.length;
        const bekliyor  = followUps.filter(f => f.status === 'BEKLIYOR').length;
        const devam     = followUps.filter(f => f.status === 'DEVAM_EDIYOR').length;
        const tamamlandi= followUps.filter(f => f.status === 'TAMAMLANDI' || f.status === 'ONAYLANDI').length;
        const overdue   = followUps.filter(isOverdue).length;
        const yeniAksiyon = followUps.filter(f => f.newActionRequired).length;
        return { total, bekliyor, devam, tamamlandi, overdue, yeniAksiyon };
    }, [followUps]);

    // ── Quick filter predicate'leri (KPI kartları) ────────────────────────────

    const quickFilterFns: Record<string, (f: FollowUp) => boolean> = useMemo(() => ({
        'gecikmis': isOverdue,
        'yeni-aksiyon': (f) => !!f.newActionRequired || f.result === 'YENI_AKSIYON_GEREKLI',
    }), []);

    const quickFilterLabels: Record<string, string> = {
        'gecikmis': 'Gecikmiş',
        'yeni-aksiyon': 'Yeni Aksiyon Gerekli',
    };

    // ── Filter ────────────────────────────────────────────────────────────────

    const filtered = useMemo(() => {
        return followUps.filter(f => {
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const text = [f.followUpId, f.finding.findingId, f.finding.summary, f.finding.relatedDepartment, f.action?.actionId, f.action?.owner?.firstName, f.action?.owner?.lastName]
                    .filter(Boolean).join(' ').toLowerCase();
                if (!text.includes(q)) return false;
            }
            if (activeFilters.status && activeFilters.status !== 'all' && f.status !== activeFilters.status) return false;
            if (activeFilters.resolutionOutcome && f.resolutionOutcome !== activeFilters.resolutionOutcome) return false;
            if (activeFilters.severity && f.finding.severity !== activeFilters.severity) return false;
            if (activeFilters.relatedDepartment) {
                if (!f.finding.relatedDepartment?.toLowerCase().includes(activeFilters.relatedDepartment.toLowerCase())) return false;
            }
            if (activeFilters.month && f.plannedDate) {
                if (new Date(f.plannedDate).getMonth() + 1 !== parseInt(activeFilters.month)) return false;
            }
            if (activeFilters.year && f.plannedDate) {
                if (new Date(f.plannedDate).getFullYear() !== parseInt(activeFilters.year)) return false;
            }
            if (quickFilter && quickFilterFns[quickFilter] && !quickFilterFns[quickFilter](f)) return false;
            return true;
        });
    }, [followUps, searchQuery, activeFilters, quickFilter, quickFilterFns]);


    // ── Gelişmiş filtre alanları ──────────────────────────────────────────────

    const advancedFields: AdvancedFilterField[] = useMemo(() => [
        {
            type: 'select',
            key: 'status', label: 'Takip Statüsü',
            value: activeFilters['status'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, status: v })); setPage(1); },
            options: Object.entries(followUpStatusConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            type: 'select',
            key: 'resolutionOutcome', label: 'Kapanış Kararı',
            value: activeFilters['resolutionOutcome'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, resolutionOutcome: v })); setPage(1); },
            options: Object.entries(resolutionConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            type: 'select',
            key: 'severity', label: 'Önem',
            value: activeFilters['severity'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, severity: v })); setPage(1); },
            options: Object.entries(severityConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            type: 'select',
            key: 'month', label: 'Ay',
            value: activeFilters['month'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, month: v })); setPage(1); },
            options: MONTHS.map((m, i) => ({ value: String(i + 1), label: m })),
        },
        {
            type: 'select',
            key: 'year', label: 'Yıl',
            value: activeFilters['year'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, year: v })); setPage(1); },
            options: YEARS.map(y => ({ value: y, label: y })),
        },
    ], [activeFilters]);

    // ── Columns ───────────────────────────────────────────────────────────────

    const columns: ColumnDef<FollowUp>[] = useMemo(() => [
        {
            key: 'followUpId',
            header: 'Takip No',
            sortable: true,
            defaultWidth: 160,
            filter: { type: 'text', placeholder: 'Takip No...', fn: (f: FollowUp, v) => f.followUpId.toLowerCase().includes(v.toLowerCase()) },
            render: (f) => (
                <span className="font-mono text-xs font-bold text-violet-700">{f.followUpId}</span>
            ),
        },
        {
            key: 'findingId',
            header: 'Bulgu No',
            sortable: true,
            defaultWidth: 140,
            filter: { type: 'text', placeholder: 'Bulgu No...', fn: (f: FollowUp, v) => f.finding.findingId.toLowerCase().includes(v.toLowerCase()) },
            render: (f) => (
                <Link href={`/findings/${f.finding.id}`} className="font-mono text-xs font-bold text-violet-600 hover:text-violet-900 hover:underline">
                    {f.finding.findingId}
                </Link>
            ),
        },
        {
            key: 'summary',
            header: 'Bulgu Özeti',
            defaultWidth: 220,
            filter: { type: 'text', placeholder: 'Özet ara...', fn: (f: FollowUp, v) => (f.finding.summary || f.finding.description).toLowerCase().includes(v.toLowerCase()) },
            render: (f) => (
                <p className="text-xs text-slate-700 truncate max-w-[200px]" title={f.finding.summary || f.finding.description}>
                    {f.finding.summary || f.finding.description}
                </p>
            ),
        },
        {
            key: 'relatedDepartment',
            header: 'İlgili Direktörlük',
            sortable: true,
            defaultWidth: 160,
            filter: { type: 'text', placeholder: 'Direktörlük...', fn: (f: FollowUp, v) => (f.finding.relatedDepartment || '').toLowerCase().includes(v.toLowerCase()) },
            render: (f) => (
                <span className="text-xs text-slate-600 truncate block max-w-[150px]">{f.finding.relatedDepartment || '—'}</span>
            ),
        },
        {
            key: 'action',
            header: 'İlgili Aksiyon',
            defaultWidth: 130,
            render: (f) => f.action
                ? <span className="font-mono text-xs text-indigo-600 font-semibold">{f.action.actionId}</span>
                : <span className="text-slate-300 text-xs">—</span>,
        },
        {
            key: 'owner',
            header: 'Aksiyon Sahibi',
            defaultWidth: 150,
            render: (f) => f.action?.owner
                ? <span className="text-xs text-slate-600">{f.action.owner.firstName} {f.action.owner.lastName}</span>
                : <span className="text-slate-300 text-xs">—</span>,
        },
        {
            key: 'plannedDate',
            header: 'Hedef Tarih',
            sortable: true,
            defaultWidth: 120,
            render: (f) => {
                const isOD = isOverdue(f);
                return (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${isOD ? 'text-red-600' : 'text-slate-700'}`}>
                        {fmt(f.plannedDate)}
                        {isOD && <WarningIcon className="w-3 h-3 text-red-500" />}
                    </span>
                );
            },
        },
        {
            key: 'status',
            header: 'Takip Statüsü',
            sortable: true,
            defaultWidth: 160,
            filter: { type: 'select', options: Object.entries(followUpStatusConfig).map(([k, v]) => ({ value: k, label: v.label })), fn: (f: FollowUp, v) => f.status === v },
            render: (f) => {
                const sc = followUpStatusConfig[f.status];
                const rc = f.resolutionOutcome ? resolutionConfig[f.resolutionOutcome] : null;
                return (
                    <div className="flex flex-col gap-1">
                        {sc && <StatusBadge variant={sc.variant}>{sc.label}</StatusBadge>}
                        {rc && <StatusBadge variant={rc.variant} dot>{rc.label}</StatusBadge>}
                    </div>
                );
            },
        },
        {
            key: 'severity',
            header: 'Öncelik',
            sortable: true,
            defaultWidth: 80,
            render: (f) => {
                const sv = severityConfig[f.finding.severity];
                return sv ? <StatusBadge variant={sv.variant}>{sv.label}</StatusBadge> : <span className="text-slate-300 text-xs">—</span>;
            },
        },
        {
            key: 'updatedAt',
            header: 'Son Güncelleme',
            sortable: true,
            defaultWidth: 130,
            render: (f) => <span className="text-xs text-slate-500">{fmt(f.updatedAt || f.createdAt)}</span>,
        },
        {
            key: 'actions',
            header: 'İşlemler',
            defaultWidth: 80,
            render: (f) => (
                <Link href={`/findings/${f.finding.id}?tab=takip`}
                    className="p-1.5 rounded text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors inline-block"
                    title="Bulguya Git">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                </Link>
            ),
        },
    ], []);

    const colFiltered = useMemo(() => {
        if (!Object.values(colFilters).some(v => v)) return filtered;
        return filtered.filter(f =>
            columns.every(col => {
                const val = colFilters[col.key];
                return !val || !col.filter?.fn || col.filter.fn(f, val);
            })
        );
    }, [filtered, colFilters, columns]);

    const paginated = useMemo(() => colFiltered.slice((page - 1) * pageSize, page * pageSize), [colFiltered, page]);

    // ── Toplu Seçim ───────────────────────────────────────────────────────────

    const handleRowSelect = (id: string) => {
        setSelectedRows(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedRows.size === colFiltered.length) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(colFiltered.map(f => f.id)));
        }
    };

    const handleBulkDelete = async () => {
        setDeleting(true);
        try {
            for (const id of selectedRows) {
                const f = followUps.find(fu => fu.id === id);
                if (f) await api.deleteFollowUp(f.finding.id, f.id);
            }
            setFollowUps(prev => prev.filter(f => !selectedRows.has(f.id)));
            setSelectedRows(new Set());
            setConfirmDeleteOpen(false);
            success('Başarılı', `${selectedRows.size} takip çalışması silindi.`);
        } catch (err) {
            console.error('Delete failed:', err);
            showError('Hata', 'Bazı takip çalışmaları silinemedi.');
        } finally {
            setDeleting(false);
        }
    };

    // ── Aktif filtre chip'leri ────────────────────────────────────────────────

    const filterLabels: Record<string, string> = {
        status: 'Takip Statüsü', resolutionOutcome: 'Kapanış Kararı', severity: 'Önem',
        relatedDepartment: 'Direktörlük', month: 'Ay', year: 'Yıl',
    };

    const filterValueLabel = (key: string, value: string): string => {
        if (key === 'status') return followUpStatusConfig[value]?.label ?? value;
        if (key === 'resolutionOutcome') return resolutionConfig[value]?.label ?? value;
        if (key === 'severity') return severityConfig[value]?.label ?? value;
        if (key === 'month') return MONTHS[parseInt(value) - 1] ?? value;
        return value;
    };

    const clearAll = () => {
        setSearchQuery('');
        setActiveFilters({});
        setQuickFilter(null);
        setColFilters({});
        setPage(1);
    };

    const activeFilterCount = Object.values(activeFilters).filter(v => v && v !== 'all').length;

    const activeChips: ActiveFilterChip[] = useMemo(() => {
        const chips: ActiveFilterChip[] = [];
        if (searchQuery) chips.push({ key: 'search', label: 'Arama', value: searchQuery, onRemove: () => { setSearchQuery(''); setPage(1); } });
        if (quickFilter) chips.push({
            key: 'quick', label: 'Hızlı Filtre', value: quickFilterLabels[quickFilter] ?? quickFilter,
            onRemove: () => { setQuickFilter(null); setPage(1); },
        });
        Object.entries(activeFilters).forEach(([k, v]) => {
            if (v && v !== 'all') chips.push({
                key: k,
                label: filterLabels[k] ?? k,
                value: filterValueLabel(k, v),
                onRemove: () => { setActiveFilters(p => ({ ...p, [k]: '' })); setPage(1); },
            });
        });
        return chips;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, activeFilters, quickFilter]);

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <PageShell>
            <PageHeader
                title="Bulgu Takip Çalışmaları"
                description="Aksiyonlara bağlı periyodik takip kayıtları — bulgunun kapanma sürecini yönetin"
                breadcrumbs={[{ label: 'Bulgu Takip Çalışmaları' }]}
                actions={
                    <div className="flex items-center gap-2">
                        {selectedRows.size > 0 && (
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setConfirmDeleteOpen(true)}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                            >
                                {selectedRows.size} Seçiliyi Sil
                            </Button>
                        )}
                        <Button variant="secondary" size="sm" onClick={() => load()} icon={<RefreshIcon className="w-4 h-4" />}>
                            Yenile
                        </Button>
                    </div>
                }
            />

            {/* KPI'lar — tümü click-to-filter */}
            <KpiGrid columns={6}>
                <KpiCard title="Toplam" value={kpis.total} variant="default"
                    icon={<ClipboardIcon />}
                    active={activeFilterCount === 0 && !quickFilter && !searchQuery}
                    onClick={() => { setActiveFilters({}); setQuickFilter(null); setPage(1); }} />
                <KpiCard title="Bekliyor" value={kpis.bekliyor} variant="default"
                    icon={<PauseIcon />}
                    active={activeFilters.status === 'BEKLIYOR'}
                    onClick={() => { setActiveFilters(p => (p.status === 'BEKLIYOR' ? {} : { status: 'BEKLIYOR' }) as Record<string, string>); setPage(1); }} />
                <KpiCard title="Devam Ediyor" value={kpis.devam} variant="warning"
                    icon={<RefreshIcon />}
                    active={activeFilters.status === 'DEVAM_EDIYOR'}
                    onClick={() => { setActiveFilters(p => (p.status === 'DEVAM_EDIYOR' ? {} : { status: 'DEVAM_EDIYOR' }) as Record<string, string>); setPage(1); }} />
                <KpiCard title="Tamamlandı" value={kpis.tamamlandi} variant="success"
                    icon={<CheckCircleIcon />}
                    active={activeFilters.status === 'TAMAMLANDI'}
                    onClick={() => { setActiveFilters(p => (p.status === 'TAMAMLANDI' ? {} : { status: 'TAMAMLANDI' }) as Record<string, string>); setPage(1); }} />
                <KpiCard title="Gecikmiş" value={kpis.overdue} variant="critical"
                    icon={<WarningIcon />}
                    active={quickFilter === 'gecikmis'}
                    onClick={() => { setQuickFilter(q => q === 'gecikmis' ? null : 'gecikmis'); setPage(1); }} />
                <KpiCard title="Yeni Aksiyon" value={kpis.yeniAksiyon} variant="high"
                    icon={<BoltIcon />}
                    active={quickFilter === 'yeni-aksiyon'}
                    onClick={() => { setQuickFilter(q => q === 'yeni-aksiyon' ? null : 'yeni-aksiyon'); setPage(1); }} />
            </KpiGrid>

            {/* Gelişmiş filtre paneli */}
            <AdvancedFilterPanel
                searchValue={searchQuery}
                onSearchChange={(v) => { setSearchQuery(v); setPage(1); }}
                searchPlaceholder="Takip No, Bulgu No, Direktörlük, Aksiyon Sahibi ara…"
                fields={advancedFields}
                activeCount={activeFilterCount}
                onClearAll={clearAll}
            />

            {/* Aktif filtre chip'leri */}
            <ActiveFilterChips chips={activeChips} onClearAll={clearAll} />

            {/* Tablo */}
            <DataTable
                columns={columns}
                data={paginated}
                rowKey={(f) => f.id}
                loading={loading}
                showCheckbox
                selectedRows={selectedRows}
                onRowSelect={handleRowSelect}
                onSelectAll={handleSelectAll}
                totalCount={colFiltered.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                storageKey="follow-ups-list-v1"
                emptyTitle="Takip çalışması bulunamadı"
                emptyDescription="Bulgulara aksiyon eklendiğinde otomatik oluşturulur."
                columnFilters={colFilters}
                onColumnFilterChange={(k, v) => { setColFilters(p => ({ ...p, [k]: v })); setPage(1); }}
                stickyFirstColumn
                onRefresh={load}
                toolbar={
                    <SavedViewMenu
                        storageKey="follow-ups-list-v1"
                        getPayload={() => ({ search: searchQuery, filters: activeFilters, quickFilter, columnFilters: colFilters })}
                        onApply={(p) => {
                            setSearchQuery(typeof p.search === 'string' ? p.search : '');
                            setActiveFilters((p.filters as Record<string, string>) || {});
                            setQuickFilter(typeof p.quickFilter === 'string' ? p.quickFilter : null);
                            setColFilters((p.columnFilters as Record<string, string>) || {});
                            setPage(1);
                        }}
                    />
                }
            />

            <ConfirmDialog
                open={confirmDeleteOpen}
                onClose={() => setConfirmDeleteOpen(false)}
                onConfirm={handleBulkDelete}
                title="Takip Çalışmaları Silinecek"
                message={`Seçilen ${selectedRows.size} takip çalışması kalıcı olarak silinecektir. Bu işlem geri alınamaz.`}
                confirmLabel="Evet, Sil"
                loading={deleting}
                variant="danger"
            />
        </PageShell>
    );
}
