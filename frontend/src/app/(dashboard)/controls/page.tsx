'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import {
    PageHeader,
    DataTable,
    FilterBar,
    StatusBadge,
    Button,
    ConfirmDialog,
} from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

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
    owner: { name: string; department: string };
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

const typeVariant: Record<string, BadgeVariant> = {
    IT_GENERAL: 'info', IT_APPLICATION: 'info', BT: 'info',
    OPERATIONAL: 'primary', COMPLIANCE: 'primary', FINANCIAL: 'primary', BT_DISI: 'primary',
};
const typeLabel: Record<string, string> = {
    IT_GENERAL: 'BT', IT_APPLICATION: 'BT', BT: 'BT',
    OPERATIONAL: 'BT Dışı', COMPLIANCE: 'BT Dışı', FINANCIAL: 'BT Dışı', BT_DISI: 'BT Dışı',
};
const natureLabel: Record<string, { label: string; variant: BadgeVariant }> = {
    PREVENTIVE: { label: 'Önleyici', variant: 'info' },
    DETECTIVE: { label: 'Tespit Edici', variant: 'medium' },
    CORRECTIVE: { label: 'Düzeltici', variant: 'warning' },
};
const automationLabel: Record<string, { label: string; variant: BadgeVariant }> = {
    AUTOMATED: { label: 'Otomatik', variant: 'success' },
    SEMI_AUTOMATED: { label: 'Yarı Oto.', variant: 'warning' },
    MANUAL: { label: 'Manuel', variant: 'neutral' },
};
const frequencyLabel: Record<string, string> = {
    DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık',
    QUARTERLY: '3 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi',
};
const effectivenessLabel: Record<string, { label: string; variant: BadgeVariant }> = {
    EFFECTIVE: { label: 'Etkin', variant: 'success' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen', variant: 'warning' },
    INEFFECTIVE: { label: 'Etkin Değil', variant: 'critical' },
    NOT_TESTED: { label: 'Test Edilmedi', variant: 'neutral' },
};

const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ControlInventoryPage() {
    const { success, error: showError } = useToast();

    const [controls, setControls] = useState<Control[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [page, setPage] = useState(1);
    const pageSize = 20;

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
                    name: `${c.owner?.firstName || ''} ${c.owner?.lastName || ''}`.trim() || 'Bilinmiyor',
                    department: String(c.owner?.department || ''),
                },
                lastTestDate: c.lastTestDate ? new Date(c.lastTestDate).toISOString().split('T')[0] : '',
                lastTestResult: String(c.lastTestResult || 'NOT_TESTED'),
                effectivenessStatus: String(c.effectivenessStatus || 'NOT_TESTED'),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                linkedRisks: (c.risks || c.riskMappings || []).map((r: any) => ({ id: r.risk?.id, riskId: r.risk?.riskId })).filter((r: any) => r.id && r.riskId),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                linkedFindings: (c.findings || []).map((f: any) => ({ id: f.id, findingId: f.findingId })).filter((f: any) => f.id && f.findingId),
                linkedActions: [],
                status: 'ACTIVE' as const,
            }));
            setControls(transformed);
        } catch (err) {
            console.error(err);
            showError('Hata', 'Kontroller yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchControls(); }, [fetchControls]);

    // ── Derived ───────────────────────────────────────────────────────────────

    const uniqueDepartments = useMemo(() => [...new Set(controls.map(c => c.owner.department))].filter(Boolean).sort(), [controls]);

    const filteredControls = useMemo(() => {
        return controls.filter(c => {
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!c.name.toLowerCase().includes(q) && !c.controlId.toLowerCase().includes(q)) return false;
            }
            const typeF = activeFilters['type'];
            if (typeF && typeF !== 'all') {
                const isBT = ['IT_GENERAL', 'IT_APPLICATION', 'BT'].includes(c.type);
                if (typeF === 'BT' && !isBT) return false;
                if (typeF === 'BT_DISI' && isBT) return false;
            }
            const natureF = activeFilters['nature'];
            if (natureF && natureF !== 'all' && c.nature !== natureF) return false;

            const automF = activeFilters['automation'];
            if (automF && automF !== 'all' && c.automation !== automF) return false;

            const effF = activeFilters['effectiveness'];
            if (effF && effF !== 'all' && c.effectivenessStatus !== effF) return false;

            const deptF = activeFilters['department'];
            if (deptF && deptF !== 'all' && c.owner.department !== deptF) return false;

            return true;
        }).sort((a, b) => a.controlId.localeCompare(b.controlId));
    }, [controls, searchQuery, activeFilters]);

    const paginatedControls = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredControls.slice(start, start + pageSize);
    }, [filteredControls, page, pageSize]);

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const effectiveCount = controls.filter(c => c.effectivenessStatus === 'EFFECTIVE').length;
    const ineffectiveCount = controls.filter(c => c.effectivenessStatus === 'INEFFECTIVE').length;
    const notTestedCount = controls.filter(c => c.effectivenessStatus === 'NOT_TESTED').length;

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

    // ── Filter Configs ────────────────────────────────────────────────────────
    const filterConfigs = useMemo(() => [
        {
            key: 'type', label: 'Tip',
            value: activeFilters['type'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, type: v })); setPage(1); },
            options: [{ value: 'BT', label: 'BT' }, { value: 'BT_DISI', label: 'BT Dışı' }],
        },
        {
            key: 'nature', label: 'Nitelik',
            value: activeFilters['nature'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, nature: v })); setPage(1); },
            options: [{ value: 'PREVENTIVE', label: 'Önleyici' }, { value: 'DETECTIVE', label: 'Tespit Edici' }, { value: 'CORRECTIVE', label: 'Düzeltici' }],
        },
        {
            key: 'automation', label: 'Otomasyon',
            value: activeFilters['automation'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, automation: v })); setPage(1); },
            options: [{ value: 'AUTOMATED', label: 'Otomatik' }, { value: 'SEMI_AUTOMATED', label: 'Yarı Oto.' }, { value: 'MANUAL', label: 'Manuel' }],
        },
        {
            key: 'effectiveness', label: 'Etkinlik',
            value: activeFilters['effectiveness'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, effectiveness: v })); setPage(1); },
            options: [{ value: 'EFFECTIVE', label: 'Etkin' }, { value: 'PARTIALLY_EFFECTIVE', label: 'Kısmen' }, { value: 'INEFFECTIVE', label: 'Etkin Değil' }, { value: 'NOT_TESTED', label: 'Test Edilmedi' }],
        },
        {
            key: 'department', label: 'Birim',
            value: activeFilters['department'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, department: v })); setPage(1); },
            options: uniqueDepartments.map(d => ({ value: d, label: d })),
        },
    ], [activeFilters, uniqueDepartments]);

    // ── Columns ───────────────────────────────────────────────────────────────
    const columns: ColumnDef<Control>[] = useMemo(() => [
        {
            key: 'controlId', header: 'Kontrol ID', sortable: true, defaultWidth: 120,
            render: (c) => (
                <Link href={`/controls/${c.id}`} className="font-mono font-semibold text-emerald-700 hover:underline">
                    {c.controlId}
                </Link>
            ),
        },
        {
            key: 'name', header: 'Kontrol Adı', sortable: true, defaultWidth: 220,
            render: (c) => <span className="font-medium text-slate-800 truncate block max-w-[200px]" title={c.name}>{c.name}</span>,
        },
        {
            key: 'type', header: 'Tip', defaultWidth: 90,
            render: (c) => <StatusBadge variant={typeVariant[c.type] || 'neutral'}>{typeLabel[c.type] || c.type}</StatusBadge>,
        },
        {
            key: 'nature', header: 'Nitelik', defaultWidth: 130,
            render: (c) => {
                const cfg = natureLabel[c.nature];
                return cfg ? <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge> : <span className="text-gray-400">—</span>;
            },
        },
        {
            key: 'automation', header: 'Otomasyon', defaultWidth: 110,
            render: (c) => {
                const cfg = automationLabel[c.automation];
                return cfg ? <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge> : <span className="text-gray-400">—</span>;
            },
        },
        {
            key: 'owner', header: 'Sahip', defaultWidth: 150,
            render: (c) => (
                <div>
                    <p className="text-sm font-medium text-slate-800">{c.owner.name}</p>
                    {c.owner.department && <p className="text-xs text-slate-500">{c.owner.department}</p>}
                </div>
            ),
        },
        {
            key: 'frequency', header: 'Sıklık', defaultWidth: 90,
            render: (c) => <span className="text-sm text-slate-600">{frequencyLabel[c.frequency] || c.frequency}</span>,
        },
        {
            key: 'lastTestDate', header: 'Son Test', sortable: true, defaultWidth: 110,
            render: (c) => <span className="text-sm text-slate-600">{formatDate(c.lastTestDate)}</span>,
        },
        {
            key: 'lastTestResult', header: 'Test Sonucu', defaultWidth: 120,
            render: (c) => {
                const cfg = effectivenessLabel[c.lastTestResult];
                return cfg ? <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge> : <span className="text-gray-400">—</span>;
            },
        },
        {
            key: 'effectivenessStatus', header: 'Etkinlik', defaultWidth: 120,
            render: (c) => {
                const cfg = effectivenessLabel[c.effectivenessStatus];
                return cfg ? <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge> : <span className="text-gray-400">—</span>;
            },
        },
        {
            key: 'linkedRisks', header: 'Risk', defaultWidth: 90,
            render: (c) => c.linkedRisks.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                    {c.linkedRisks.slice(0, 2).map(r => (
                        <Link key={r.id} href={`/risks/${r.id}`} className="text-xs text-blue-600 hover:underline font-medium">{r.riskId}</Link>
                    ))}
                    {c.linkedRisks.length > 2 && <span className="text-xs text-slate-400">+{c.linkedRisks.length - 2}</span>}
                </div>
            ) : <span className="text-slate-300">—</span>,
        },
        {
            key: 'linkedFindings', header: 'Bulgu', defaultWidth: 90,
            render: (c) => c.linkedFindings.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                    {c.linkedFindings.slice(0, 2).map(f => (
                        <Link key={f.id} href={`/findings/${f.id}`} className="text-xs text-violet-600 hover:underline font-medium">{f.findingId}</Link>
                    ))}
                    {c.linkedFindings.length > 2 && <span className="text-xs text-slate-400">+{c.linkedFindings.length - 2}</span>}
                </div>
            ) : <span className="text-slate-300">—</span>,
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
                    <Link href="/controls/testing" className="p-1.5 rounded text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors" title="Test Et">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                    </Link>
                </div>
            ),
        },
    ], []);

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            <div className="px-8 pt-8">
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
                            <Link href="/controls/new">
                                <Button variant="primary" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}>
                                    Yeni Kontrol
                                </Button>
                            </Link>
                        </div>
                    }
                />

                {/* KPI Cards */}
                <div className="grid grid-cols-5 gap-4 mb-6">
                    {[
                        { label: 'Toplam Kontrol', value: controls.length, color: 'slate', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
                        { label: 'Etkin', value: effectiveCount, color: 'green', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
                        { label: 'Etkin Değil', value: ineffectiveCount, color: 'red', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z' },
                        { label: 'Test Edilmedi', value: notTestedCount, color: 'amber', icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                        { label: 'Tüm Riskler', value: controls.reduce((s, c) => s + c.linkedRisks.length, 0), color: 'blue', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
                    ].map(kpi => (
                        <div key={kpi.label} className={`bg-white rounded-xl border border-${kpi.color}-100 shadow-sm p-5 flex items-center gap-4`}>
                            <div className={`p-3 bg-${kpi.color}-50 rounded-xl`}>
                                <svg className={`w-5 h-5 text-${kpi.color}-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={kpi.icon} />
                                </svg>
                            </div>
                            <div>
                                <p className={`text-xs font-medium text-${kpi.color}-600 uppercase tracking-wide`}>{kpi.label}</p>
                                <p className={`text-2xl font-bold text-${kpi.color}-700 mt-0.5`}>{kpi.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Filter Bar */}
                <div className="mb-4 bg-white border border-slate-200 rounded-xl shadow-sm p-3">
                    <FilterBar
                        searchValue={searchQuery}
                        onSearchChange={(v) => { setSearchQuery(v); setPage(1); }}
                        searchPlaceholder="Kontrol ID veya adı ara..."
                        filters={filterConfigs}
                        onClearAll={() => { setSearchQuery(''); setActiveFilters({}); setPage(1); }}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="px-8 pb-8 flex-1">
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
                    onEmptyAction={() => window.location.href = '/controls/new'}
                />
            </div>

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
        </div>
    );
}
