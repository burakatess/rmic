'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/components/auth/AuthProvider';
import {
    PageShell,
    PageHeader,
    DataTable,
    StatusBadge,
    Button,
    ConfirmDialog,
    KpiCard,
    KpiGrid,
    QuickFilterBar,
    AdvancedFilterPanel,
    ActiveFilterChips,
    SavedViewMenu,
} from '@/components/ui';
import type { ColumnDef, ActiveFilterChip, QuickFilterItem, AdvancedFilterField } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import ImportControlModal from '@/components/modals/ImportControlModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Control {
    id: string;
    controlId: string;
    name: string;
    description: string;
    type: string;
    nature: string;
    automation: string;
    frequency: string;
    owner: { id: string; name: string; department: string };
    mehaz: string;
    lastTestDate: string;
    lastTestResult: string;
    effectivenessStatus: string;
    linkedRisks: { id: string; riskId: string }[];
    linkedFindings: { id: string; findingId: string }[];
    linkedActions: { id: string; actionId: string }[];
    status: 'ACTIVE' | 'PASSIVE';
}

// ─── Config Maps ──────────────────────────────────────────────────────────────

type BadgeVariant = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const frequencyLabel: Record<string, string> = {
    DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık',
    QUARTERLY: '3 Aylık', SEMI_ANNUAL: '6 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi',
};
const effectivenessLabel: Record<string, { label: string; variant: BadgeVariant }> = {
    EFFECTIVE: { label: 'Etkin', variant: 'success' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen', variant: 'warning' },
    INEFFECTIVE: { label: 'Etkin Değil', variant: 'critical' },
    NOT_TESTED: { label: 'Test Edilmedi', variant: 'neutral' },
};
const statusLabel: Record<string, { label: string; variant: BadgeVariant }> = {
    ACTIVE: { label: 'Aktif', variant: 'success' },
    PASSIVE: { label: 'Pasif', variant: 'neutral' },
};

const emptyColFilters: Record<string, string> = {
    controlId: '',
    name: '',
    type: '',
    nature: '',
    automation: '',
    frequency: '',
    status: '',
    effectiveness: '',
    hasFinding: '',
};

const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
};

export default function ControlInventoryPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const { user: currentUser } = useAuth();

    const [controls, setControls] = useState<Control[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [importModalOpen, setImportModalOpen] = useState(false);

    // Filtering states
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 20;

    const [colFilters, setColFilters] = useState<Record<string, string>>({ ...emptyColFilters });
    const [quickFilter, setQuickFilter] = useState<string | null>(null);

    const [sortConfig, setSortConfig] = useState<{ key: keyof Control | 'owner.name' | ''; direction: 'asc' | 'desc' }>({ key: '', direction: 'asc' });

    // ── Fetch ─────────────────────────────────────────────────────────────────

    const fetchControls = useCallback(async () => {
        try {
            setLoading(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = await api.getControls() as any;
            const list = Array.isArray(data) ? data : (data.data || []);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const transformed: Control[] = list.map((c: any) => ({
                id: String(c.id),
                controlId: String(c.controlId || ''),
                name: String(c.name || ''),
                description: String(c.description || ''),
                type: String(c.type || 'IT_GENERAL'),
                nature: String(c.nature || 'PREVENTIVE'),
                automation: String(c.automation || 'MANUAL'),
                frequency: String(c.frequency || 'MONTHLY'),
                owner: {
                    id: String(c.owner?.id || ''),
                    name: `${c.owner?.firstName || ''} ${c.owner?.lastName || ''}`.trim() || 'Bilinmiyor',
                    department: String(c.owner?.department || ''),
                },
                mehaz: String(c.mehaz || ''),
                lastTestDate: c.lastTestDate ? new Date(c.lastTestDate).toISOString().split('T')[0] : '',
                lastTestResult: String(c.lastTestResult || 'NOT_TESTED'),
                effectivenessStatus: String(c.effectivenessStatus || 'NOT_TESTED'),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                linkedRisks: (c.risks || c.riskMappings || []).map((r: any) => ({ id: r.risk?.id, riskId: r.risk?.riskId })).filter((r: any) => r.id && r.riskId),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                linkedFindings: (c.findings || []).map((f: any) => ({ id: f.id, findingId: f.findingId })).filter((f: any) => f.id && f.findingId),
                linkedActions: [],
                status: (c.status || 'ACTIVE') as 'ACTIVE' | 'PASSIVE',
            }));
            setControls(transformed);
        } catch (err) {
            console.error(err);
            showError('Hata', 'Kontroller yüklenemedi.');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { fetchControls(); }, [fetchControls]);

    // ── Quick filter predicate'leri (eski preset mantığı birebir korunur) ─────

    const quickFilterFns: Record<string, (c: Control) => boolean> = useMemo(() => ({
        // "Benim Kontrollerim": kullanıcı yoksa filtre uygulanmaz (eski davranış)
        my_controls: (c) => !currentUser || c.owner.id === currentUser.id,
        // "Açık Bulgulu": hasFinding=true ile aynı mantık
        open_findings: (c) => c.linkedFindings.length > 0,
        // "Bu Ay": status=ACTIVE + Günlük/Haftalık/Aylık sıklık
        this_month: (c) => c.status === 'ACTIVE' && ['MONTHLY', 'DAILY', 'WEEKLY'].includes(c.frequency),
    }), [currentUser]);

    const clearAllFilters = () => {
        setSearchQuery('');
        setQuickFilter(null);
        setColFilters({ ...emptyColFilters });
        setSortConfig({ key: '', direction: 'asc' });
        setPage(1);
    };

    // ── Derived ───────────────────────────────────────────────────────────────

    const filteredControls = useMemo(() => {
        let result = [...controls];

        // Global Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.controlId.toLowerCase().includes(q) ||
                c.description.toLowerCase().includes(q) ||
                c.owner.name.toLowerCase().includes(q)
            );
        }

        // Quick filter
        if (quickFilter && quickFilterFns[quickFilter]) {
            result = result.filter(quickFilterFns[quickFilter]);
        }

        // Column Specific Filters
        if (colFilters.controlId) {
            const q = colFilters.controlId.toLowerCase();
            result = result.filter(c => c.controlId.toLowerCase().includes(q));
        }

        if (colFilters.name) {
            const q = colFilters.name.toLowerCase();
            result = result.filter(c => c.name.toLowerCase().includes(q));
        }

        if (colFilters.type) {
            result = result.filter(c => {
                const isBT = ['IT_GENERAL', 'IT_APPLICATION', 'BT'].includes(c.type);
                return colFilters.type === 'BT' ? isBT : !isBT;
            });
        }

        if (colFilters.nature) {
            result = result.filter(c => c.nature === colFilters.nature);
        }

        if (colFilters.automation) {
            result = result.filter(c => c.automation === colFilters.automation);
        }

        if (colFilters.mehaz) {
            const q = colFilters.mehaz.toLowerCase();
            result = result.filter(c => c.mehaz.toLowerCase().includes(q));
        }

        if (colFilters.lastTestResult) {
            result = result.filter(c => c.lastTestResult === colFilters.lastTestResult);
        }

        if (colFilters.frequency) {
            result = result.filter(c => c.frequency === colFilters.frequency);
        }

        if (colFilters.status) {
            result = result.filter(c => c.status === colFilters.status);
        }

        if (colFilters.effectiveness || colFilters.effectivenessStatus) {
            const val = colFilters.effectiveness || colFilters.effectivenessStatus;
            result = result.filter(c => c.effectivenessStatus === val);
        }

        if (colFilters.hasFinding || colFilters.findingStatus) {
            const val = colFilters.hasFinding || colFilters.findingStatus;
            result = result.filter(c =>
                val === 'true'
                    ? c.linkedFindings.length > 0
                    : c.linkedFindings.length === 0
            );
        }

        if (colFilters.owner) {
            const q = colFilters.owner.toLowerCase();
            result = result.filter(c => c.owner.name.toLowerCase().includes(q));
        }

        // Sorting
        if (sortConfig.key) {
            result.sort((a, b) => {
                let valA = '';
                let valB = '';

                if (sortConfig.key === 'owner.name') {
                    valA = a.owner.name;
                    valB = b.owner.name;
                } else {
                    valA = String(a[sortConfig.key as keyof Control] || '');
                    valB = String(b[sortConfig.key as keyof Control] || '');
                }

                return sortConfig.direction === 'asc'
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA);
            });
        } else {
            // Default sort
            result.sort((a, b) => a.controlId.localeCompare(b.controlId));
        }

        return result;
    }, [controls, searchQuery, colFilters, sortConfig, quickFilter, quickFilterFns]);

    const paginatedControls = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredControls.slice(start, start + pageSize);
    }, [filteredControls, page, pageSize]);

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const activeCount = controls.filter(c => c.status === 'ACTIVE').length;
    const passiveCount = controls.filter(c => c.status === 'PASSIVE').length;
    const ineffectiveCount = controls.filter(c => c.effectivenessStatus === 'INEFFECTIVE').length;
    const notTestedCount = controls.filter(c => c.effectivenessStatus === 'NOT_TESTED').length;

    const hasAnyFilter = !!searchQuery || !!quickFilter || Object.values(colFilters).some(v => v);

    // ── Quick filter chip'leri (canlı sayaçlarla) ─────────────────────────────
    const quickFilterItems: QuickFilterItem[] = useMemo(() => [
        { key: 'my_controls', label: 'Benim Kontrollerim', count: controls.filter(quickFilterFns['my_controls']).length },
        { key: 'open_findings', label: 'Açık Bulgulu', count: controls.filter(quickFilterFns['open_findings']).length },
        { key: 'this_month', label: 'Bu Ay', count: controls.filter(quickFilterFns['this_month']).length },
    ], [controls, quickFilterFns]);

    const quickFilterLabels: Record<string, string> = {
        my_controls: 'Benim Kontrollerim',
        open_findings: 'Açık Bulgulu',
        this_month: 'Bu Ay',
    };

    // ── Gelişmiş filtre alanları ──────────────────────────────────────────────
    const advancedFields: AdvancedFilterField[] = useMemo(() => [
        {
            type: 'select', key: 'hasFinding', label: 'Bulgu Durumu',
            value: colFilters.hasFinding ?? '',
            onChange: (v) => { setColFilters(p => ({ ...p, hasFinding: v })); setPage(1); },
            options: [
                { value: 'true', label: 'Bulgulu' },
                { value: 'false', label: 'Bulgusu Yok' },
            ],
        },
        {
            type: 'select', key: 'frequency', label: 'Periyodik Sıklık',
            value: colFilters.frequency ?? '',
            onChange: (v) => { setColFilters(p => ({ ...p, frequency: v })); setPage(1); },
            options: Object.entries(frequencyLabel).map(([k, v]) => ({ value: k, label: v })),
        },
    ], [colFilters.hasFinding, colFilters.frequency]);

    const advancedActiveCount = [colFilters.hasFinding, colFilters.frequency].filter(Boolean).length;

    // ── Aktif filtre chip'leri ────────────────────────────────────────────────
    const colFilterLabels: Record<string, string> = {
        controlId: 'Kontrol ID', name: 'Kontrol Adı', mehaz: 'Mehaz', owner: 'Sahip',
        type: 'Tip', nature: 'Nitelik', automation: 'Otomasyon',
        frequency: 'Sıklık', status: 'Durum',
        effectiveness: 'Etkinlik', effectivenessStatus: 'Etkinlik', lastTestResult: 'Son Kontrol Sonucu',
        hasFinding: 'Bulgu Durumu', findingStatus: 'Bulgu Durumu',
    };
    const colFilterValueLabel = (key: string, value: string): string => {
        if (key === 'frequency') return frequencyLabel[value] ?? value;
        if (key === 'status') return statusLabel[value]?.label ?? value;
        if (key === 'effectiveness' || key === 'effectivenessStatus' || key === 'lastTestResult') return effectivenessLabel[value]?.label ?? value;
        if (key === 'hasFinding' || key === 'findingStatus') return value === 'true' ? 'Bulgulu' : 'Bulgusu Yok';
        if (key === 'type') return value === 'BT' ? 'BT' : 'BT Dışı';
        return value;
    };

    const activeChips: ActiveFilterChip[] = useMemo(() => {
        const chips: ActiveFilterChip[] = [];
        if (searchQuery) chips.push({
            key: 'search', label: 'Arama', value: searchQuery,
            onRemove: () => { setSearchQuery(''); setPage(1); },
        });
        if (quickFilter) chips.push({
            key: 'quick', label: 'Hızlı Filtre', value: quickFilterLabels[quickFilter] ?? quickFilter,
            onRemove: () => { setQuickFilter(null); setPage(1); },
        });
        Object.entries(colFilters).forEach(([k, v]) => {
            if (v) chips.push({
                key: k, label: colFilterLabels[k] ?? k, value: colFilterValueLabel(k, v),
                onRemove: () => { setColFilters(p => ({ ...p, [k]: '' })); setPage(1); },
            });
        });
        return chips;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, quickFilter, colFilters]);

    // ── Selection & Delete ────────────────────────────────────────────────────
    const handleRowSelect = (id: string) => {
        setSelectedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };
    const handleSelectAll = () => {
        setSelectedRows(prev => prev.size === filteredControls.length ? new Set() : new Set(filteredControls.map(c => c.id)));
    };
    const handleBulkDelete = async () => {
        setDeleting(true);
        try {
            for (const id of selectedRows) await api.deleteControl(id);
            setControls(prev => prev.filter(c => !selectedRows.has(c.id)));
            setSelectedRows(new Set());
            setConfirmDeleteOpen(false);
            success('Başarılı', `${selectedRows.size} kontrol silindi.`);
        } catch {
            showError('Hata', 'Bazı kontroller silinemedi.');
        } finally {
            setDeleting(false);
        }
    };

    // ── Columns ───────────────────────────────────────────────────────────────
    const columns: ColumnDef<Control>[] = useMemo(() => [
        {
            key: 'controlId', header: 'Kontrol ID', sortable: true, defaultWidth: 120,
            filter: { type: 'text', placeholder: 'ID ara...' },
            render: (c) => (
                <Link href={`/controls/${c.id}`} className="font-mono font-semibold text-emerald-700 hover:underline">
                    {c.controlId}
                </Link>
            ),
        },
        {
            key: 'name', header: 'Kontrol Adı', sortable: true, defaultWidth: 220,
            filter: { type: 'text', placeholder: 'Ad ara...' },
            render: (c) => <span className="font-medium text-slate-800 truncate block max-w-[200px]" title={c.name}>{c.name}</span>,
        },
        {
            key: 'mehaz', header: 'Mehaz', defaultWidth: 140, hideable: true, defaultHidden: true,
            filter: { type: 'text', placeholder: 'Mehaz ara...' },
            render: (c) => c.mehaz
                ? <span className="text-xs text-slate-600 truncate block max-w-[130px]" title={c.mehaz}>{c.mehaz}</span>
                : <span className="text-slate-300">—</span>,
        },
        {
            key: 'lastTestResult', header: 'Son Kontrol Sonucu', defaultWidth: 140, hideable: true, defaultHidden: true,
            filter: {
                type: 'select', options: [
                    { value: 'EFFECTIVE', label: 'Etkin' },
                    { value: 'PARTIALLY_EFFECTIVE', label: 'Kısmen Etkin' },
                    { value: 'INEFFECTIVE', label: 'Etkin Değil' },
                    { value: 'NOT_TESTED', label: 'Test Edilmedi' },
                ],
            },
            render: (c) => {
                const cfg = effectivenessLabel[c.lastTestResult];
                return cfg ? <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge> : <span className="text-slate-300">—</span>;
            },
        },
        {
            key: 'findingStatus', header: 'Bulgu Durumu', defaultWidth: 120, hideable: true,
            filter: { type: 'select', options: [{ value: 'true', label: 'Bulgulu' }, { value: 'false', label: 'Bulgusu Yok' }] },
            render: (c) => {
                const hasFinding = c.linkedFindings.length > 0;
                return (
                    <StatusBadge variant={hasFinding ? 'critical' : 'neutral'}>
                        {hasFinding ? 'Bulgulu' : 'Bulgusu Yok'}
                    </StatusBadge>
                );
            },
        },
        {
            key: 'findingsCount', header: 'Bulgu Sayısı', defaultWidth: 100, hideable: true,
            render: (c) => (
                <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                    c.linkedFindings.length > 0
                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                    {c.linkedFindings.length}
                </span>
            ),
        },
        {
            key: 'owner', header: 'Sahip', defaultWidth: 150, hideable: true,
            filter: { type: 'text', placeholder: 'Sahip ara...' },
            render: (c) => (
                <div>
                    <p className="text-sm font-semibold text-slate-800">{c.owner.name}</p>
                    {c.owner.department && <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{c.owner.department}</p>}
                </div>
            ),
        },
        {
            key: 'frequency', header: 'Sıklık', defaultWidth: 90, hideable: true,
            filter: { type: 'select', options: Object.entries(frequencyLabel).map(([k, v]) => ({ value: k, label: v })) },
            render: (c) => <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">{frequencyLabel[c.frequency] || c.frequency}</span>,
        },
        {
            key: 'lastTestDate', header: 'Son Test', sortable: true, defaultWidth: 110, hideable: true,
            render: (c) => <span className="text-sm text-slate-600">{formatDate(c.lastTestDate)}</span>,
        },
        {
            key: 'linkedRisks', header: 'Risk', defaultWidth: 90, hideable: true,
            render: (c) => c.linkedRisks.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                    {c.linkedRisks.slice(0, 2).map(r => (
                        <Link key={r.id} href={`/risks/${r.id}`} className="text-xs text-blue-600 hover:underline font-bold bg-blue-50 px-1.5 py-0.5 rounded">{r.riskId}</Link>
                    ))}
                    {c.linkedRisks.length > 2 && <span className="text-xs text-slate-400 font-bold">+{c.linkedRisks.length - 2}</span>}
                </div>
            ) : <span className="text-slate-300">—</span>,
        },
        {
            key: 'effectivenessStatus', header: 'Etkinlik', defaultWidth: 120, hideable: true,
            filter: { type: 'select', options: Object.entries(effectivenessLabel).map(([k, v]) => ({ value: k, label: v.label })) },
            render: (c) => {
                const cfg = effectivenessLabel[c.effectivenessStatus];
                return cfg ? <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge> : <span className="text-slate-400">—</span>;
            },
        },
        {
            key: 'status', header: 'Durum', defaultWidth: 90,
            filter: { type: 'select', options: Object.entries(statusLabel).map(([k, v]) => ({ value: k, label: v.label })) },
            render: (c) => {
                const cfg = statusLabel[c.status];
                return cfg ? <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge> : <span className="text-slate-400">—</span>;
            },
        },
        {
            key: 'actions', header: 'İşlemler', defaultWidth: 110,
            render: (c) => (
                <div className="flex items-center gap-1">
                    <Link href={`/controls/${c.id}`} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Görüntüle">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    </Link>
                    <Link href={`/controls/${c.id}/edit`} className="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Düzenle">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </Link>
                </div>
            ),
        },
    ], []);

    return (
        <PageShell>
            <PageHeader
                title="Kontrol Envanteri"
                description="Tüm iç kontrol mekanizmalarını görüntüleyin ve yönetin"
                breadcrumbs={[{ label: 'Kontrol Yönetimi', href: '/controls' }, { label: 'Envanter' }]}
                actions={
                    <div className="flex items-center gap-2">
                        {selectedRows.size > 0 && (
                            <Button variant="danger" size="sm" onClick={() => setConfirmDeleteOpen(true)}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}>
                                {selectedRows.size} Seçiliyi Sil
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => setImportModalOpen(true)} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>}>
                            Dışarıdan Yükle
                        </Button>
                        <Link href="/controls/new">
                            <Button variant="primary" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}>
                                Yeni Kontrol
                            </Button>
                        </Link>
                    </div>
                }
            />

            {/* KPI'lar — click-to-filter */}
            <KpiGrid columns={5}>
                <KpiCard
                    title="Toplam" value={controls.length} variant="default"
                    active={!hasAnyFilter}
                    onClick={clearAllFilters}
                    icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
                <KpiCard
                    title="Aktif" value={activeCount} variant="success"
                    active={colFilters.status === 'ACTIVE'}
                    onClick={() => { setColFilters(p => ({ ...p, status: p.status === 'ACTIVE' ? '' : 'ACTIVE' })); setPage(1); }}
                    icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
                />
                <KpiCard
                    title="Pasif" value={passiveCount} variant="warning"
                    active={colFilters.status === 'PASSIVE'}
                    onClick={() => { setColFilters(p => ({ ...p, status: p.status === 'PASSIVE' ? '' : 'PASSIVE' })); setPage(1); }}
                    icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
                />
                <KpiCard
                    title="Etkin Değil" value={ineffectiveCount} variant="critical"
                    active={colFilters.effectiveness === 'INEFFECTIVE'}
                    onClick={() => { setColFilters(p => ({ ...p, effectiveness: p.effectiveness === 'INEFFECTIVE' ? '' : 'INEFFECTIVE' })); setPage(1); }}
                    icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>}
                />
                <KpiCard
                    title="Test Edilmedi" value={notTestedCount} variant="info"
                    active={colFilters.effectiveness === 'NOT_TESTED'}
                    onClick={() => { setColFilters(p => ({ ...p, effectiveness: p.effectiveness === 'NOT_TESTED' ? '' : 'NOT_TESTED' })); setPage(1); }}
                    icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
            </KpiGrid>

            {/* Hızlı filtreler */}
            <QuickFilterBar
                items={quickFilterItems}
                active={quickFilter}
                onChange={(k) => { setQuickFilter(k); setPage(1); }}
            />

            {/* Gelişmiş filtre paneli */}
            <AdvancedFilterPanel
                searchValue={searchQuery}
                onSearchChange={(v) => { setSearchQuery(v); setPage(1); }}
                searchPlaceholder="ID, ad, sahip, açıklama ara..."
                fields={advancedFields}
                activeCount={advancedActiveCount}
                onClearAll={clearAllFilters}
            />

            {/* Aktif filtre chip'leri */}
            <ActiveFilterChips chips={activeChips} onClearAll={clearAllFilters} />

            <DataTable
                columns={columns}
                data={paginatedControls}
                rowKey={(c) => c.id}
                loading={loading}
                showCheckbox
                selectedRows={selectedRows}
                onRowSelect={handleRowSelect}
                onSelectAll={handleSelectAll}
                totalCount={filteredControls.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                storageKey="controls-table"
                emptyTitle="Kontrol bulunamadı"
                emptyDescription="Filtrelerinizi değiştirin veya yeni bir kontrol ekleyin."
                emptyActionLabel="Yeni Kontrol Ekle"
                onEmptyAction={() => router.push('/controls/new')}
                columnFilters={colFilters}
                onColumnFilterChange={(k, v) => { setColFilters(p => ({ ...p, [k]: v })); setPage(1); }}
                stickyFirstColumn
                onRefresh={fetchControls}
                toolbar={
                    <SavedViewMenu
                        storageKey="controls-table"
                        getPayload={() => ({ search: searchQuery, quickFilter, columnFilters: colFilters })}
                        onApply={(p) => {
                            setSearchQuery(typeof p.search === 'string' ? p.search : '');
                            setQuickFilter(typeof p.quickFilter === 'string' ? p.quickFilter : null);
                            setColFilters({ ...emptyColFilters, ...((p.columnFilters as Record<string, string>) || {}) });
                            setPage(1);
                        }}
                    />
                }
            />

            <ConfirmDialog
                open={confirmDeleteOpen}
                onClose={() => setConfirmDeleteOpen(false)}
                onConfirm={handleBulkDelete}
                title="Kontroller Silinecek"
                message={`Seçilen ${selectedRows.size} kontrol kalıcı olarak silinecektir.`}
                confirmLabel="Evet, Sil"
                loading={deleting}
                variant="danger"
            />

            <ImportControlModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                onImportSuccess={() => {
                    success('Başarılı', 'Kontroller başarıyla içeri aktarıldı.');
                    fetchControls();
                }}
            />
        </PageShell>
    );
}
