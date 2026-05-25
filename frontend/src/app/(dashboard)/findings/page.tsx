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

interface Finding {
    id: string;
    findingId: string;
    findingType: string;
    description: string;
    affectedSystem: string;
    risk: { id: string; riskId: string; name: string } | null;
    control: { id: string; controlId: string; name: string } | null;
    recommendation: string;
    actionOwner: { id: string; name: string; department: string };
    targetClosureDate: string;
    closedDate: string | null;
    status: string;
    actions: { id: string; actionId: string; status: string }[];
    createdAt: string;
}

// ─── Config Maps ──────────────────────────────────────────────────────────────

type BadgeVariant = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const findingTypeConfig: Record<string, { label: string; variant: BadgeVariant }> = {
    CONTROL_DEFICIENCY: { label: 'Kontrol Eksikliği', variant: 'critical' },
    PROCESS_GAP: { label: 'Süreç Açığı', variant: 'high' },
    COMPLIANCE_ISSUE: { label: 'Uyum Sorunu', variant: 'medium' },
    DOCUMENTATION: { label: 'Dokümantasyon', variant: 'info' },
    IT_SECURITY: { label: 'BT Güvenliği', variant: 'primary' },
    OPERATIONAL: { label: 'Operasyonel', variant: 'neutral' },
};

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
    OPEN: { label: 'Açık', variant: 'critical' },
    IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
    PENDING_REVIEW: { label: 'İnceleme Bekliyor', variant: 'info' },
    CLOSED: { label: 'Kapatıldı', variant: 'success' },
    VERIFIED: { label: 'Doğrulandı', variant: 'low' },
};

const delayStatusConfig: Record<string, { label: string; variant: BadgeVariant; icon: string }> = {
    ON_TIME: { label: 'Zamanında', variant: 'success', icon: '✓' },
    APPROACHING: { label: 'Yaklaşıyor', variant: 'warning', icon: '⏰' },
    OVERDUE: { label: 'Gecikmiş', variant: 'critical', icon: '⚠' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getDelayStatus = (targetDate: string, closedDate: string | null, status: string): string => {
    if (status === 'CLOSED' || status === 'VERIFIED') return 'ON_TIME';
    const diffDays = Math.ceil((new Date(targetDate).getTime() - Date.now()) / 86400000);
    if (diffDays < 0) return 'OVERDUE';
    if (diffDays <= 7) return 'APPROACHING';
    return 'ON_TIME';
};

const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FindingsPage() {
    const { success, error: showError } = useToast();

    const [findings, setFindings] = useState<Finding[]>([]);
    const [loading, setLoading] = useState(true);

    // Selection
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

    // Pagination
    const [page, setPage] = useState(1);
    const pageSize = 20;

    // ── Fetch ─────────────────────────────────────────────────────────────────

    const loadFindings = useCallback(async () => {
        setLoading(true);
        try {
            const result = await api.getFindings({}) as { data: Finding[] };
            setFindings(result.data || []);
        } catch (err) {
            console.error('Failed to load findings:', err);
            showError('Hata', 'Bulgular yüklenemedi.');
            setFindings([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadFindings(); }, [loadFindings]);

    // ── Derived Data ──────────────────────────────────────────────────────────

    const filteredFindings = useMemo(() => {
        return findings.filter(f => {
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (
                    !f.description.toLowerCase().includes(q) &&
                    !f.findingId.toLowerCase().includes(q) &&
                    !f.affectedSystem.toLowerCase().includes(q)
                ) return false;
            }
            const typeFilter = activeFilters['findingType'];
            if (typeFilter && typeFilter !== 'all' && f.findingType !== typeFilter) return false;

            const statusFilter = activeFilters['status'];
            if (statusFilter && statusFilter !== 'all' && f.status !== statusFilter) return false;

            const delayFilter = activeFilters['delayStatus'];
            if (delayFilter && delayFilter !== 'all') {
                if (getDelayStatus(f.targetClosureDate, f.closedDate, f.status) !== delayFilter) return false;
            }
            return true;
        });
    }, [findings, searchQuery, activeFilters]);

    const paginatedFindings = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredFindings.slice(start, start + pageSize);
    }, [filteredFindings, page, pageSize]);

    // ── KPIs ──────────────────────────────────────────────────────────────────

    const totalFindings = findings.length;
    const openFindings = findings.filter(f => f.status === 'OPEN' || f.status === 'IN_PROGRESS').length;
    const overdueFindings = findings.filter(f => getDelayStatus(f.targetClosureDate, f.closedDate, f.status) === 'OVERDUE').length;
    const closedList = findings.filter(f => f.closedDate);
    const avgClosureTime = closedList.length > 0
        ? Math.round(closedList.reduce((acc, f) => {
            return acc + (new Date(f.closedDate!).getTime() - new Date(f.createdAt).getTime()) / 86400000;
        }, 0) / closedList.length)
        : 0;

    // ── Row Selection ─────────────────────────────────────────────────────────

    const handleRowSelect = (id: string) => {
        setSelectedRows(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedRows.size === filteredFindings.length) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(filteredFindings.map(f => f.id)));
        }
    };

    // ── Bulk Delete ───────────────────────────────────────────────────────────

    const handleBulkDelete = async () => {
        setDeleting(true);
        try {
            for (const id of selectedRows) {
                await api.deleteFinding(id);
            }
            setFindings(prev => prev.filter(f => !selectedRows.has(f.id)));
            setSelectedRows(new Set());
            setConfirmDeleteOpen(false);
            success('Başarılı', `${selectedRows.size} bulgu silindi.`);
        } catch (err) {
            console.error('Delete failed:', err);
            showError('Hata', 'Bazı bulgular silinemedi.');
        } finally {
            setDeleting(false);
        }
    };

    // ── Filter Options ────────────────────────────────────────────────────────

    const filterConfigs = useMemo(() => [
        {
            key: 'findingType',
            label: 'Bulgu Tipi',
            value: activeFilters['findingType'] || '',
            onChange: (v: string) => { setActiveFilters(prev => ({ ...prev, findingType: v })); setPage(1); },
            options: [
                ...Object.entries(findingTypeConfig).map(([k, v]) => ({ value: k, label: v.label })),
            ],
        },
        {
            key: 'status',
            label: 'Durum',
            value: activeFilters['status'] || '',
            onChange: (v: string) => { setActiveFilters(prev => ({ ...prev, status: v })); setPage(1); },
            options: [
                ...Object.entries(statusConfig).map(([k, v]) => ({ value: k, label: v.label })),
            ],
        },
        {
            key: 'delayStatus',
            label: 'Gecikme',
            value: activeFilters['delayStatus'] || '',
            onChange: (v: string) => { setActiveFilters(prev => ({ ...prev, delayStatus: v })); setPage(1); },
            options: [
                ...Object.entries(delayStatusConfig).map(([k, v]) => ({ value: k, label: v.label })),
            ],
        },
    ], [activeFilters]);

    // ── Columns ───────────────────────────────────────────────────────────────

    const columns: ColumnDef<Finding>[] = useMemo(() => [
        {
            key: 'findingId',
            header: 'Bulgu ID',
            sortable: true,
            defaultWidth: 150,
            render: (f) => (
                <Link href={`/findings/${f.id}`} className="font-mono text-sm font-semibold text-violet-600 hover:underline whitespace-nowrap">
                    {f.findingId}
                </Link>
            ),
        },
        {
            key: 'findingType',
            header: 'Bulgu Tipi',
            sortable: true,
            defaultWidth: 160,
            render: (f) => {
                const cfg = findingTypeConfig[f.findingType];
                return cfg ? (
                    <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge>
                ) : <span className="text-gray-400">—</span>;
            },
        },
        {
            key: 'description',
            header: 'Açıklama',
            defaultWidth: 260,
            render: (f) => (
                <p className="text-sm text-gray-800 truncate max-w-xs" title={f.description}>
                    {f.description}
                </p>
            ),
        },
        {
            key: 'affectedSystem',
            header: 'Etkilenen Sistem',
            sortable: true,
            defaultWidth: 150,
            render: (f) => <span className="text-sm text-gray-600">{f.affectedSystem}</span>,
        },
        {
            key: 'risk',
            header: 'İlişkili Risk',
            defaultWidth: 130,
            render: (f) => f.risk ? (
                <Link href={`/risks/${f.risk.id}`} className="text-sm text-blue-600 hover:underline font-medium">
                    {f.risk.riskId}
                </Link>
            ) : <span className="text-gray-400 text-sm">—</span>,
        },
        {
            key: 'control',
            header: 'İlişkili Kontrol',
            defaultWidth: 130,
            render: (f) => f.control ? (
                <Link href={`/controls/${f.control.id}`} className="text-sm text-emerald-600 hover:underline font-medium">
                    {f.control.controlId}
                </Link>
            ) : <span className="text-gray-400 text-sm">—</span>,
        },
        {
            key: 'actionOwner',
            header: 'Aksiyon Sahibi',
            defaultWidth: 160,
            render: (f) => (
                <div>
                    <p className="text-sm font-medium text-gray-900">{f.actionOwner?.name || '—'}</p>
                    {f.actionOwner?.department && (
                        <p className="text-xs text-gray-500">{f.actionOwner.department}</p>
                    )}
                </div>
            ),
        },
        {
            key: 'targetClosureDate',
            header: 'Hedef Tarih',
            sortable: true,
            defaultWidth: 120,
            render: (f) => {
                const delay = getDelayStatus(f.targetClosureDate, f.closedDate, f.status);
                return (
                    <span className={`text-sm font-medium ${delay === 'OVERDUE' ? 'text-red-600' : 'text-gray-700'}`}>
                        {formatDate(f.targetClosureDate)}
                    </span>
                );
            },
        },
        {
            key: 'delayStatus',
            header: 'Gecikme',
            defaultWidth: 130,
            render: (f) => {
                const key = getDelayStatus(f.targetClosureDate, f.closedDate, f.status);
                const cfg = delayStatusConfig[key];
                return cfg ? (
                    <StatusBadge variant={cfg.variant} dot>
                        {cfg.label}
                    </StatusBadge>
                ) : null;
            },
        },
        {
            key: 'status',
            header: 'Durum',
            sortable: true,
            defaultWidth: 140,
            render: (f) => {
                const cfg = statusConfig[f.status];
                return cfg ? (
                    <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge>
                ) : <span className="text-gray-400">—</span>;
            },
        },
        {
            key: 'actions',
            header: 'İşlemler',
            defaultWidth: 120,
            render: (f) => (
                <div className="flex items-center gap-1">
                    <Link
                        href={`/findings/${f.id}`}
                        className="p-1.5 rounded text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                        title="Görüntüle"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    </Link>
                    <Link
                        href={`/findings/${f.id}/edit`}
                        className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Düzenle"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </Link>
                </div>
            ),
        },
    ], []);

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            <div className="px-8 pt-8">
                {/* Header */}
                <PageHeader
                    title="Bulgular"
                    description="Denetim ve kontrol testlerinden elde edilen bulgular"
                    breadcrumbs={[{ label: 'Bulgular' }]}
                    actions={
                        <div className="flex items-center gap-2">
                            {selectedRows.size > 0 && (
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setConfirmDeleteOpen(true)}
                                    icon={
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    }
                                >
                                    {selectedRows.size} Seçiliyi Sil
                                </Button>
                            )}
                            <Link href="/findings/new">
                                <Button
                                    variant="primary"
                                    icon={
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                    }
                                >
                                    Yeni Bulgu
                                </Button>
                            </Link>
                        </div>
                    }
                />

                {/* KPI Cards */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    {/* Toplam */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
                        <div className="p-3 bg-slate-100 rounded-xl">
                            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Toplam Bulgu</p>
                            <p className="text-2xl font-bold text-slate-800 mt-0.5">{totalFindings}</p>
                        </div>
                    </div>

                    {/* Açık */}
                    <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-5 flex items-center gap-4">
                        <div className="p-3 bg-amber-50 rounded-xl">
                            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Açık Bulgular</p>
                            <p className="text-2xl font-bold text-amber-700 mt-0.5">{openFindings}</p>
                        </div>
                    </div>

                    {/* Gecikmiş */}
                    <div className="bg-white rounded-xl border border-red-100 shadow-sm p-5 flex items-center gap-4">
                        <div className="p-3 bg-red-50 rounded-xl">
                            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Gecikmiş</p>
                            <p className="text-2xl font-bold text-red-700 mt-0.5">{overdueFindings}</p>
                        </div>
                    </div>

                    {/* Ort. Kapanış */}
                    <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-5 flex items-center gap-4">
                        <div className="p-3 bg-blue-50 rounded-xl">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Ort. Kapanış</p>
                            <p className="text-2xl font-bold text-blue-700 mt-0.5">{avgClosureTime} <span className="text-base font-medium">gün</span></p>
                        </div>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="mb-4 bg-white border border-slate-200 rounded-xl shadow-sm p-3">
                    <FilterBar
                        searchValue={searchQuery}
                        onSearchChange={(v) => { setSearchQuery(v); setPage(1); }}
                        searchPlaceholder="Bulgu ID, açıklama veya sistem ara..."
                        filters={filterConfigs}
                        onClearAll={() => {
                            setSearchQuery('');
                            setActiveFilters({});
                            setPage(1);
                        }}
                    />
                </div>
            </div>

            {/* Data Table */}
            <div className="px-8 pb-8 flex-1">
                <DataTable
                    columns={columns}
                    data={paginatedFindings}
                    rowKey={(f) => f.id}
                    loading={loading}
                    showCheckbox
                    selectedRows={selectedRows}
                    onRowSelect={handleRowSelect}
                    onSelectAll={handleSelectAll}
                    totalCount={filteredFindings.length}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    storageKey="findings-table"
                    emptyTitle="Bulgu bulunamadı"
                    emptyDescription="Filtrelerinizi değiştirin veya yeni bir bulgu ekleyin."
                    emptyActionLabel="Yeni Bulgu Ekle"
                    onEmptyAction={() => window.location.href = '/findings/new'}
                />
            </div>

            {/* Confirm Delete Dialog */}
            <ConfirmDialog
                open={confirmDeleteOpen}
                onClose={() => setConfirmDeleteOpen(false)}
                onConfirm={handleBulkDelete}
                title="Bulgular Silinecek"
                message={`Seçilen ${selectedRows.size} bulgu kalıcı olarak silinecektir. Bu işlem geri alınamaz.`}
                confirmLabel="Evet, Sil"
                loading={deleting}
                variant="danger"
            />
        </div>
    );
}
