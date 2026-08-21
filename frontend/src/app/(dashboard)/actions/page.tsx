'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import {
    PageShell, PageHeader, DataTable, StatusBadge, Button, ConfirmDialog,
    KpiCard, KpiGrid, QuickFilterBar, AdvancedFilterPanel, ActiveFilterChips, SavedViewMenu,
} from '@/components/ui';
import type { ColumnDef, ActiveFilterChip, QuickFilterItem, AdvancedFilterField } from '@/components/ui';
import ActionEditModal from '@/components/actions/ActionEditModal';
import { PermissionGate } from '@/components/auth/AuthProvider';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/ui/Toast';

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
const IN_PROGRESS_STATUSES = ['DEVAM_EDIYOR', 'IN_PROGRESS'];

const getDaysRemaining = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const isOverdue = (a: Action) =>
    a.status === 'OVERDUE' || (getDaysRemaining(a.dueDate) < 0 && !CLOSED_STATUSES.includes(a.status));

const isInCurrentMonth = (a: Action) => {
    if (!a.dueDate) return false;
    const due = new Date(a.dueDate);
    const now = new Date();
    return due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth();
};

function ActionsContent() {
    const { user } = useAuth();
    const { success, error: showError } = useToast();
    const searchParams = useSearchParams();

    const [actions, setActions] = useState<Action[]>([]);
    const [loading, setLoading] = useState(true);
    const [editAction, setEditAction] = useState<Action | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [colFilters, setColFilters] = useState<Record<string, string>>({});
    const [quickFilter, setQuickFilter] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const pageSize = 15;

    // Toplu seçim
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Dashboard linkleri (?status=OVERDUE vb.) mount'ta uygulanır
    useEffect(() => {
        const status = searchParams.get('status');
        if (status === 'OVERDUE') {
            setQuickFilter('geciken');
        } else if (status && statusLabels[status]) {
            setActiveFilters(p => ({ ...p, status }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadActions = useCallback(async () => {
        setLoading(true);
        try {
            const result = await api.getActions({}) as { data: Action[] };
            setActions(result.data || []);
        } catch (error) {
            console.error('Failed to load actions:', error);
            showError('Hata', 'Aksiyonlar yüklenemedi.');
            setActions([]);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { loadActions(); }, [loadActions]);

    // ── Quick filter predicate'leri ──
    const quickFilterFns: Record<string, (a: Action) => boolean> = useMemo(() => ({
        'benim': (a) => a.owner?.id === user?.id,
        'geciken': (a) => isOverdue(a),
        'buay': (a) => isInCurrentMonth(a),
        'devam': (a) => IN_PROGRESS_STATUSES.includes(a.status),
        'tamamlanan': (a) => CLOSED_STATUSES.includes(a.status),
    }), [user?.id]);

    const baseFilteredActions = useMemo(() => {
        return actions.filter(a => {
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!a.actionId.toLowerCase().includes(q) && !a.description.toLowerCase().includes(q)) return false;
            }
            if (activeFilters['status'] && activeFilters['status'] !== 'all' && a.status !== activeFilters['status']) return false;
            if (activeFilters['source'] && activeFilters['source'] !== 'all' && a.source !== activeFilters['source']) return false;
            if (quickFilter && quickFilterFns[quickFilter] && !quickFilterFns[quickFilter](a)) return false;
            return true;
        });
    }, [actions, searchQuery, activeFilters, quickFilter, quickFilterFns]);

    // KPIs
    const inProgress = actions.filter(quickFilterFns['devam']).length;
    const completed = actions.filter(quickFilterFns['tamamlanan']).length;
    const overdue = actions.filter(quickFilterFns['geciken']).length;

    const columns: ColumnDef<Action>[] = useMemo(() => [
        {
            key: 'actionId', header: 'Aksiyon ID', sortable: true, defaultWidth: 120,
            filter: { type: 'text', placeholder: 'ID ara...', fn: (a: Action, v) => a.actionId.toLowerCase().includes(v.toLowerCase()) },
            render: (a) => (
                <Link href={`/actions/${a.id}`} className="font-mono text-xs font-bold text-blue-700 hover:underline">
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
                const overdueRow = getDaysRemaining(a.dueDate) < 0 && !CLOSED_STATUSES.includes(a.status);
                return (
                    <span className={`text-sm ${overdueRow ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
                        {new Date(a.dueDate).toLocaleDateString('tr-TR')}
                    </span>
                );
            },
        },
        {
            key: 'remainingDays', header: 'Kalan', defaultWidth: 110,
            render: (a) => {
                const d = getDaysRemaining(a.dueDate);
                const overdueRow = d < 0 && !CLOSED_STATUSES.includes(a.status);
                if (CLOSED_STATUSES.includes(a.status)) return <span className="text-xs text-slate-400">—</span>;
                return (
                    <span className={`text-xs ${overdueRow ? 'text-red-500' : d <= 7 ? 'text-amber-500' : 'text-slate-500'}`}>
                        {overdueRow ? `${Math.abs(d)} gün gecikmiş` : `${d} gün kaldı`}
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
                    <Link href={`/actions/${a.id}`} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Görüntüle">
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

    // ── Toplu Seçim ───────────────────────────────────────────────────────────

    const handleRowSelect = (id: string) => {
        setSelectedRows(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedRows.size === filteredActions.length) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(filteredActions.map(a => a.id)));
        }
    };

    const handleBulkDelete = async () => {
        setDeleting(true);
        try {
            for (const id of selectedRows) await api.deleteAction(id);
            setActions(prev => prev.filter(a => !selectedRows.has(a.id)));
            setSelectedRows(new Set());
            setConfirmDeleteOpen(false);
            success('Başarılı', `${selectedRows.size} aksiyon silindi.`);
        } catch (err) {
            console.error('Delete failed:', err);
            showError('Hata', 'Bazı aksiyonlar silinemedi.');
        } finally {
            setDeleting(false);
        }
    };

    // ── Quick filter chip'leri (canlı sayaçlarla) ──
    const quickFilterItems: QuickFilterItem[] = useMemo(() => [
        { key: 'benim', label: 'Benim Aksiyonlarım', count: actions.filter(quickFilterFns['benim']).length },
        { key: 'geciken', label: 'Gecikenler', count: overdue },
        { key: 'buay', label: 'Bu Ay', count: actions.filter(quickFilterFns['buay']).length },
    ], [actions, quickFilterFns, overdue]);

    const quickFilterLabels: Record<string, string> = {
        'benim': 'Benim Aksiyonlarım', 'geciken': 'Gecikenler', 'buay': 'Bu Ay',
        'devam': 'Devam Eden', 'tamamlanan': 'Tamamlanan',
    };

    // ── Gelişmiş filtre alanları ──
    const advancedFields: AdvancedFilterField[] = useMemo(() => [
        {
            type: 'select', key: 'status', label: 'Durum',
            value: activeFilters['status'] || '',
            onChange: (v) => { setActiveFilters(p => ({ ...p, status: v })); setPage(1); },
            options: Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            type: 'select', key: 'source', label: 'Kaynak',
            value: activeFilters['source'] || '',
            onChange: (v) => { setActiveFilters(p => ({ ...p, source: v })); setPage(1); },
            options: Object.entries(sourceLabels).map(([k, v]) => ({ value: k, label: v })),
        },
    ], [activeFilters]);

    // ── Aktif filtre chip'leri ──
    const filterLabels: Record<string, string> = { status: 'Durum', source: 'Kaynak' };
    const filterValueLabel = (key: string, value: string): string => {
        if (key === 'status') return statusLabels[value]?.label ?? value;
        if (key === 'source') return sourceLabels[value] ?? value;
        return value;
    };
    const activeChips: ActiveFilterChip[] = useMemo(() => {
        const chips: ActiveFilterChip[] = [];
        if (searchQuery) chips.push({ key: 'search', label: 'Arama', value: searchQuery, onRemove: () => { setSearchQuery(''); setPage(1); } });
        if (quickFilter) chips.push({
            key: 'quick', label: 'Hızlı Filtre', value: quickFilterLabels[quickFilter] ?? quickFilter,
            onRemove: () => { setQuickFilter(null); setPage(1); },
        });
        Object.entries(activeFilters).forEach(([k, v]) => {
            if (v && v !== 'all') chips.push({
                key: k, label: filterLabels[k] ?? k, value: filterValueLabel(k, v),
                onRemove: () => { setActiveFilters(p => ({ ...p, [k]: '' })); setPage(1); },
            });
        });
        return chips;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, activeFilters, quickFilter]);

    const clearAll = () => { setSearchQuery(''); setActiveFilters({}); setQuickFilter(null); setColFilters({}); setPage(1); };

    return (
        <PageShell>
            <PageHeader
                title="Aksiyon Yönetimi"
                description="Tüm aksiyonları takip edin ve yönetin"
                breadcrumbs={[{ label: 'Bulgu & Aksiyon' }, { label: 'Aksiyon Listesi' }]}
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
                        <Link href="/actions/new">
                            <Button variant="primary" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}>
                                Yeni Aksiyon
                            </Button>
                        </Link>
                    </div>
                }
            />

            {/* KPI'lar — tümü click-to-filter */}
            <KpiGrid columns={4}>
                <KpiCard title="Toplam Aksiyon" value={actions.length} variant="default"
                    active={!quickFilter && activeChips.length === 0}
                    onClick={clearAll} />
                <KpiCard title="Devam Eden" value={inProgress} variant="warning"
                    active={quickFilter === 'devam'}
                    onClick={() => { setQuickFilter(quickFilter === 'devam' ? null : 'devam'); setPage(1); }} />
                <KpiCard title="Tamamlanan" value={completed} variant="success"
                    active={quickFilter === 'tamamlanan'}
                    onClick={() => { setQuickFilter(quickFilter === 'tamamlanan' ? null : 'tamamlanan'); setPage(1); }} />
                <KpiCard title="Gecikmiş" value={overdue} variant="critical"
                    active={quickFilter === 'geciken'}
                    onClick={() => { setQuickFilter(quickFilter === 'geciken' ? null : 'geciken'); setPage(1); }} />
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
                searchPlaceholder="Aksiyon ID veya açıklama ara..."
                fields={advancedFields}
                activeCount={Object.values(activeFilters).filter(v => v && v !== 'all').length}
                onClearAll={clearAll}
            />

            {/* Aktif filtre chip'leri */}
            <ActiveFilterChips chips={activeChips} onClearAll={clearAll} />

            <DataTable
                columns={columns}
                data={paginatedActions}
                rowKey={(a) => a.id}
                loading={loading}
                showCheckbox
                selectedRows={selectedRows}
                onRowSelect={handleRowSelect}
                onSelectAll={handleSelectAll}
                totalCount={filteredActions.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                storageKey="actions-table"
                emptyTitle="Aksiyon bulunamadı"
                emptyDescription="Filtrelerinizi değiştirin veya yeni bir aksiyon oluşturun."
                columnFilters={colFilters}
                onColumnFilterChange={(k, v) => { setColFilters(p => ({ ...p, [k]: v })); setPage(1); }}
                stickyFirstColumn
                onRefresh={loadActions}
                toolbar={
                    <SavedViewMenu
                        storageKey="actions-table"
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
                title="Aksiyonlar Silinecek"
                message={`Seçilen ${selectedRows.size} aksiyon kalıcı olarak silinecektir. Bu işlem geri alınamaz.`}
                confirmLabel="Evet, Sil"
                loading={deleting}
                variant="danger"
            />

            <ActionEditModal
                isOpen={!!editAction}
                onClose={() => setEditAction(null)}
                onSuccess={loadActions}
                action={editAction as any}
            />
        </PageShell>
    );
}

export default function ActionsPage() {
    return (
        <Suspense fallback={<PageShell><div className="py-24" /></PageShell>}>
            <ActionsContent />
        </Suspense>
    );
}
