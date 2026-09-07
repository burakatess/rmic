'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
    QuickFilterBar,
    AdvancedFilterPanel,
    ActiveFilterChips,
    SavedViewMenu,
} from '@/components/ui';
import type { ColumnDef, ActiveFilterChip, QuickFilterItem, AdvancedFilterField } from '@/components/ui';
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

const delayLabels: Record<string, string> = {
    ON_TIME: 'Zamanında',
    APPROACHING: 'Yaklaşıyor',
    OVERDUE: 'Gecikmiş',
};

// ─── Saved Views (hızlı filtre chip'leri) ─────────────────────────────────────

interface SavedViewDef {
    id: string;
    label: string;
    filters: Record<string, string>;
    description: string;
}

const savedViews: SavedViewDef[] = [
    { id: 'all',        label: 'Tüm Bulgular',        filters: {},                                     description: '' },
    { id: 'taslak',     label: 'Taslak',               filters: { workflowStatus: 'TASLAK' },           description: 'Henüz mutabakata gönderilmemiş bulgular' },
    { id: 'mutabakat',  label: 'Mutabakat Sürecinde',  filters: { workflowStatus: 'MUTABAKATA_GONDERILDI' }, description: 'Birimden yanıt bekleniyor' },
    { id: 'onayda',     label: 'İKS Onayında',         filters: { workflowStatus: 'IC_KONTROL_ONAYINA_GONDERILDI' }, description: 'İKS incelemesinde' },
    { id: 'critical',   label: 'Önemli Eksiklikler',   filters: { severity: 'CRITICAL' },              description: 'KZ önem derecesindeki bulgular' },
    { id: 'this_month', label: 'Bu Ay Takip',          filters: { thisMonth: 'true' },                 description: 'Bu ay takip edilecek bulgular' },
    { id: 'closed',     label: 'Kapanan Bulgular',     filters: { resolutionStatus: 'KAPATILDI' },     description: 'Kapatılmış bulgular' },
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

// ─── Icons (inline SVG — emoji yasak) ─────────────────────────────────────────

const iconProps = { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' } as const;

const ClipboardIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
);
const PencilIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
);
const RefreshIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
);
const ClockIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const WarningIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
);
const CheckCircleIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const LinkIcon = ({ className = 'w-3 h-3' }: { className?: string }) => (
    <svg className={className} {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

function FindingsContent() {
    const { success, error: showError } = useToast();
    const searchParams = useSearchParams();

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
    const [colFilters, setColFilters] = useState<Record<string, string>>({});
    const [page, setPage] = useState(1);
    const pageSize = 20;

    // Dashboard linkleri (?severity=CRITICAL) filtre olarak uygulanır
    useEffect(() => {
        const sev = searchParams.get('severity');
        if (sev && severityConfig[sev]) {
            setActiveFilters(prev => ({ ...prev, severity: sev }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const baseFilteredFindings = useMemo(() => {
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

    // ── Gelişmiş filtre alanları ──────────────────────────────────────────────

    const advancedFields: AdvancedFilterField[] = useMemo(() => [
        {
            type: 'select',
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
            type: 'select',
            key: 'severity',
            label: 'Önem Derecesi',
            value: activeFilters['severity'] || '',
            onChange: (v: string) => { setActiveFilters(prev => ({ ...prev, severity: v })); setPage(1); },
            options: Object.entries(severityConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            type: 'select',
            key: 'workflowStatus',
            label: 'Mutabakat Statüsü',
            value: activeFilters['workflowStatus'] || '',
            onChange: (v: string) => { setActiveFilters(prev => ({ ...prev, workflowStatus: v })); setPage(1); },
            options: Object.entries(workflowConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            type: 'select',
            key: 'resolutionStatus',
            label: 'Çözüm Durumu',
            value: activeFilters['resolutionStatus'] || '',
            onChange: (v: string) => { setActiveFilters(prev => ({ ...prev, resolutionStatus: v })); setPage(1); },
            options: Object.entries(resolutionConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            type: 'select',
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
            filter: { type: 'text', placeholder: 'Bulgu No...', fn: (f: Finding, v) => f.findingId.toLowerCase().includes(v.toLowerCase()) },
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
            filter: { type: 'select', options: Object.entries(findingTypeConfig).map(([k, v]) => ({ value: k, label: v.label })), fn: (f: Finding, v) => f.findingType === v },
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
            filter: { type: 'text', placeholder: 'Özet ara...', fn: (f: Finding, v) => (f.summary || f.description || '').toLowerCase().includes(v.toLowerCase()) },
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
            filter: { type: 'text', placeholder: 'Direktörlük...', fn: (f: Finding, v) => (f.relatedDepartment || '').toLowerCase().includes(v.toLowerCase()) },
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
                            <LinkIcon className="w-3 h-3" /> {count}
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
            filter: { type: 'select', options: Object.entries(severityConfig).map(([k, v]) => ({ value: k, label: v.label })), fn: (f: Finding, v) => f.severity === v },
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
            filter: { type: 'select', options: Object.entries(workflowConfig).map(([k, v]) => ({ value: k, label: v.label })), fn: (f: Finding, v) => f.workflowStatus === v },
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
                    <span className={`inline-flex items-center gap-1 text-sm font-medium ${delay === 'OVERDUE' ? 'text-red-600' : delay === 'APPROACHING' ? 'text-amber-600' : 'text-slate-700'}`}>
                        {formatDate(f.targetResolutionDate)}
                        {delay === 'OVERDUE' && <WarningIcon className="w-3.5 h-3.5 text-red-500" />}
                    </span>
                );
            },
        },
        {
            key: 'responsiblePerson',
            header: 'Assignee',
            defaultWidth: 140,
            filter: { type: 'text', placeholder: 'Kişi ara...', fn: (f: Finding, v) => (f.responsiblePerson || '').toLowerCase().includes(v.toLowerCase()) },
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

    // Apply column-level filters after columns are defined
    const filteredFindings = useMemo(() => {
        if (!Object.values(colFilters).some(v => v)) return baseFilteredFindings;
        return baseFilteredFindings.filter(f =>
            columns.every(col => {
                const val = colFilters[col.key];
                return !val || !col.filter?.fn || col.filter.fn(f, val);
            })
        );
    }, [baseFilteredFindings, colFilters, columns]);

    const paginatedFindings = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredFindings.slice(start, start + pageSize);
    }, [filteredFindings, page]);

    // ── Quick filter chip'leri (kayıtlı görünümler, canlı sayaçlarla) ─────────

    const viewCount = useCallback((view: SavedViewDef) => findings.filter(f => {
        if (view.filters.workflowStatus) return f.workflowStatus === view.filters.workflowStatus;
        if (view.filters.resolutionStatus) return f.resolutionStatus === view.filters.resolutionStatus;
        if (view.filters.severity) return f.severity === view.filters.severity;
        if (view.filters.thisMonth === 'true') return isThisMonth(f.targetResolutionDate);
        return true;
    }).length, [findings]);

    const quickFilterItems: QuickFilterItem[] = useMemo(() =>
        savedViews.map(v => ({
            key: v.id,
            label: v.label,
            count: v.id === 'all' ? undefined : viewCount(v),
        })), [viewCount]);

    // ── Aktif filtre chip'leri ────────────────────────────────────────────────

    const filterLabels: Record<string, string> = {
        findingType: 'Bulgu Türü', severity: 'Önem', workflowStatus: 'Mutabakat',
        resolutionStatus: 'Çözüm', status: 'Statü', delayStatus: 'Gecikme', thisMonth: 'Takip',
    };

    const filterValueLabel = (key: string, value: string): string => {
        if (key === 'findingType') return findingTypeConfig[value]?.label ?? value;
        if (key === 'severity') return severityConfig[value]?.label ?? value;
        if (key === 'workflowStatus') return workflowConfig[value]?.label ?? value;
        if (key === 'resolutionStatus') return resolutionConfig[value]?.label ?? value;
        if (key === 'status') return statusConfig[value]?.label ?? value;
        if (key === 'delayStatus') return delayLabels[value] ?? value;
        if (key === 'thisMonth') return 'Bu Ay';
        return value;
    };

    const removeFilter = (key: string) => {
        setActiveFilters(prev => ({ ...prev, [key]: '' }));
        const view = savedViews.find(v => v.id === activeView);
        if (view && view.filters[key]) setActiveView('all');
        setPage(1);
    };

    const clearAll = () => {
        setSearchQuery('');
        setActiveFilters({});
        setActiveView('all');
        setColFilters({});
        setPage(1);
    };

    const activeFilterCount = Object.values(activeFilters).filter(v => v && v !== 'all').length;

    const activeChips: ActiveFilterChip[] = useMemo(() => {
        const chips: ActiveFilterChip[] = [];
        if (searchQuery) chips.push({ key: 'search', label: 'Arama', value: searchQuery, onRemove: () => { setSearchQuery(''); setPage(1); } });
        Object.entries(activeFilters).forEach(([k, v]) => {
            if (v && v !== 'all') chips.push({
                key: k,
                label: filterLabels[k] ?? k,
                value: filterValueLabel(k, v),
                onRemove: () => removeFilter(k),
            });
        });
        return chips;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, activeFilters, activeView]);

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <PageShell>
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
                            Yeni Bulgu
                        </Button>
                    </div>
                }
            />

            {/* KPI'lar — tümü click-to-filter */}
            <KpiGrid columns={6}>
                <KpiCard title="Toplam" value={kpis.total} variant="default"
                    icon={<ClipboardIcon />}
                    active={activeView === 'all' && activeFilterCount === 0 && !searchQuery}
                    onClick={() => handleViewChange('all')} />
                <KpiCard title="Taslak" value={kpis.taslak} variant="default"
                    icon={<PencilIcon />}
                    active={activeView === 'taslak'}
                    onClick={() => handleViewChange('taslak')} />
                <KpiCard title="Mutabakatta" value={kpis.mutabakatta} variant="warning"
                    icon={<RefreshIcon />}
                    active={activeView === 'mutabakat'}
                    onClick={() => handleViewChange('mutabakat')} />
                <KpiCard title="Ertelendi" value={kpis.ertelendi} variant="primary"
                    icon={<ClockIcon />}
                    active={activeFilters.resolutionStatus === 'ERTELENDI'}
                    onClick={() => {
                        setActiveFilters(prev => (prev.resolutionStatus === 'ERTELENDI' ? {} : { resolutionStatus: 'ERTELENDI' }) as Record<string, string>);
                        setActiveView('all');
                        setPage(1);
                    }} />
                <KpiCard title="Gecikmiş" value={kpis.overdue} variant="critical"
                    icon={<WarningIcon />}
                    active={activeFilters.delayStatus === 'OVERDUE'}
                    onClick={() => {
                        setActiveFilters(prev => (prev.delayStatus === 'OVERDUE' ? {} : { delayStatus: 'OVERDUE' }) as Record<string, string>);
                        setActiveView('all');
                        setPage(1);
                    }} />
                <KpiCard title="Kapatıldı" value={kpis.closed} variant="success"
                    icon={<CheckCircleIcon />}
                    active={activeView === 'closed'}
                    onClick={() => handleViewChange('closed')} />
            </KpiGrid>

            {/* Hızlı filtreler — kayıtlı görünümler */}
            <QuickFilterBar
                items={quickFilterItems}
                active={activeView}
                onChange={(k) => handleViewChange(k ?? 'all')}
            />

            {/* Gelişmiş filtre paneli */}
            <AdvancedFilterPanel
                searchValue={searchQuery}
                onSearchChange={(v) => { setSearchQuery(v); setPage(1); }}
                searchPlaceholder="Bulgu No, özet, direktörlük veya GMY ara..."
                fields={advancedFields}
                activeCount={activeFilterCount}
                onClearAll={clearAll}
            />

            {/* Aktif filtre chip'leri */}
            <ActiveFilterChips chips={activeChips} onClearAll={clearAll} />

            {/* Data Table */}
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
                columnFilters={colFilters}
                onColumnFilterChange={(k, v) => { setColFilters(p => ({ ...p, [k]: v })); setPage(1); }}
                stickyFirstColumn
                onRefresh={loadFindings}
                toolbar={
                    <SavedViewMenu
                        storageKey="findings-inventory-v2"
                        getPayload={() => ({ search: searchQuery, filters: activeFilters, view: activeView, columnFilters: colFilters })}
                        onApply={(p) => {
                            setSearchQuery(typeof p.search === 'string' ? p.search : '');
                            setActiveFilters((p.filters as Record<string, string>) || {});
                            setActiveView(typeof p.view === 'string' ? p.view : 'all');
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
        </PageShell>
    );
}

export default function FindingsPage() {
    return (
        <Suspense fallback={<PageShell><div className="py-24" /></PageShell>}>
            <FindingsContent />
        </Suspense>
    );
}
