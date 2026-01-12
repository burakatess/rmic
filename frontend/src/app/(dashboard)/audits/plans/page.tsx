'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Types
interface AuditTeamMember {
    id: string;
    name: string;
    role: 'LEADER' | 'MEMBER' | 'OBSERVER';
}

interface AuditPlan {
    id: string;
    auditCode: string;
    auditName: string;
    auditType: string;
    auditedUnit: string;
    auditTeam: string;
    teamLeader: string;
    teamMembers: AuditTeamMember[];
    plannedStartDate: string;
    plannedEndDate: string;
    actualStartDate: string | null;
    actualEndDate: string | null;
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
    planStatus: 'ACTIVE' | 'ARCHIVED';
    year: number;
    period: string;
}

// Demo Data
const DEMO_AUDITS: AuditPlan[] = [
    {
        id: '1', auditCode: 'AP-2024-001', auditName: 'Bilgi Güvenliği Denetimi', auditType: 'İç Denetim',
        auditedUnit: 'Bilgi Teknolojileri', auditTeam: 'BT Denetim Ekibi', teamLeader: 'Ahmet Yılmaz',
        teamMembers: [
            { id: '1', name: 'Ahmet Yılmaz', role: 'LEADER' },
            { id: '2', name: 'Ayşe Kaya', role: 'MEMBER' },
            { id: '3', name: 'Mehmet Demir', role: 'MEMBER' },
        ],
        plannedStartDate: '2024-01-15', plannedEndDate: '2024-02-15',
        actualStartDate: '2024-01-15', actualEndDate: '2024-02-20',
        status: 'COMPLETED', phase: 'CLOSED', rationale: 'PERIODIC', priority: 'HIGH',
        plannedManDays: 30, actualManDays: 35, scheduleVariance: 5,
        delayStatus: 'DELAYED', draftReportDate: '2024-02-25', finalReportDate: '2024-03-05',
        totalFindings: 12, openFindings: 3, actionStatus: 'IN_PROGRESS', planStatus: 'ACTIVE', year: 2024, period: 'Q1'
    },
    {
        id: '2', auditCode: 'AP-2024-002', auditName: 'Kredi Süreçleri Denetimi', auditType: 'İç Denetim',
        auditedUnit: 'Kredi Tahsis', auditTeam: 'Finansal Denetim Ekibi', teamLeader: 'Fatma Öz',
        teamMembers: [
            { id: '4', name: 'Fatma Öz', role: 'LEADER' },
            { id: '5', name: 'Can Arslan', role: 'MEMBER' },
        ],
        plannedStartDate: '2024-03-01', plannedEndDate: '2024-04-15',
        actualStartDate: '2024-03-05', actualEndDate: null,
        status: 'IN_PROGRESS', phase: 'FIELDWORK', rationale: 'REGULATORY', priority: 'HIGH',
        plannedManDays: 45, actualManDays: 28, scheduleVariance: 0,
        delayStatus: 'ON_TRACK', draftReportDate: null, finalReportDate: null,
        totalFindings: 5, openFindings: 5, actionStatus: 'NO_ACTIONS', planStatus: 'ACTIVE', year: 2024, period: 'Q1'
    },
    {
        id: '3', auditCode: 'AP-2024-003', auditName: 'MASAK Uyum Denetimi', auditType: 'İç Denetim',
        auditedUnit: 'Uyum Birimi', auditTeam: 'Uyum Denetim Ekibi', teamLeader: 'Zeynep Şen',
        teamMembers: [
            { id: '6', name: 'Zeynep Şen', role: 'LEADER' },
            { id: '7', name: 'Ali Veli', role: 'MEMBER' },
            { id: '8', name: 'Kemal Yurt', role: 'OBSERVER' },
        ],
        plannedStartDate: '2024-04-01', plannedEndDate: '2024-05-15',
        actualStartDate: null, actualEndDate: null,
        status: 'PLANNED', phase: 'PLANNING', rationale: 'REGULATORY', priority: 'HIGH',
        plannedManDays: 40, actualManDays: 0, scheduleVariance: 0,
        delayStatus: 'ON_TRACK', draftReportDate: null, finalReportDate: null,
        totalFindings: 0, openFindings: 0, actionStatus: 'NO_ACTIONS', planStatus: 'ACTIVE', year: 2024, period: 'Q2'
    },
    {
        id: '4', auditCode: 'AP-2024-004', auditName: 'Şube Operasyonları Denetimi', auditType: 'İç Denetim',
        auditedUnit: 'Şube Ağı', auditTeam: 'Operasyonel Denetim Ekibi', teamLeader: 'Murat Kaya',
        teamMembers: [
            { id: '9', name: 'Murat Kaya', role: 'LEADER' },
            { id: '10', name: 'Selin Demir', role: 'MEMBER' },
        ],
        plannedStartDate: '2024-02-01', plannedEndDate: '2024-03-15',
        actualStartDate: '2024-02-01', actualEndDate: '2024-03-20',
        status: 'COMPLETED', phase: 'CLOSED', rationale: 'PERIODIC', priority: 'MEDIUM',
        plannedManDays: 35, actualManDays: 40, scheduleVariance: 5,
        delayStatus: 'DELAYED', draftReportDate: '2024-03-25', finalReportDate: '2024-04-05',
        totalFindings: 8, openFindings: 0, actionStatus: 'COMPLETED', planStatus: 'ARCHIVED', year: 2024, period: 'Q1'
    },
    {
        id: '5', auditCode: 'AP-2024-005', auditName: 'İnsan Kaynakları Süreç Denetimi', auditType: 'İç Denetim',
        auditedUnit: 'İnsan Kaynakları', auditTeam: 'HR Denetim Ekibi', teamLeader: 'Deniz Yıldız',
        teamMembers: [
            { id: '11', name: 'Deniz Yıldız', role: 'LEADER' },
        ],
        plannedStartDate: '2024-05-01', plannedEndDate: '2024-06-15',
        actualStartDate: null, actualEndDate: null,
        status: 'PLANNED', phase: 'PLANNING', rationale: 'MANAGEMENT_REQUEST', priority: 'MEDIUM',
        plannedManDays: 30, actualManDays: 0, scheduleVariance: 0,
        delayStatus: 'AT_RISK', draftReportDate: null, finalReportDate: null,
        totalFindings: 0, openFindings: 0, actionStatus: 'NO_ACTIONS', planStatus: 'ACTIVE', year: 2024, period: 'Q2'
    },
    {
        id: '6', auditCode: 'AP-2024-006', auditName: 'Satın Alma Süreçleri Denetimi', auditType: 'İç Denetim',
        auditedUnit: 'Satın Alma', auditTeam: 'Operasyonel Denetim Ekibi', teamLeader: 'Murat Kaya',
        teamMembers: [
            { id: '9', name: 'Murat Kaya', role: 'LEADER' },
            { id: '12', name: 'Ece Tan', role: 'MEMBER' },
        ],
        plannedStartDate: '2024-06-01', plannedEndDate: '2024-07-15',
        actualStartDate: null, actualEndDate: null,
        status: 'PLANNED', phase: 'PLANNING', rationale: 'RISK_BASED', priority: 'LOW',
        plannedManDays: 25, actualManDays: 0, scheduleVariance: 0,
        delayStatus: 'ON_TRACK', draftReportDate: null, finalReportDate: null,
        totalFindings: 0, openFindings: 0, actionStatus: 'NO_ACTIONS', planStatus: 'ACTIVE', year: 2024, period: 'Q2'
    },
];

// Config objects
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    PLANNED: { label: 'Planlandı', color: 'bg-blue-100 text-blue-700' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'bg-amber-100 text-amber-700' },
    COMPLETED: { label: 'Tamamlandı', color: 'bg-green-100 text-green-700' },
    CANCELLED: { label: 'İptal', color: 'bg-gray-100 text-gray-600' },
};

const PHASE_CONFIG: Record<string, { label: string; color: string }> = {
    PLANNING: { label: 'Planlama', color: 'bg-slate-100 text-slate-700' },
    FIELDWORK: { label: 'Saha Çalışması', color: 'bg-indigo-100 text-indigo-700' },
    REPORTING: { label: 'Raporlama', color: 'bg-purple-100 text-purple-700' },
    CLOSED: { label: 'Kapatıldı', color: 'bg-gray-100 text-gray-600' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
    LOW: { label: 'Düşük', color: 'bg-green-100 text-green-700' },
    MEDIUM: { label: 'Orta', color: 'bg-yellow-100 text-yellow-700' },
    HIGH: { label: 'Yüksek', color: 'bg-red-100 text-red-700' },
};

const DELAY_CONFIG: Record<string, { label: string; color: string }> = {
    ON_TRACK: { label: 'Zamanında', color: 'bg-green-100 text-green-700' },
    AT_RISK: { label: 'Risk Altında', color: 'bg-amber-100 text-amber-700' },
    DELAYED: { label: 'Gecikmeli', color: 'bg-red-100 text-red-700' },
};

const RATIONALE_CONFIG: Record<string, string> = {
    PERIODIC: 'Periyodik',
    REGULATORY: 'Regülatif',
    MANAGEMENT_REQUEST: 'Yönetim Talebi',
    RISK_BASED: 'Risk Bazlı',
};

const ACTION_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    NO_ACTIONS: { label: '—', color: 'text-gray-400' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'text-amber-600' },
    COMPLETED: { label: 'Tamamlandı', color: 'text-green-600' },
};

// Format date helper
const formatDate = (dateString: string | null): string => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

export default function AuditPlanPage() {
    const [audits] = useState<AuditPlan[]>(DEMO_AUDITS);
    const [search, setSearch] = useState('');
    const [unitFilter, setUnitFilter] = useState('');
    const [teamFilter, setTeamFilter] = useState('');
    const [leaderFilter, setLeaderFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [phaseFilter, setPhaseFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [delayFilter, setDelayFilter] = useState('');
    const [yearFilter, setYearFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [showExportMenu, setShowExportMenu] = useState(false);

    // Column widths for resizable columns
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
        checkbox: 40,
        auditCode: 110,
        auditName: 220,
        auditedUnit: 130,
        auditTeam: 150,
        teamLeader: 120,
        plannedStart: 100,
        plannedEnd: 100,
        status: 100,
        phase: 110,
        rationale: 100,
        plannedDays: 70,
        actualDays: 70,
        variance: 60,
        delayStatus: 90,
        draftReport: 100,
        finalReport: 100,
        totalFindings: 60,
        openFindings: 60,
        actionStatus: 90,
    });

    // Resize handling
    const [resizing, setResizing] = useState<string | null>(null);
    const [startX, setStartX] = useState(0);
    const [startWidth, setStartWidth] = useState(0);

    const handleMouseDown = (e: React.MouseEvent, columnKey: string) => {
        e.preventDefault();
        setResizing(columnKey);
        setStartX(e.clientX);
        setStartWidth(columnWidths[columnKey]);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!resizing) return;
            const diff = e.clientX - startX;
            const newWidth = Math.max(40, startWidth + diff);
            setColumnWidths(prev => ({ ...prev, [resizing]: newWidth }));
        };

        const handleMouseUp = () => setResizing(null);

        if (resizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizing, startX, startWidth]);

    // Extract unique values for filters
    const uniqueUnits = Array.from(new Set(audits.map(a => a.auditedUnit))).sort();
    const uniqueTeams = Array.from(new Set(audits.map(a => a.auditTeam))).sort();
    const uniqueLeaders = Array.from(new Set(audits.map(a => a.teamLeader))).sort();
    const uniqueYears = Array.from(new Set(audits.map(a => a.year))).sort();

    // Filter
    const filteredAudits = audits.filter(a => {
        if (search && !a.auditName.toLowerCase().includes(search.toLowerCase()) && !a.auditCode.toLowerCase().includes(search.toLowerCase())) return false;
        if (unitFilter && a.auditedUnit !== unitFilter) return false;
        if (teamFilter && a.auditTeam !== teamFilter) return false;
        if (leaderFilter && a.teamLeader !== leaderFilter) return false;
        if (statusFilter && a.status !== statusFilter) return false;
        if (phaseFilter && a.phase !== phaseFilter) return false;
        if (priorityFilter && a.priority !== priorityFilter) return false;
        if (delayFilter && a.delayStatus !== delayFilter) return false;
        if (yearFilter && a.year !== parseInt(yearFilter)) return false;
        return true;
    });

    // KPIs
    const totalAudits = audits.length;
    const inProgressCount = audits.filter(a => a.status === 'IN_PROGRESS').length;
    const completedCount = audits.filter(a => a.status === 'COMPLETED').length;
    const delayedCount = audits.filter(a => a.delayStatus === 'DELAYED').length;
    const totalPlannedDays = audits.reduce((sum, a) => sum + a.plannedManDays, 0);
    const totalActualDays = audits.reduce((sum, a) => sum + a.actualManDays, 0);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredAudits.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredAudits.map(a => a.id));
        }
    };

    const clearFilters = () => {
        setSearch('');
        setUnitFilter('');
        setTeamFilter('');
        setLeaderFilter('');
        setStatusFilter('');
        setPhaseFilter('');
        setPriorityFilter('');
        setDelayFilter('');
        setYearFilter('');
    };

    const handleExport = (format: string) => {
        alert(`${filteredAudits.length} denetim planı ${format} formatında export edilecek.`);
        setShowExportMenu(false);
    };

    // Resizable column header component
    const ResizableHeader = ({ columnKey, children, align = 'left' }: { columnKey: string; children: React.ReactNode; align?: 'left' | 'center' }) => (
        <th
            style={{ width: columnWidths[columnKey] }}
            className={`px-2 py-3 ${align === 'center' ? 'text-center' : 'text-left'} text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group`}
        >
            {children}
            <div
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                onMouseDown={(e) => handleMouseDown(e, columnKey)}
            />
        </th>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[2000px] mx-auto px-6 py-6">
                {/* Page Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Denetim Planı</h1>
                        <p className="text-gray-500 mt-0.5">İç denetim faaliyetlerini planlayın ve takip edin</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Export Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                className="px-4 py-2.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Dışa Aktar
                                <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {showExportMenu && (
                                <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                                    <button onClick={() => handleExport('Excel')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50">Excel (.xlsx)</button>
                                    <button onClick={() => handleExport('CSV')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50">CSV</button>
                                    <button onClick={() => handleExport('PDF')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50">PDF</button>
                                </div>
                            )}
                        </div>
                        <Link
                            href="/audits/plans/new"
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white font-medium rounded-lg hover:bg-[#152a45] transition-all shadow-sm"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Yeni Denetim Planı
                        </Link>
                    </div>
                </div>

                {/* KPI Summary */}
                <div className="grid grid-cols-6 gap-4 mb-6">
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-sm text-gray-500">Toplam Plan</p>
                        <p className="text-2xl font-bold text-gray-900">{totalAudits}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-amber-200">
                        <p className="text-sm text-amber-600">Devam Eden</p>
                        <p className="text-2xl font-bold text-amber-600">{inProgressCount}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-green-200">
                        <p className="text-sm text-green-600">Tamamlanan</p>
                        <p className="text-2xl font-bold text-green-600">{completedCount}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-red-200">
                        <p className="text-sm text-red-600">Gecikmeli</p>
                        <p className="text-2xl font-bold text-red-600">{delayedCount}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-blue-200">
                        <p className="text-sm text-blue-600">Planlanan Adam-Gün</p>
                        <p className="text-2xl font-bold text-blue-600">{totalPlannedDays}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-indigo-200">
                        <p className="text-sm text-indigo-600">Gerçekleşen Adam-Gün</p>
                        <p className="text-2xl font-bold text-indigo-600">{totalActualDays}</p>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="bg-white rounded-lg p-4 border border-gray-200 mb-4">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Search */}
                        <div className="relative min-w-[200px]">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Kod veya isim ara..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Birimler</option>
                            {uniqueUnits.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>

                        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Ekipler</option>
                            {uniqueTeams.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>

                        <select value={leaderFilter} onChange={(e) => setLeaderFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Liderler</option>
                            {uniqueLeaders.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>

                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Durumlar</option>
                            <option value="PLANNED">Planlandı</option>
                            <option value="IN_PROGRESS">Devam Ediyor</option>
                            <option value="COMPLETED">Tamamlandı</option>
                            <option value="CANCELLED">İptal</option>
                        </select>

                        <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Fazlar</option>
                            <option value="PLANNING">Planlama</option>
                            <option value="FIELDWORK">Saha Çalışması</option>
                            <option value="REPORTING">Raporlama</option>
                            <option value="CLOSED">Kapatıldı</option>
                        </select>

                        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Öncelikler</option>
                            <option value="LOW">Düşük</option>
                            <option value="MEDIUM">Orta</option>
                            <option value="HIGH">Yüksek</option>
                        </select>

                        <select value={delayFilter} onChange={(e) => setDelayFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Gecikme</option>
                            <option value="ON_TRACK">Zamanında</option>
                            <option value="AT_RISK">Risk Altında</option>
                            <option value="DELAYED">Gecikmeli</option>
                        </select>

                        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Yıllar</option>
                            {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>

                        <button onClick={clearFilters} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
                            Temizle
                        </button>
                    </div>
                </div>

                {/* Bulk Actions */}
                {selectedIds.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center justify-between">
                        <span className="text-sm text-blue-700">{selectedIds.length} denetim planı seçildi</span>
                        <div className="flex items-center gap-2">
                            <button className="px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 rounded">Toplu Durum Güncelle</button>
                            <button className="px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 rounded">Dışa Aktar</button>
                            <button onClick={() => setSelectedIds([])} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">İptal</button>
                        </div>
                    </div>
                )}

                {/* Main Table */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="text-sm" style={{ width: 'max-content', minWidth: '100%' }}>
                            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                                <tr>
                                    <th style={{ width: columnWidths.checkbox }} className="px-2 py-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.length === filteredAudits.length && filteredAudits.length > 0}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    </th>
                                    <ResizableHeader columnKey="auditCode">PLAN KODU</ResizableHeader>
                                    <ResizableHeader columnKey="auditName">DENETİM ADI</ResizableHeader>
                                    <ResizableHeader columnKey="auditedUnit">DENETLENEN BİRİM</ResizableHeader>
                                    <ResizableHeader columnKey="auditTeam">DENETİM EKİBİ</ResizableHeader>
                                    <ResizableHeader columnKey="teamLeader">EKİP LİDERİ</ResizableHeader>
                                    <ResizableHeader columnKey="plannedStart" align="center">PLAN BAŞLANGIÇ</ResizableHeader>
                                    <ResizableHeader columnKey="plannedEnd" align="center">PLAN BİTİŞ</ResizableHeader>
                                    <ResizableHeader columnKey="status" align="center">DURUM</ResizableHeader>
                                    <ResizableHeader columnKey="phase" align="center">FAZ</ResizableHeader>
                                    <ResizableHeader columnKey="rationale" align="center">GEREKÇE</ResizableHeader>
                                    <ResizableHeader columnKey="plannedDays" align="center">PLAN GÜN</ResizableHeader>
                                    <ResizableHeader columnKey="actualDays" align="center">GERÇEK GÜN</ResizableHeader>
                                    <ResizableHeader columnKey="variance" align="center">SAPMA</ResizableHeader>
                                    <ResizableHeader columnKey="delayStatus" align="center">GECİKME</ResizableHeader>
                                    <ResizableHeader columnKey="draftReport" align="center">TASLAK RAPOR</ResizableHeader>
                                    <ResizableHeader columnKey="finalReport" align="center">FİNAL RAPOR</ResizableHeader>
                                    <ResizableHeader columnKey="totalFindings" align="center">BULGU</ResizableHeader>
                                    <ResizableHeader columnKey="openFindings" align="center">AÇIK</ResizableHeader>
                                    <ResizableHeader columnKey="actionStatus" align="center">AKSİYON</ResizableHeader>
                                    <th className="px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">İŞLEMLER</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredAudits.map(audit => (
                                    <tr key={audit.id} className="hover:bg-gray-50 group">
                                        <td className="px-2 py-2.5">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(audit.id)}
                                                onChange={() => toggleSelect(audit.id)}
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </td>
                                        <td className="px-2 py-2.5">
                                            <Link href={`/audits/plans/${audit.id}`} className="text-blue-700 font-medium hover:underline">
                                                {audit.auditCode}
                                            </Link>
                                        </td>
                                        <td className="px-2 py-2.5">
                                            <p className="text-gray-900 font-medium truncate" style={{ maxWidth: columnWidths.auditName }} title={audit.auditName}>
                                                {audit.auditName}
                                            </p>
                                        </td>
                                        <td className="px-2 py-2.5 text-gray-700">{audit.auditedUnit}</td>
                                        <td className="px-2 py-2.5 text-gray-700">{audit.auditTeam}</td>
                                        <td className="px-2 py-2.5">
                                            <div className="flex items-center gap-1.5" title={`Ekip: ${audit.teamMembers.map(m => m.name).join(', ')}`}>
                                                <span className="text-gray-900">{audit.teamLeader}</span>
                                                <span className="text-xs text-gray-400">+{audit.teamMembers.length - 1}</span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-2.5 text-center text-gray-600">{formatDate(audit.plannedStartDate)}</td>
                                        <td className="px-2 py-2.5 text-center text-gray-600">{formatDate(audit.plannedEndDate)}</td>
                                        <td className="px-2 py-2.5 text-center">
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${STATUS_CONFIG[audit.status].color}`}>
                                                {STATUS_CONFIG[audit.status].label}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2.5 text-center">
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${PHASE_CONFIG[audit.phase].color}`}>
                                                {PHASE_CONFIG[audit.phase].label}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2.5 text-center text-xs text-gray-600">{RATIONALE_CONFIG[audit.rationale]}</td>
                                        <td className="px-2 py-2.5 text-center text-gray-700">{audit.plannedManDays}</td>
                                        <td className="px-2 py-2.5 text-center text-gray-700">{audit.actualManDays || '—'}</td>
                                        <td className="px-2 py-2.5 text-center">
                                            {audit.scheduleVariance !== 0 ? (
                                                <span className={audit.scheduleVariance > 0 ? 'text-red-600' : 'text-green-600'}>
                                                    {audit.scheduleVariance > 0 ? '+' : ''}{audit.scheduleVariance}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2.5 text-center">
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${DELAY_CONFIG[audit.delayStatus].color}`}>
                                                {DELAY_CONFIG[audit.delayStatus].label}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2.5 text-center text-gray-600">{formatDate(audit.draftReportDate)}</td>
                                        <td className="px-2 py-2.5 text-center text-gray-600">{formatDate(audit.finalReportDate)}</td>
                                        <td className="px-2 py-2.5 text-center">
                                            {audit.totalFindings > 0 ? (
                                                <span className="font-medium text-gray-900">{audit.totalFindings}</span>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2.5 text-center">
                                            {audit.openFindings > 0 ? (
                                                <span className="font-medium text-red-600">{audit.openFindings}</span>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2.5 text-center">
                                            <span className={`text-xs font-medium ${ACTION_STATUS_CONFIG[audit.actionStatus].color}`}>
                                                {ACTION_STATUS_CONFIG[audit.actionStatus].label}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2.5">
                                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Link href={`/audits/plans/${audit.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Görüntüle">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                </Link>
                                                <Link href={`/audits/plans/${audit.id}/edit`} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Düzenle">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </Link>
                                                <Link href={`/audits/plans/${audit.id}/timeline`} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded" title="Zaman Çizelgesi">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                        <p className="text-sm text-gray-500">
                            <span className="font-medium">{filteredAudits.length}</span> denetim planı gösteriliyor
                        </p>
                        <div className="flex items-center gap-1">
                            <button className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Önceki</button>
                            <button className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded">1</button>
                            <button className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Sonraki</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
