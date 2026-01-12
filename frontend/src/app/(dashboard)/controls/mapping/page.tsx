'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

// Types
interface Risk {
    id: string;
    riskId: string;
    name: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    probability: number;
    impact: number;
    category: string;
}

interface Control {
    id: string;
    controlId: string;
    name: string;
    type: 'IT_GENERAL' | 'IT_APPLICATION' | 'FINANCIAL' | 'OPERATIONAL' | 'COMPLIANCE';
    scope: string;
    frequency: string;
    ownerUnit: string;
    linkedRisks: Risk[]; // Using Risk type directly for simplicity in frontend mapping
    // Backend returns risks via riskMappings usually, so we'll transform in fetch
}

const TYPE_LABELS: Record<string, string> = {
    IT_GENERAL: 'IT Genel',
    IT_APPLICATION: 'IT Uygulama',
    FINANCIAL: 'Finansal',
    OPERATIONAL: 'Operasyonel',
    COMPLIANCE: 'Uyum',
};

const SEVERITY_COLORS: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800 border-red-200',
    HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
    MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    LOW: 'bg-green-100 text-green-800 border-green-200',
};

export default function ControlRiskMappingPage() {
    const [controls, setControls] = useState<Control[]>([]);
    const [risks, setRisks] = useState<Risk[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unmapped' | 'it' | 'financial'>('all');
    const [showModal, setShowModal] = useState(false);
    const [selectedControl, setSelectedControl] = useState<Control | null>(null);
    const [hoveredRisk, setHoveredRisk] = useState<Risk | null>(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const [controlsData, risksData] = await Promise.all([
                api.getControls(),
                api.getRisks()
            ]) as [any[], any[]];

            const cData = Array.isArray(controlsData) ? controlsData : (controlsData as any).data || [];
            const rData = Array.isArray(risksData) ? risksData : (risksData as any).data || [];

            setRisks(rData.map((r: any) => ({
                id: r.id,
                riskId: r.riskId,
                name: r.name,
                severity: r.inherentRiskScore >= 20 ? 'CRITICAL' : r.inherentRiskScore >= 12 ? 'HIGH' : r.inherentRiskScore >= 5 ? 'MEDIUM' : 'LOW', // Approximate mapping if severity field is different
                probability: r.probability || 1,
                impact: r.impact || 1,
                category: r.category?.name || 'Genel Risk'
            })));

            setControls(cData.map((c: any) => {
                // Handle both 'risks' (new backend) and 'riskMappings' (legacy) field names
                const riskMappings = c.risks || c.riskMappings || [];
                return {
                    id: c.id,
                    controlId: c.controlId,
                    name: c.name,
                    type: c.type,
                    scope: 'Genel',
                    frequency: c.frequency || 'Günlük',
                    ownerUnit: c.owner?.department || c.owner?.firstName || 'Bilinmiyor',
                    linkedRisks: riskMappings.map((rm: any) => {
                        // rm could be {risk: {...}} or just the risk object
                        const risk = rm.risk || rm;
                        return {
                            id: risk.id,
                            riskId: risk.riskId,
                            name: risk.name,
                            severity: risk.inherentRiskScore >= 20 ? 'CRITICAL' :
                                risk.inherentRiskScore >= 12 ? 'HIGH' :
                                    risk.inherentRiskScore >= 5 ? 'MEDIUM' : 'LOW',
                            category: risk.category?.name || 'Risk'
                        };
                    })
                };
            }));

        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    // KPI calculations
    const totalControls = controls.length;
    const mappedControls = controls.filter(c => c.linkedRisks.length > 0).length;
    const unmappedControls = totalControls - mappedControls;
    const mappingRate = totalControls > 0 ? Math.round((mappedControls / totalControls) * 100) : 0;

    // Filter controls
    const filteredControls = controls.filter(control => {
        if (filter === 'unmapped') return control.linkedRisks.length === 0;
        if (filter === 'it') return control.type === 'IT_GENERAL' || control.type === 'IT_APPLICATION';
        if (filter === 'financial') return control.type === 'FINANCIAL';
        return true;
    });

    const handleAddRisk = (controlId: string) => {
        const control = controls.find(c => c.id === controlId);
        if (control) {
            setSelectedControl(control);
            setShowModal(true);
        }
    };

    const handleRiskSelect = async (risk: Risk) => {
        if (!selectedControl) return;

        // Optimistic UI update
        const originalControls = [...controls];
        setControls(prev => prev.map(c => {
            if (c.id === selectedControl.id) {
                return { ...c, linkedRisks: [...c.linkedRisks, risk] };
            }
            return c;
        }));

        setShowModal(false);
        setSelectedControl(null);

        try {
            await api.mapControlRisk(selectedControl.id, risk.id);
        } catch (error) {
            console.error('Failed to map risk:', error);
            alert('Risk eşleştirilirken bir hata oluştu.');
            // Revert changes
            setControls(originalControls);
        }
    };

    const handleUnmapRisk = async (controlId: string, riskId: string, event: React.MouseEvent) => {
        event.stopPropagation(); // Prevent bubbling if clicked inside a clickable row
        if (!confirm('Bu riskin eşleşmesini kaldırmak istediğinize emin misiniz?')) return;

        // Optimistic UI update
        const originalControls = [...controls];
        setControls(prev => prev.map(c => {
            if (c.id === controlId) {
                return { ...c, linkedRisks: c.linkedRisks.filter(r => r.id !== riskId) };
            }
            return c;
        }));

        try {
            await api.unmapControlRisk(controlId, riskId);
        } catch (error) {
            console.error('Failed to unmap risk:', error);
            alert('Eşleşme kaldırılırken bir hata oluştu.');
            setControls(originalControls);
        }
    };

    const handleRiskHover = (risk: Risk, event: React.MouseEvent) => {
        // Need to find full risk details from our fetching risks list to display correct tooltip info
        const fullRisk = risks.find(r => r.id === risk.id);
        if (fullRisk) {
            setHoveredRisk(fullRisk);
            setTooltipPosition({ x: event.clientX, y: event.clientY });
        }
    };

    const availableRisks = selectedControl
        ? risks.filter(r => !selectedControl.linkedRisks.some(lr => lr.id === r.id))
        : [];

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Yükleniyor...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="border-b border-gray-200 pb-4">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                    <Link href="/controls" className="hover:text-gray-700">Kontroller</Link>
                    <span>/</span>
                    <span className="text-gray-900">Kontrol–Risk Eşleştirme</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Kontrol–Risk Eşleştirme</h1>
                <p className="text-gray-500 mt-1">Kontrollerin ilgili risklerle ilişkilendirilmesini ve risk kapsam durumunu gösterir.</p>
            </div>

            {/* KPI Indicators */}
            <div className="flex items-center gap-6 py-3 px-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Toplam Kontrol:</span>
                    <span className="text-sm font-semibold text-gray-900">{totalControls}</span>
                </div>
                <div className="w-px h-4 bg-gray-300"></div>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Eşleştirilmiş:</span>
                    <span className="text-sm font-semibold text-green-700">{mappedControls}</span>
                </div>
                <div className="w-px h-4 bg-gray-300"></div>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Eşleme Bekleyen:</span>
                    <span className={`text-sm font-semibold ${unmappedControls > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{unmappedControls}</span>
                </div>
                <div className="w-px h-4 bg-gray-300"></div>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Eşleştirme Oranı:</span>
                    <span className={`text-sm font-semibold ${mappingRate === 100 ? 'text-green-700' : mappingRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {mappingRate}% ({mappedControls} / {totalControls})
                    </span>
                </div>
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 mr-2">Filtre:</span>
                {[
                    { key: 'all', label: 'Tümü' },
                    { key: 'unmapped', label: 'Risk Atanmamış' },
                    { key: 'it', label: 'IT Kontrolleri' },
                    { key: 'financial', label: 'Finansal Kontroller' },
                ].map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key as typeof filter)}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${filter === f.key
                            ? 'bg-slate-700 text-white'
                            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        {f.label}
                        {f.key === 'unmapped' && unmappedControls > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                                {unmappedControls}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-[35%]">Kontrol</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-[12%]">Tip</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-[33%]">Eşleşen Riskler</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-[10%]">Durum</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-[10%]">İşlem</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredControls.map(control => (
                            <tr key={control.id} className="hover:bg-gray-50">
                                {/* Kontrol */}
                                <td className="px-4 py-3">
                                    <div>
                                        <Link href={`/controls/${control.id}`} className="text-sm font-medium text-blue-700 hover:text-blue-900">
                                            {control.controlId}
                                        </Link>
                                        <p className="text-sm text-gray-900 mt-0.5">{control.name}</p>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                            <span>{control.scope}</span>
                                            <span>•</span>
                                            <span>{control.frequency}</span>
                                            <span>•</span>
                                            <span>{control.ownerUnit}</span>
                                        </div>
                                    </div>
                                </td>

                                {/* Tip */}
                                <td className="px-4 py-3">
                                    <span className="text-sm text-gray-700">{TYPE_LABELS[control.type] || control.type}</span>
                                </td>

                                {/* Eşleşen Riskler */}
                                <td className="px-4 py-3">
                                    {control.linkedRisks.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {control.linkedRisks.map(risk => {
                                                // Find real risk to get correct severity if needed, or rely on what matches
                                                const realRisk = risks.find(r => r.id === risk.id) || risk;
                                                return (
                                                    <span
                                                        key={risk.id}
                                                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border cursor-help ${SEVERITY_COLORS[realRisk.severity] || 'bg-gray-100'}`}
                                                        onMouseEnter={(e) => handleRiskHover(risk, e)}
                                                        onMouseLeave={() => setHoveredRisk(null)}
                                                    >
                                                        {risk.riskId}
                                                        <button
                                                            onClick={(e) => handleUnmapRisk(control.id, risk.id, e)}
                                                            className="ml-0.5 text-gray-500 hover:text-red-500 rounded-full hover:bg-white/50"
                                                        >
                                                            &times;
                                                        </button>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded border border-amber-200">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            Risk Atanmamış
                                        </span>
                                    )}
                                </td>

                                {/* Durum */}
                                <td className="px-4 py-3">
                                    {control.linkedRisks.length > 0 ? (
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                            <span className="text-xs text-green-700">Eşleştirilmiş</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                            <span className="text-xs text-amber-700">Bekliyor</span>
                                        </div>
                                    )}
                                </td>

                                {/* İşlem */}
                                <td className="px-4 py-3">
                                    <button
                                        onClick={() => handleAddRisk(control.id)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        {control.linkedRisks.length > 0 ? 'Ek Risk' : 'Risk Ekle'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredControls.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        <p className="text-sm">Bu kriterlere uygun kontrol bulunamadı.</p>
                    </div>
                )}
            </div>

            {/* Risk Tooltip */}
            {hoveredRisk && (
                <div
                    className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 pointer-events-none"
                    style={{ left: tooltipPosition.x + 10, top: tooltipPosition.y + 10 }}
                >
                    <p className="text-sm font-semibold text-gray-900 mb-2">{hoveredRisk.name}</p>
                    <div className="space-y-1 text-xs text-gray-600">
                        <div className="flex justify-between gap-6">
                            <span className="text-gray-400">Kategori:</span>
                            <span>{hoveredRisk.category}</span>
                        </div>
                        <div className="flex justify-between gap-6">
                            <span className="text-gray-400">Etki Seviyesi:</span>
                            <span>{hoveredRisk.impact}/5</span>
                        </div>
                        <div className="flex justify-between gap-6">
                            <span className="text-gray-400">Olasılık:</span>
                            <span>{hoveredRisk.probability}/5</span>
                        </div>
                        <div className="flex justify-between gap-6">
                            <span className="text-gray-400">Ciddiyet:</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs ${SEVERITY_COLORS[hoveredRisk.severity]}`}>
                                {hoveredRisk.severity}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Risk Modal */}
            {showModal && selectedControl && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl w-full max-w-lg mx-4 shadow-2xl">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">Risk Eşleştir</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                <span className="font-medium text-gray-700">{selectedControl.controlId}</span> için risk seçin
                            </p>
                        </div>

                        <div className="p-6 max-h-96 overflow-y-auto">
                            {availableRisks.length > 0 ? (
                                <div className="space-y-2">
                                    {availableRisks.map(risk => (
                                        <button
                                            key={risk.id}
                                            onClick={() => handleRiskSelect(risk)}
                                            className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
                                        >
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-gray-900">{risk.riskId}</span>
                                                    <span className={`px-1.5 py-0.5 text-xs rounded ${SEVERITY_COLORS[risk.severity]}`}>
                                                        {risk.severity}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-600 mt-0.5">{risk.name}</p>
                                                <p className="text-xs text-gray-400 mt-0.5">{risk.category}</p>
                                            </div>
                                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-sm">Tüm riskler bu kontrole zaten atanmış.</p>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
                            <button
                                onClick={() => { setShowModal(false); setSelectedControl(null); }}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                            >
                                İptal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
