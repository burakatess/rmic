'use client';

import { useState } from 'react';
import Link from 'next/link';

// Types
interface Action {
    id: string;
    actionId: string;
    description: string;
    owner: string;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
    dueDate: string;
    progress: number;
}

interface Risk {
    id: string;
    riskId: string;
    name: string;
    description: string;
    owner: string;
    ownerDepartment: string;
    category: string;
    inherentScore: number;
    residualScore: number;
    riskAppetite: number;
    treatmentDecision: 'MITIGATE' | 'ACCEPT' | 'TRANSFER' | 'AVOID' | null;
    treatmentApproval: boolean;
    treatmentApprovedBy: string | null;
    treatmentApprovedAt: string | null;
    actions: Action[];
}

// Demo Data
const DEMO_RISKS: Risk[] = [
    {
        id: '1', riskId: 'R-2024-0001', name: 'Siber Saldırı Riski',
        description: 'Kurum sistemlerine yönelik siber saldırılar sonucu veri kaybı veya sistem kesintisi yaşanması riski.',
        owner: 'Ahmet Yılmaz', ownerDepartment: 'BT Güvenlik', category: 'BT Riski',
        inherentScore: 20, residualScore: 8, riskAppetite: 10,
        treatmentDecision: 'MITIGATE', treatmentApproval: true, treatmentApprovedBy: 'Risk Komitesi', treatmentApprovedAt: '2024-11-20',
        actions: [
            { id: '1', actionId: 'A-2024-0001', description: 'Güvenlik duvarı kurallarının güncellenmesi', owner: 'Ali Demir', status: 'COMPLETED', dueDate: '2024-12-01', progress: 100 },
            { id: '2', actionId: 'A-2024-0002', description: 'Sızma testi yaptırılması', owner: 'Ayşe Kaya', status: 'IN_PROGRESS', dueDate: '2024-12-31', progress: 60 },
        ]
    },
    {
        id: '2', riskId: 'R-2024-0002', name: 'Regülasyon Uyumsuzluk Riski',
        description: 'BDDK ve KVKK regülasyonlarına uyumsuzluk nedeniyle yaptırım uygulanması riski.',
        owner: 'Fatma Demir', ownerDepartment: 'Uyum Birimi', category: 'Uyum Riski',
        inherentScore: 15, residualScore: 8, riskAppetite: 8,
        treatmentDecision: null, treatmentApproval: false, treatmentApprovedBy: null, treatmentApprovedAt: null,
        actions: []
    },
    {
        id: '3', riskId: 'R-2024-0003', name: 'Operasyonel Hata Riski',
        description: 'Manuel süreçlerde insan hatası nedeniyle müşteri mağduriyeti veya finansal kayıp oluşması riski.',
        owner: 'Mehmet Kaya', ownerDepartment: 'Operasyon', category: 'Operasyonel Risk',
        inherentScore: 12, residualScore: 6, riskAppetite: 8,
        treatmentDecision: 'ACCEPT', treatmentApproval: false, treatmentApprovedBy: null, treatmentApprovedAt: null,
        actions: []
    },
    {
        id: '4', riskId: 'R-2024-0004', name: 'Veri Sızıntısı Riski',
        description: 'Müşteri verilerinin izinsiz olarak üçüncü taraflarla paylaşılması veya sızdırılması riski.',
        owner: 'Ayşe Çelik', ownerDepartment: 'BT Güvenlik', category: 'BT Riski',
        inherentScore: 15, residualScore: 4, riskAppetite: 6,
        treatmentDecision: 'MITIGATE', treatmentApproval: true, treatmentApprovedBy: 'Risk Komitesi', treatmentApprovedAt: '2024-10-15',
        actions: [
            { id: '3', actionId: 'A-2024-0003', description: 'DLP çözümü implementasyonu', owner: 'Zeynep Arslan', status: 'IN_PROGRESS', dueDate: '2025-01-31', progress: 40 },
        ]
    },
    {
        id: '5', riskId: 'R-2024-0005', name: 'Kritik Sistem Kesintisi Riski',
        description: 'Kritik bankacılık sistemlerinde yaşanacak kesintiler nedeniyle hizmet aksaması riski.',
        owner: 'Ali Öztürk', ownerDepartment: 'BT Operasyon', category: 'BT Riski',
        inherentScore: 10, residualScore: 4, riskAppetite: 5,
        treatmentDecision: 'TRANSFER', treatmentApproval: false, treatmentApprovedBy: null, treatmentApprovedAt: null,
        actions: []
    },
];

const TREATMENT_OPTIONS = [
    { value: 'MITIGATE', label: 'Azalt', description: 'Kontroller ile riski kabul edilebilir seviyeye düşür', icon: '↓', color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { value: 'ACCEPT', label: 'Kabul Et', description: 'Riski mevcut seviyesinde kabul et', icon: '✓', color: 'bg-green-50 border-green-200 text-green-700' },
    { value: 'TRANSFER', label: 'Devret', description: 'Riski sigorta veya üçüncü tarafa devret', icon: '→', color: 'bg-purple-50 border-purple-200 text-purple-700' },
    { value: 'AVOID', label: 'Kaçın', description: 'Risk içeren faaliyeti sonlandır', icon: '✕', color: 'bg-red-50 border-red-200 text-red-700' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    NOT_STARTED: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Başlamadı' },
    IN_PROGRESS: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Devam Ediyor' },
    COMPLETED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Tamamlandı' },
    OVERDUE: { bg: 'bg-red-100', text: 'text-red-700', label: 'Gecikmiş' },
};

export default function RiskTreatmentPage() {
    const [risks, setRisks] = useState<Risk[]>(DEMO_RISKS);
    const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'pending' | 'mitigate' | 'above'>('all');
    const [showActionModal, setShowActionModal] = useState(false);
    const [newAction, setNewAction] = useState({ description: '', owner: '', dueDate: '' });

    const selectedRisk = risks.find(r => r.id === selectedRiskId);

    // Filter risks
    const filteredRisks = risks.filter(risk => {
        if (filter === 'pending') return !risk.treatmentDecision;
        if (filter === 'mitigate') return risk.treatmentDecision === 'MITIGATE';
        if (filter === 'above') return risk.residualScore > risk.riskAppetite;
        return true;
    });

    const pendingCount = risks.filter(r => !r.treatmentDecision).length;
    const aboveAppetiteCount = risks.filter(r => r.residualScore > r.riskAppetite).length;

    const handleSelectRisk = (riskId: string) => {
        setSelectedRiskId(riskId);
    };

    const handleTreatmentDecision = (decision: typeof TREATMENT_OPTIONS[0]['value']) => {
        if (!selectedRiskId) return;
        setRisks(prev => prev.map(r => {
            if (r.id === selectedRiskId) {
                return { ...r, treatmentDecision: decision as Risk['treatmentDecision'] };
            }
            return r;
        }));
    };

    const handleApproval = () => {
        if (!selectedRiskId) return;
        setRisks(prev => prev.map(r => {
            if (r.id === selectedRiskId) {
                return {
                    ...r,
                    treatmentApproval: true,
                    treatmentApprovedBy: 'Risk Komitesi',
                    treatmentApprovedAt: new Date().toISOString().split('T')[0],
                };
            }
            return r;
        }));
    };

    const handleAddAction = () => {
        if (!selectedRiskId || !newAction.description) return;
        const action: Action = {
            id: Date.now().toString(),
            actionId: `A-2024-${String(Date.now()).slice(-4)}`,
            description: newAction.description,
            owner: newAction.owner || 'Belirtilmedi',
            status: 'NOT_STARTED',
            dueDate: newAction.dueDate || '2025-01-31',
            progress: 0,
        };
        setRisks(prev => prev.map(r => {
            if (r.id === selectedRiskId) {
                return { ...r, actions: [...r.actions, action] };
            }
            return r;
        }));
        setShowActionModal(false);
        setNewAction({ description: '', owner: '', dueDate: '' });
    };

    return (
        <div className="flex h-[calc(100vh-120px)] gap-6">
            {/* LEFT PANEL - Risk List */}
            <div className="w-[380px] flex-shrink-0 flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <h2 className="text-sm font-semibold text-gray-900">Risk Tedavi Kararları</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{filteredRisks.length} risk listeleniyor</p>
                </div>

                {/* Filters */}
                <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1.5">
                    {[
                        { key: 'all', label: 'Tümü' },
                        { key: 'pending', label: 'Karar Bekleyen', count: pendingCount },
                        { key: 'mitigate', label: 'Azaltma' },
                        { key: 'above', label: 'Risk İştahı Üstü', count: aboveAppetiteCount },
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
                            {f.count !== undefined && f.count > 0 && (
                                <span className="ml-1 px-1 text-[10px] bg-amber-200 text-amber-800 rounded">{f.count}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Risk List */}
                <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                    {filteredRisks.map(risk => (
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
                                        {risk.residualScore > risk.riskAppetite && (
                                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700 border border-red-200">
                                                İştah Üstü
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{risk.name}</p>
                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                                        <span>Artık: {risk.residualScore}</span>
                                        <span>•</span>
                                        <span>İştah: {risk.riskAppetite}</span>
                                        <span>•</span>
                                        {risk.treatmentDecision ? (
                                            <span className="text-green-600">{TREATMENT_OPTIONS.find(t => t.value === risk.treatmentDecision)?.label}</span>
                                        ) : (
                                            <span className="text-amber-600">Karar Bekliyor</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* RIGHT PANEL - Treatment Detail */}
            <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
                {!selectedRisk ? (
                    /* Empty State */
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Tedavi kararı almak için sol taraftan bir risk seçin</h3>
                        <p className="text-sm text-gray-500 max-w-md">
                            Risk tedavi sürecinde riskleri azaltma, kabul etme, devretme veya kaçınma kararları verilebilir.
                        </p>
                    </div>
                ) : (
                    /* Treatment Content */
                    <div className="flex-1 overflow-y-auto">
                        {/* Risk Overview */}
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Link href={`/risks/${selectedRisk.id}`} className="text-sm font-semibold text-blue-700 hover:underline">
                                            {selectedRisk.riskId}
                                        </Link>
                                        {selectedRisk.treatmentApproval && (
                                            <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700 border border-green-200">
                                                ✓ Onaylandı
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="text-lg font-semibold text-gray-900 mt-1">{selectedRisk.name}</h2>
                                    <p className="text-sm text-gray-600 mt-1">{selectedRisk.description}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6 mt-3 text-xs text-gray-500">
                                <div className="flex items-center gap-4">
                                    <div>
                                        <span className="text-gray-400">Doğal Risk:</span>
                                        <span className="ml-1 font-semibold text-gray-900">{selectedRisk.inherentScore}</span>
                                    </div>
                                    <span className="text-gray-300">→</span>
                                    <div>
                                        <span className="text-gray-400">Artık Risk:</span>
                                        <span className={`ml-1 font-semibold ${selectedRisk.residualScore > selectedRisk.riskAppetite ? 'text-red-600' : 'text-green-600'}`}>
                                            {selectedRisk.residualScore}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Risk İştahı:</span>
                                        <span className="ml-1 font-semibold text-gray-700">{selectedRisk.riskAppetite}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Treatment Decision */}
                        <div className="px-6 py-5 border-b border-gray-200">
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">Tedavi Kararı</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {TREATMENT_OPTIONS.map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => handleTreatmentDecision(option.value)}
                                        className={`p-4 rounded-lg border-2 text-left transition-all ${selectedRisk.treatmentDecision === option.value
                                            ? `${option.color} border-current ring-2 ring-offset-2 ring-current`
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-lg">{option.icon}</span>
                                            <span className="text-sm font-semibold">{option.label}</span>
                                        </div>
                                        <p className="text-xs text-gray-500">{option.description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Approval Status */}
                        {selectedRisk.treatmentDecision && (
                            <div className="px-6 py-4 border-b border-gray-200">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900">Onay Durumu</h3>
                                        {selectedRisk.treatmentApproval ? (
                                            <p className="text-xs text-gray-500 mt-1">
                                                {selectedRisk.treatmentApprovedBy} tarafından {selectedRisk.treatmentApprovedAt} tarihinde onaylandı.
                                            </p>
                                        ) : (
                                            <p className="text-xs text-amber-600 mt-1">Onay bekleniyor</p>
                                        )}
                                    </div>
                                    {!selectedRisk.treatmentApproval && (
                                        <button
                                            onClick={handleApproval}
                                            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                                        >
                                            Onayla
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Actions (if MITIGATE) */}
                        {selectedRisk.treatmentDecision === 'MITIGATE' && (
                            <div className="px-6 py-5 border-b border-gray-200">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-semibold text-gray-900">Azaltma Aksiyonları</h3>
                                    <button
                                        onClick={() => setShowActionModal(true)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Aksiyon Ekle
                                    </button>
                                </div>

                                {selectedRisk.actions.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedRisk.actions.map(action => (
                                            <div key={action.id} className="p-3 bg-gray-50 rounded-lg">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <Link href={`/actions/${action.id}`} className="text-sm font-medium text-blue-700 hover:underline">
                                                                {action.actionId}
                                                            </Link>
                                                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${STATUS_COLORS[action.status].bg} ${STATUS_COLORS[action.status].text}`}>
                                                                {STATUS_COLORS[action.status].label}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-gray-700 mt-1">{action.description}</p>
                                                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                                            <span>Sorumlu: {action.owner}</span>
                                                            <span>•</span>
                                                            <span>Hedef: {action.dueDate}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-sm font-semibold text-gray-900">{action.progress}%</span>
                                                        <div className="w-16 h-1.5 bg-gray-200 rounded-full mt-1">
                                                            <div
                                                                className="h-full bg-blue-600 rounded-full"
                                                                style={{ width: `${action.progress}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                                        Henüz azaltma aksiyonu tanımlanmamış. Riski azaltmak için aksiyon ekleyin.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Summary */}
                        <div className="px-6 py-4">
                            <div className="p-4 bg-gray-50 rounded-lg">
                                <h4 className="text-xs font-semibold text-gray-700 mb-2">Tedavi Özeti</h4>
                                <div className="grid grid-cols-3 gap-4 text-xs">
                                    <div>
                                        <span className="text-gray-400">Karar:</span>
                                        <span className="ml-1 font-medium text-gray-900">
                                            {selectedRisk.treatmentDecision
                                                ? TREATMENT_OPTIONS.find(t => t.value === selectedRisk.treatmentDecision)?.label
                                                : 'Belirlenmedi'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Onay:</span>
                                        <span className={`ml-1 font-medium ${selectedRisk.treatmentApproval ? 'text-green-600' : 'text-amber-600'}`}>
                                            {selectedRisk.treatmentApproval ? 'Onaylandı' : 'Bekliyor'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Aksiyon:</span>
                                        <span className="ml-1 font-medium text-gray-900">{selectedRisk.actions.length} adet</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Add Action Modal */}
            {showActionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl w-full max-w-md mx-4 shadow-2xl">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">Yeni Aksiyon Ekle</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Aksiyon Açıklaması *</label>
                                <textarea
                                    value={newAction.description}
                                    onChange={(e) => setNewAction({ ...newAction, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                                    rows={3}
                                    placeholder="Yapılacak işlemi açıklayın..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Sorumlu</label>
                                <input
                                    type="text"
                                    value={newAction.owner}
                                    onChange={(e) => setNewAction({ ...newAction, owner: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    placeholder="Ad Soyad"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Hedef Tarih</label>
                                <input
                                    type="date"
                                    value={newAction.dueDate}
                                    onChange={(e) => setNewAction({ ...newAction, dueDate: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => setShowActionModal(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleAddAction}
                                className="px-4 py-2 text-sm font-medium text-white bg-slate-700 rounded-lg hover:bg-slate-800"
                            >
                                Aksiyon Ekle
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
