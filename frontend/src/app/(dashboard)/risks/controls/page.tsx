'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { PageHeader, DataTable, Button, Modal, Input, Textarea, Select, StatusBadge, FilterBar, getStatusVariant } from '@/components/ui';
import type { ColumnDef } from '@/components/ui';

interface RiskManagementControl {
    id: string;
    controlCode: string;
    name: string;
    description: string;
    effectiveness: number;
    frequency: number;
    automationLevel: number;
    controlScore: number | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    _count?: {
        riskMappings: number;
        tests: number;
    };
    riskMappings?: Array<{
        id: string;
        applicabilityScore: number;
        riskEntry: {
            id: string;
            riskId: string;
            riskTanimi: string;
        };
    }>;
}

interface RiskEntry {
    id: string;
    riskId: string;
    riskTanimi: string;
    dogalRiskSeviyesi?: string;
}

const SCORE_LABELS: Record<number, string> = {
    1: 'Çok Düşük',
    2: 'Düşük',
    3: 'Orta',
    4: 'Yüksek',
    5: 'Çok Yüksek',
};

export default function RiskManagementControlsPage() {
    const [controls, setControls] = useState<RiskManagementControl[]>([]);
    const [riskEntries, setRiskEntries] = useState<RiskEntry[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [showMappingModal, setShowMappingModal] = useState(false);
    
    // Selection
    const [selectedControl, setSelectedControl] = useState<RiskManagementControl | null>(null);
    const [editingControl, setEditingControl] = useState<Partial<RiskManagementControl> | null>(null);

    // Form
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        effectiveness: 3,
        frequency: 3,
        automationLevel: 3,
    });

    // Main Table State
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 15;

    // Mapping Modal State
    const [mappingSearch, setMappingSearch] = useState('');
    const [mappingPage, setMappingPage] = useState(1);
    const mappingPageSize = 10;

    const fetchControls = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.getRiskManagementControls() as { data: RiskManagementControl[] };
            setControls(response.data || []);
        } catch (error) {
            console.error('Failed to fetch controls:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchRiskEntries = useCallback(async () => {
        try {
            const response = await api.getRiskEntries() as { data: RiskEntry[] };
            setRiskEntries(response.data || []);
        } catch (error) {
            console.error('Failed to fetch risk entries:', error);
        }
    }, []);

    useEffect(() => {
        fetchControls();
        fetchRiskEntries();
    }, [fetchControls, fetchRiskEntries]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingControl?.id) {
                await api.updateRiskManagementControl(editingControl.id, formData);
            } else {
                await api.createRiskManagementControl(formData);
            }
            setShowAddModal(false);
            setEditingControl(null);
            setFormData({ name: '', description: '', effectiveness: 3, frequency: 3, automationLevel: 3 });
            fetchControls();
        } catch (error) {
            console.error('Failed to save control:', error);
            alert('Kontrol kaydedilemedi.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bu kontrolü silmek istediğinizden emin misiniz?')) return;
        try {
            await api.deleteRiskManagementControl(id);
            fetchControls();
        } catch (error) {
            console.error('Failed to delete control:', error);
            alert('Kontrol silinemedi.');
        }
    };

    const handleMapRisk = async (controlId: string, riskEntryId: string, applicabilityScore: number = 3) => {
        try {
            await api.mapRYKControlToRiskEntry(controlId, riskEntryId, applicabilityScore);
            fetchControls();
            
            // Update local state for immediate feedback
            setSelectedControl(prev => {
                if (!prev) return prev;
                const risk = riskEntries.find(r => r.id === riskEntryId);
                if (!risk) return prev;
                return {
                    ...prev,
                    riskMappings: [
                        ...(prev.riskMappings || []),
                        {
                            id: Date.now().toString(), // temp ID
                            applicabilityScore,
                            riskEntry: {
                                id: risk.id,
                                riskId: risk.riskId,
                                riskTanimi: risk.riskTanimi
                            }
                        }
                    ]
                };
            });
        } catch (error) {
            console.error('Failed to map control to risk:', error);
            alert('Eşleştirme başarısız.');
        }
    };

    const handleUnmapRisk = async (controlId: string, riskEntryId: string) => {
        try {
            await api.unmapRYKControlFromRiskEntry(controlId, riskEntryId);
            fetchControls();
            
            // Update local state
            setSelectedControl(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    riskMappings: (prev.riskMappings || []).filter(m => m.riskEntry.id !== riskEntryId)
                };
            });
        } catch (error) {
            console.error('Failed to unmap control from risk:', error);
        }
    };

    const openEditModal = (control: RiskManagementControl) => {
        setEditingControl(control);
        setFormData({
            name: control.name,
            description: control.description,
            effectiveness: control.effectiveness,
            frequency: control.frequency,
            automationLevel: control.automationLevel,
        });
        setShowAddModal(true);
    };

    const openMappingModal = (control: RiskManagementControl) => {
        setSelectedControl(control);
        setMappingSearch('');
        setMappingPage(1);
        setShowMappingModal(true);
    };

    // Calculate aggregate stats
    const totalControls = controls.length;
    const avgScore = controls.length > 0
        ? (controls.reduce((sum, c) => sum + (c.controlScore || 0), 0) / controls.length).toFixed(2)
        : '0.00';
    const mappedRisks = controls.reduce((sum, c) => sum + (c._count?.riskMappings || 0), 0);

    // Filter controls list
    const filteredControls = useMemo(() => {
        let result = controls;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(c => 
                c.name.toLowerCase().includes(query) || 
                c.controlCode.toLowerCase().includes(query)
            );
        }
        return result;
    }, [controls, searchQuery]);

    const paginatedControls = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredControls.slice(start, start + pageSize);
    }, [filteredControls, page, pageSize]);

    // Format badge based on score 1-5
    const getBadgeVariantForScore = (score: number) => {
        if (score >= 4) return 'success';
        if (score === 3) return 'warning';
        return 'critical';
    };

    const controlColumns: ColumnDef<RiskManagementControl>[] = useMemo(() => [
        {
            key: 'controlCode',
            header: 'Kontrol Kodu',
            render: (item) => <span className="font-medium text-blue-700">{item.controlCode}</span>,
            sortable: true,
        },
        {
            key: 'name',
            header: 'Kontrol Adı',
            render: (item) => <span className="font-medium text-gray-900">{item.name}</span>,
            sortable: true,
        },
        {
            key: 'effectiveness',
            header: 'Etkinlik',
            render: (item) => (
                <StatusBadge variant={getBadgeVariantForScore(item.effectiveness)}>
                    {item.effectiveness} - {SCORE_LABELS[item.effectiveness]}
                </StatusBadge>
            ),
        },
        {
            key: 'frequency',
            header: 'Sıklık',
            render: (item) => (
                <StatusBadge variant={getBadgeVariantForScore(item.frequency)}>
                    {item.frequency} - {SCORE_LABELS[item.frequency]}
                </StatusBadge>
            ),
        },
        {
            key: 'automationLevel',
            header: 'Otomasyon',
            render: (item) => (
                <StatusBadge variant={getBadgeVariantForScore(item.automationLevel)}>
                    {item.automationLevel} - {SCORE_LABELS[item.automationLevel]}
                </StatusBadge>
            ),
        },
        {
            key: 'controlScore',
            header: 'Kontrol Skoru',
            render: (item) => <span className="font-mono text-sm font-semibold text-indigo-700">{item.controlScore?.toFixed(2) || '-'}</span>,
        },
        {
            key: 'riskMappings',
            header: 'Eşleşen Risk',
            render: (item) => <span className="font-medium px-2 py-1 bg-gray-100 rounded text-xs">{item._count?.riskMappings || 0}</span>,
        },
        {
            key: 'actions',
            header: 'İşlemler',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="xs" onClick={() => openMappingModal(item)} title="Risk Eşle">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => openEditModal(item)} title="Düzenle">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => handleDelete(item.id)} title="Sil">
                        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </Button>
                </div>
            )
        }
    ], []);

    // Filter and sort risks for mapping modal (Mapped ones on top, then search query)
    const processedRisksForMapping = useMemo(() => {
        if (!selectedControl) return [];
        
        const mappedRiskIds = new Set((selectedControl.riskMappings || []).map(m => m.riskEntry.id));
        
        let filtered = riskEntries;
        if (mappingSearch) {
            const query = mappingSearch.toLowerCase();
            filtered = filtered.filter(r => 
                r.riskTanimi.toLowerCase().includes(query) || 
                r.riskId.toLowerCase().includes(query)
            );
        }
        
        // Sort: Mapped ones first, then by risk ID
        return filtered.sort((a, b) => {
            const aMapped = mappedRiskIds.has(a.id);
            const bMapped = mappedRiskIds.has(b.id);
            if (aMapped && !bMapped) return -1;
            if (!aMapped && bMapped) return 1;
            return a.riskId.localeCompare(b.riskId);
        });
    }, [riskEntries, selectedControl, mappingSearch]);

    const paginatedMappingRisks = useMemo(() => {
        const start = (mappingPage - 1) * mappingPageSize;
        return processedRisksForMapping.slice(start, start + mappingPageSize);
    }, [processedRisksForMapping, mappingPage, mappingPageSize]);

    const mappingColumns: ColumnDef<RiskEntry>[] = useMemo(() => [
        {
            key: 'riskId',
            header: 'Risk Kodu',
            render: (item) => <span className="font-medium text-slate-700">{item.riskId}</span>,
        },
        {
            key: 'riskTanimi',
            header: 'Risk Tanımı',
            render: (item) => <span className="text-sm truncate max-w-[200px] block" title={item.riskTanimi}>{item.riskTanimi}</span>,
        },
        {
            key: 'status',
            header: 'Durum',
            render: (item) => {
                const isMapped = selectedControl?.riskMappings?.some(m => m.riskEntry.id === item.id);
                return isMapped ? (
                    <StatusBadge variant="success">Eşlendi</StatusBadge>
                ) : (
                    <StatusBadge variant="neutral">Eşlenmedi</StatusBadge>
                );
            }
        },
        {
            key: 'action',
            header: '',
            render: (item) => {
                const isMapped = selectedControl?.riskMappings?.some(m => m.riskEntry.id === item.id);
                return isMapped ? (
                    <Button variant="danger" size="xs" onClick={() => handleUnmapRisk(selectedControl!.id, item.id)}>
                        Kaldır
                    </Button>
                ) : (
                    <Button variant="primary" size="xs" onClick={() => handleMapRisk(selectedControl!.id, item.id)}>
                        Eşle
                    </Button>
                );
            }
        }
    ], [selectedControl]);

    return (
        <div className="flex flex-col h-full bg-gray-50/50">
            <div className="px-8 pt-8">
                <PageHeader
                    title="Risk Yönetimi Kontrolleri (RYK)"
                    description="Risk Yönetimi ekibinin kontrollerini tanımlayın ve risklerle eşleştirin."
                    breadcrumbs={[
                        { label: 'Risk Yönetimi', href: '/risks' },
                        { label: 'RYK' }
                    ]}
                    actions={
                        <Button
                            variant="primary"
                            onClick={() => {
                                setEditingControl(null);
                                setFormData({ name: '', description: '', effectiveness: 3, frequency: 3, automationLevel: 3 });
                                setShowAddModal(true);
                            }}
                            icon={
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            }
                        >
                            Yeni RYK Ekle
                        </Button>
                    }
                />

                {/* KPIs */}
                <div className="flex items-center gap-6 py-3 px-5 mb-6 bg-white border border-slate-200 rounded-lg shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 font-medium">Toplam Kontrol</p>
                            <p className="text-lg font-bold text-slate-800">{totalControls}</p>
                        </div>
                    </div>
                    <div className="w-px h-10 bg-slate-200" />
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 font-medium">Ortalama Skor</p>
                            <p className="text-lg font-bold text-slate-800">{avgScore}</p>
                        </div>
                    </div>
                    <div className="w-px h-10 bg-slate-200" />
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 font-medium">Eşleşen Risk</p>
                            <p className="text-lg font-bold text-slate-800">{mappedRisks}</p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="mb-4 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                    <FilterBar
                        searchValue={searchQuery}
                        onSearchChange={(val) => { setSearchQuery(val); setPage(1); }}
                        searchPlaceholder="Kontrol kodu veya adı ile ara..."
                    />
                </div>
            </div>

            {/* Controls Table */}
            <div className="px-8 pb-8 flex-1">
                <DataTable
                    columns={controlColumns}
                    data={paginatedControls}
                    rowKey={(r) => r.id}
                    loading={loading}
                    totalCount={filteredControls.length}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                />
            </div>

            {/* Add/Edit Modal */}
            <Modal
                open={showAddModal}
                onClose={() => setShowAddModal(false)}
                title={editingControl ? 'RYK Kontrol Düzenle' : 'Yeni RYK Kontrol'}
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setShowAddModal(false)}>İptal</Button>
                        <Button variant="primary" onClick={handleSubmit}>{editingControl ? 'Güncelle' : 'Kaydet'}</Button>
                    </>
                }
            >
                <div className="space-y-4 py-2">
                    <Input
                        label="Kontrol Adı *"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                    />
                    <Textarea
                        label="Açıklama"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={3}
                    />
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Etkinlik (1-5)</label>
                            <Select
                                value={formData.effectiveness.toString()}
                                onChange={(e) => setFormData({ ...formData, effectiveness: parseInt(e.target.value) })}
                                options={[1, 2, 3, 4, 5].map(v => ({ value: v.toString(), label: `${v} - ${SCORE_LABELS[v]}` }))}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Sıklık (1-5)</label>
                            <Select
                                value={formData.frequency.toString()}
                                onChange={(e) => setFormData({ ...formData, frequency: parseInt(e.target.value) })}
                                options={[1, 2, 3, 4, 5].map(v => ({ value: v.toString(), label: `${v} - ${SCORE_LABELS[v]}` }))}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Otomasyon (1-5)</label>
                            <Select
                                value={formData.automationLevel.toString()}
                                onChange={(e) => setFormData({ ...formData, automationLevel: parseInt(e.target.value) })}
                                options={[1, 2, 3, 4, 5].map(v => ({ value: v.toString(), label: `${v} - ${SCORE_LABELS[v]}` }))}
                            />
                        </div>
                    </div>
                    <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded-lg mt-2">
                        <p className="text-sm text-indigo-800">
                            <strong>Hesaplanan Kontrol Skoru:</strong>{' '}
                            <span className="font-mono bg-white px-2 py-0.5 rounded shadow-sm ml-1 text-indigo-700 font-semibold">
                                {((formData.effectiveness * 0.5) + (formData.frequency * 0.3) + (formData.automationLevel * 0.2)).toFixed(2)}
                            </span>
                        </p>
                        <p className="text-xs text-indigo-600/70 mt-1">
                            Formül: (Etkinlik × 0.5) + (Sıklık × 0.3) + (Otomasyon × 0.2)
                        </p>
                    </div>
                </div>
            </Modal>

            {/* Risk Mapping Modal */}
            <Modal
                open={showMappingModal}
                onClose={() => setShowMappingModal(false)}
                title="Risk Eşleştirme"
                description={selectedControl ? `${selectedControl.controlCode} - ${selectedControl.name}` : ''}
                size="lg"
            >
                <div className="flex flex-col gap-4 py-2 min-h-[400px]">
                    <FilterBar
                        searchValue={mappingSearch}
                        onSearchChange={(val) => { setMappingSearch(val); setMappingPage(1); }}
                        searchPlaceholder="Risk kodu veya tanımı ile ara..."
                    />
                    
                    <div className="border border-slate-200 rounded-lg overflow-hidden flex-1">
                        <DataTable
                            columns={mappingColumns}
                            data={paginatedMappingRisks}
                            rowKey={(r) => r.id}
                            totalCount={processedRisksForMapping.length}
                            page={mappingPage}
                            pageSize={mappingPageSize}
                            onPageChange={setMappingPage}
                        />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
