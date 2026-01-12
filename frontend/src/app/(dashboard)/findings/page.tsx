'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

// Types
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

// Config
const findingTypeConfig: Record<string, { label: string; color: string }> = {
    CONTROL_DEFICIENCY: { label: 'Kontrol Eksikliği', color: 'bg-red-100 text-red-700' },
    PROCESS_GAP: { label: 'Süreç Açığı', color: 'bg-orange-100 text-orange-700' },
    COMPLIANCE_ISSUE: { label: 'Uyum Sorunu', color: 'bg-purple-100 text-purple-700' },
    DOCUMENTATION: { label: 'Dokümantasyon', color: 'bg-blue-100 text-blue-700' },
    IT_SECURITY: { label: 'BT Güvenliği', color: 'bg-indigo-100 text-indigo-700' },
    OPERATIONAL: { label: 'Operasyonel', color: 'bg-gray-100 text-gray-700' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
    OPEN: { label: 'Açık', color: 'bg-red-100 text-red-700' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'bg-yellow-100 text-yellow-700' },
    PENDING_REVIEW: { label: 'İnceleme Bekliyor', color: 'bg-blue-100 text-blue-700' },
    CLOSED: { label: 'Kapatıldı', color: 'bg-green-100 text-green-700' },
    VERIFIED: { label: 'Doğrulandı', color: 'bg-emerald-100 text-emerald-700' },
};

const delayStatusConfig: Record<string, { label: string; color: string; icon: string }> = {
    ON_TIME: { label: 'Zamanında', color: 'bg-green-100 text-green-700', icon: '✓' },
    APPROACHING: { label: 'Yaklaşıyor', color: 'bg-yellow-100 text-yellow-700', icon: '⏰' },
    OVERDUE: { label: 'Gecikmiş', color: 'bg-red-100 text-red-700', icon: '⚠️' },
};

// Helper functions
const calculateDelayStatus = (targetDate: string, closedDate: string | null, status: string): string => {
    if (status === 'CLOSED' || status === 'VERIFIED') return 'ON_TIME';
    const target = new Date(targetDate);
    const now = new Date();
    const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'OVERDUE';
    if (diffDays <= 7) return 'APPROACHING';
    return 'ON_TIME';
};

const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
};

// Column definitions
const allColumns = [
    { id: 'checkbox', label: '', width: 40, fixed: true },
    { id: 'findingId', label: 'Bulgu ID', width: 110 },
    { id: 'findingType', label: 'Bulgu Tipi', width: 130 },
    { id: 'description', label: 'Açıklama', width: 250 },
    { id: 'affectedSystem', label: 'Etkilenen Sistem', width: 140 },
    { id: 'risk', label: 'İlişkili Risk', width: 120 },
    { id: 'control', label: 'İlişkili Kontrol', width: 120 },
    { id: 'recommendation', label: 'Öneri', width: 200 },
    { id: 'actionOwner', label: 'Aksiyon Sahibi', width: 140 },
    { id: 'targetClosureDate', label: 'Hedef Kapanış', width: 110 },
    { id: 'delayStatus', label: 'Gecikme Durumu', width: 120 },
    { id: 'status', label: 'Bulgu Durumu', width: 120 },
    { id: 'actions', label: 'İşlemler', width: 140, fixed: true },
];

export default function FindingsPage() {
    const [findings, setFindings] = useState<Finding[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Filters
    const [findingTypeFilter, setFindingTypeFilter] = useState('');
    const [systemFilter, setSystemFilter] = useState('');
    const [ownerFilter, setOwnerFilter] = useState('');
    const [delayFilter, setDelayFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [riskFilter, setRiskFilter] = useState('');
    const [controlFilter, setControlFilter] = useState('');

    // Column management
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
        Object.fromEntries(allColumns.map(c => [c.id, c.width]))
    );
    const [visibleColumns, setVisibleColumns] = useState<string[]>(allColumns.map(c => c.id));
    const [showColumnMenu, setShowColumnMenu] = useState(false);
    const [sortBy, setSortBy] = useState<string>('findingId');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // Export menu
    const [showExportMenu, setShowExportMenu] = useState(false);

    // Refs for resize
    const resizingColumn = useRef<string | null>(null);
    const startX = useRef(0);
    const startWidth = useRef(0);

    // Load data
    useEffect(() => {
        const loadFindings = async () => {
            setLoading(true);
            try {
                const result = await api.getFindings({}) as { data: Finding[] };
                setFindings(result.data || []);
            } catch (error) {
                console.error('Failed to load findings:', error);
                setFindings([]);
            } finally {
                setLoading(false);
            }
        };
        loadFindings();
    }, []);

    // Filter and sort
    const filteredFindings = findings
        .filter(f => {
            if (findingTypeFilter && f.findingType !== findingTypeFilter) return false;
            if (systemFilter && !f.affectedSystem.toLowerCase().includes(systemFilter.toLowerCase())) return false;
            if (ownerFilter && f.actionOwner?.id !== ownerFilter) return false;
            if (delayFilter && calculateDelayStatus(f.targetClosureDate, f.closedDate, f.status) !== delayFilter) return false;
            if (statusFilter && f.status !== statusFilter) return false;
            if (riskFilter && f.risk?.id !== riskFilter) return false;
            if (controlFilter && f.control?.id !== controlFilter) return false;
            return true;
        })
        .sort((a, b) => {
            let aVal = '', bVal = '';
            if (sortBy === 'findingId') { aVal = a.findingId; bVal = b.findingId; }
            else if (sortBy === 'targetClosureDate') { aVal = a.targetClosureDate; bVal = b.targetClosureDate; }
            else if (sortBy === 'status') { aVal = a.status; bVal = b.status; }
            else if (sortBy === 'findingType') { aVal = a.findingType; bVal = b.findingType; }
            const cmp = aVal.localeCompare(bVal);
            return sortOrder === 'asc' ? cmp : -cmp;
        });

    // KPIs
    const totalFindings = findings.length;
    const openFindings = findings.filter(f => f.status === 'OPEN' || f.status === 'IN_PROGRESS').length;
    const overdueFindings = findings.filter(f => calculateDelayStatus(f.targetClosureDate, f.closedDate, f.status) === 'OVERDUE').length;
    const closedFindings = findings.filter(f => f.closedDate);
    const avgClosureTime = closedFindings.length > 0
        ? Math.round(closedFindings.reduce((acc, f) => {
            const created = new Date(f.createdAt).getTime();
            const closed = new Date(f.closedDate!).getTime();
            return acc + (closed - created) / (1000 * 60 * 60 * 24);
        }, 0) / closedFindings.length)
        : 0;

    // Resize handlers
    const handleMouseDown = (columnId: string, e: React.MouseEvent) => {
        resizingColumn.current = columnId;
        startX.current = e.clientX;
        startWidth.current = columnWidths[columnId];
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!resizingColumn.current) return;
        const diff = e.clientX - startX.current;
        setColumnWidths(prev => ({
            ...prev,
            [resizingColumn.current!]: Math.max(50, startWidth.current + diff)
        }));
    };

    const handleMouseUp = () => {
        resizingColumn.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    const handleSort = (columnId: string) => {
        if (sortBy === columnId) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(columnId);
            setSortOrder('asc');
        }
    };

    const toggleColumnVisibility = (columnId: string) => {
        setVisibleColumns(prev =>
            prev.includes(columnId)
                ? prev.filter(c => c !== columnId)
                : [...prev, columnId]
        );
    };

    const handleExport = (format: string) => {
        alert(`${format.toUpperCase()} formatında dışa aktarılıyor...`);
        setShowExportMenu(false);
    };

    const clearFilters = () => {
        setFindingTypeFilter('');
        setSystemFilter('');
        setOwnerFilter('');
        setDelayFilter('');
        setStatusFilter('');
        setRiskFilter('');
        setControlFilter('');
    };

    // Bulk selection handlers
    const toggleSelectAll = () => {
        if (selectedIds.length === filteredFindings.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredFindings.map(f => f.id));
        }
    };

    const toggleSelectItem = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        const confirmDelete = confirm(`${selectedIds.length} bulgu silinecek. Devam etmek istiyor musunuz?`);
        if (!confirmDelete) return;

        try {
            for (const id of selectedIds) {
                await api.deleteFinding(id);
            }
            setFindings(prev => prev.filter(f => !selectedIds.includes(f.id)));
            setSelectedIds([]);
        } catch (err) {
            console.error('Failed to delete findings:', err);
            alert('Bazı bulgular silinemedi');
        }
    };

    const handleBulkCopy = () => {
        if (selectedIds.length === 0) return;
        const selectedFindings = findings.filter(f => selectedIds.includes(f.id));
        const copyText = selectedFindings.map(f =>
            `${f.findingId}\t${findingTypeConfig[f.findingType]?.label || f.findingType}\t${f.description}\t${f.affectedSystem}\t${statusConfig[f.status]?.label || f.status}`
        ).join('\n');

        navigator.clipboard.writeText(copyText).then(() => {
            alert(`${selectedIds.length} bulgu panoya kopyalandı`);
        }).catch(() => {
            alert('Kopyalama başarısız');
        });
    };

    // Get unique values for filters
    const uniqueOwners = [...new Map(findings.filter(f => f.actionOwner).map(f => [f.actionOwner.id, f.actionOwner])).values()];
    const uniqueRisks = [...new Map(findings.filter(f => f.risk).map(f => [f.risk!.id, f.risk!])).values()];
    const uniqueControls = [...new Map(findings.filter(f => f.control).map(f => [f.control!.id, f.control!])).values()];

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1900px] mx-auto px-6 py-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Bulgular</h1>
                        <p className="text-gray-500 text-sm mt-1">Denetim ve kontrol testlerinden elde edilen bulgular</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Export Menu */}
                        <div className="relative">
                            <button
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Dışa Aktar
                            </button>
                            {showExportMenu && (
                                <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-20">
                                    <button onClick={() => handleExport('excel')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50">Excel (.xlsx)</button>
                                    <button onClick={() => handleExport('csv')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50">CSV</button>
                                    <button onClick={() => handleExport('pdf')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50">PDF</button>
                                </div>
                            )}
                        </div>
                        {/* Column Menu */}
                        <div className="relative">
                            <button
                                onClick={() => setShowColumnMenu(!showColumnMenu)}
                                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                                </svg>
                                Kolonlar
                            </button>
                            {showColumnMenu && (
                                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-100 py-2 z-20 max-h-80 overflow-y-auto">
                                    {allColumns.filter(c => !c.fixed).map(col => (
                                        <label key={col.id} className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={visibleColumns.includes(col.id)}
                                                onChange={() => toggleColumnVisibility(col.id)}
                                                className="w-4 h-4 text-purple-600 rounded border-gray-300"
                                            />
                                            <span className="ml-3 text-sm text-gray-700">{col.label}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                        <Link
                            href="/findings/new"
                            className="px-4 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Yeni Bulgu
                        </Link>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <p className="text-sm text-gray-500">Toplam Bulgu</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{totalFindings}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <p className="text-sm text-gray-500">Açık Bulgular</p>
                        <p className="text-2xl font-bold text-yellow-600 mt-1">{openFindings}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <p className="text-sm text-gray-500">Gecikmiş Bulgular</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">{overdueFindings}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <p className="text-sm text-gray-500">Ort. Kapanış Süresi</p>
                        <p className="text-2xl font-bold text-blue-600 mt-1">{avgClosureTime} gün</p>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
                    <div className="flex flex-wrap gap-3 items-center">
                        <select value={findingTypeFilter} onChange={e => setFindingTypeFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-purple-500">
                            <option value="">Tüm Bulgu Tipleri</option>
                            {Object.entries(findingTypeConfig).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            placeholder="Etkilenen Sistem..."
                            value={systemFilter}
                            onChange={e => setSystemFilter(e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg w-40 focus:ring-2 focus:ring-purple-500"
                        />
                        <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-purple-500">
                            <option value="">Tüm Aksiyon Sahipleri</option>
                            {uniqueOwners.map(o => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                        </select>
                        <select value={delayFilter} onChange={e => setDelayFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-purple-500">
                            <option value="">Tüm Gecikme Durumları</option>
                            {Object.entries(delayStatusConfig).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                            ))}
                        </select>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-purple-500">
                            <option value="">Tüm Durumlar</option>
                            {Object.entries(statusConfig).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                            ))}
                        </select>
                        <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-purple-500">
                            <option value="">Tüm Riskler</option>
                            {uniqueRisks.map(r => (
                                <option key={r.id} value={r.id}>{r.riskId}</option>
                            ))}
                        </select>
                        <select value={controlFilter} onChange={e => setControlFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-purple-500">
                            <option value="">Tüm Kontroller</option>
                            {uniqueControls.map(c => (
                                <option key={c.id} value={c.id}>{c.controlId}</option>
                            ))}
                        </select>
                        <button onClick={clearFilters} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
                            Temizle
                        </button>
                    </div>
                </div>

                {/* Bulk Action Bar */}
                {selectedIds.length > 0 && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4 flex items-center justify-between">
                        <span className="text-purple-700 font-medium">{selectedIds.length} bulgu seçildi</span>
                        <div className="flex items-center gap-2">
                            <button onClick={handleBulkCopy} className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                Kopyala
                            </button>
                            <button onClick={handleBulkDelete} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Sil
                            </button>
                            <button onClick={() => setSelectedIds([])} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
                                Seçimi Kaldır
                            </button>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-3 py-3 text-center w-10 border-b border-gray-100">
                                            <input
                                                type="checkbox"
                                                checked={filteredFindings.length > 0 && selectedIds.length === filteredFindings.length}
                                                onChange={toggleSelectAll}
                                                className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                                            />
                                        </th>
                                        {allColumns.filter(c => visibleColumns.includes(c.id)).map(col => (
                                            <th
                                                key={col.id}
                                                style={{ width: columnWidths[col.id], minWidth: columnWidths[col.id] }}
                                                className="relative px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-100"
                                            >
                                                <div className="flex items-center gap-1">
                                                    {col.id === 'checkbox' ? (
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.length === filteredFindings.length && filteredFindings.length > 0}
                                                            onChange={(e) => setSelectedIds(e.target.checked ? filteredFindings.map(f => f.id) : [])}
                                                            className="w-4 h-4 rounded border-gray-300"
                                                        />
                                                    ) : (
                                                        <button onClick={() => handleSort(col.id)} className="flex items-center gap-1 hover:text-gray-700">
                                                            {col.label}
                                                            {sortBy === col.id && (
                                                                <span className="text-purple-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                                {!col.fixed && (
                                                    <div
                                                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-purple-400"
                                                        onMouseDown={(e) => handleMouseDown(col.id, e)}
                                                    />
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredFindings.map((finding) => {
                                        const delayStatus = calculateDelayStatus(finding.targetClosureDate, finding.closedDate, finding.status);
                                        const isOverdue = delayStatus === 'OVERDUE';
                                        return (
                                            <tr key={finding.id} className={`hover:bg-gray-50 transition-colors ${isOverdue ? 'bg-red-50/50' : ''} ${selectedIds.includes(finding.id) ? 'bg-purple-50' : ''}`}>
                                                {visibleColumns.includes('checkbox') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['checkbox'] }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.includes(finding.id)}
                                                            onChange={() => toggleSelectItem(finding.id)}
                                                            className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                                                        />
                                                    </td>
                                                )}
                                                {visibleColumns.includes('findingId') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['findingId'] }}>
                                                        <Link href={`/findings/${finding.id}`} className="font-mono text-sm text-purple-600 hover:underline">
                                                            {finding.findingId}
                                                        </Link>
                                                    </td>
                                                )}
                                                {visibleColumns.includes('findingType') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['findingType'] }}>
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${findingTypeConfig[finding.findingType]?.color}`}>
                                                            {findingTypeConfig[finding.findingType]?.label}
                                                        </span>
                                                    </td>
                                                )}
                                                {visibleColumns.includes('description') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['description'] }}>
                                                        <p className="text-sm text-gray-900 truncate" title={finding.description}>
                                                            {finding.description}
                                                        </p>
                                                    </td>
                                                )}
                                                {visibleColumns.includes('affectedSystem') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['affectedSystem'] }}>
                                                        <span className="text-sm text-gray-600">{finding.affectedSystem}</span>
                                                    </td>
                                                )}
                                                {visibleColumns.includes('risk') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['risk'] }}>
                                                        {finding.risk ? (
                                                            <Link href={`/risks/${finding.risk.id}`} className="text-sm text-blue-600 hover:underline">
                                                                {finding.risk.riskId}
                                                            </Link>
                                                        ) : <span className="text-gray-400">—</span>}
                                                    </td>
                                                )}
                                                {visibleColumns.includes('control') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['control'] }}>
                                                        {finding.control ? (
                                                            <Link href={`/controls/${finding.control.id}`} className="text-sm text-green-600 hover:underline">
                                                                {finding.control.controlId}
                                                            </Link>
                                                        ) : <span className="text-gray-400">—</span>}
                                                    </td>
                                                )}
                                                {visibleColumns.includes('recommendation') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['recommendation'] }}>
                                                        <p className="text-sm text-gray-600 truncate" title={finding.recommendation}>
                                                            {finding.recommendation}
                                                        </p>
                                                    </td>
                                                )}
                                                {visibleColumns.includes('actionOwner') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['actionOwner'] }}>
                                                        <div>
                                                            <p className="text-sm text-gray-900">{finding.actionOwner?.name || '—'}</p>
                                                            <p className="text-xs text-gray-500">{finding.actionOwner?.department || ''}</p>
                                                        </div>
                                                    </td>
                                                )}
                                                {visibleColumns.includes('targetClosureDate') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['targetClosureDate'] }}>
                                                        <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                                            {formatDate(finding.targetClosureDate)}
                                                        </span>
                                                    </td>
                                                )}
                                                {visibleColumns.includes('delayStatus') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['delayStatus'] }}>
                                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${delayStatusConfig[delayStatus]?.color}`}>
                                                            <span>{delayStatusConfig[delayStatus]?.icon}</span>
                                                            {delayStatusConfig[delayStatus]?.label}
                                                        </span>
                                                    </td>
                                                )}
                                                {visibleColumns.includes('status') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['status'] }}>
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusConfig[finding.status]?.color}`}>
                                                            {statusConfig[finding.status]?.label}
                                                        </span>
                                                    </td>
                                                )}
                                                {visibleColumns.includes('actions') && (
                                                    <td className="px-4 py-3" style={{ width: columnWidths['actions'] }}>
                                                        <div className="flex items-center gap-2">
                                                            <Link href={`/findings/${finding.id}`} className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded" title="Görüntüle">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                </svg>
                                                            </Link>
                                                            <Link href={`/findings/${finding.id}/edit`} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Düzenle">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </Link>
                                                            <button className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded" title="Kanıt">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                                </svg>
                                                            </button>
                                                            <button className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded" title="Geçmiş">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                        <div className="flex items-center justify-between text-sm text-gray-500">
                            <span>{filteredFindings.length} bulgu gösteriliyor</span>
                            <span>{selectedIds.length > 0 && `${selectedIds.length} seçili`}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
