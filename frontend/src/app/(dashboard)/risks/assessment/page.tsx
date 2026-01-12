'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

// Types
interface Control {
    id: string;
    controlId: string;
    name: string;
    type: 'IT_GENERAL' | 'IT_APPLICATION' | 'FINANCIAL' | 'OPERATIONAL';
    effectiveness: 'EFFECTIVE' | 'PARTIALLY_EFFECTIVE' | 'INEFFECTIVE' | 'NOT_TESTED';
}

interface Risk {
    id: string;
    riskId: string;
    name: string;
    description: string;
    owner: string;
    ownerDepartment: string;
    category: string;
    status: 'PENDING' | 'ASSESSED' | 'TREATED';
    preLevel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
    inherentLikelihood: number;
    inherentImpact: number;
    residualLikelihood: number | null;
    residualImpact: number | null;
    lastAssessmentDate: string | null;
    controls: Control[];
}

const TYPE_LABELS: Record<string, string> = {
    IT_GENERAL: 'IT Genel',
    IT_APPLICATION: 'IT Uygulama',
    FINANCIAL: 'Finansal',
    OPERATIONAL: 'Operasyonel',
    PREVENTIVE: 'Önleyici',
    DETECTIVE: 'Tespit Edici',
    CORRECTIVE: 'Düzeltici',
};

const EFFECTIVENESS_LABELS: Record<string, { label: string; color: string }> = {
    EFFECTIVE: { label: 'Etkin', color: 'text-green-700 bg-green-50' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen Etkin', color: 'text-amber-700 bg-amber-50' },
    INEFFECTIVE: { label: 'Etkin Değil', color: 'text-red-700 bg-red-50' },
    NOT_TESTED: { label: 'Test Edilmedi', color: 'text-gray-600 bg-gray-100' },
};

const LEVEL_COLORS: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-800 border-red-200',
    MEDIUM: 'bg-amber-100 text-amber-800 border-amber-200',
    LOW: 'bg-green-100 text-green-800 border-green-200',
};

export default function RiskAssessmentPage() {
    const [risks, setRisks] = useState<Risk[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'high' | 'it' | 'mine'>('all');
    const [methodologyOpen, setMethodologyOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    // Assessment form state
    const [likelihood, setLikelihood] = useState<number>(3);
    const [impact, setImpact] = useState<number>(3);
    const [residualLikelihood, setResidualLikelihood] = useState<number>(2);
    const [residualImpact, setResidualImpact] = useState<number>(2);

    // Fetch real risks from API
    const fetchRisks = useCallback(async () => {
        try {
            setLoading(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await api.getRisks() as any;
            const riskData = response.data || response;

            // Transform API data to component format
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const transformedRisks: Risk[] = riskData.map((r: any) => {
                const inherentScore = (r.inherentProbability || 1) * (r.inherentImpact || 1);
                let preLevel: 'HIGH' | 'MEDIUM' | 'LOW' | null = null;
                if (inherentScore >= 15) preLevel = 'HIGH';
                else if (inherentScore >= 8) preLevel = 'MEDIUM';
                else preLevel = 'LOW';

                // Map status from backend to component status
                let status: 'PENDING' | 'ASSESSED' | 'TREATED' = 'PENDING';
                if (r.status === 'TREATED' || r.treatmentDecision) status = 'TREATED';
                else if (r.status === 'ASSESSED' || r.residualRiskScore) status = 'ASSESSED';

                return {
                    id: r.id,
                    riskId: r.riskId,
                    name: r.name,
                    description: r.description || '',
                    owner: r.owner ? `${r.owner.firstName || ''} ${r.owner.lastName || ''}`.trim() : 'Bilinmiyor',
                    ownerDepartment: r.owner?.department || '',
                    category: r.category?.name || 'Genel',
                    status,
                    preLevel,
                    inherentLikelihood: r.inherentProbability || 1,
                    inherentImpact: r.inherentImpact || 1,
                    residualLikelihood: r.residualProbability || null,
                    residualImpact: r.residualImpact || null,
                    lastAssessmentDate: r.updatedAt ? r.updatedAt.split('T')[0] : null,
                    controls: (r.controls || r._count?.controls > 0 ? [] : []).map((cm: { control: { id: string; controlId: string; name: string; type: string; effectivenessStatus: string } }) => ({
                        id: cm.control?.id || '',
                        controlId: cm.control?.controlId || '',
                        name: cm.control?.name || '',
                        type: cm.control?.type || 'OPERATIONAL',
                        effectiveness: cm.control?.effectivenessStatus || 'NOT_TESTED',
                    })),
                };
            });
            setRisks(transformedRisks);
        } catch (error) {
            console.error('Failed to fetch risks:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRisks();
    }, [fetchRisks]);

    const selectedRisk = risks.find(r => r.id === selectedRiskId);

    // Filter risks
    const filteredRisks = risks.filter(risk => {
        if (filter === 'high') return risk.preLevel === 'HIGH';
        if (filter === 'it') return risk.category.includes('BT') || risk.category.includes('IT');
        if (filter === 'mine') return risk.status === 'PENDING'; // Show pending for "mine"
        return true;
    });

    const pendingRisks = filteredRisks.filter(r => r.status === 'PENDING');

    const calculateRiskScore = (l: number, i: number) => l * i;
    const getRiskLevel = (score: number): 'HIGH' | 'MEDIUM' | 'LOW' => {
        if (score >= 15) return 'HIGH';
        if (score >= 8) return 'MEDIUM';
        return 'LOW';
    };

    const getRecommendation = (level: 'HIGH' | 'MEDIUM' | 'LOW') => {
        if (level === 'LOW') return { label: 'Kabul Edilebilir', color: 'text-green-700 bg-green-50 border-green-200' };
        if (level === 'MEDIUM') return { label: 'Tedavi Gerekli', color: 'text-amber-700 bg-amber-50 border-amber-200' };
        return { label: 'Yönetim Onayı Gerekli', color: 'text-red-700 bg-red-50 border-red-200' };
    };

    const handleSelectRisk = (riskId: string) => {
        const risk = risks.find(r => r.id === riskId);
        if (risk) {
            setSelectedRiskId(riskId);
            setLikelihood(risk.inherentLikelihood || 3);
            setImpact(risk.inherentImpact || 3);
            setResidualLikelihood(risk.residualLikelihood || 2);
            setResidualImpact(risk.residualImpact || 2);
        }
    };

    const handleSaveAssessment = async () => {
        if (!selectedRiskId) return;

        try {
            setSaving(true);
            // Call API to assess risk (uses AssessRiskDto)
            await api.assessRisk(selectedRiskId, {
                probability: likelihood,
                impact: impact,
                residualProbability: residualLikelihood,
                residualImpact: residualImpact,
            });

            // Update local state
            setRisks(prev => prev.map(r => {
                if (r.id === selectedRiskId) {
                    return {
                        ...r,
                        status: 'ASSESSED' as const,
                        inherentLikelihood: likelihood,
                        inherentImpact: impact,
                        residualLikelihood,
                        residualImpact,
                        lastAssessmentDate: new Date().toISOString().split('T')[0],
                    };
                }
                return r;
            }));

            alert('Değerlendirme başarıyla kaydedildi.');
        } catch (error) {
            console.error('Failed to save assessment:', error);
            alert('Değerlendirme kaydedilirken hata oluştu.');
        } finally {
            setSaving(false);
        }
    };

    const inherentScore = calculateRiskScore(likelihood, impact);
    const inherentLevel = getRiskLevel(inherentScore);
    const residualScore = calculateRiskScore(residualLikelihood, residualImpact);
    const residualLevel = getRiskLevel(residualScore);
    const recommendation = getRecommendation(residualLevel);

    return (
        <div className="flex h-[calc(100vh-120px)] gap-6">
            {/* LEFT PANEL - Risk List */}
            <div className="w-[380px] flex-shrink-0 flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <h2 className="text-sm font-semibold text-gray-900">Değerlendirme Bekleyen Riskler</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{pendingRisks.length} risk bekliyor</p>
                </div>

                {/* Filters */}
                <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1.5">
                    {[
                        { key: 'all', label: 'Tümü' },
                        { key: 'high', label: 'Yüksek Risk' },
                        { key: 'it', label: 'BT Riskleri' },
                        { key: 'mine', label: 'Bana Atanan' },
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key as typeof filter)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${filter === f.key
                                ? 'bg-slate-700 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Risk List */}
                <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : filteredRisks.length === 0 ? (
                        <div className="text-center py-12 text-gray-500 text-sm">Risk bulunamadı</div>
                    ) : (filteredRisks.map(risk => (
                        <button
                            key={risk.id}
                            onClick={() => handleSelectRisk(risk.id)}
                            className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedRiskId === risk.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                                }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-blue-700">{risk.riskId}</span>
                                        {risk.preLevel && (
                                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${LEVEL_COLORS[risk.preLevel]}`}>
                                                {risk.preLevel}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{risk.name}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{risk.owner}</p>
                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                                        <span>{risk.category}</span>
                                        <span>•</span>
                                        <span className={risk.status === 'PENDING' ? 'text-amber-600' : 'text-green-600'}>
                                            {risk.status === 'PENDING' ? 'Değerlendirme Bekliyor' : 'Değerlendirildi'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </button>
                    )))}
                </div>
            </div>

            {/* RIGHT PANEL - Assessment Detail */}
            <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
                {!selectedRisk ? (
                    /* Empty State */
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Değerlendirme yapmak için sol taraftan bir risk seçin</h3>
                        <div className="text-sm text-gray-500 space-y-1 mt-4">
                            <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-xs flex items-center justify-center">1</span>
                                <span>Sol panelden bir risk seçin</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-xs flex items-center justify-center">2</span>
                                <span>Olasılık ve etki değerlendirmesi yapın</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-xs flex items-center justify-center">3</span>
                                <span>Kontrolleri gözden geçirin ve artık riski hesaplayın</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Assessment Content */
                    <div className="flex-1 overflow-y-auto">
                        {/* 1. Risk Overview */}
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Link href={`/risks/${selectedRisk.id}`} className="text-sm font-semibold text-blue-700 hover:underline">
                                            {selectedRisk.riskId}
                                        </Link>
                                        <span className={`px-2 py-0.5 text-xs font-medium rounded border ${LEVEL_COLORS[selectedRisk.preLevel || 'MEDIUM']}`}>
                                            {selectedRisk.preLevel || 'N/A'}
                                        </span>
                                    </div>
                                    <h2 className="text-lg font-semibold text-gray-900 mt-1">{selectedRisk.name}</h2>
                                    <p className="text-sm text-gray-600 mt-1">{selectedRisk.description}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6 mt-3 text-xs text-gray-500">
                                <div>
                                    <span className="text-gray-400">Sahip:</span>
                                    <span className="ml-1 text-gray-700">{selectedRisk.owner} ({selectedRisk.ownerDepartment})</span>
                                </div>
                                <div>
                                    <span className="text-gray-400">Son Değerlendirme:</span>
                                    <span className="ml-1 text-gray-700">{selectedRisk.lastAssessmentDate || 'Henüz değerlendirilmedi'}</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Inherent Risk Assessment */}
                        <div className="px-6 py-5 border-b border-gray-200">
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">Doğal Risk Değerlendirmesi</h3>
                            <div className="grid grid-cols-2 gap-6">
                                {/* Likelihood */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-2">
                                        Olasılık (1-5)
                                        <span className="ml-1 text-gray-400 font-normal" title="1: Çok Düşük, 5: Çok Yüksek">ⓘ</span>
                                    </label>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map(v => (
                                            <button
                                                key={v}
                                                onClick={() => setLikelihood(v)}
                                                className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${likelihood === v
                                                    ? 'bg-slate-700 text-white'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                    }`}
                                            >
                                                {v}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Impact */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-2">
                                        Etki (1-5)
                                        <span className="ml-1 text-gray-400 font-normal" title="1: Çok Düşük, 5: Çok Yüksek">ⓘ</span>
                                    </label>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map(v => (
                                            <button
                                                key={v}
                                                onClick={() => setImpact(v)}
                                                className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${impact === v
                                                    ? 'bg-slate-700 text-white'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                    }`}
                                            >
                                                {v}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Calculated Score */}
                            <div className="mt-4 p-3 bg-gray-50 rounded-lg flex items-center gap-6">
                                <div>
                                    <span className="text-xs text-gray-500">Risk Skoru:</span>
                                    <span className="ml-2 text-lg font-bold text-gray-900">{inherentScore}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500">Risk Seviyesi:</span>
                                    <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded border ${LEVEL_COLORS[inherentLevel]}`}>
                                        {inherentLevel === 'HIGH' ? 'Yüksek' : inherentLevel === 'MEDIUM' ? 'Orta' : 'Düşük'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 3. Existing Controls */}
                        <div className="px-6 py-5 border-b border-gray-200">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3">Mevcut Kontroller</h3>
                            {selectedRisk.controls.length > 0 ? (
                                <div className="space-y-2">
                                    {selectedRisk.controls.map(control => (
                                        <div key={control.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <Link href={`/controls/${control.id}`} className="text-sm font-medium text-blue-700 hover:underline">
                                                        {control.controlId}
                                                    </Link>
                                                    <span className="text-xs text-gray-400">{TYPE_LABELS[control.type]}</span>
                                                </div>
                                                <p className="text-sm text-gray-700 mt-0.5">{control.name}</p>
                                            </div>
                                            <span className={`px-2 py-1 text-xs font-medium rounded ${EFFECTIVENESS_LABELS[control.effectiveness].color}`}>
                                                {EFFECTIVENESS_LABELS[control.effectiveness].label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                                    Bu riske bağlı kontrol bulunmamaktadır.
                                </div>
                            )}
                        </div>

                        {/* 4. Residual Risk Calculation */}
                        <div className="px-6 py-5 border-b border-gray-200">
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">Artık Risk Hesaplaması</h3>
                            <div className="grid grid-cols-2 gap-6">
                                {/* Residual Likelihood */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-2">Artık Olasılık (1-5)</label>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map(v => (
                                            <button
                                                key={v}
                                                onClick={() => setResidualLikelihood(v)}
                                                className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${residualLikelihood === v
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                    }`}
                                            >
                                                {v}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Residual Impact */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-2">Artık Etki (1-5)</label>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map(v => (
                                            <button
                                                key={v}
                                                onClick={() => setResidualImpact(v)}
                                                className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${residualImpact === v
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                    }`}
                                            >
                                                {v}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Residual Calculated Score */}
                            <div className="mt-4 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <div>
                                        <span className="text-xs text-gray-500">Artık Risk Skoru:</span>
                                        <span className="ml-2 text-lg font-bold text-gray-900">{residualScore}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-gray-500">Artık Risk Seviyesi:</span>
                                        <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded border ${LEVEL_COLORS[residualLevel]}`}>
                                            {residualLevel === 'HIGH' ? 'Yüksek' : residualLevel === 'MEDIUM' ? 'Orta' : 'Düşük'}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <span className={`px-3 py-1.5 text-xs font-medium rounded border ${recommendation.color}`}>
                                        {recommendation.label}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 5. Methodology & Governance */}
                        <div className="px-6 py-4">
                            <button
                                onClick={() => setMethodologyOpen(!methodologyOpen)}
                                className="flex items-center justify-between w-full text-left"
                            >
                                <h3 className="text-sm font-semibold text-gray-700">Metodoloji ve Yönetişim</h3>
                                <svg className={`w-4 h-4 text-gray-400 transition-transform ${methodologyOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {methodologyOpen && (
                                <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Kullanılan Metodoloji:</span>
                                        <span>Kurumsal Risk Metodolojisi v2.1</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Referans Çerçeve:</span>
                                        <span>ISO 31000, COSO ERM</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Onay Seviyesi:</span>
                                        <span>Risk Komitesi</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setSelectedRiskId(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleSaveAssessment}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium text-white bg-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                                {saving ? 'Kaydediliyor...' : 'Değerlendirmeyi Kaydet'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
