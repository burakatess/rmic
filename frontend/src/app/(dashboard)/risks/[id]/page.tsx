'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/lib/api';

// Types
interface Risk {
    id: string;
    riskId: string;
    name: string;
    description: string;
    category: { name: string; color: string };
    owner: { name: string; department: string; email: string };
    inherentProbability: number;
    inherentImpact: number;
    inherentScore: number;
    residualProbability: number;
    residualImpact: number;
    residualScore: number;
    riskAppetite: number;
    riskLevel: string;
    appetiteStatus: string;
    status: string;
    treatmentDecision: string;
    mutabakatTarihi?: string;
    olusturmaTarihi: string;
    guncellemeTarihi: string;
}

interface Control {
    id: string;
    controlId: string;
    name: string;
    type: string;
    effectiveness: string;
    findingsCount: number;
}

interface Finding {
    id: string;
    findingId: string;
    description: string;
    severity: string;
    status: string;
    controlId?: string;
    controlName?: string;
    actionsCount: number;
}

interface Action {
    id: string;
    actionId: string;
    description: string;
    status: string;
    dueDate: string;
    owner: string;
    findingId?: string;
    findingDescription?: string;
}

const AUDIT_LOG = [
    { date: '2024-12-15 14:30', user: 'Ahmet Yılmaz', action: 'Risk değerlendirmesi güncellendi' },
    { date: '2024-12-10 09:15', user: 'Ayşe Kaya', action: 'Kontrol C-2024-0006 eklendi' },
    { date: '2024-11-20 16:45', user: 'Mehmet Demir', action: 'Tedavi kararı: Azalt olarak belirlendi' },
    { date: '2024-10-05 11:00', user: 'Sistem', action: 'Risk oluşturuldu' },
];

const statusConfig: Record<string, { label: string; color: string }> = {
    IDENTIFIED: { label: 'Tanımlandı', color: 'bg-gray-100 text-gray-600' },
    ASSESSED: { label: 'Değerlendirildi', color: 'bg-blue-100 text-blue-600' },
    TREATED: { label: 'Tedavi Edildi', color: 'bg-emerald-100 text-emerald-600' },
    MONITORED: { label: 'İzleniyor', color: 'bg-indigo-100 text-indigo-600' },
    CLOSED: { label: 'Kapatıldı', color: 'bg-gray-200 text-gray-500' },
};

const treatmentLabels: Record<string, string> = {
    MITIGATE: 'Azalt',
    TRANSFER: 'Transfer Et',
    AVOID: 'Kaçın',
    ACCEPT: 'Kabul Et',
};

const effectivenessConfig: Record<string, { label: string; color: string }> = {
    EFFECTIVE: { label: 'Etkin', color: 'bg-green-100 text-green-700' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen Etkin', color: 'bg-yellow-100 text-yellow-700' },
    INEFFECTIVE: { label: 'Etkin Değil', color: 'bg-red-100 text-red-700' },
};

const actionStatusConfig: Record<string, { label: string; color: string }> = {
    OPEN: { label: 'Açık', color: 'bg-blue-100 text-blue-700' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'bg-yellow-100 text-yellow-700' },
    COMPLETED: { label: 'Tamamlandı', color: 'bg-green-100 text-green-700' },
    CLOSED: { label: 'Kapatıldı', color: 'bg-gray-100 text-gray-600' },
};

const getScoreColor = (score: number) => {
    if (score >= 20) return 'from-red-500 to-red-600';
    if (score >= 15) return 'from-orange-500 to-orange-600';
    if (score >= 10) return 'from-yellow-500 to-yellow-600';
    return 'from-green-500 to-green-600';
};

export default function RiskDetailPage() {
    const params = useParams();
    const [activeTab, setActiveTab] = useState<'summary' | 'controls' | 'actions' | 'findings' | 'history'>('summary');
    const [risk, setRisk] = useState<Risk | null>(null);
    const [controls, setControls] = useState<Control[]>([]);
    const [findings, setFindings] = useState<Finding[]>([]);
    const [actions, setActions] = useState<Action[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRiskData = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = await api.getRisk(params.id as string) as any;
                if (data) {
                    setRisk({
                        id: String(data.id),
                        riskId: String(data.riskId || ''),
                        name: String(data.name || ''),
                        description: String(data.description || ''),
                        category: {
                            name: data.category?.name || 'Bilinmiyor',
                            color: data.category?.color || '#3b82f6'
                        },
                        owner: {
                            name: `${data.owner?.firstName || ''} ${data.owner?.lastName || ''}`.trim() || 'Bilinmiyor',
                            department: String(data.owner?.department || ''),
                            email: String(data.owner?.email || '')
                        },
                        inherentProbability: Number(data.inherentProbability || 0),
                        inherentImpact: Number(data.inherentImpact || 0),
                        inherentScore: Number(data.inherentRiskScore || 0),
                        residualProbability: Number(data.residualProbability || 0),
                        residualImpact: Number(data.residualImpact || 0),
                        residualScore: Number(data.residualRiskScore || 0),
                        riskAppetite: Number(data.riskAppetite || 10),
                        riskLevel: String(data.residualRiskScore >= 20 ? 'CRITICAL' : data.residualRiskScore >= 15 ? 'HIGH' : data.residualRiskScore >= 8 ? 'MEDIUM' : 'LOW'),
                        appetiteStatus: data.isAboveAppetite ? 'EXCEEDED' : 'WITHIN',
                        status: String(data.status || 'IDENTIFIED'),
                        treatmentDecision: String(data.treatmentDecision || ''),
                        mutabakatTarihi: data.riskEntries?.[0]?.mutabakatTarihi || null,
                        olusturmaTarihi: data.riskEntries?.[0]?.olusturmaTarihi || data.createdAt || new Date().toISOString(),
                        guncellemeTarihi: data.riskEntries?.[0]?.guncellemeTarihi || data.updatedAt || new Date().toISOString()
                    });
                    // Transform controls and extract findings/actions from chain
                    if (data.controls?.length) {
                        const allFindings: Finding[] = [];
                        const allActions: Action[] = [];

                        const transformedControls = data.controls.map((cm: any) => {
                            const control = cm.control;
                            const controlFindings = control?.findings || [];

                            // Extract findings from this control
                            controlFindings.forEach((f: any) => {
                                allFindings.push({
                                    id: String(f.id || ''),
                                    findingId: String(f.findingId || ''),
                                    description: String(f.description || ''),
                                    severity: String(f.severity || 'MEDIUM'),
                                    status: String(f.status || 'OPEN'),
                                    controlId: String(control?.controlId || ''),
                                    controlName: String(control?.name || ''),
                                    actionsCount: f.actions?.length || 0,
                                });

                                // Extract actions from this finding
                                (f.actions || []).forEach((a: any) => {
                                    allActions.push({
                                        id: String(a.id || ''),
                                        actionId: String(a.actionId || ''),
                                        description: String(a.description || ''),
                                        status: String(a.status || 'OPEN'),
                                        dueDate: a.dueDate || new Date().toISOString(),
                                        owner: `${a.owner?.firstName || ''} ${a.owner?.lastName || ''}`.trim(),
                                        findingId: String(f.findingId || ''),
                                        findingDescription: String(f.description || '').substring(0, 50) + '...',
                                    });
                                });
                            });

                            return {
                                id: String(control?.id || ''),
                                controlId: String(control?.controlId || ''),
                                name: String(control?.name || ''),
                                type: 'Önleyici',
                                effectiveness: String(control?.effectivenessStatus || 'NOT_TESTED'),
                                findingsCount: controlFindings.length,
                            };
                        });

                        setControls(transformedControls);
                        setFindings(allFindings);
                        setActions(allActions);
                    }

                    // Fallback: also check direct findings/actions for backward compatibility
                    if (data.findings?.length && findings.length === 0) {
                        setFindings(data.findings.map((f: any) => ({
                            id: String(f.id || ''),
                            findingId: String(f.findingId || ''),
                            description: String(f.description || ''),
                            severity: String(f.severity || 'MEDIUM'),
                            status: String(f.status || 'OPEN'),
                            controlId: String(f.control?.controlId || ''),
                            controlName: String(f.control?.name || ''),
                            actionsCount: f.actions?.length || 0,
                        })));
                    }

                    if (data.actions?.length && actions.length === 0) {
                        setActions(data.actions.map((a: any) => ({
                            id: String(a.id || ''),
                            actionId: String(a.actionId || ''),
                            description: String(a.description || ''),
                            status: String(a.status || 'OPEN'),
                            dueDate: a.dueDate || new Date().toISOString(),
                            owner: `${a.owner?.firstName || ''} ${a.owner?.lastName || ''}`.trim(),
                            findingId: String(a.finding?.findingId || ''),
                            findingDescription: String(a.finding?.description || '').substring(0, 50),
                        })));
                    }
                }
            } catch (err) {
                console.error('Failed to fetch risk:', err);
                // Keep demo data on error
            } finally {
                setLoading(false);
            }
        };
        if (params.id) {
            fetchRiskData();
        }
    }, [params.id]);

    const tabs = [
        { id: 'summary', label: 'Özet', icon: '📋' },
        { id: 'controls', label: 'Kontroller', icon: '🛡️', count: controls.length },
        { id: 'actions', label: 'Aksiyonlar', icon: '📌', count: actions.filter(a => a.status !== 'COMPLETED').length },
        { id: 'findings', label: 'Bulgular', icon: '🔍', count: findings.length },
        { id: 'history', label: 'Geçmiş', icon: '📜' },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!risk) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <span className="text-4xl mb-2">⚠️</span>
                <p>Risk bulunamadı</p>
                <Link href="/risks" className="mt-4 text-blue-600 hover:underline">Risk Envanterine Dön</Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1400px] mx-auto px-6 py-6">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/risks" className="hover:text-blue-600">Risk Envanteri</Link>
                    <span>/</span>
                    <span className="text-gray-900">{risk.riskId}</span>
                </div>

                {/* Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="font-mono text-lg text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">{risk.riskId}</span>
                                <span className={`px-3 py-1 rounded-lg text-sm font-medium ${statusConfig[risk.status]?.color}`}>
                                    {statusConfig[risk.status]?.label}
                                </span>
                                {risk.appetiteStatus === 'EXCEEDED' && (
                                    <span className="px-3 py-1 rounded-lg text-sm font-medium bg-red-100 text-red-700">
                                        ⚠️ İştah Aşımı
                                    </span>
                                )}
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">{risk.name}</h1>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                                <span style={{ color: risk.category.color }}>● {risk.category.name}</span>
                                <span>Sahip: {risk.owner.name}</span>
                                <span>Güncelleme: {new Date(risk.guncellemeTarihi).toLocaleDateString('tr-TR')}</span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                            <Link
                                href={`/risks/${params.id}/edit`}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Düzenle
                            </Link>
                            <Link
                                href="/risks/assessment"
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                            >
                                Değerlendir
                            </Link>
                            <Link
                                href="/risks/treatment"
                                className="px-4 py-2 text-sm font-medium text-white bg-[#1e3a5f] rounded-lg hover:bg-[#152a45]"
                            >
                                Tedavi
                            </Link>
                        </div>
                    </div>

                    {/* Score Cards */}
                    <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Doğal Risk Skoru</p>
                            <div className="flex items-center gap-3">
                                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${getScoreColor(risk.inherentScore)} flex items-center justify-center text-white text-xl font-bold`}>
                                    {risk.inherentScore}
                                </div>
                                <div className="text-sm text-gray-600">
                                    <p>Olasılık: {risk.inherentProbability}</p>
                                    <p>Etki: {risk.inherentImpact}</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Rezidüel Risk Skoru</p>
                            <div className="flex items-center gap-3">
                                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${getScoreColor(risk.residualScore)} flex items-center justify-center text-white text-xl font-bold`}>
                                    {risk.residualScore}
                                </div>
                                <div className="text-sm text-gray-600">
                                    <p>Olasılık: {risk.residualProbability}</p>
                                    <p>Etki: {risk.residualImpact}</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Risk İştahı</p>
                            <div className="flex items-center gap-3">
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white text-xl font-bold">
                                    {risk.riskAppetite}
                                </div>
                                <div className="text-sm">
                                    {risk.residualScore > risk.riskAppetite ? (
                                        <span className="text-red-600 font-medium">Aşıldı (+{risk.residualScore - risk.riskAppetite})</span>
                                    ) : (
                                        <span className="text-green-600 font-medium">İçinde (-{risk.riskAppetite - risk.residualScore})</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Tedavi Kararı</p>
                            <div className="flex items-center gap-3">
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center text-white text-2xl">
                                    📉
                                </div>
                                <div className="text-sm text-gray-900 font-medium">
                                    {treatmentLabels[risk.treatmentDecision] || 'Belirlenmedi'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="flex border-b border-gray-100">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                className={`px-6 py-4 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === tab.id
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <span>{tab.icon}</span>
                                {tab.label}
                                {tab.count !== undefined && (
                                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="p-6">
                        {activeTab === 'summary' && (
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <h3 className="font-semibold text-gray-900 mb-3">Risk Açıklaması</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed">{risk.description}</p>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 mb-3">Risk Sahibi</h3>
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <p className="font-medium text-gray-900">{risk.owner.name}</p>
                                        <p className="text-sm text-gray-500">{risk.owner.department}</p>
                                        <p className="text-sm text-blue-600">{risk.owner.email}</p>
                                    </div>

                                    <h3 className="font-semibold text-gray-900 mt-6 mb-3">Önemli Tarihler</h3>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Mutabakat Tarihi:</span>
                                            <span className="text-gray-900">{risk.mutabakatTarihi ? new Date(risk.mutabakatTarihi).toLocaleDateString('tr-TR') : '-'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Oluşturma Tarihi:</span>
                                            <span className="text-gray-900">{new Date(risk.olusturmaTarihi).toLocaleDateString('tr-TR')}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Güncelleme Tarihi:</span>
                                            <span className="text-gray-900">{new Date(risk.guncellemeTarihi).toLocaleDateString('tr-TR')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'controls' && (
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-sm text-gray-500">{controls.length} kontrol bu riskle ilişkilendirilmiş</p>
                                    <Link href={`/risks/${params.id}/controls`} className="text-sm text-blue-600 hover:underline">
                                        Kontrol Ekle →
                                    </Link>
                                </div>
                                <div className="space-y-3">
                                    {controls.map(control => (
                                        <div key={control.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
                                                    🛡️
                                                </div>
                                                <div>
                                                    <p className="font-mono text-sm text-green-600">{control.controlId}</p>
                                                    <p className="font-medium text-gray-900">{control.name}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-sm text-gray-500">{control.type}</span>
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${effectivenessConfig[control.effectiveness]?.color}`}>
                                                    {effectivenessConfig[control.effectiveness]?.label}
                                                </span>
                                                <Link href={`/controls/${control.id}`} className="text-gray-400 hover:text-blue-600">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </Link>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'actions' && (
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-sm text-gray-500">{actions.length} aksiyon bu riskle ilişkilendirilmiş</p>
                                    <Link href="/actions/new" className="text-sm text-blue-600 hover:underline">
                                        Yeni Aksiyon →
                                    </Link>
                                </div>
                                <div className="space-y-3">
                                    {actions.map(action => (
                                        <div key={action.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600">
                                                    📌
                                                </div>
                                                <div>
                                                    <p className="font-mono text-sm text-orange-600">{action.actionId}</p>
                                                    <p className="text-gray-900">{action.description}</p>
                                                    <p className="text-xs text-gray-500">Sorumlu: {action.owner}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${actionStatusConfig[action.status]?.color}`}>
                                                    {actionStatusConfig[action.status]?.label}
                                                </span>
                                                <span className="text-gray-500">
                                                    {new Date(action.dueDate).toLocaleDateString('tr-TR')}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'findings' && (
                            <div>
                                <p className="text-sm text-gray-500 mb-4">Bu riske bağlı kontrollerin bulguları (Kontrol → Bulgu zinciri)</p>
                                {findings.length === 0 ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <span className="text-4xl mb-3 block">🔍</span>
                                        <p>Bu riskle ilişkili bulgu bulunmamaktadır</p>
                                        <p className="text-xs mt-2">Bulgular, kontroller üzerinden bu riske bağlanır</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {findings.map((finding) => {
                                            const severityConfig: Record<string, { label: string; color: string }> = {
                                                CRITICAL: { label: 'Kritik', color: 'bg-red-100 text-red-700' },
                                                HIGH: { label: 'Yüksek', color: 'bg-orange-100 text-orange-700' },
                                                MEDIUM: { label: 'Orta', color: 'bg-yellow-100 text-yellow-700' },
                                                LOW: { label: 'Düşük', color: 'bg-green-100 text-green-700' },
                                            };
                                            const findingStatusConfig: Record<string, { label: string; color: string }> = {
                                                OPEN: { label: 'Açık', color: 'bg-blue-100 text-blue-700' },
                                                IN_PROGRESS: { label: 'İşlemde', color: 'bg-yellow-100 text-yellow-700' },
                                                RESOLVED: { label: 'Çözüldü', color: 'bg-green-100 text-green-700' },
                                                CLOSED: { label: 'Kapatıldı', color: 'bg-gray-100 text-gray-600' },
                                            };
                                            const severity = severityConfig[finding.severity] || severityConfig.MEDIUM;
                                            const status = findingStatusConfig[finding.status] || findingStatusConfig.OPEN;

                                            return (
                                                <div key={finding.id} className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span className="text-sm font-mono text-gray-500">{finding.findingId}</span>
                                                                <span className={`text-xs px-2 py-0.5 rounded-full ${severity.color}`}>
                                                                    {severity.label}
                                                                </span>
                                                                <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>
                                                                    {status.label}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-gray-900 mb-2">{finding.description}</p>
                                                            <div className="flex items-center gap-4 text-xs text-gray-500">
                                                                <span className="flex items-center gap-1">
                                                                    🛡️ {finding.controlId} - {finding.controlName}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    📌 {finding.actionsCount} aksiyon
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <Link
                                                            href={`/findings/${finding.id}`}
                                                            className="text-blue-600 hover:text-blue-700 text-sm"
                                                        >
                                                            Detay →
                                                        </Link>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'history' && (
                            <div>
                                <p className="text-sm text-gray-500 mb-4">Risk değişiklik geçmişi</p>
                                <div className="space-y-4">
                                    {AUDIT_LOG.map((log, index) => (
                                        <div key={index} className="flex items-start gap-4">
                                            <div className="w-2 h-2 mt-2 bg-blue-400 rounded-full"></div>
                                            <div className="flex-1">
                                                <p className="text-sm text-gray-900">{log.action}</p>
                                                <p className="text-xs text-gray-500">{log.user} • {log.date}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
