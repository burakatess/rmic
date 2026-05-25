'use client';

import { useState, useEffect, useMemo } from 'react';
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
    type: 'IT_GENERAL' | 'IT_APPLICATION' | 'FINANCIAL' | 'OPERATIONAL' | 'COMPLIANCE' | 'BT' | 'BT_DISI';
    scope: string;
    frequency: string;
    ownerUnit: string;
    linkedRisks: Risk[];
}

const TYPE_LABELS: Record<string, string> = {
    IT_GENERAL: 'IT Genel',
    IT_APPLICATION: 'IT Uygulama',
    FINANCIAL: 'Finansal',
    OPERATIONAL: 'Operasyonel',
    COMPLIANCE: 'Uyum',
    BT: 'BT Kontrolü',
    BT_DISI: 'BT Dışı Kontrol',
};

const SEVERITY_COLORS: Record<string, string> = {
    CRITICAL: 'bg-rose-50 text-rose-700 border-rose-100',
    HIGH: 'bg-orange-50 text-orange-700 border-orange-100',
    MEDIUM: 'bg-amber-50 text-amber-700 border-amber-100',
    LOW: 'bg-emerald-50 text-emerald-700 border-emerald-100',
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
                severity: r.inherentRiskScore >= 20 ? 'CRITICAL' : r.inherentRiskScore >= 12 ? 'HIGH' : r.inherentRiskScore >= 5 ? 'MEDIUM' : 'LOW',
                probability: r.probability || 1,
                impact: r.impact || 1,
                category: r.category?.name || 'Genel Risk'
            })));

            setControls(cData.map((c: any) => {
                const riskMappings = c.risks || c.riskMappings || [];
                return {
                    id: c.id,
                    controlId: c.controlId,
                    name: c.name,
                    type: c.type,
                    scope: c.gmy || 'Genel',
                    frequency: c.frequency || 'Aylık',
                    ownerUnit: c.directorate || c.owner?.department || 'Bilinmiyor',
                    linkedRisks: riskMappings.map((rm: any) => {
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
        if (filter === 'it') return control.type === 'IT_GENERAL' || control.type === 'IT_APPLICATION' || control.type === 'BT';
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
            setControls(originalControls);
        }
    };

    const handleUnmapRisk = async (controlId: string, riskId: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (!confirm('Bu riskin eşleşmesini kaldırmak istediğinize emin misiniz?')) return;

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
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto py-8 px-4">
            {/* Page Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-5">
                <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                        <Link href="/controls" className="hover:text-slate-600">Kontrol Envanteri</Link>
                        <span>/</span>
                        <span className="text-slate-600">Risk Eşleştirme</span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Kontrol–Risk Eşleştirme Matrisi</h1>
                    <p className="text-sm text-slate-500 mt-1">Hangi kontrol faaliyetinin hangi risklere teminat sağladığını ve risk kapsama performansını yönetin.</p>
                </div>
            </div>

            {/* Premium KPI Indicators */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Toplam Kontrol</p>
                        <p className="text-3xl font-extrabold text-slate-800 mt-1">{totalControls}</p>
                    </div>
                    <span className="text-xl p-3 bg-slate-50 rounded-xl">🛡️</span>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">İlişkilendirilmiş</p>
                        <p className="text-3xl font-extrabold text-emerald-600 mt-1">{mappedControls}</p>
                    </div>
                    <span className="text-xl p-3 bg-emerald-50 text-emerald-600 rounded-xl">🔗</span>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Eşleme Bekleyen</p>
                        <p className="text-3xl font-extrabold text-amber-600 mt-1">{unmappedControls}</p>
                    </div>
                    <span className="text-xl p-3 bg-amber-50 text-amber-600 rounded-xl">⚠️</span>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kapsama Oranı</p>
                        <p className="text-3xl font-extrabold text-blue-600 mt-1">{mappingRate}%</p>
                    </div>
                    <span className="text-xl p-3 bg-blue-50 text-blue-600 rounded-xl">📊</span>
                </div>
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex-wrap">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">Filtrele:</span>
                {[
                    { key: 'all', label: 'Tüm Kontroller' },
                    { key: 'unmapped', label: 'Risk Atanmamış Kontroller' },
                    { key: 'it', label: 'IT & BT Kontrolleri' },
                    { key: 'financial', label: 'Finansal Kontroller' },
                ].map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key as typeof filter)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${filter === f.key
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        {f.label}
                        {f.key === 'unmapped' && unmappedControls > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800 font-extrabold rounded-full">
                                {unmappedControls}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-[40%]">Kontrol Detayları</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-[15%]">Kontrol Tipi</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-[30%]">Eşleşen Riskler</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-[15%]">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredControls.map(control => (
                                <tr key={control.id} className="hover:bg-slate-50/50 transition-colors">
                                    {/* Kontrol */}
                                    <td className="px-6 py-4">
                                        <div className="space-y-1">
                                            <Link href={`/controls/${control.id}`} className="font-mono text-xs font-bold text-blue-600 hover:underline bg-blue-50 px-2 py-0.5 rounded border border-blue-100 inline-block">
                                                {control.controlId}
                                            </Link>
                                            <p className="text-sm font-semibold text-slate-800">{control.name}</p>
                                            <div className="flex items-center gap-2.5 text-xs text-slate-400">
                                                <span>🏢 {control.ownerUnit}</span>
                                                <span>•</span>
                                                <span>⏱️ {control.frequency}</span>
                                                <span>•</span>
                                                <span>GMY: {control.scope}</span>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Tip */}
                                    <td className="px-6 py-4">
                                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                                            {TYPE_LABELS[control.type] || control.type}
                                        </span>
                                    </td>

                                    {/* Eşleşen Riskler */}
                                    <td className="px-6 py-4">
                                        {control.linkedRisks.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {control.linkedRisks.map(risk => {
                                                    const realRisk = risks.find(r => r.id === risk.id) || risk;
                                                    return (
                                                        <span
                                                            key={risk.id}
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold rounded-lg border cursor-help shadow-sm transition-all hover:scale-105 ${SEVERITY_COLORS[realRisk.severity] || 'bg-slate-50'}`}
                                                            onMouseEnter={(e) => handleRiskHover(risk, e)}
                                                            onMouseLeave={() => setHoveredRisk(null)}
                                                        >
                                                            {risk.riskId}
                                                            <button
                                                                onClick={(e) => handleUnmapRisk(control.id, risk.id, e)}
                                                                className="ml-1 text-slate-400 hover:text-rose-600 rounded-full hover:bg-slate-200/50 p-0.5 font-black text-xs"
                                                            >
                                                                &times;
                                                            </button>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-amber-700 bg-amber-50 rounded-xl border border-amber-100">
                                                ⚠️ Risk Atanmamış
                                            </span>
                                        )}
                                    </td>

                                    {/* İşlem */}
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => handleAddRisk(control.id)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors rounded-xl border border-blue-100"
                                        >
                                            ➕ {control.linkedRisks.length > 0 ? 'Risk Ekle' : 'İlişkilendir'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredControls.length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                        <p className="text-sm">Seçili kriterlere uygun kontrol bulunamadı.</p>
                    </div>
                )}
            </div>

            {/* Enhanced Risk Tooltip */}
            {hoveredRisk && (
                <div
                    className="fixed z-50 bg-white border border-slate-200/80 rounded-2xl shadow-xl p-4 pointer-events-none w-72 backdrop-blur-md animate-in fade-in duration-150"
                    style={{ left: tooltipPosition.x + 15, top: tooltipPosition.y + 15 }}
                >
                    <div className="border-b border-slate-100 pb-2 mb-2">
                        <span className="font-mono text-xs font-bold text-blue-600">{hoveredRisk.riskId}</span>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">{hoveredRisk.name}</p>
                    </div>
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Kategori:</span>
                            <span className="font-semibold text-slate-700">{hoveredRisk.category}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Olasılık:</span>
                            <span className="font-semibold text-slate-700">{hoveredRisk.probability}/5</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Etki:</span>
                            <span className="font-semibold text-slate-700">{hoveredRisk.impact}/5</span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                            <span className="text-slate-400">Kritiklik:</span>
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${SEVERITY_COLORS[hoveredRisk.severity]}`}>
                                {hoveredRisk.severity}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Risk Modal */}
            {showModal && selectedControl && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-lg mx-4 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-extrabold text-slate-800">Risk İle İlişkilendir</h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{selectedControl.controlId}</span> kodlu kontrol için risk seçin.
                                </p>
                            </div>
                            <button
                                onClick={() => { setShowModal(false); setSelectedControl(null); }}
                                className="text-slate-400 hover:text-slate-600 font-bold text-xl"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="p-6 max-h-96 overflow-y-auto space-y-3">
                            {availableRisks.length > 0 ? (
                                availableRisks.map(risk => (
                                    <button
                                        key={risk.id}
                                        onClick={() => handleRiskSelect(risk)}
                                        className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-slate-200/80 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left group"
                                    >
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs font-bold text-slate-800">{risk.riskId}</span>
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${SEVERITY_COLORS[risk.severity]}`}>
                                                    {risk.severity}
                                                </span>
                                            </div>
                                            <p className="text-sm font-semibold text-slate-700 group-hover:text-blue-700 transition-colors">{risk.name}</p>
                                            <p className="text-[11px] text-slate-400">{risk.category}</p>
                                        </div>
                                        <span className="text-lg opacity-0 group-hover:opacity-100 transition-opacity">🔗</span>
                                    </button>
                                ))
                            ) : (
                                <div className="text-center py-8 text-slate-400">
                                    <span className="text-3xl block mb-2">🎉</span>
                                    <p className="text-sm font-semibold">Tüm riskler zaten atanmış.</p>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50">
                            <button
                                onClick={() => { setShowModal(false); setSelectedControl(null); }}
                                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors"
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
