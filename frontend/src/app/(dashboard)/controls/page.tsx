'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

// Types
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
    linkedHighRisks: number;
    openActions: number;
    hasEvidence: boolean;
    linkedRegulations: string[];
    status: 'ACTIVE' | 'PASSIVE';
    hasOverdueTest: boolean;
    hasOverdueActions: boolean;
}

const typeConfig: Record<string, { label: string; color: string }> = {
    IT_GENERAL: { label: 'IT Genel', color: 'bg-blue-100 text-blue-700' },
    IT_APPLICATION: { label: 'IT Uygulama', color: 'bg-indigo-100 text-indigo-700' },
    OPERATIONAL: { label: 'Operasyonel', color: 'bg-gray-100 text-gray-700' },
    COMPLIANCE: { label: 'Uyum', color: 'bg-purple-100 text-purple-700' },
    FINANCIAL: { label: 'Finansal', color: 'bg-emerald-100 text-emerald-700' },
};

const natureConfig: Record<string, { label: string; color: string }> = {
    PREVENTIVE: { label: 'Önleyici', color: 'bg-sky-100 text-sky-700' },
    DETECTIVE: { label: 'Tespit Edici', color: 'bg-violet-100 text-violet-700' },
    CORRECTIVE: { label: 'Düzeltici', color: 'bg-rose-100 text-rose-700' },
};

const automationConfig: Record<string, { label: string; color: string }> = {
    AUTOMATED: { label: 'Otomatik', color: 'bg-green-100 text-green-700' },
    SEMI_AUTOMATED: { label: 'Yarı Oto.', color: 'bg-yellow-100 text-yellow-700' },
    MANUAL: { label: 'Manuel', color: 'bg-gray-100 text-gray-600' },
};

const frequencyConfig: Record<string, string> = {
    DAILY: 'Günlük',
    WEEKLY: 'Haftalık',
    MONTHLY: 'Aylık',
    QUARTERLY: '3 Aylık',
    ANNUAL: 'Yıllık',
    AD_HOC: 'Arızi',
};

const effectivenessConfig: Record<string, { label: string; color: string }> = {
    EFFECTIVE: { label: 'Etkin', color: 'bg-green-100 text-green-700' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen', color: 'bg-yellow-100 text-yellow-700' },
    INEFFECTIVE: { label: 'Etkin Değil', color: 'bg-red-100 text-red-700' },
    NOT_TESTED: { label: 'Test Edilmedi', color: 'bg-gray-100 text-gray-500' },
};

// Consistent date formatting to avoid hydration mismatch
const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

export default function ControlInventoryPage() {
    const [controls, setControls] = useState<Control[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [natureFilter, setNatureFilter] = useState('');
    const [automationFilter, setAutomationFilter] = useState('');
    const [effectivenessFilter, setEffectivenessFilter] = useState('');
    const [unitFilter, setUnitFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Fetch controls from API
    useEffect(() => {
        const fetchControls = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = await api.getControls() as any;
                const controlList = Array.isArray(data) ? data : (data.data || []);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const transformedControls: Control[] = controlList.map((c: any) => ({
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
                        department: String(c.owner?.department || '')
                    },
                    lastTestDate: c.lastTestDate ? new Date(c.lastTestDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    lastTestResult: String(c.lastTestResult || 'NOT_TESTED'),
                    effectivenessStatus: String(c.effectivenessStatus || 'NOT_TESTED'),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    linkedRisks: (c.risks || c.riskMappings || []).map((r: any) => ({ id: r.risk?.id, riskId: r.risk?.riskId })).filter((r: any) => r.id && r.riskId),
                    linkedHighRisks: 0,
                    openActions: 0,
                    hasEvidence: false,
                    linkedRegulations: [],
                    status: 'ACTIVE' as const,
                    hasOverdueTest: false,
                    hasOverdueActions: false
                }));
                setControls(transformedControls);
            } catch (err) {
                console.error('Failed to fetch controls:', err);
                setControls([]);
            } finally {
                setLoading(false);
            }
        };
        fetchControls();
    }, []);

    // Column widths for resizable columns
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
        checkbox: 40,
        controlId: 100,
        name: 200,
        type: 90,
        nature: 80,
        automation: 80,
        owner: 120,
        frequency: 80,
        lastTest: 90,
        testResult: 80,
        effectiveness: 80,
        risks: 50,
        actions: 60,
        evidence: 50,
        regulations: 100,
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

    // useEffect for mouse move/up events
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!resizing) return;
            const diff = e.clientX - startX;
            const newWidth = Math.max(40, startWidth + diff);
            setColumnWidths(prev => ({ ...prev, [resizing]: newWidth }));
        };

        const handleMouseUp = () => {
            setResizing(null);
        };

        if (resizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizing, startX, startWidth]);

    // Extract unique departments for filter
    const uniqueDepartments = Array.from(new Set(controls.map(c => c.owner.department))).sort();


    // KPI calculations
    const totalControls = controls.length;
    const effectiveCount = controls.filter(c => c.effectivenessStatus === 'EFFECTIVE').length;
    const ineffectiveHighRisk = controls.filter(c => c.effectivenessStatus === 'INEFFECTIVE' && c.linkedHighRisks > 0).length;
    const overdueTests = controls.filter(c => c.hasOverdueTest).length;
    const missingEvidence = controls.filter(c => !c.hasEvidence).length;

    // Filter
    const filteredControls = controls.filter(c => {
        if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.controlId.toLowerCase().includes(search.toLowerCase())) return false;
        if (typeFilter && c.type !== typeFilter) return false;
        if (natureFilter && c.nature !== natureFilter) return false;
        if (automationFilter && c.automation !== automationFilter) return false;
        if (effectivenessFilter && c.effectivenessStatus !== effectivenessFilter) return false;
        if (unitFilter && c.owner.department !== unitFilter) return false;
        return true;
    });

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredControls.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredControls.map(c => c.id));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        const confirmDelete = confirm(`${selectedIds.length} kontrol silinecek. Devam etmek istiyor musunuz?`);
        if (!confirmDelete) return;

        try {
            for (const id of selectedIds) {
                await api.deleteControl(id);
            }
            setControls(prev => prev.filter(c => !selectedIds.includes(c.id)));
            setSelectedIds([]);
        } catch (err) {
            console.error('Failed to delete controls:', err);
            alert('Bazı kontroller silinemedi');
        }
    };

    const handleBulkCopy = () => {
        if (selectedIds.length === 0) return;
        const selectedControls = controls.filter(c => selectedIds.includes(c.id));
        const copyText = selectedControls.map(c =>
            `${c.controlId}\t${c.name}\t${typeConfig[c.type]?.label || c.type}\t${c.owner.name}\t${effectivenessConfig[c.effectivenessStatus]?.label || c.effectivenessStatus}`
        ).join('\n');

        navigator.clipboard.writeText(copyText).then(() => {
            alert(`${selectedIds.length} kontrol panoya kopyalandı`);
        }).catch(() => {
            alert('Kopyalama başarısız');
        });
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1800px] mx-auto px-6 py-6">
                {/* Page Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Kontrol Envanteri</h1>
                        <p className="text-gray-500 mt-0.5">Tüm iç kontrol mekanizmalarını görüntüleyin ve yönetin</p>
                    </div>
                    <Link
                        href="/controls/new"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white font-medium rounded-lg hover:bg-[#152a45] transition-all shadow-sm"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Yeni Kontrol
                    </Link>
                </div>

                {/* KPI Summary Bar */}
                <div className="grid grid-cols-5 gap-4 mb-6">
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                        <p className="text-sm text-gray-500">Toplam Kontrol</p>
                        <p className="text-2xl font-bold text-gray-900">{totalControls}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-green-100">
                        <p className="text-sm text-green-600">Etkin Kontrol</p>
                        <p className="text-2xl font-bold text-green-600">{effectiveCount}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-red-100">
                        <p className="text-sm text-red-600">Kritik Risk + Etkisiz</p>
                        <p className="text-2xl font-bold text-red-600">{ineffectiveHighRisk}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100">
                        <p className="text-sm text-orange-600">Geciken Test</p>
                        <p className="text-2xl font-bold text-orange-600">{overdueTests}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-purple-100">
                        <p className="text-sm text-purple-600">Eksik Kanıt</p>
                        <p className="text-2xl font-bold text-purple-600">{missingEvidence}</p>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 mb-4 sticky top-0 z-10">
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Search */}
                        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="ID veya isim ara..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                            />
                        </div>

                        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Tipler</option>
                            <option value="IT_GENERAL">IT Genel</option>
                            <option value="IT_APPLICATION">IT Uygulama</option>
                            <option value="OPERATIONAL">Operasyonel</option>
                            <option value="COMPLIANCE">Uyum</option>
                        </select>

                        <select value={natureFilter} onChange={(e) => setNatureFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Nitelikler</option>
                            <option value="PREVENTIVE">Önleyici</option>
                            <option value="DETECTIVE">Tespit Edici</option>
                        </select>

                        <select value={automationFilter} onChange={(e) => setAutomationFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Otomasyon</option>
                            <option value="AUTOMATED">Otomatik</option>
                            <option value="SEMI_AUTOMATED">Yarı Otomatik</option>
                            <option value="MANUAL">Manuel</option>
                        </select>

                        <select value={effectivenessFilter} onChange={(e) => setEffectivenessFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Etkinlik</option>
                            <option value="EFFECTIVE">Etkin</option>
                            <option value="PARTIALLY_EFFECTIVE">Kısmen</option>
                            <option value="INEFFECTIVE">Etkin Değil</option>
                        </select>

                        <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                            <option value="">Tüm Birimler</option>
                            {uniqueDepartments.map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>

                        <div className="flex items-center gap-2 ml-auto">
                            <button onClick={() => { setSearch(''); setTypeFilter(''); setNatureFilter(''); setAutomationFilter(''); setEffectivenessFilter(''); setUnitFilter(''); }} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
                                Temizle
                            </button>
                            <button className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Dışa Aktar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Bulk Actions */}
                {selectedIds.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center justify-between">
                        <span className="text-sm text-green-700 font-medium">{selectedIds.length} kontrol seçildi</span>
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

                {/* Main Table */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="text-sm" style={{ width: 'max-content', minWidth: '100%' }}>
                            <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                                <tr>
                                    <th style={{ width: columnWidths.checkbox }} className="px-3 py-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.length === filteredControls.length && filteredControls.length > 0}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.controlId }} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        KONTROL ID
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'controlId')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.name }} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        KONTROL ADI
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'name')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.type }} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        TİP
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'type')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.nature }} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        NİTELİK
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'nature')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.automation }} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        OTOMASYON
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'automation')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.owner }} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        SAHİP
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'owner')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.frequency }} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        SIKLIK
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'frequency')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.lastTest }} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        SON TEST
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'lastTest')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.testResult }} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        TEST SONUCU
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'testResult')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.effectiveness }} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        ETKİNLİK
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'effectiveness')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.risks }} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        RİSK
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'risks')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.actions }} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        AKSİYON
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'actions')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.evidence }} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        KANIT
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'evidence')}
                                        />
                                    </th>
                                    <th style={{ width: columnWidths.regulations }} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap relative group">
                                        REGÜLASYON
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-300"
                                            onMouseDown={(e) => handleMouseDown(e, 'regulations')}
                                        />
                                    </th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Durum</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredControls.map((control) => {
                                    const hasAlert = control.hasOverdueTest || (control.effectivenessStatus === 'INEFFECTIVE' && control.linkedHighRisks > 0) || !control.hasEvidence;
                                    return (
                                        <tr key={control.id} className={`hover:bg-gray-50 transition-colors ${hasAlert ? 'bg-red-50/30' : ''}`}>
                                            <td className="px-3 py-2.5">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(control.id)}
                                                    onChange={() => toggleSelect(control.id)}
                                                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                                />
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-mono text-green-600">{control.controlId}</span>
                                                    {control.hasOverdueTest && <span className="text-orange-500" title="Test gecikmiş">⚠️</span>}
                                                    {control.effectivenessStatus === 'INEFFECTIVE' && control.linkedHighRisks > 0 && <span className="text-red-500" title="Kritik risk - Etkisiz kontrol">🔴</span>}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <Link href={`/controls/${control.id}`} className="font-medium text-gray-900 hover:text-green-600 line-clamp-1">
                                                    {control.name}
                                                </Link>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`text-xs px-2 py-0.5 rounded ${typeConfig[control.type]?.color}`}>
                                                    {typeConfig[control.type]?.label}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`text-xs px-2 py-0.5 rounded ${natureConfig[control.nature]?.color}`}>
                                                    {natureConfig[control.nature]?.label}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`text-xs px-2 py-0.5 rounded ${automationConfig[control.automation]?.color}`}>
                                                    {automationConfig[control.automation]?.label}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <p className="text-gray-900 text-xs">{control.owner.name}</p>
                                                <p className="text-gray-400 text-[10px]">{control.owner.department}</p>
                                            </td>
                                            <td className="px-3 py-2.5 text-center text-xs text-gray-600">
                                                {frequencyConfig[control.frequency]}
                                            </td>
                                            <td className="px-3 py-2.5 text-center text-xs text-gray-600">
                                                {formatDate(control.lastTestDate)}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`text-xs px-2 py-0.5 rounded ${effectivenessConfig[control.lastTestResult]?.color}`}>
                                                    {effectivenessConfig[control.lastTestResult]?.label}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${effectivenessConfig[control.effectivenessStatus]?.color}`}>
                                                    {effectivenessConfig[control.effectivenessStatus]?.label}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                {control.linkedRisks.length > 0 ? (
                                                    <div className="flex flex-col items-center justify-center gap-0.5">
                                                        <div className="flex flex-wrap justify-center gap-1">
                                                            {control.linkedRisks.slice(0, 2).map((risk, idx) => (
                                                                <Link
                                                                    key={risk.id}
                                                                    href={`/risks/${risk.id}`}
                                                                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                                                >
                                                                    {risk.riskId}{idx < Math.min(control.linkedRisks.length, 2) - 1 ? ',' : ''}
                                                                </Link>
                                                            ))}
                                                        </div>
                                                        {control.linkedRisks.length > 2 && (
                                                            <span
                                                                className="text-[10px] text-gray-500 cursor-help"
                                                                title={control.linkedRisks.slice(2).map(r => r.riskId).join(', ')}
                                                            >
                                                                (+{control.linkedRisks.length - 2} daha)
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                {control.openActions > 0 ? (
                                                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${control.hasOverdueActions ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                                        {control.openActions}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                {control.hasEvidence ? (
                                                    <span className="text-green-500">✓</span>
                                                ) : (
                                                    <span className="text-red-500">✗</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className="flex flex-wrap gap-1">
                                                    {control.linkedRegulations.slice(0, 2).map(reg => (
                                                        <span key={reg} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                                            {reg}
                                                        </span>
                                                    ))}
                                                    {control.linkedRegulations.length > 2 && (
                                                        <span className="text-[10px] text-gray-400">+{control.linkedRegulations.length - 2}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`inline-flex w-2 h-2 rounded-full ${control.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className="flex items-center justify-center gap-0.5">
                                                    <Link href={`/controls/${control.id}`} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Görüntüle">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    </Link>
                                                    <button className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Düzenle">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                    <Link href="/controls/testing" className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded" title="Test Et">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                                        </svg>
                                                    </Link>
                                                    <button className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded" title="Kanıt">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                        <p className="text-sm text-gray-500">
                            <span className="font-medium">{filteredControls.length}</span> kontrol gösteriliyor
                        </p>
                        <div className="flex items-center gap-1">
                            <button className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Önceki</button>
                            <button className="px-3 py-1.5 text-sm bg-green-600 text-white rounded">1</button>
                            <button className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">2</button>
                            <button className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Sonraki</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
