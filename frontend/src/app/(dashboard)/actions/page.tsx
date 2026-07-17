'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { PageHeader, DataTable, FilterBar, StatusBadge, Button } from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import ActionEditModal from '@/components/actions/ActionEditModal';
import { PermissionGate } from '@/components/auth/AuthProvider';

interface Action {
    id: string;
    actionId: string;
    description: string;
    source: string;
    status: string;
    dueDate: string;
    slaInDays: number;
    notes?: string | null;
    responsibleDepartment?: string | null;
    owner: {
        id: string;
        firstName: string;
        lastName: string;
    };
    risk?: {
        id: string;
        riskId: string;
        name: string;
    };
    finding?: {
        id: string;
        findingId: string;
    };
}

type BadgeVariant = 'neutral' | 'warning' | 'info' | 'success' | 'critical' | 'primary';

const sourceLabels: Record<string, string> = {
    RISK: 'Risk',
    FINDING: 'Bulgu',
    AUDIT: 'Denetim',
    CONTROL_TEST: 'Kontrol Testi',
};

const statusLabels: Record<string, { label: string; variant: BadgeVariant }> = {
    BEKLIYOR: { label: 'Bekliyor', variant: 'info' },
    DEVAM_EDIYOR: { label: 'Devam Ediyor', variant: 'warning' },
    TAMAMLANDI: { label: 'Tamamlandı', variant: 'success' },
    YETERSIZ: { label: 'Yetersiz', variant: 'critical' },
    KAPATILDI: { label: 'Kapatıldı', variant: 'neutral' },
    // Legacy
    OPEN: { label: 'Açık', variant: 'info' },
    IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
    COMPLETED: { label: 'Tamamlandı', variant: 'success' },
    CLOSED: { label: 'Kapatıldı', variant: 'neutral' },
    OVERDUE: { label: 'Gecikmiş', variant: 'critical' },
};

const CLOSED_STATUSES = ['TAMAMLANDI', 'KAPATILDI', 'COMPLETED', 'CLOSED'];

const getDaysRemaining = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

export default function ActionsPage() {
    const [actions, setActions] = useState<Action[]>([]);
    const [loading, setLoading] = useState(true);
    const [editAction, setEditAction] = useState<Action | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [colFilters, setColFilters] = useState<Record<string, string>>({});
    const [page, setPage] = useState(1);
    const pageSize = 15;

    const loadActions = useCallback(async () => {
        setLoading(true);
        try {
            const result = await api.getActions({}) as { data: Action[] };
            setActions(result.data || []);
        } catch (error) {
            console.error('Failed to load actions:', error);
            setActions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadActions(); }, [loadActions]);

    const filterConfigs = useMemo(() => [
        {
            key: 'status', label: 'Durum',
            value: activeFilters['status'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, status: v })); setPage(1); },
            options: Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            key: 'source', label: 'Kaynak',
            value: activeFilters['source'] || '',
            onChange: (v: string) => { setActiveFilters(p => ({ ...p, source: v })); setPage(1); },
            options: Object.entries(sourceLabels).map(([k, v]) => ({ value: k, label: v })),
        },
    ], [activeFilters]);

    const baseFilteredActions = useMemo(() => {
        return actions.filter(a => {
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!a.actionId.toLowerCase().includes(q) && !a.description.toLowerCase().includes(q)) return false;
            }
            if (activeFilters['status'] && activeFilters['status'] !== 'all' && a.status !== activeFilters['status']) return false;
            if (activeFilters['source'] && activeFilters['source'] !== 'all' && a.source !== activeFilters['source']) return false;
            return true;
        });
    }, [actions, searchQuery, activeFilters]);

    // KPIs
    const inProgress = actions.filter(a => a.status === 'IN_PROGRESS' || a.status === 'DEVAM_EDIYOR').length;
    const completed = actions.filter(a => CLOSED_STATUSES.includes(a.status)).length;
    const overdue = actions.filter(a => a.status === 'OVERDUE' || (getDaysRemaining(a.dueDate) < 0 && !CLOSED_STATUSES.includes(a.status))).length;

    const columns: ColumnDef<Action>[] = useMemo(() => [
        {
            key: 'actionId', header: 'Aksiyon ID', sortable: true, defaultWidth: 120,
            filter: { type: 'text', placeholder: 'ID ara...', fn: (a: Action, v) => a.actionId.toLowerCase().includes(v.toLowerCase()) },
            render: (a) => (
                <Link href={`/actions/${a.id}`} className="font-mono font-semibold text-orange-600 hover:underline">
                    {a.actionId}
                </Link>
            ),
        },
        {
            key: 'description', header: 'Açıklama', defaultWidth: 250,
            filter: { type: 'text', placeholder: 'Açıklama ara...', fn: (a: Action, v) => a.description.toLowerCase().includes(v.toLowerCase()) },
            render: (a) => <span className="font-medium text-slate-800 truncate block max-w-[230px]" title={a.description}>{a.description}</span>,
        },
        {
            key: 'source', header: 'Kaynak', defaultWidth: 110,
            filter: { type: 'select', options: Object.entries(sourceLabels).map(([k, v]) => ({ value: k, label: v })), fn: (a: Action, v) => a.source === v },
            render: (a) => <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{sourceLabels[a.source] || a.source}</span>,
        },
        {
            key: 'owner', header: 'Sorumlu', defaultWidth: 150,
            filter: { type: 'text', placeholder: 'Kişi ara...', fn: (a: Action, v) => `${a.owner?.firstName || ''} ${a.owner?.lastName || ''}`.toLowerCase().includes(v.toLowerCase()) },
            render: (a) => <span className="text-sm text-slate-700">{a.owner?.firstName} {a.owner?.lastName}</span>,
        },
        {
            key: 'dueDate', header: 'Hedef Tarih', sortable: true, defaultWidth: 120,
            render: (a) => {
                const isOverdue = getDaysRemaining(a.dueDate) < 0 && !CLOSED_STATUSES.includes(a.status);
                return (
                    <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
                        {new Date(a.dueDate).toLocaleDateString('tr-TR')}
                    </span>
                );
            },
        },
        {
            key: 'remainingDays', header: 'Kalan', defaultWidth: 110,
            render: (a) => {
                const d = getDaysRemaining(a.dueDate);
                const isOverdue = d < 0 && !CLOSED_STATUSES.includes(a.status);
                if (CLOSED_STATUSES.includes(a.status)) return <span className="text-xs text-slate-400">—</span>;
                return (
                    <span className={`text-xs ${isOverdue ? 'text-red-500' : d <= 7 ? 'text-amber-500' : 'text-slate-500'}`}>
                        {isOverdue ? `${Math.abs(d)} gün gecikmiş` : `${d} gün kaldı`}
                    </span>
                );
            },
        },
        {
            key: 'status', header: 'Durum', defaultWidth: 130,
            filter: { type: 'select', options: Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v.label })), fn: (a: Action, v) => a.status === v },
            render: (a) => {
                const c = statusLabels[a.status];
                return c ? <StatusBadge variant={c.variant}>{c.label}</StatusBadge> : null;
            },
        },
        {
            key: 'relations', header: 'İlişkiler', defaultWidth: 140,
            render: (a) => (
                <div className="flex flex-col gap-1">
                    {a.risk && (
                        <Link href={`/risks/${a.risk.id}`} className="text-[11px] text-blue-600 hover:underline">
                            Risk: {a.risk.riskId}
                        </Link>
                    )}
                    {a.finding && (
                        <Link href={`/findings/${a.finding.id}`} className="text-[11px] text-violet-600 hover:underline">
                            Bulgu: {a.finding.findingId}
                        </Link>
                    )}
                </div>
            ),
        },
        {
            key: 'actions', header: 'İşlemler', defaultWidth: 100,
            render: (a) => (
                <div className="flex items-center gap-1">
                    <Link href={`/actions/${a.id}`} className="p-1.5 rounded text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors" title="Görüntüle">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    </Link>
                    <PermissionGate permission="action:update">
                        <button onClick={(e) => { e.stopPropagation(); setEditAction(a); }}
                            className="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Düzenle">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                    </PermissionGate>
                </div>
            ),
        },
    ], []);

    const filteredActions = useMemo(() => {
        if (!Object.values(colFilters).some(v => v)) return baseFilteredActions;
        return baseFilteredActions.filter(a =>
            columns.every(col => {
                const val = colFilters[col.key];
                return !val || !col.filter?.fn || col.filter.fn(a, val);
            })
        );
    }, [baseFilteredActions, colFilters, columns]);

    const paginatedActions = useMemo(() => filteredActions.slice((page - 1) * pageSize, page * pageSize), [filteredActions, page]);

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            <div className="px-8 pt-8">
                <PageHeader
                    title="Aksiyon Yönetimi"
                    description="Tüm aksiyonları takip edin ve yönetin"
                    breadcrumbs={[{ label: 'Bulgu & Aksiyon' }, { label: 'Aksiyon Listesi' }]}
                    actions={
                        <Link href="/actions/new">
                            <Button variant="primary" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>} className="bg-orange-600 hover:bg-orange-700 ring-orange-600">
                                Yeni Aksiyon
                            </Button>
                        </Link>
                    }
                />

                {/* KPIs */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Toplam Aksiyon</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">{actions.length}</p>
                    </div>
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-amber-200">
                        <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Devam Eden</p>
                        <p className="text-2xl font-bold text-amber-700 mt-1">{inProgress}</p>
                    </div>
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-emerald-200">
                        <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Tamamlanan</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-1">{completed}</p>
                    </div>
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-red-200">
                        <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Gecikmiş</p>
                        <p className="text-2xl font-bold text-red-700 mt-1">{overdue}</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="mb-4 bg-white border border-slate-200 rounded-xl shadow-sm p-3">
                    <FilterBar
                        searchValue={searchQuery}
                        onSearchChange={(v) => { setSearchQuery(v); setPage(1); }}
                        searchPlaceholder="Aksiyon ID veya açıklama ara..."
                        filters={filterConfigs}
                        onClearAll={() => { setSearchQuery(''); setActiveFilters({}); setPage(1); }}
                    />
                </div>
            </div>

            <div className="px-8 pb-8 flex-1">
                <DataTable
                    columns={columns}
                    data={paginatedActions}
                    rowKey={(a) => a.id}
                    loading={loading}
                    totalCount={filteredActions.length}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    storageKey="actions-table"
                    emptyTitle="Aksiyon bulunamadı"
                    emptyDescription="Filtrelerinizi değiştirin veya yeni bir aksiyon oluşturun."
                    columnFilters={colFilters}
                    onColumnFilterChange={(k, v) => { setColFilters(p => ({ ...p, [k]: v })); setPage(1); }}
                />
            </div>

            <ActionEditModal
                isOpen={!!editAction}
                onClose={() => setEditAction(null)}
                onSuccess={loadActions}
                action={editAction as any}
            />
        </div>
    );
}
