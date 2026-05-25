'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/auth';
import { PageHeader, FilterBar, DataTable, StatusBadge, getStatusVariant, Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { RiskDetailDrawer } from './components/RiskDetailDrawer';
import { RiskFormModal } from './components/RiskFormModal';
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

export default function RiskInventoryPage() {
    const { hasPermission } = useAuth();
    const { success, error: showError } = useToast();
    
    // Permissions
    const canCreate = hasPermission('risk:create');
    const canEdit = hasPermission('risk:update');
    const canDelete = hasPermission('risk:delete');

    // State
    const [risks, setRisks] = useState<Risk[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    
    // UI State
    const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRisk, setEditingRisk] = useState<Risk | null>(null);

    // Fetch Risks
    const fetchRisks = async () => {
        setLoading(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = await api.getRisks() as any;
            const riskList = Array.isArray(data) ? data : (data.data || []);
            
            // Transform API data
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
                    const control = cm.control || cm;
                    return {
                        id: String((control as Record<string, unknown>)?.controlId || ''),
                        name: String((control as Record<string, unknown>)?.name || '')
                    };
                }),
                linkedFindings: (() => {
                    const findingsSet = new Map<string, { id: string; title: string }>();
                    ((r.findings as Array<Record<string, unknown>>) || []).forEach((f) => {
                        const id = String(f.findingId || '');
                        if (id) findingsSet.set(id, { id, title: String(f.description || '') });
                    });
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
            showError('Hata', 'Riskler yüklenirken bir hata oluştu');
            setRisks([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRisks();
    }, []);

    // Derived State: Filtering
    const filteredRisks = useMemo(() => {
        return risks.filter(risk => {
            // Text Search
            if (searchQuery) {
                const searchLower = searchQuery.toLowerCase();
                const matchesSearch = 
                    risk.name.toLowerCase().includes(searchLower) || 
                    risk.riskId.toLowerCase().includes(searchLower);
                if (!matchesSearch) return false;
            }

            // Dropdown Filters
            const category = activeFilters['category'];
            if (category && category !== 'all' && category !== risk.category) return false;

            const level = activeFilters['level'];
            if (level && level !== 'all' && level !== risk.riskLevel) return false;

            const status = activeFilters['status'];
            if (status && status !== 'all' && status !== risk.status) return false;

            return true;
        });
    }, [risks, searchQuery, activeFilters]);

    // Handlers
    const handleRowClick = (risk: Risk) => {
        setSelectedRisk(risk);
        setIsDrawerOpen(true);
    };

    const handleCreateClick = () => {
        setEditingRisk(null);
        setIsModalOpen(true);
    };

    const handleEditRisk = (risk: Risk) => {
        setEditingRisk(risk);
        setIsModalOpen(true);
    };

    const handleDeleteRisk = async (risk: Risk) => {
        try {
            await api.deleteRisk(risk.id);
            success('Başarılı', 'Risk başarıyla silindi');
            fetchRisks();
        } catch (err) {
            console.error('Failed to delete risk:', err);
            showError('Hata', 'Risk silinirken bir hata oluştu');
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleFormSubmit = async (data: any) => {
        try {
            if (editingRisk) {
                // Update Risk
                const updateData = {
                    name: data.name,
                    description: data.description,
                    // In a real app we'd map this to ID, assuming API handles it for now
                    categoryId: data.category,
                    inherentProbability: data.inherentProbability,
                    inherentImpact: data.inherentImpact,
                };
                await api.updateRisk(editingRisk.id, updateData);
                success('Başarılı', 'Risk başarıyla güncellendi');
            } else {
                // Create Risk
                const riskData = {
                    name: data.name,
                    description: data.description,
                    categoryId: data.category,
                    inherentProbability: data.inherentProbability,
                    inherentImpact: data.inherentImpact,
                };
                await api.createRisk(riskData);
                success('Başarılı', 'Yeni risk başarıyla eklendi');
            }
            setIsModalOpen(false);
            fetchRisks();
        } catch (err) {
            console.error('Failed to save risk:', err);
            showError('Hata', 'Risk kaydedilirken bir hata oluştu');
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 20) return 'text-red-600 bg-red-50 ring-1 ring-inset ring-red-500/10';
        if (score >= 15) return 'text-orange-600 bg-orange-50 ring-1 ring-inset ring-orange-500/10';
        if (score >= 10) return 'text-amber-600 bg-amber-50 ring-1 ring-inset ring-amber-500/10';
        if (score >= 5) return 'text-emerald-600 bg-emerald-50 ring-1 ring-inset ring-emerald-500/10';
        return 'text-slate-600 bg-slate-50 ring-1 ring-inset ring-slate-500/10';
    };

    // Table Columns
    const columns = [
        {
            key: 'riskId',
            header: 'Risk ID',
            sortable: true,
            defaultWidth: 100,
            render: (risk: Risk) => (
                <span className="font-medium text-blue-600 hover:text-blue-800 transition-colors">
                    {risk.riskId}
                </span>
            )
        },
        {
            key: 'name',
            header: 'Risk Adı',
            sortable: true,
            defaultWidth: 250,
            render: (risk: Risk) => (
                <div>
                    <p className="font-medium text-slate-900 truncate" title={risk.name}>{risk.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{risk.category}</p>
                </div>
            )
        },
        {
            key: 'owner',
            header: 'Risk Sahibi',
            sortable: true,
            defaultWidth: 150,
            render: (risk: Risk) => (
                <div>
                    <p className="text-sm text-slate-900">{risk.owner.name}</p>
                    <p className="text-xs text-slate-500">{risk.owner.department}</p>
                </div>
            )
        },
        {
            key: 'inherent',
            header: 'Doğal',
            sortable: true,
            defaultWidth: 80,
            cellClassName: 'text-center',
            headerClassName: 'text-center',
            render: (risk: Risk) => (
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${getScoreColor(risk.inherentScore)}`}>
                    {risk.inherentScore}
                </span>
            )
        },
        {
            key: 'residual',
            header: 'Rezidüel',
            sortable: true,
            defaultWidth: 80,
            cellClassName: 'text-center',
            headerClassName: 'text-center',
            render: (risk: Risk) => (
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${getScoreColor(risk.residualScore)}`}>
                    {risk.residualScore}
                </span>
            )
        },
        {
            key: 'status',
            header: 'Durum',
            sortable: true,
            defaultWidth: 140,
            render: (risk: Risk) => <StatusBadge variant={getStatusVariant(risk.status)}>{risk.status}</StatusBadge>
        },
        {
            key: 'appetite',
            header: 'İştah Durumu',
            defaultWidth: 120,
            render: (risk: Risk) => (
                risk.appetiteStatus === 'WITHIN' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Dahilinde
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                        Aşım Var
                    </span>
                )
            )
        },
        {
            key: 'actions',
            header: 'İşlemler',
            defaultWidth: 100,
            cellClassName: 'text-right',
            headerClassName: 'text-right',
            render: (risk: Risk) => (
                <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                    {canEdit && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleEditRisk(risk); }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" 
                            title="Düzenle"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                    )}
                    {canDelete && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteRisk(risk); }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" 
                            title="Sil"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Risk Envanteri"
                description="Kurumsal riskleri yönetin ve izleyin"
                badge={<StatusBadge variant="info">{risks.length} Risk</StatusBadge>}
                actions={
                    canCreate && (
                        <Button variant="primary" onClick={handleCreateClick} icon={
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        }>
                            Yeni Risk
                        </Button>
                    )
                }
            />

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                    <p className="text-sm font-medium text-slate-500 mb-1">Toplam Risk</p>
                    <p className="text-3xl font-bold text-slate-900">{risks.length}</p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-red-200 shadow-sm bg-red-50/30">
                    <p className="text-sm font-medium text-red-600 mb-1">Kritik / Yüksek</p>
                    <p className="text-3xl font-bold text-red-700">
                        {risks.filter(r => r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL').length}
                    </p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-amber-200 shadow-sm bg-amber-50/30">
                    <p className="text-sm font-medium text-amber-600 mb-1">İştah Aşımı</p>
                    <p className="text-3xl font-bold text-amber-700">
                        {risks.filter(r => r.appetiteStatus === 'EXCEEDED').length}
                    </p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-emerald-200 shadow-sm bg-emerald-50/30">
                    <p className="text-sm font-medium text-emerald-600 mb-1">İştah Dahilinde</p>
                    <p className="text-3xl font-bold text-emerald-700">
                        {risks.filter(r => r.appetiteStatus === 'WITHIN').length}
                    </p>
                </div>
            </div>

            <FilterBar
                searchPlaceholder="Risk ID veya isim ile ara..."
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                onClearAll={() => { setSearchQuery(''); setActiveFilters({}); }}
                filters={[
                    {
                        key: 'category',
                        label: 'Tüm Kategoriler',
                        value: activeFilters['category'] || '',
                        onChange: (val) => setActiveFilters(prev => ({...prev, category: val})),
                        options: [
                            { value: 'BT Riski', label: 'BT Riski' },
                            { value: 'Uyum Riski', label: 'Uyum Riski' },
                            { value: 'Operasyonel Risk', label: 'Operasyonel Risk' },
                            { value: 'Stratejik Risk', label: 'Stratejik Risk' },
                            { value: 'Finansal Risk', label: 'Finansal Risk' },
                        ]
                    },
                    {
                        key: 'level',
                        label: 'Tüm Seviyeler',
                        value: activeFilters['level'] || '',
                        onChange: (val) => setActiveFilters(prev => ({...prev, level: val})),
                        options: [
                            { value: 'LOW', label: 'Düşük' },
                            { value: 'MEDIUM', label: 'Orta' },
                            { value: 'HIGH', label: 'Yüksek' },
                            { value: 'CRITICAL', label: 'Kritik' },
                        ]
                    },
                    {
                        key: 'status',
                        label: 'Tüm Durumlar',
                        value: activeFilters['status'] || '',
                        onChange: (val) => setActiveFilters(prev => ({...prev, status: val})),
                        options: [
                            { value: 'IDENTIFIED', label: 'Tanımlandı' },
                            { value: 'ASSESSED', label: 'Değerlendirildi' },
                            { value: 'TREATED', label: 'Tedavi Edildi' },
                            { value: 'MONITORED', label: 'İzleniyor' },
                            { value: 'CLOSED', label: 'Kapatıldı' },
                        ]
                    }
                ]}
            />

            <DataTable
                columns={columns}
                data={filteredRisks}
                rowKey={(r) => r.id}
                loading={loading}
                showCheckbox={true}
                selectedRows={selectedRows}
                onRowSelect={(id) => {
                    const newSet = new Set(selectedRows);
                    if (newSet.has(id)) newSet.delete(id);
                    else newSet.add(id);
                    setSelectedRows(newSet);
                }}
                onSelectAll={() => {
                    if (selectedRows.size === filteredRisks.length) setSelectedRows(new Set());
                    else setSelectedRows(new Set(filteredRisks.map(r => r.id)));
                }}
                onRowClick={handleRowClick}
                storageKey="risks-table"
                emptyTitle="Risk Bulunamadı"
                emptyDescription="Arama kriterlerinize uyan veya envanterinizde henüz bir risk bulunmuyor."
            />

            <RiskDetailDrawer 
                isOpen={isDrawerOpen} 
                onClose={() => setIsDrawerOpen(false)} 
                risk={selectedRisk}
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={handleEditRisk}
                onDelete={handleDeleteRisk}
            />

            <RiskFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleFormSubmit}
                initialData={editingRisk}
            />
        </div>
    );
}
