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
import { CreateFindingModal } from '@/components/modals/CreateFindingModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LinkedRisk { id: string; riskId: string; name: string; residualRiskScore?: number }
interface LinkedControl { id: string; controlId: string; name: string }

interface Finding {
    id: string;
    findingId: string;
    findingType: string;
    description: string;
    summary: string | null;
    relatedDepartment: string | null;
    iletisimKisisi: string | null;
    control: LinkedControl | null;
    risk: LinkedRisk | null;
    linkedRisks: LinkedRisk[];
    severity: string;
    status: string;
    workflowStatus: string;
    resolutionStatus: string;
    targetResolutionDate: string | null;
    closedDate: string | null;
    testDate: string | null;
    assigneeId: string | null;
    responsiblePerson: string | null;
    gmy: string | null;
    _count?: { actions: number; followUps: number };
    createdAt: string;
}

// ─── Config Maps ──────────────────────────────────────────────────────────────

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const findingTypeConfig: Record<string, { label: string; code: string; variant: BV }> = {
    BT:                 { label: 'Bilgi Teknolojileri',     code: 'BT',  variant: 'primary' },
    IB:                 { label: 'İş Birimleri',            code: 'İB',  variant: 'info' },
    CONTROL_DEFICIENCY: { label: 'Kontrol Eksikliği',       code: 'KE',  variant: 'critical' },
    PROCESS_GAP:        { label: 'Süreç Açığı',             code: 'SA',  variant: 'high' },
    COMPLIANCE_ISSUE:   { label: 'Uyum Sorunu',             code: 'US',  variant: 'medium' },
    DOCUMENTATION:      { label: 'Dokümantasyon',           code: 'DO',  variant: 'neutral' },
    IT_SECURITY:        { label: 'BT Güvenliği',            code: 'BG',  variant: 'primary' },
    OPERATIONAL:        { label: 'Operasyonel',             code: 'OP',  variant: 'neutral' },
};

const severityConfig: Record<string, { label: string; variant: BV }> = {
    CRITICAL: { label: 'KZ',  variant: 'critical' },
    HIGH:     { label: 'KD',  variant: 'high' },
    MEDIUM:   { label: 'ÖK',  variant: 'medium' },
    LOW:      { label: 'Düşük', variant: 'low' },
};

// Mutabakat akışı statüleri
const workflowConfig: Record<string, { label: string; variant: BV; step: number }> = {
    TASLAK:                         { label: 'Taslak',                       variant: 'neutral', step: 1 },
    MUTABAKATA_GONDERILDI:          { label: 'Mutabakata Gönderildi',        variant: 'warning', step: 2 },
    IC_KONTROL_ONAYINA_GONDERILDI:  { label: 'İKS Onayına Gönderildi',      variant: 'info',    step: 3 },
    MUTABAKAT_YAPILDI:              { label: 'Mutabakat Yapıldı',            variant: 'success', step: 4 },
    IPTAL:                          { label: 'İptal',                        variant: 'critical', step: 0 },
};

// Çözüm durumu
const resolutionConfig: Record<string, { label: string; variant: BV }> = {
    DEVAM_EDIYOR:    { label: 'Devam Ediyor',     variant: 'warning' },
    KISMEN_KAPATILDI:{ label: 'Kısmen Kapatıldı', variant: 'info' },
    KAPATILDI:       { label: 'Kapatıldı',        variant: 'success' },
    ERTELENDI:       { label: 'Ertelendi',        variant: 'neutral' },
};

// Legacy status (geriye dönük uyumluluk için)
const statusConfig: Record<string, { label: string; variant: BV }> = {
    OPEN:             { label: 'Açık',             variant: 'warning' },
    IN_PROGRESS:      { label: 'Devam Ediyor',     variant: 'warning' },
    PARTIALLY_CLOSED: { label: 'Kısmen Kapatıldı', variant: 'info' },
    PENDING_REVIEW:   { label: 'İnceleme Bekliyor', variant: 'neutral' },
    CLOSED:           { label: 'Kapatıldı',        variant: 'success' },
    VERIFIED:         { label: 'Doğrulandı',       variant: 'low' },
};

// ─── Saved Views ─────────────────────────────────────────────────────────────

interface SavedView {
    id: string;
    label: string;
    icon: string;
    filters: Record<string, string>;
    description: string;
}

const savedViews: SavedView[] = [
    { id: 'all',        label: 'Tüm Bulgular',        icon: '📋', filters: {},                                     description: '' },
    { id: 'taslak',     label: 'Taslak',               icon: '📝', filters: { workflowStatus: 'TASLAK' },           description: 'Henüz mutabakata gönderilmemiş bulgular' },
    { id: 'mutabakat',  label: 'Mutabakat Sürecinde',  icon: '🔄', filters: { workflowStatus: 'MUTABAKATA_GONDERILDI' }, description: 'Birimden yanıt bekleniyor' },
    { id: 'onayda',     label: 'İKS Onayında',         icon: '⏳', filters: { workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' }, description: 'İKS incelemesinde' },
    { id: 'critical',   label: 'Önemli Eksiklikler',   icon: '⚠️', filters: { severity: 'CRITICAL' },              description: 'KZ önem derecesindeki bulgular' },
    { id: 'this_month', label: 'Bu Ay Takip',          icon: '📅', filters: { thisMonth: 'true' },                 description: 'Bu ay takip edilecek bulgular' },
    { id: 'closed',     label: 'Kapanan Bulgular',     icon: '✅', filters: { resolutionStatus: 'KAPATILDI' },     description: 'Kapatılmış bulgular' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (d: string | null | undefined): string => {
    if (!d) return '—';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '—';
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
};

const getDelayStatus = (targetDate: string | null, closedDate: string | null, status: string): 'ON_TIME' | 'APPROACHING' | 'OVERDUE' => {
    if (status === 'CLOSED' || status === 'VERIFIED') return 'ON_TIME';
    if (!targetDate) return 'ON_TIME';
    const diffDays = Math.ceil((new Date(targetDate).getTime() - Date.now()) / 86400000);
    if (diffDays < 0) return 'OVERDUE';
    if (diffDays <= 7) return 'APPROACHING';
    return 'ON_TIME';
};

const isThisMonth = (d: string | null) => {
    if (!d) return false;
    const date = new Date(d);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FindingsPage() {
    const { success, error: showError } = useToast();

    const [findings, setFindings] = useState<Finding[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateFindingOpen, setIsCreateFindingOpen] = useState(false);
    const [activeView, setActiveView] = useState<string>('all');

    // Selection
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [page, setPage] = useState(1);
    const pageSize = 20;

    // ── Fetch ─────────────────────────────────────────────────────────────────

    const loadFindings = useCallback(async () => {
        setLoading(true);
        try {
            const result = await api.getFindings({ limit: 200 }) as { data: Finding[] };
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

    // ── Saved View activation ──────────────────────────────────────────────────

    const handleViewChange = (viewId: string) => {
        setActiveView(viewId);
        const view = savedViews.find(v => v.id === viewId);
        if (view) {
            setActiveFilters(view.filters);
            setSearchQuery('');
            setPage(1);
        }
    };

    // ── Filter + derived data ──────────────────────────────────────────────────

    const filteredFindings = useMemo(() => {
        return findings.filter(f => {
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchText = [f.findingId, f.summary, f.description, f.relatedDepartment, f.responsiblePerson, f.gmy, f.iletisimKisisi]
                    .filter(Boolean).join(' ').toLowerCase();
                if (!matchText.includes(q)) return false;
            }

            if (activeFilters.workflowStatus && activeFilters.workflowStatus !== 'all' && f.workflowStatus !== activeFilters.workflowStatus) return false;
            if (activeFilters.resolutionStatus && activeFilters.resolutionStatus !== 'all' && f.resolutionStatus !== activeFilters.resolutionStatus) return false;
            if (activeFilters.status && activeFilters.status !== 'all' && f.status !== activeFilters.status) return false;
            if (activeFilters.severity && activeFilters.severity !== 'all' && f.severity !== activeFilters.severity) return false;
            if (activeFilters.findingType && activeFilters.findingType !== 'all' && f.findingType !== activeFilters.findingType) return false;
            if (activeFilters.thisMonth === 'true' && !isThisMonth(f.targetResolutionDate)) return false;

            const delayFilter = activeFilters.delayStatus;
            if (delayFilter && delayFilter !== 'all') {
                if (getDelayStatus(f.targetResolutionDate, f.closedDate, f.resolutionStatus || f.status) !== delayFilter) return false;
            }

            return true;
        });
    }, [findings, searchQuery, activeFilters]);

    const paginatedFindings = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredFindings.slice(start, start + pageSize);
    }, [filteredFindings, page]);

    // ── KPIs ──────────────────────────────────────────────────────────────────

    const kpis = useMemo(() => {
        const total = findings.length;
        const taslak = findings.filter(f => f.workflowStatus === 'TASLAK').length;
        const mutabakatta = findings.filter(f =>
            f.workflowStatus === 'MUTABAKATA_GONDERILDI' || f.workflowStatus === 'IC_KONTROL_ONAYINA_GONDERILDI'
        ).length;
        const overdue = findings.filter(f => getDelayStatus(f.targetResolutionDate, f.closedDate, f.resolutionStatus || f.status) === 'OVERDUE').length;
        const closed = findings.filter(f => f.resolutionStatus === 'KAPATILDI' || f.status === 'CLOSED').length;
        const ertelendi = findings.filter(f => f.resolutionStatus === 'ERTELENDI').length;
        return { total, taslak, mutabakatta, overdue, closed, ertelendi };
    }, [findings]);

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
            for (const id of selectedRows) await api.deleteFinding(id);
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
            label: 'Bulgu Türü',
            value: activeFilters['findingType'] || '',
            onChange: (v: string) => { setActiveFilters(prev => ({ ...prev, findingType: v })); setPage(1); },
            options: [
                { value: 'BT', label: 'BT — Bilgi Teknolojileri' },
                { value: 'IB', label: 'İB — İş Birimleri' },
            ],
        },
        {
            key: 'severity',
            label: 'Önem Derecesi',
            value: activeFilters['severity'] || '',
            onChange: (v: string) => { setActiveFilters(prev => ({ ...prev, severity: v })); setPage(1); },
            options: Object.entries(severityConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            key: 'workflowStatus',
            label: 'Mutabakat Statüsü',
            value: activeFilters['workflowStatus'] || '',
            onChange: (v: string) => { setActiveFilters(prev => ({ ...prev, workflowStatus: v })); setPage(1); },
            options: Object.entries(workflowConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            key: 'resolutionStatus',
            label: 'Çözüm Durumu',
            value: activeFilters['resolutionStatus'] || '',
            onChange: (v: string) => { setActiveFilters(prev => ({ ...prev, resolutionStatus: v })); setPage(1); },
            options: Object.entries(resolutionConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            key: 'delayStatus',
            label: 'Gecikme',
            value: activeFilters['delayStatus'] || '',
            onChange: (v: string) => { setActiveFilters(prev => ({ ...prev, delayStatus: v })); setPage(1); },
            options: [
                { value: 'ON_TIME', label: 'Zamanında' },
                { value: 'APPROACHING', label: 'Yaklaşıyor' },
                { value: 'OVERDUE', label: 'Gecikmiş' },
            ],
        },
    ], [activeFilters]);

    // ── Columns ───────────────────────────────────────────────────────────────

    const columns: ColumnDef<Finding>[] = useMemo(() => [
        {
            key: 'findingId',
            header: 'Bulgu No',
            sortable: true,
            defaultWidth: 140,
            render: (f) => (
                <Link href={`/findings/${f.id}`} className="font-mono text-sm font-bold text-violet-700 hover:text-violet-900 hover:underline whitespace-nowrap">
                    {f.findingId}
                </Link>
            ),
        },
        {
            key: 'findingType',
            header: 'Bulgu Türü',
            sortable: true,
            defaultWidth: 140,
            render: (f) => {
                const cfg = findingTypeConfig[f.findingType];
                return cfg
                    ? <StatusBadge variant={cfg.variant}>{cfg.code}</StatusBadge>
                    : <span className="text-gray-400 text-xs">—</span>;
            },
        },
        {
            key: 'summary',
            header: 'Bulgu Özeti',
            defaultWidth: 240,
            render: (f) => (
                <p className="text-sm text-slate-800 truncate max-w-[220px]" title={f.summary || f.description}>
                    {f.summary || f.description || '—'}
                </p>
            ),
        },
        {
            key: 'relatedDepartment',
            header: 'İlgili Direktörlük',
            sortable: true,
            defaultWidth: 170,
            render: (f) => (
                <span className="text-sm text-slate-600 truncate block max-w-[160px]" title={f.relatedDepartment || ''}>
                    {f.relatedDepartment || '—'}
                </span>
            ),
        },
        {
            key: 'control',
            header: 'İlgili Kontrol',
            defaultWidth: 130,
            render: (f) => f.control
                ? <Link href={`/controls/${f.control.id}`} className="font-mono text-xs text-emerald-700 hover:underline font-semibold">{f.control.controlId}</Link>
                : <span className="text-slate-300 text-xs">—</span>,
        },
        {
            key: 'linkedRisks',
            header: 'İlişkili Risk',
            defaultWidth: 100,
            render: (f) => {
                const count = f.linkedRisks?.length || 0;
                return count > 0
                    ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-200">
                            🔗 {count}
                        </span>
                    )
                    : <span className="text-slate-300 text-xs">—</span>;
            },
        },
        {
            key: 'severity',
            header: 'Önem',
            sortable: true,
            defaultWidth: 90,
            render: (f) => {
                const cfg = severityConfig[f.severity];
                return cfg
                    ? <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge>
                    : <span className="text-slate-400 text-xs">—</span>;
            },
        },
        {
            key: 'workflowStatus',
            header: 'Mutabakat',
            sortable: true,
            defaultWidth: 190,
            render: (f) => {
                const wf = workflowConfig[f.workflowStatus] || workflowConfig['TASLAK'];
                const rs = resolutionConfig[f.resolutionStatus] || resolutionConfig['DEVAM_EDIYOR'];
                return (
                    <div className="flex flex-col gap-1">
                        <StatusBadge variant={wf.variant}>{wf.label}</StatusBadge>
                        <StatusBadge variant={rs.variant} dot>{rs.label}</StatusBadge>
                    </div>
                );
            },
        },
        {
            key: 'targetResolutionDate',
            header: 'Öngörülen Kapatma',
            sortable: true,
            defaultWidth: 150,
            render: (f) => {
                const delay = getDelayStatus(f.targetResolutionDate, f.closedDate, f.status);
                return (
                    <span className={`text-sm font-medium ${delay === 'OVERDUE' ? 'text-red-600' : delay === 'APPROACHING' ? 'text-amber-600' : 'text-slate-700'}`}>
                        {formatDate(f.targetResolutionDate)}
                        {delay === 'OVERDUE' && <span className="ml-1 text-xs text-red-500">⚠</span>}
                    </span>
                );
            },
        },
        {
            key: 'responsiblePerson',
            header: 'Assignee',
            defaultWidth: 140,
            render: (f) => (
                <span className="text-sm text-slate-600 truncate block max-w-[130px]" title={f.responsiblePerson || ''}>
                    {f.responsiblePerson || '—'}
                </span>
            ),
        },
        {
            key: 'delayStatus',
            header: 'Durum',
            defaultWidth: 120,
            render: (f) => {
                const delay = getDelayStatus(f.targetResolutionDate, f.closedDate, f.status);
                if (f.status === 'CLOSED') return <StatusBadge variant="success" dot>Kapatıldı</StatusBadge>;
                if (delay === 'OVERDUE') return <StatusBadge variant="critical" dot>Gecikmiş</StatusBadge>;
                if (delay === 'APPROACHING') return <StatusBadge variant="warning" dot>Yaklaşıyor</StatusBadge>;
                return <StatusBadge variant="success" dot>Zamanında</StatusBadge>;
            },
        },
        {
            key: 'actions',
            header: 'İşlemler',
            defaultWidth: 80,
            render: (f) => (
                <Link
                    href={`/findings/${f.id}`}
                    className="p-1.5 rounded text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors inline-block"
                    title="Detay"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                </Link>
            ),
        },
    ], []);

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            <div className="px-8 pt-8">
                {/* Header */}
                <PageHeader
                    title="Bulgu Envanteri"
                    description="İç Kontrol Sistemi — Kontrol ve test süreçlerinden elde edilen bulgular"
                    breadcrumbs={[{ label: 'Bulgular' }]}
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
                            <Button
                                variant="primary"
                                onClick={() => setIsCreateFindingOpen(true)}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                            >
                                + Yeni Bulgu
                            </Button>
                        </div>
                    }
                />

                {/* KPI Cards */}
                <div className="grid grid-cols-6 gap-3 mb-5">
                    {[
                        { label: 'Toplam', value: kpis.total, color: 'slate', icon: '📋', onClick: () => handleViewChange('all') },
                        { label: 'Taslak', value: kpis.taslak, color: 'slate', icon: '📝', onClick: () => handleViewChange('taslak') },
                        { label: 'Mutabakatta', value: kpis.mutabakatta, color: 'amber', icon: '🔄', onClick: () => handleViewChange('mutabakat') },
                        { label: 'Ertelendi', value: kpis.ertelendi, color: 'blue', icon: '⏳', onClick: () => setActiveFilters({ resolutionStatus: 'ERTELENDI' }) },
                        { label: 'Gecikmiş', value: kpis.overdue, color: 'red', icon: '⚠️', onClick: () => setActiveFilters({ delayStatus: 'OVERDUE' }) },
                        { label: 'Kapatıldı', value: kpis.closed, color: 'emerald', icon: '✅', onClick: () => handleViewChange('closed') },
                    ].map(kpi => (
                        <button
                            key={kpi.label}
                            onClick={kpi.onClick}
                            className={`bg-white rounded-xl border border-${kpi.color}-100 shadow-sm p-4 flex items-center gap-3 hover:border-${kpi.color}-300 hover:shadow-md transition-all text-left w-full`}
                        >
                            <span className="text-xl">{kpi.icon}</span>
                            <div>
                                <p className={`text-xs font-semibold text-${kpi.color}-600 uppercase tracking-wide`}>{kpi.label}</p>
                                <p className={`text-2xl font-bold text-${kpi.color}-700 mt-0.5`}>{kpi.value}</p>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Saved Views */}
                <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
                    {savedViews.map(view => (
                        <button
                            key={view.id}
                            onClick={() => handleViewChange(view.id)}
                            title={view.description}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap border transition-all ${
                                activeView === view.id
                                    ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-700'
                            }`}
                        >
                            <span>{view.icon}</span>
                            {view.label}
                            {view.id !== 'all' && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    activeView === view.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                                }`}>
                                    {findings.filter(f => {
                                        if (view.filters.workflowStatus) return f.workflowStatus === view.filters.workflowStatus;
                                        if (view.filters.resolutionStatus) return f.resolutionStatus === view.filters.resolutionStatus;
                                        if (view.filters.severity) return f.severity === view.filters.severity;
                                        if (view.filters.thisMonth === 'true') return isThisMonth(f.targetResolutionDate);
                                        return true;
                                    }).length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Filter Bar */}
                <div className="mb-4 bg-white border border-slate-200 rounded-xl shadow-sm p-3">
                    <FilterBar
                        searchValue={searchQuery}
                        onSearchChange={(v) => { setSearchQuery(v); setPage(1); }}
                        searchPlaceholder="Bulgu No, özet, direktörlük veya GMY ara..."
                        filters={filterConfigs}
                        onClearAll={() => {
                            setSearchQuery('');
                            setActiveFilters({});
                            setActiveView('all');
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
                    storageKey="findings-inventory-v2"
                    emptyTitle="Bulgu bulunamadı"
                    emptyDescription="Filtrelerinizi değiştirin veya yeni bir bulgu ekleyin."
                    emptyActionLabel="Yeni Bulgu Ekle"
                    onEmptyAction={() => setIsCreateFindingOpen(true)}
                />
            </div>

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

            <CreateFindingModal
                isOpen={isCreateFindingOpen}
                onClose={() => setIsCreateFindingOpen(false)}
                onSuccess={() => loadFindings()}
            />
        </div>
    );
}
