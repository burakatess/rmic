'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
    PageShell, PageHeader, DataTable, StatusBadge, Button,
    KpiCard, KpiGrid, AdvancedFilterPanel, ActiveFilterChips, SavedViewMenu,
} from '@/components/ui';
import type { ColumnDef, AdvancedFilterField, ActiveFilterChip } from '@/components/ui';

interface AuditPlan {
    id: string;
    auditCode: string;
    auditName: string;
    auditedUnit: string;
    auditTeam: string;
    teamLeader: string;
    teamSize: number;
    plannedStartDate: string;
    plannedEndDate: string;
    status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    phase: 'PLANNING' | 'FIELDWORK' | 'REPORTING' | 'CLOSED';
    rationale: 'PERIODIC' | 'REGULATORY' | 'MANAGEMENT_REQUEST' | 'RISK_BASED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    plannedManDays: number;
    actualManDays: number;
    scheduleVariance: number;
    delayStatus: 'ON_TRACK' | 'AT_RISK' | 'DELAYED';
    draftReportDate: string | null;
    finalReportDate: string | null;
    totalFindings: number;
    openFindings: number;
    actionStatus: 'NO_ACTIONS' | 'IN_PROGRESS' | 'COMPLETED';
}

const DEMO_AUDITS: AuditPlan[] = [
    { id: '1', auditCode: 'AP-2024-001', auditName: 'Bilgi Güvenliği Denetimi', auditedUnit: 'Bilgi Teknolojileri', auditTeam: 'BT Denetim Ekibi', teamLeader: 'Ahmet Yılmaz', teamSize: 3, plannedStartDate: '2024-01-15', plannedEndDate: '2024-02-15', status: 'COMPLETED', phase: 'CLOSED', rationale: 'PERIODIC', priority: 'HIGH', plannedManDays: 30, actualManDays: 35, scheduleVariance: 5, delayStatus: 'DELAYED', draftReportDate: '2024-02-25', finalReportDate: '2024-03-05', totalFindings: 12, openFindings: 3, actionStatus: 'IN_PROGRESS' },
    { id: '2', auditCode: 'AP-2024-002', auditName: 'Kredi Süreçleri Denetimi', auditedUnit: 'Kredi Tahsis', auditTeam: 'Finansal Denetim Ekibi', teamLeader: 'Fatma Öz', teamSize: 2, plannedStartDate: '2024-03-01', plannedEndDate: '2024-04-15', status: 'IN_PROGRESS', phase: 'FIELDWORK', rationale: 'REGULATORY', priority: 'HIGH', plannedManDays: 45, actualManDays: 28, scheduleVariance: 0, delayStatus: 'ON_TRACK', draftReportDate: null, finalReportDate: null, totalFindings: 5, openFindings: 5, actionStatus: 'NO_ACTIONS' },
    { id: '3', auditCode: 'AP-2024-003', auditName: 'MASAK Uyum Denetimi', auditedUnit: 'Uyum Birimi', auditTeam: 'Uyum Denetim Ekibi', teamLeader: 'Zeynep Şen', teamSize: 3, plannedStartDate: '2024-04-01', plannedEndDate: '2024-05-15', status: 'PLANNED', phase: 'PLANNING', rationale: 'REGULATORY', priority: 'HIGH', plannedManDays: 40, actualManDays: 0, scheduleVariance: 0, delayStatus: 'ON_TRACK', draftReportDate: null, finalReportDate: null, totalFindings: 0, openFindings: 0, actionStatus: 'NO_ACTIONS' },
    { id: '4', auditCode: 'AP-2024-004', auditName: 'Şube Operasyonları Denetimi', auditedUnit: 'Şube Ağı', auditTeam: 'Operasyonel Denetim Ekibi', teamLeader: 'Murat Kaya', teamSize: 2, plannedStartDate: '2024-02-01', plannedEndDate: '2024-03-15', status: 'COMPLETED', phase: 'CLOSED', rationale: 'PERIODIC', priority: 'MEDIUM', plannedManDays: 35, actualManDays: 40, scheduleVariance: 5, delayStatus: 'DELAYED', draftReportDate: '2024-03-25', finalReportDate: '2024-04-05', totalFindings: 8, openFindings: 0, actionStatus: 'COMPLETED' },
    { id: '5', auditCode: 'AP-2024-005', auditName: 'İnsan Kaynakları Süreç Denetimi', auditedUnit: 'İnsan Kaynakları', auditTeam: 'HR Denetim Ekibi', teamLeader: 'Deniz Yıldız', teamSize: 1, plannedStartDate: '2024-05-01', plannedEndDate: '2024-06-15', status: 'PLANNED', phase: 'PLANNING', rationale: 'MANAGEMENT_REQUEST', priority: 'MEDIUM', plannedManDays: 30, actualManDays: 0, scheduleVariance: 0, delayStatus: 'AT_RISK', draftReportDate: null, finalReportDate: null, totalFindings: 0, openFindings: 0, actionStatus: 'NO_ACTIONS' },
    { id: '6', auditCode: 'AP-2024-006', auditName: 'Satın Alma Süreçleri Denetimi', auditedUnit: 'Satın Alma', auditTeam: 'Operasyonel Denetim Ekibi', teamLeader: 'Murat Kaya', teamSize: 2, plannedStartDate: '2024-06-01', plannedEndDate: '2024-07-15', status: 'PLANNED', phase: 'PLANNING', rationale: 'RISK_BASED', priority: 'LOW', plannedManDays: 25, actualManDays: 0, scheduleVariance: 0, delayStatus: 'ON_TRACK', draftReportDate: null, finalReportDate: null, totalFindings: 0, openFindings: 0, actionStatus: 'NO_ACTIONS' },
];

type BadgeVariant = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const STATUS_CFG: Record<string, { label: string; variant: BadgeVariant }> = {
    PLANNED: { label: 'Planlandı', variant: 'info' },
    IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
    COMPLETED: { label: 'Tamamlandı', variant: 'success' },
    CANCELLED: { label: 'İptal', variant: 'neutral' },
};
const PHASE_CFG: Record<string, { label: string; variant: BadgeVariant }> = {
    PLANNING: { label: 'Planlama', variant: 'neutral' },
    FIELDWORK: { label: 'Saha', variant: 'primary' },
    REPORTING: { label: 'Raporlama', variant: 'medium' },
    CLOSED: { label: 'Kapatıldı', variant: 'low' },
};
const PRIORITY_CFG: Record<string, { label: string; variant: BadgeVariant }> = {
    LOW: { label: 'Düşük', variant: 'low' },
    MEDIUM: { label: 'Orta', variant: 'warning' },
    HIGH: { label: 'Yüksek', variant: 'critical' },
};
const DELAY_CFG: Record<string, { label: string; variant: BadgeVariant }> = {
    ON_TRACK: { label: 'Zamanında', variant: 'success' },
    AT_RISK: { label: 'Risk Altında', variant: 'warning' },
    DELAYED: { label: 'Gecikmeli', variant: 'critical' },
};
const RATIONALE_LABEL: Record<string, string> = {
    PERIODIC: 'Periyodik', REGULATORY: 'Regülatif',
    MANAGEMENT_REQUEST: 'Yönetim Talebi', RISK_BASED: 'Risk Bazlı',
};

const fmt = (d: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
};

export default function AuditPlanPage() {
    const [audits] = useState<AuditPlan[]>(DEMO_AUDITS);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [page, setPage] = useState(1);
    const pageSize = 15;

    const setFilter = (key: string, value: string) => {
        setActiveFilters(p => ({ ...p, [key]: value }));
        setPage(1);
    };
    const toggleFilter = (key: string, value: string) => {
        setActiveFilters(p => ({ ...p, [key]: p[key] === value ? '' : value }));
        setPage(1);
    };
    const clearAll = () => { setSearchQuery(''); setActiveFilters({}); setPage(1); };

    const advancedFields: AdvancedFilterField[] = useMemo(() => [
        {
            type: 'select', key: 'status', label: 'Durum',
            value: activeFilters['status'] || '',
            onChange: (v: string) => setFilter('status', v),
            options: Object.entries(STATUS_CFG).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            type: 'select', key: 'phase', label: 'Faz',
            value: activeFilters['phase'] || '',
            onChange: (v: string) => setFilter('phase', v),
            options: Object.entries(PHASE_CFG).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            type: 'select', key: 'priority', label: 'Öncelik',
            value: activeFilters['priority'] || '',
            onChange: (v: string) => setFilter('priority', v),
            options: Object.entries(PRIORITY_CFG).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            type: 'select', key: 'delayStatus', label: 'Gecikme',
            value: activeFilters['delayStatus'] || '',
            onChange: (v: string) => setFilter('delayStatus', v),
            options: Object.entries(DELAY_CFG).map(([k, v]) => ({ value: k, label: v.label })),
        },
    ], [activeFilters]);

    const filtered = useMemo(() => audits.filter(a => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!a.auditName.toLowerCase().includes(q) && !a.auditCode.toLowerCase().includes(q)) return false;
        }
        if (activeFilters['status'] && activeFilters['status'] !== 'all' && a.status !== activeFilters['status']) return false;
        if (activeFilters['phase'] && activeFilters['phase'] !== 'all' && a.phase !== activeFilters['phase']) return false;
        if (activeFilters['priority'] && activeFilters['priority'] !== 'all' && a.priority !== activeFilters['priority']) return false;
        if (activeFilters['delayStatus'] && activeFilters['delayStatus'] !== 'all' && a.delayStatus !== activeFilters['delayStatus']) return false;
        return true;
    }), [audits, searchQuery, activeFilters]);

    const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

    const columns: ColumnDef<AuditPlan>[] = useMemo(() => [
        {
            key: 'auditCode', header: 'Plan Kodu', sortable: true, defaultWidth: 130,
            render: (a) => <Link href={`/audits/plans/${a.id}`} className="font-mono font-semibold text-blue-700 hover:underline">{a.auditCode}</Link>,
        },
        {
            key: 'auditName', header: 'Denetim Adı', sortable: true, defaultWidth: 240,
            render: (a) => <span className="font-medium text-slate-800 truncate block max-w-[220px]" title={a.auditName}>{a.auditName}</span>,
        },
        {
            key: 'auditedUnit', header: 'Denetlenen Birim', defaultWidth: 160,
            render: (a) => <span className="text-sm text-slate-600">{a.auditedUnit}</span>,
        },
        {
            key: 'teamLeader', header: 'Ekip Lideri', defaultWidth: 150,
            render: (a) => (
                <div>
                    <p className="text-sm font-medium text-slate-800">{a.teamLeader}</p>
                    <p className="text-xs text-slate-500">+{a.teamSize - 1} üye</p>
                </div>
            ),
        },
        {
            key: 'plannedStartDate', header: 'Başlangıç', sortable: true, defaultWidth: 110,
            render: (a) => <span className="text-sm text-slate-600">{fmt(a.plannedStartDate)}</span>,
        },
        {
            key: 'plannedEndDate', header: 'Bitiş', sortable: true, defaultWidth: 110,
            render: (a) => <span className="text-sm text-slate-600">{fmt(a.plannedEndDate)}</span>,
        },
        {
            key: 'status', header: 'Durum', defaultWidth: 130,
            render: (a) => { const c = STATUS_CFG[a.status]; return c ? <StatusBadge variant={c.variant}>{c.label}</StatusBadge> : null; },
        },
        {
            key: 'phase', header: 'Faz', defaultWidth: 120,
            render: (a) => { const c = PHASE_CFG[a.phase]; return c ? <StatusBadge variant={c.variant}>{c.label}</StatusBadge> : null; },
        },
        {
            key: 'priority', header: 'Öncelik', defaultWidth: 100,
            render: (a) => { const c = PRIORITY_CFG[a.priority]; return c ? <StatusBadge variant={c.variant}>{c.label}</StatusBadge> : null; },
        },
        {
            key: 'delayStatus', header: 'Gecikme', defaultWidth: 130,
            render: (a) => { const c = DELAY_CFG[a.delayStatus]; return c ? <StatusBadge variant={c.variant} dot>{c.label}</StatusBadge> : null; },
        },
        {
            key: 'plannedManDays', header: 'Plan/Gerçek Gün', defaultWidth: 130,
            render: (a) => (
                <span className="text-sm">
                    <span className="text-slate-700 font-medium">{a.plannedManDays}</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className={a.scheduleVariance > 0 ? 'text-red-600 font-medium' : 'text-slate-600'}>{a.actualManDays || '—'}</span>
                </span>
            ),
        },
        {
            key: 'totalFindings', header: 'Bulgu', defaultWidth: 90,
            render: (a) => a.totalFindings > 0 ? (
                <span className="font-medium text-slate-700">{a.totalFindings} <span className="text-red-500 text-xs">({a.openFindings} açık)</span></span>
            ) : <span className="text-slate-300">—</span>,
        },
        {
            key: 'rationale', header: 'Gerekçe', defaultWidth: 130,
            render: (a) => <span className="text-xs text-slate-500">{RATIONALE_LABEL[a.rationale]}</span>,
        },
        {
            key: 'actions', header: 'İşlemler', defaultWidth: 90,
            render: (a) => (
                <div className="flex items-center gap-1">
                    <Link href={`/audits/plans/${a.id}`} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Görüntüle">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    </Link>
                    <Link href={`/audits/plans/${a.id}/edit`} className="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Düzenle">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </Link>
                </div>
            ),
        },
    ], []);

    // KPIs
    const inProgress = audits.filter(a => a.status === 'IN_PROGRESS').length;
    const completed = audits.filter(a => a.status === 'COMPLETED').length;
    const delayed = audits.filter(a => a.delayStatus === 'DELAYED').length;
    const totalPlanned = audits.reduce((s, a) => s + a.plannedManDays, 0);
    const totalActual = audits.reduce((s, a) => s + a.actualManDays, 0);

    // ── Aktif filtre chip'leri ──
    const filterLabels: Record<string, string> = { status: 'Durum', phase: 'Faz', priority: 'Öncelik', delayStatus: 'Gecikme' };
    const filterValueLabel = (key: string, value: string): string => {
        if (key === 'status') return STATUS_CFG[value]?.label ?? value;
        if (key === 'phase') return PHASE_CFG[value]?.label ?? value;
        if (key === 'priority') return PRIORITY_CFG[value]?.label ?? value;
        if (key === 'delayStatus') return DELAY_CFG[value]?.label ?? value;
        return value;
    };
    const activeChips: ActiveFilterChip[] = useMemo(() => {
        const chips: ActiveFilterChip[] = [];
        if (searchQuery) chips.push({ key: 'search', label: 'Arama', value: searchQuery, onRemove: () => { setSearchQuery(''); setPage(1); } });
        Object.entries(activeFilters).forEach(([k, v]) => {
            if (v && v !== 'all') chips.push({
                key: k, label: filterLabels[k] ?? k, value: filterValueLabel(k, v),
                onRemove: () => setFilter(k, ''),
            });
        });
        return chips;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, activeFilters]);

    const activeFilterCount = Object.values(activeFilters).filter(v => v && v !== 'all').length;

    return (
        <PageShell>
            <PageHeader
                title="Denetim Planı"
                description="İç denetim faaliyetlerini planlayın ve takip edin"
                breadcrumbs={[{ label: 'Denetim & İnceleme' }, { label: 'Denetim Planı' }]}
                actions={
                    <Link href="/audits/plans/new">
                        <Button variant="primary" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}>
                            Yeni Denetim Planı
                        </Button>
                    </Link>
                }
            />

            {/* KPI'lar — statü/gecikme filtreleriyle click-to-filter */}
            <KpiGrid columns={6}>
                <KpiCard title="Toplam Plan" value={audits.length} variant="default"
                    active={activeChips.length === 0}
                    onClick={clearAll} />
                <KpiCard title="Devam Eden" value={inProgress} variant="warning"
                    active={activeFilters['status'] === 'IN_PROGRESS'}
                    onClick={() => toggleFilter('status', 'IN_PROGRESS')} />
                <KpiCard title="Tamamlanan" value={completed} variant="success"
                    active={activeFilters['status'] === 'COMPLETED'}
                    onClick={() => toggleFilter('status', 'COMPLETED')} />
                <KpiCard title="Gecikmeli" value={delayed} variant="critical"
                    active={activeFilters['delayStatus'] === 'DELAYED'}
                    onClick={() => toggleFilter('delayStatus', 'DELAYED')} />
                <KpiCard title="Plan Adam-Gün" value={totalPlanned} variant="primary" />
                <KpiCard title="Gerçek Adam-Gün" value={totalActual} variant="violet" />
            </KpiGrid>

            {/* Gelişmiş filtre paneli */}
            <AdvancedFilterPanel
                searchValue={searchQuery}
                onSearchChange={(v) => { setSearchQuery(v); setPage(1); }}
                searchPlaceholder="Plan kodu veya denetim adı ara..."
                fields={advancedFields}
                activeCount={activeFilterCount}
                onClearAll={clearAll}
            />

            {/* Aktif filtre chip'leri */}
            <ActiveFilterChips chips={activeChips} onClearAll={clearAll} />

            <DataTable
                columns={columns}
                data={paginated}
                rowKey={(a) => a.id}
                totalCount={filtered.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                storageKey="audit-plans-table"
                emptyTitle="Denetim planı bulunamadı"
                emptyDescription="Filtrelerinizi değiştirin veya yeni bir denetim planı oluşturun."
                stickyFirstColumn
                toolbar={
                    <SavedViewMenu
                        storageKey="audit-plans-table"
                        getPayload={() => ({ search: searchQuery, filters: activeFilters })}
                        onApply={(p) => {
                            setSearchQuery(typeof p.search === 'string' ? p.search : '');
                            setActiveFilters((p.filters as Record<string, string>) || {});
                            setPage(1);
                        }}
                    />
                }
            />
        </PageShell>
    );
}
