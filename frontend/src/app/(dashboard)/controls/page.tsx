'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/components/auth/AuthProvider';
import {
    PageHeader,
    DataTable,
    StatusBadge,
    Button,
    ConfirmDialog,
} from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
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

const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
};

export default function ControlInventoryPage() {
    const { success, error: showError } = useToast();
    const { user: currentUser } = useAuth();

    const [controls, setControls] = useState<Control[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [importModalOpen, setImportModalOpen] = useState(false);

    // Advanced Filtering States
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 20;

    const [colFilters, setColFilters] = useState<Record<string, string>>({
        controlId: '',
        name: '',
        type: '',
        nature: '',
        automation: '',
        frequency: '',
        status: '',
        effectiveness: '',
        hasFinding: '',
    });

    const [sortConfig, setSortConfig] = useState<{ key: keyof Control | 'owner.name' | ''; direction: 'asc' | 'desc' }>({ key: '', direction: 'asc' });

    // Active Preset Name for styling indicator
    const [activePreset, setActivePreset] = useState<string>('');

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
    }, []);

    useEffect(() => { fetchControls(); }, [fetchControls]);

    // ── Presets ───────────────────────────────────────────────────────────────

    const applyPreset = (presetName: string) => {
        setActivePreset(presetName);
        setPage(1);

        // Reset first
        const newFilters = {
            controlId: '', name: '', type: '', nature: '', automation: '', frequency: '', status: '', effectiveness: '', hasFinding: ''
        };

        if (presetName === 'my_controls') {
            setColFilters({ ...newFilters });
            // Will filter in useMemo using currentUser id
        } else if (presetName === 'open_findings') {
            setColFilters({ ...newFilters, hasFinding: 'true' });
        } else if (presetName === 'this_month') {
            setColFilters({ ...newFilters, status: 'ACTIVE' });
            // Will also filter by calendar month in useMemo
        } else {
            setActivePreset('');
            setColFilters({ ...newFilters });
        }
    };

    const clearAllFilters = () => {
        setSearchQuery('');
        setActivePreset('');
        setColFilters({
            controlId: '', name: '', type: '', nature: '', automation: '', frequency: '', status: '', effectiveness: '', hasFinding: ''
        });
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

        // Apply Preset Specials
        if (activePreset === 'my_controls' && currentUser) {
            result = result.filter(c => c.owner.id === currentUser.id);
        }

        if (activePreset === 'this_month') {
            const currentMonthName = new Intl.DateTimeFormat('tr-TR', { month: 'long' }).format(new Date()); // e.g. "Mayıs"
            result = result.filter(c => c.frequency === 'MONTHLY' || c.frequency === 'DAILY' || c.frequency === 'WEEKLY');
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

        if (colFilters.frequency) {
            result = result.filter(c => c.frequency === colFilters.frequency);
        }

        if (colFilters.status) {
            result = result.filter(c => c.status === colFilters.status);
        }

        if (colFilters.effectiveness) {
            result = result.filter(c => c.effectivenessStatus === colFilters.effectiveness);
        }

        if (colFilters.hasFinding) {
            result = result.filter(c => c.linkedFindings.length > 0);
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
    }, [controls, searchQuery, colFilters, sortConfig, activePreset, currentUser]);

    const paginatedControls = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredControls.slice(start, start + pageSize);
    }, [filteredControls, page, pageSize]);

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const activeCount = controls.filter(c => c.status === 'ACTIVE').length;
    const passiveCount = controls.filter(c => c.status === 'PASSIVE').length;
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

    const handleSort = (key: keyof Control | 'owner.name') => {
        setSortConfig(prev => {
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

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
                    <p className="text-sm font-semibold text-slate-800">{c.owner.name}</p>
                    {c.owner.department && <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{c.owner.department}</p>}
                </div>
            ),
        },
        {
            key: 'frequency', header: 'Sıklık', defaultWidth: 90,
            render: (c) => <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">{frequencyLabel[c.frequency] || c.frequency}</span>,
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
                        <Link key={r.id} href={`/risks/${r.id}`} className="text-xs text-blue-600 hover:underline font-bold bg-blue-50 px-1.5 py-0.5 rounded">{r.riskId}</Link>
                    ))}
                    {c.linkedRisks.length > 2 && <span className="text-xs text-slate-400 font-bold">+{c.linkedRisks.length - 2}</span>}
                </div>
            ) : <span className="text-slate-300">—</span>,
        },
        {
            key: 'linkedFindings', header: 'Bulgu', defaultWidth: 90,
            render: (c) => c.linkedFindings.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                    {c.linkedFindings.slice(0, 2).map(f => (
                        <Link key={f.id} href={`/findings/${f.id}`} className="text-xs text-rose-600 hover:underline font-bold bg-rose-50 px-1.5 py-0.5 rounded">{f.findingId}</Link>
                    ))}
                    {c.linkedFindings.length > 2 && <span className="text-xs text-slate-400 font-bold">+{c.linkedFindings.length - 2}</span>}
                </div>
            ) : <span className="text-slate-300">—</span>,
        },
        {
            key: 'status', header: 'Durum', defaultWidth: 90,
            render: (c) => {
                const cfg = statusLabel[c.status];
                return cfg ? <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge> : <span className="text-gray-400">—</span>;
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

                {/* KPI Cards */}
                <div className="grid grid-cols-5 gap-4 mb-6">
                    {[
                        { label: 'Toplam', value: controls.length, color: 'slate', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
                        { label: 'Aktif', value: activeCount, color: 'green', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
                        { label: 'Pasif', value: passiveCount, color: 'amber', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
                        { label: 'Etkin Değil', value: ineffectiveCount, color: 'red', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z' },
                        { label: 'Test Edilmedi', value: notTestedCount, color: 'blue', icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                    ].map(kpi => (
                        <div key={kpi.label} className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4`}>
                            <div className={`p-3 rounded-xl ${kpi.color === 'slate' ? 'bg-slate-50 text-slate-600' : kpi.color === 'green' ? 'bg-emerald-50 text-emerald-600' : kpi.color === 'amber' ? 'bg-amber-50 text-amber-600' : kpi.color === 'red' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={kpi.icon} />
                                </svg>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
                                <p className="text-xl font-extrabold text-slate-800 mt-0.5">{kpi.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Filter and Presets Panel */}
                <div className="mb-5 bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-4">
                    
                    {/* Saved Filter Presets */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">🎯 Hızlı Filtreler:</span>
                            <button
                                type="button"
                                onClick={() => applyPreset(activePreset === 'my_controls' ? '' : 'my_controls')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-xl border transition-all ${activePreset === 'my_controls' ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/10' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                            >
                                Benim Kontrollerim
                            </button>
                            <button
                                type="button"
                                onClick={() => applyPreset(activePreset === 'open_findings' ? '' : 'open_findings')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-xl border transition-all ${activePreset === 'open_findings' ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/10' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                            >
                                Açık Bulgulu Kontroller
                            </button>
                            <button
                                type="button"
                                onClick={() => applyPreset(activePreset === 'this_month' ? '' : 'this_month')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-xl border transition-all ${activePreset === 'this_month' ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/10' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                            >
                                Bu Ay Yapılacaklar
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={clearAllFilters}
                            className="text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider transition-colors"
                        >
                            Filtreleri Temizle
                        </button>
                    </div>

                    {/* Column Filtering Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        <div className="col-span-1 sm:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Küresel Arama (Her Şeyde Ara)</label>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="ID, ad, sahip, açıklama..."
                                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-800 font-semibold"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kontrol Tipi</label>
                            <select
                                value={colFilters.type}
                                onChange={(e) => setColFilters(p => ({ ...p, type: e.target.value }))}
                                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 outline-none font-bold text-slate-600"
                            >
                                <option value="">Tümü</option>
                                <option value="BT">BT</option>
                                <option value="BT_DISI">BT Dışı</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nitelik</label>
                            <select
                                value={colFilters.nature}
                                onChange={(e) => setColFilters(p => ({ ...p, nature: e.target.value }))}
                                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 outline-none font-bold text-slate-600"
                            >
                                <option value="">Tümü</option>
                                <option value="PREVENTIVE">Önleyici</option>
                                <option value="DETECTIVE">Tespit Edici</option>
                                <option value="CORRECTIVE">Düzeltici</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Otomasyon</label>
                            <select
                                value={colFilters.automation}
                                onChange={(e) => setColFilters(p => ({ ...p, automation: e.target.value }))}
                                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 outline-none font-bold text-slate-600"
                            >
                                <option value="">Tümü</option>
                                <option value="AUTOMATED">Otomatik</option>
                                <option value="SEMI_AUTOMATED">Yarı Otomatik</option>
                                <option value="MANUAL">Manuel</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Periyodik Sıklık</label>
                            <select
                                value={colFilters.frequency}
                                onChange={(e) => setColFilters(p => ({ ...p, frequency: e.target.value }))}
                                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 outline-none font-bold text-slate-600"
                            >
                                <option value="">Tümü</option>
                                <option value="DAILY">Günlük</option>
                                <option value="WEEKLY">Haftalık</option>
                                <option value="MONTHLY">Aylık</option>
                                <option value="QUARTERLY">3 Aylık</option>
                                <option value="SEMI_ANNUAL">6 Aylık</option>
                                <option value="ANNUAL">Yıllık</option>
                                <option value="AD_HOC">Arızi</option>
                            </select>
                        </div>
                    </div>
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
            
            <ImportControlModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                onImportSuccess={() => {
                    success('Başarılı', 'Kontroller başarıyla içeri aktarıldı.');
                    fetchControls();
                }}
            />
        </div>
    );
}
