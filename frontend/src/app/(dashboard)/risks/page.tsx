'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

// Types
interface Risk {
    id: string;
    riskId: string;
    name: string;
    description: string;
    category: string;
    owner: { name: string; department: string };
    inherentScore: number;
    residualScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    appetiteStatus: 'WITHIN' | 'EXCEEDED';
    status: 'IDENTIFIED' | 'ASSESSED' | 'TREATED' | 'MONITORED' | 'CLOSED';
    linkedControls: { id: string; name: string }[];
    linkedFindings: { id: string; title: string }[];
    lastReviewDate: string;
}

// Category prefixes for Risk ID generation
const CATEGORY_PREFIXES: Record<string, string> = {
    'BT Riski': 'BT',
    'Uyum Riski': 'UR',
    'Operasyonel Risk': 'OPR',
    'Stratejik Risk': 'SR',
    'Finansal Risk': 'FR',
};

// Counter for unique IDs (in production, this would be from database)
let riskCounters: Record<string, number> = {
    'BT': 6,
    'UR': 2,
    'OPR': 3,
    'SR': 1,
    'FR': 1,
};

// Generate unique Risk ID based on category
const generateRiskId = (category: string): string => {
    const prefix = CATEGORY_PREFIXES[category] || 'RSK';
    const year = new Date().getFullYear();
    riskCounters[prefix] = (riskCounters[prefix] || 0) + 1;
    const counter = String(riskCounters[prefix]).padStart(4, '0');
    return `${prefix}-${year}-${counter}`;
};

// Configs
const CATEGORIES = ['BT Riski', 'Uyum Riski', 'Operasyonel Risk', 'Stratejik Risk', 'Finansal Risk'];

const CATEGORY_COLORS: Record<string, string> = {
    'BT Riski': 'bg-blue-100 text-blue-700',
    'Uyum Riski': 'bg-purple-100 text-purple-700',
    'Operasyonel Risk': 'bg-amber-100 text-amber-700',
    'Stratejik Risk': 'bg-green-100 text-green-700',
    'Finansal Risk': 'bg-red-100 text-red-700',
};

const LEVEL_CONFIG: Record<string, { label: string; color: string }> = {
    LOW: { label: 'Düşük', color: 'bg-green-100 text-green-700' },
    MEDIUM: { label: 'Orta', color: 'bg-yellow-100 text-yellow-700' },
    HIGH: { label: 'Yüksek', color: 'bg-orange-100 text-orange-700' },
    CRITICAL: { label: 'Kritik', color: 'bg-red-100 text-red-700' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    IDENTIFIED: { label: 'Tanımlandı', color: 'bg-gray-100 text-gray-600' },
    ASSESSED: { label: 'Değerlendirildi', color: 'bg-blue-100 text-blue-600' },
    TREATED: { label: 'Tedavi Edildi', color: 'bg-emerald-100 text-emerald-600' },
    MONITORED: { label: 'İzleniyor', color: 'bg-indigo-100 text-indigo-600' },
    CLOSED: { label: 'Kapatıldı', color: 'bg-gray-200 text-gray-500' },
};

const getScoreColor = (score: number) => {
    if (score >= 20) return 'bg-red-500 text-white';
    if (score >= 15) return 'bg-orange-500 text-white';
    if (score >= 10) return 'bg-yellow-500 text-white';
    if (score >= 5) return 'bg-green-500 text-white';
    return 'bg-gray-400 text-white';
};

const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
};

export default function RiskInventoryPage() {
    const [risks, setRisks] = useState<Risk[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [levelFilter, setLevelFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showImportModal, setShowImportModal] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [importPreview, setImportPreview] = useState<string[][]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Bulk selection state
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

    // New risk form state
    const [newRisk, setNewRisk] = useState({
        name: '', category: 'BT Riski', ownerName: '', ownerDept: '',
        inherentScore: 12, residualScore: 6, riskLevel: 'MEDIUM' as const, status: 'IDENTIFIED' as const
    });

    // Fetch risks from API
    useEffect(() => {
        const fetchRisks = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = await api.getRisks() as any;
                const riskList = Array.isArray(data) ? data : (data.data || []);
                // Transform API data to match frontend interface
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const transformedRisks: Risk[] = riskList.map((r: any) => ({
                    id: String(r.id),
                    riskId: String(r.riskId || ''),
                    name: String(r.name || ''),
                    description: String(r.description || ''),
                    category: String((r.category as Record<string, unknown>)?.name || r.categoryId || ''),
                    owner: {
                        name: `${(r.owner as Record<string, unknown>)?.firstName || ''} ${(r.owner as Record<string, unknown>)?.lastName || ''}`.trim() || 'Bilinmiyor',
                        department: String((r.owner as Record<string, unknown>)?.department || '')
                    },
                    inherentScore: Number(r.inherentRiskScore || r.inherentScore || 0),
                    residualScore: Number(r.residualRiskScore || r.residualScore || 0),
                    riskLevel: (r.residualRiskScore as number) >= 20 ? 'CRITICAL' : (r.residualRiskScore as number) >= 15 ? 'HIGH' : (r.residualRiskScore as number) >= 8 ? 'MEDIUM' : 'LOW',
                    appetiteStatus: (r.isAboveAppetite ? 'EXCEEDED' : 'WITHIN') as 'WITHIN' | 'EXCEEDED',
                    status: (r.status || 'IDENTIFIED') as Risk['status'],
                    linkedControls: ((r.controls || r.controlMappings) as Array<Record<string, unknown>> || []).map((cm) => {
                        // Handle both direct control object and nested {control: {...}} structure
                        const control = cm.control || cm;
                        return {
                            id: String((control as Record<string, unknown>)?.controlId || ''),
                            name: String((control as Record<string, unknown>)?.name || '')
                        };
                    }),
                    // Extract findings from both direct relation AND control chain
                    linkedFindings: (() => {
                        const findingsSet = new Map<string, { id: string; title: string }>();

                        // Add direct findings
                        ((r.findings as Array<Record<string, unknown>>) || []).forEach((f) => {
                            const id = String(f.findingId || '');
                            if (id) findingsSet.set(id, { id, title: String(f.description || '') });
                        });

                        // Add findings from controls chain (Risk → Control → Finding)
                        ((r.controls || r.controlMappings) as Array<Record<string, unknown>> || []).forEach((cm) => {
                            const control = (cm.control || cm) as Record<string, unknown>;
                            const controlFindings = (control?.findings as Array<Record<string, unknown>>) || [];
                            controlFindings.forEach((f) => {
                                const id = String(f.findingId || '');
                                if (id) findingsSet.set(id, { id, title: String(f.description || '').substring(0, 50) });
                            });
                        });

                        return Array.from(findingsSet.values());
                    })(),
                    lastReviewDate: r.updatedAt ? new Date(r.updatedAt as string).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
                }));
                setRisks(transformedRisks);
            } catch (err) {
                console.error('Failed to fetch risks:', err);
                setRisks([]);
            } finally {
                setLoading(false);
            }
        };
        fetchRisks();
    }, []);

    // Filter
    const filteredRisks = risks.filter(r => {
        if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.riskId.toLowerCase().includes(search.toLowerCase())) return false;
        if (categoryFilter && r.category !== categoryFilter) return false;
        if (levelFilter && r.riskLevel !== levelFilter) return false;
        if (statusFilter && r.status !== statusFilter) return false;
        return true;
    });

    // KPIs
    const totalRisks = risks.length;
    const highRisks = risks.filter(r => r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL').length;
    const exceededAppetite = risks.filter(r => r.appetiteStatus === 'EXCEEDED').length;

    // Export Template
    const handleExportTemplate = () => {
        const headers = ['Risk ID (Otomatik)', 'Risk Adı', 'Kategori', 'Sahip Adı', 'Sahip Departman', 'Doğal Skor', 'Rezidüel Skor', 'Seviye (LOW/MEDIUM/HIGH/CRITICAL)', 'İştah Durumu (WITHIN/EXCEEDED)', 'Durum'];
        const csv = headers.join(';') + '\n';
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'risk_envanter_sablonu.csv';
        a.click();
        setShowExportMenu(false);
    };

    // Export Data
    const handleExportData = () => {
        const headers = ['Risk ID', 'Risk Adı', 'Kategori', 'Sahip Adı', 'Sahip Departman', 'Doğal Skor', 'Rezidüel Skor', 'Seviye', 'İştah Durumu', 'Durum', 'İlişkili Kontrol', 'İlişkili Bulgu', 'Son İnceleme'];
        const rows = risks.map(r => [
            r.riskId, r.name, r.category, r.owner.name, r.owner.department,
            r.inherentScore, r.residualScore, r.riskLevel, r.appetiteStatus, r.status,
            r.linkedControls.map(c => c.id).join(','),
            r.linkedFindings.map(f => f.id).join(','),
            r.lastReviewDate
        ]);
        const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'risk_envanteri.csv';
        a.click();
        setShowExportMenu(false);
    };

    // Import handling
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const lines = text.split('\n').filter(l => l.trim());
            const parsed = lines.map(l => l.split(';').map(c => c.trim().replace(/"/g, '')));
            setImportPreview(parsed.slice(0, 6));
        };
        reader.readAsText(file);
        setShowImportModal(true);
    };

    const handleImportConfirm = () => {
        const newRisks = importPreview.slice(1).map((row, idx) => {
            const category = row[2] || 'BT Riski';
            return {
                id: `imported-${Date.now()}-${idx}`,
                riskId: generateRiskId(category),
                name: row[1] || '',
                description: '',
                category,
                owner: { name: row[3] || '', department: row[4] || '' },
                inherentScore: parseInt(row[5]) || 12,
                residualScore: parseInt(row[6]) || 6,
                riskLevel: (row[7] as Risk['riskLevel']) || 'MEDIUM',
                appetiteStatus: (row[8] as Risk['appetiteStatus']) || 'WITHIN',
                status: (row[9] as Risk['status']) || 'IDENTIFIED',
                linkedControls: [],
                linkedFindings: [],
                lastReviewDate: new Date().toISOString().split('T')[0],
            };
        });
        setRisks(prev => [...prev, ...newRisks]);
        setShowImportModal(false);
        setImportPreview([]);
    };

    // Add risk
    const handleAddRisk = async () => {
        try {
            // Find category ID from backend (we'll use the name for now)
            const riskData = {
                name: newRisk.name,
                description: '',
                categoryId: newRisk.category, // Backend will handle category name lookup
                inherentProbability: Math.ceil(newRisk.inherentScore / 5),
                inherentImpact: 5,
            };

            // Call API to create risk
            await api.createRisk(riskData);

            // Refresh risks from API
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = await api.getRisks() as any;
            const riskList = Array.isArray(data) ? data : (data.data || []);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const transformedRisks: Risk[] = riskList.map((r: any) => ({
                id: String(r.id),
                riskId: String(r.riskId || ''),
                name: String(r.name || ''),
                description: String(r.description || ''),
                category: String(r.category?.name || r.categoryId || ''),
                owner: {
                    name: `${r.owner?.firstName || ''} ${r.owner?.lastName || ''}`.trim() || 'Bilinmiyor',
                    department: String(r.owner?.department || '')
                },
                inherentScore: Number(r.inherentRiskScore || r.inherentScore || 0),
                residualScore: Number(r.residualRiskScore || r.residualScore || 0),
                riskLevel: (r.residualRiskScore as number) >= 20 ? 'CRITICAL' : (r.residualRiskScore as number) >= 15 ? 'HIGH' : (r.residualRiskScore as number) >= 8 ? 'MEDIUM' : 'LOW',
                appetiteStatus: (r.isAboveAppetite ? 'EXCEEDED' : 'WITHIN') as 'WITHIN' | 'EXCEEDED',
                status: (r.status || 'IDENTIFIED') as Risk['status'],
                linkedControls: (r.controls || r.controlMappings || []).map((cm: { control?: { controlId?: string; name?: string; findings?: Array<{ findingId?: string; description?: string }> }; controlId?: string; name?: string }) => {
                    const control = cm.control || cm;
                    return {
                        id: String(control?.controlId || ''),
                        name: String(control?.name || '')
                    };
                }),
                // Extract findings from both direct relation AND control chain
                linkedFindings: (() => {
                    const findingsSet = new Map<string, { id: string; title: string }>();

                    // Add direct findings
                    (r.findings || []).forEach((f: { findingId?: string; description?: string }) => {
                        const id = String(f.findingId || '');
                        if (id) findingsSet.set(id, { id, title: String(f.description || '') });
                    });

                    // Add findings from controls chain (Risk → Control → Finding)
                    (r.controls || r.controlMappings || []).forEach((cm: { control?: { findings?: Array<{ findingId?: string; description?: string }> } }) => {
                        const control = cm.control || cm;
                        const controlFindings = (control as { findings?: Array<{ findingId?: string; description?: string }> })?.findings || [];
                        controlFindings.forEach((f) => {
                            const id = String(f.findingId || '');
                            if (id) findingsSet.set(id, { id, title: String(f.description || '').substring(0, 50) });
                        });
                    });

                    return Array.from(findingsSet.values());
                })(),
                lastReviewDate: r.updatedAt ? new Date(r.updatedAt as string).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
            }));
            setRisks(transformedRisks);

            // Reset form and close modal
            setNewRisk({ name: '', category: 'BT Riski', ownerName: '', ownerDept: '', inherentScore: 12, residualScore: 6, riskLevel: 'MEDIUM', status: 'IDENTIFIED' });
            setShowAddModal(false);
        } catch (err) {
            console.error('Failed to create risk:', err);
            const errorMessage = err instanceof Error ? err.message : 'Bilinmeyen hata';
            alert(`Risk oluşturulamadı: ${errorMessage}`);
        }
    };

    const clearFilters = () => {
        setSearch(''); setCategoryFilter(''); setLevelFilter(''); setStatusFilter('');
    };

    // Bulk selection handlers
    const toggleSelectAll = () => {
        if (selectedItems.size === filteredRisks.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(filteredRisks.map(r => r.id)));
        }
    };

    const toggleSelectItem = (id: string) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedItems(newSelected);
    };

    const handleBulkDelete = async () => {
        if (selectedItems.size === 0) return;
        if (!confirm(`${selectedItems.size} risk silinecek. Devam etmek istiyor musunuz?`)) return;

        try {
            for (const id of selectedItems) {
                await api.deleteRisk(id);
            }
            setRisks(prev => prev.filter(r => !selectedItems.has(r.id)));
            setSelectedItems(new Set());
        } catch (err) {
            console.error('Failed to delete risks:', err);
            alert('Silme işlemi başarısız: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
        }
    };

    const handleBulkCopy = () => {
        if (selectedItems.size === 0) return;
        const selectedRisks = risks.filter(r => selectedItems.has(r.id));
        const copyText = selectedRisks.map(r =>
            `${r.riskId}\t${r.name}\t${r.category}\t${r.owner.name}\t${r.inherentScore}\t${r.residualScore}\t${r.riskLevel}\t${r.status}`
        ).join('\n');

        navigator.clipboard.writeText(copyText).then(() => {
            alert(`${selectedItems.size} risk panoya kopyalandı`);
        }).catch(() => {
            alert('Kopyalama başarısız');
        });
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1800px] mx-auto px-6 py-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Risk Envanteri</h1>
                        <p className="text-gray-500 mt-0.5">Kurumsal riskleri yönetin ve izleyin</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="file" ref={fileInputRef} accept=".csv" onChange={handleFileChange} className="hidden" />
                        <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            İçe Aktar
                        </button>
                        <div className="relative">
                            <button onClick={() => setShowExportMenu(!showExportMenu)} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Dışa Aktar
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {showExportMenu && (
                                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                                    <button onClick={handleExportTemplate} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50">Boş Şablon İndir</button>
                                    <button onClick={handleExportData} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50">Mevcut Verileri Dışa Aktar</button>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setShowAddModal(true)} className="px-5 py-2 bg-[#1e3a5f] text-white font-medium rounded-lg hover:bg-[#152a45] flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Yeni Risk
                        </button>
                    </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-sm text-gray-500">Toplam Risk</p>
                        <p className="text-2xl font-bold text-gray-900">{totalRisks}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-red-200">
                        <p className="text-sm text-red-600">Yüksek/Kritik</p>
                        <p className="text-2xl font-bold text-red-600">{highRisks}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-orange-200">
                        <p className="text-sm text-orange-600">İştah Aşımı</p>
                        <p className="text-2xl font-bold text-orange-600">{exceededAppetite}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-green-200">
                        <p className="text-sm text-green-600">İştah Dahilinde</p>
                        <p className="text-2xl font-bold text-green-600">{totalRisks - exceededAppetite}</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-lg p-4 border border-gray-200 mb-4">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1 max-w-md">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input type="text" placeholder="Risk ID veya Risk Adı ara..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                            <option value="">Tüm Kategoriler</option>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                            <option value="">Tüm Seviyeler</option>
                            <option value="LOW">Düşük</option>
                            <option value="MEDIUM">Orta</option>
                            <option value="HIGH">Yüksek</option>
                            <option value="CRITICAL">Kritik</option>
                        </select>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                            <option value="">Tüm Durumlar</option>
                            <option value="IDENTIFIED">Tanımlandı</option>
                            <option value="ASSESSED">Değerlendirildi</option>
                            <option value="TREATED">Tedavi Edildi</option>
                            <option value="MONITORED">İzleniyor</option>
                        </select>
                        <button onClick={clearFilters} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Temizle</button>
                    </div>
                </div>

                {/* Bulk Action Bar */}
                {selectedItems.size > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center justify-between relative z-50">
                        <div className="flex items-center gap-2">
                            <span className="text-blue-700 font-medium">{selectedItems.size} öğe seçildi</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={handleBulkCopy} className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                Kopyala
                            </button>
                            <button onClick={handleBulkDelete} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Sil
                            </button>
                            <button onClick={() => setSelectedItems(new Set())} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
                                Seçimi Kaldır
                            </button>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-3 py-3 text-center w-10">
                                        <input
                                            type="checkbox"
                                            checked={filteredRisks.length > 0 && selectedItems.size === filteredRisks.length}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        />
                                    </th>
                                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Risk ID</th>
                                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase min-w-[200px]">Risk Adı</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Kategori</th>
                                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Risk Sahibi</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Doğal</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Rezidüel</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Seviye</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">İştah</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Durum</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">İlişkili Kontrol</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">İlişkili Bulgu</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Son İnceleme</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredRisks.map(risk => (
                                    <tr key={risk.id} className={`hover:bg-gray-50 group ${selectedItems.has(risk.id) ? 'bg-blue-50' : ''}`}>
                                        <td className="px-3 py-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.has(risk.id)}
                                                onChange={() => toggleSelectItem(risk.id)}
                                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                            />
                                        </td>
                                        <td className="px-3 py-3">
                                            <Link href={`/risks/${risk.id}`} className="text-blue-700 font-medium hover:underline">{risk.riskId}</Link>
                                            {risk.appetiteStatus === 'EXCEEDED' && <span className="ml-1 w-2 h-2 bg-red-500 rounded-full inline-block" title="İştah Aşımı" />}
                                        </td>
                                        <td className="px-3 py-3 text-gray-900 font-medium">{risk.name}</td>
                                        <td className="px-3 py-3 text-center">
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${CATEGORY_COLORS[risk.category] || 'bg-gray-100 text-gray-700'}`}>
                                                {risk.category}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3">
                                            <p className="text-gray-900">{risk.owner.name}</p>
                                            <p className="text-xs text-gray-500">{risk.owner.department}</p>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${getScoreColor(risk.inherentScore)}`}>
                                                {risk.inherentScore}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${getScoreColor(risk.residualScore)}`}>
                                                {risk.residualScore}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${LEVEL_CONFIG[risk.riskLevel].color}`}>
                                                {LEVEL_CONFIG[risk.riskLevel].label}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            {risk.appetiteStatus === 'WITHIN' ? (
                                                <span className="text-green-600" title="İştah Dahilinde">✓</span>
                                            ) : (
                                                <span className="text-red-600" title="İştah Aşımı">⚠</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${STATUS_CONFIG[risk.status].color}`}>
                                                {STATUS_CONFIG[risk.status].label}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            {risk.linkedControls.length > 0 ? (
                                                <div className="flex flex-col gap-0.5">
                                                    {risk.linkedControls.map(ctrl => (
                                                        <Link
                                                            key={ctrl.id}
                                                            href={`/controls/${ctrl.id}`}
                                                            className="text-blue-600 hover:underline text-sm font-medium"
                                                            title={ctrl.name}
                                                        >
                                                            {ctrl.id}
                                                        </Link>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            {risk.linkedFindings.length > 0 ? (
                                                <div className="flex flex-col gap-0.5">
                                                    {risk.linkedFindings.map(finding => (
                                                        <Link
                                                            key={finding.id}
                                                            href={`/findings/${finding.id}`}
                                                            className="text-purple-600 hover:underline text-sm font-medium"
                                                            title={finding.title}
                                                        >
                                                            {finding.id}
                                                        </Link>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-center text-gray-600">{formatDate(risk.lastReviewDate)}</td>
                                        <td className="px-3 py-3">
                                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Link href={`/risks/${risk.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Görüntüle">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                </Link>
                                                <Link href={`/risks/${risk.id}/edit`} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Düzenle">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                        <p className="text-sm text-gray-500"><span className="font-medium">{filteredRisks.length}</span> risk gösteriliyor</p>
                    </div>
                </div>
            </div>

            {/* Add Risk Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl w-full max-w-lg mx-4 shadow-2xl">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">Yeni Risk Ekle</h2>
                            <p className="text-sm text-gray-500">Kategori bazlı otomatik eşsiz ID atanacak</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Risk Adı *</label>
                                <input type="text" value={newRisk.name} onChange={e => setNewRisk({ ...newRisk, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="Risk başlığı" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori *</label>
                                <select value={newRisk.category} onChange={e => setNewRisk({ ...newRisk, category: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg">
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">ID formatı: {CATEGORY_PREFIXES[newRisk.category]}-2025-XXXX</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Sahip Adı</label>
                                    <input type="text" value={newRisk.ownerName} onChange={e => setNewRisk({ ...newRisk, ownerName: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Departman</label>
                                    <input type="text" value={newRisk.ownerDept} onChange={e => setNewRisk({ ...newRisk, ownerDept: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Doğal Skor</label>
                                    <input type="number" value={newRisk.inherentScore} onChange={e => setNewRisk({ ...newRisk, inherentScore: parseInt(e.target.value) })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" min={1} max={25} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Rezidüel Skor</label>
                                    <input type="number" value={newRisk.residualScore} onChange={e => setNewRisk({ ...newRisk, residualScore: parseInt(e.target.value) })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" min={1} max={25} />
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-gray-600">İptal</button>
                            <button onClick={handleAddRisk} disabled={!newRisk.name} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg disabled:bg-gray-300">Risk Ekle</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl w-full max-w-3xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">Risk Verisi İçe Aktar</h2>
                            <p className="text-sm text-gray-500">Her risk kategorisine göre otomatik eşsiz ID alacak</p>
                        </div>
                        <div className="p-6">
                            {importPreview.length > 0 && (
                                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                {importPreview[0]?.map((h, i) => (
                                                    <th key={i} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {importPreview.slice(1).map((row, ri) => (
                                                <tr key={ri}>
                                                    {row.map((c, ci) => (
                                                        <td key={ci} className="px-3 py-2 text-gray-700">{c}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                                <p className="text-sm text-blue-800">
                                    <strong>{importPreview.length - 1}</strong> risk import edilecek. Her birine kategorisine göre eşsiz ID atanacak:
                                </p>
                                <ul className="text-xs text-blue-600 mt-1 space-y-0.5">
                                    <li>• BT Riski → BT-2025-XXXX</li>
                                    <li>• Uyum Riski → UR-2025-XXXX</li>
                                    <li>• Operasyonel Risk → OPR-2025-XXXX</li>
                                    <li>• Stratejik Risk → SR-2025-XXXX</li>
                                    <li>• Finansal Risk → FR-2025-XXXX</li>
                                </ul>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                            <button onClick={() => { setShowImportModal(false); setImportPreview([]); }} className="px-4 py-2 text-sm text-gray-600">İptal</button>
                            <button onClick={handleImportConfirm} className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700">İçe Aktar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
