'use client';

import { useState, useEffect } from 'react';

interface Action {
    id: string;
    actionId: string;
    description: string;
    source: string;
    status: string;
    completedAt?: string;
    effectivenessStatus?: string;
    effectivenessReview?: string;
    risk?: { riskId: string; name: string };
}

const COMPLETED_ACTIONS: Action[] = [
    { id: '1', actionId: 'A-2024-0003', description: 'Yedekleme prosedürlerinin test edilmesi', source: 'CONTROL_TEST', status: 'COMPLETED', completedAt: '2024-12-15', effectivenessStatus: 'EFFECTIVE', risk: { riskId: 'R-2024-0003', name: 'Operasyonel Kesinti Riski' } },
    { id: '2', actionId: 'A-2024-0006', description: 'Firewall kurallarının güncellenmesi', source: 'RISK', status: 'COMPLETED', completedAt: '2024-12-10', effectivenessStatus: undefined, risk: { riskId: 'R-2024-0001', name: 'Siber Saldırı Riski' } },
    { id: '3', actionId: 'A-2024-0007', description: 'Erişim yetki matrisinin revizyonu', source: 'FINDING', status: 'COMPLETED', completedAt: '2024-12-08', effectivenessStatus: 'PARTIALLY_EFFECTIVE', effectivenessReview: 'Bazı yetkiler hala gözden geçirilmeli', risk: { riskId: 'R-2024-0004', name: 'Veri Sızıntısı Riski' } },
];

const effectivenessLabels: Record<string, { label: string; color: string }> = {
    EFFECTIVE: { label: 'Etkin', color: 'bg-green-100 text-green-700' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen Etkin', color: 'bg-yellow-100 text-yellow-700' },
    INEFFECTIVE: { label: 'Etkin Değil', color: 'bg-red-100 text-red-700' },
};

export default function ActionEffectivenessPage() {
    const [actions, setActions] = useState<Action[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAction, setSelectedAction] = useState<Action | null>(null);
    const [effectiveness, setEffectiveness] = useState('');
    const [review, setReview] = useState('');

    useEffect(() => {
        setTimeout(() => {
            setActions(COMPLETED_ACTIONS);
            setLoading(false);
        }, 500);
    }, []);

    const pendingReview = actions.filter(a => !a.effectivenessStatus);
    const reviewed = actions.filter(a => a.effectivenessStatus);

    const handleSaveReview = () => {
        if (!selectedAction || !effectiveness) return;

        setActions(actions.map(a =>
            a.id === selectedAction.id
                ? { ...a, effectivenessStatus: effectiveness, effectivenessReview: review }
                : a
        ));
        setSelectedAction(null);
        setEffectiveness('');
        setReview('');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Etkinlik Değerlendirmesi</h1>
                <p className="text-gray-500 mt-1">Tamamlanan aksiyonların etkinliğini değerlendirin</p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Toplam Tamamlanan</p>
                    <p className="text-2xl font-bold text-gray-900">{actions.length}</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 shadow-sm border border-orange-100">
                    <p className="text-sm text-orange-600">Değerlendirme Bekleyen</p>
                    <p className="text-2xl font-bold text-orange-600">{pendingReview.length}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 shadow-sm border border-green-100">
                    <p className="text-sm text-green-600">Etkin</p>
                    <p className="text-2xl font-bold text-green-600">{actions.filter(a => a.effectivenessStatus === 'EFFECTIVE').length}</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-4 shadow-sm border border-yellow-100">
                    <p className="text-sm text-yellow-600">Kısmen Etkin</p>
                    <p className="text-2xl font-bold text-yellow-600">{actions.filter(a => a.effectivenessStatus === 'PARTIALLY_EFFECTIVE').length}</p>
                </div>
            </div>

            {/* Pending Review Alert */}
            {pendingReview.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                    <h3 className="font-semibold text-orange-800 mb-2">Etkinlik Değerlendirmesi Bekleyen Aksiyonlar</h3>
                    <p className="text-sm text-orange-600 mb-3">Tamamlanan aksiyonların risk azaltma etkinliği değerlendirilmeli</p>
                    <div className="flex flex-wrap gap-2">
                        {pendingReview.map((action) => (
                            <button
                                key={action.id}
                                onClick={() => setSelectedAction(action)}
                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-orange-200 rounded-lg text-sm text-orange-700 hover:bg-orange-100 transition-all"
                            >
                                <span className="font-mono">{action.actionId}</span>
                                <span>→ Değerlendir</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Actions List */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <h3 className="font-semibold text-gray-900">Tamamlanan Aksiyonlar</h3>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600"></div>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {actions.map((action) => (
                                <button
                                    key={action.id}
                                    onClick={() => {
                                        setSelectedAction(action);
                                        setEffectiveness(action.effectivenessStatus || '');
                                        setReview(action.effectivenessReview || '');
                                    }}
                                    className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${selectedAction?.id === action.id ? 'bg-orange-50' : ''
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-mono text-sm text-orange-600">{action.actionId}</span>
                                        {action.effectivenessStatus ? (
                                            <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${effectivenessLabels[action.effectivenessStatus]?.color}`}>
                                                {effectivenessLabels[action.effectivenessStatus]?.label}
                                            </span>
                                        ) : (
                                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                                                Değerlendirme Bekliyor
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-900">{action.description}</p>
                                    {action.risk && (
                                        <p className="text-xs text-blue-600 mt-1">{action.risk.riskId} - {action.risk.name}</p>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Review Form */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    {!selectedAction ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                            </svg>
                            <p>Değerlendirmek için bir aksiyon seçin</p>
                        </div>
                    ) : (
                        <>
                            <div className="mb-6 pb-6 border-b border-gray-100">
                                <span className="font-mono text-sm text-orange-600">{selectedAction.actionId}</span>
                                <h3 className="text-lg font-semibold text-gray-900 mt-1">{selectedAction.description}</h3>
                                <p className="text-sm text-gray-500 mt-2">
                                    Tamamlanma: {selectedAction.completedAt && new Date(selectedAction.completedAt).toLocaleDateString('tr-TR')}
                                </p>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-3">Etkinlik Durumu</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {Object.entries(effectivenessLabels).map(([key, { label, color }]) => (
                                        <button
                                            key={key}
                                            onClick={() => setEffectiveness(key)}
                                            className={`py-3 rounded-xl font-medium text-sm transition-all ${effectiveness === key
                                                    ? color + ' ring-2 ring-offset-2'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Değerlendirme Notu</label>
                                <textarea
                                    value={review}
                                    onChange={(e) => setReview(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                                    rows={4}
                                    placeholder="Aksiyon sonrası risk durumu hakkında notlar..."
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setSelectedAction(null)}
                                    className="px-6 py-2.5 text-gray-600"
                                >
                                    İptal
                                </button>
                                <button
                                    onClick={handleSaveReview}
                                    disabled={!effectiveness}
                                    className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-medium rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all disabled:opacity-50"
                                >
                                    Değerlendirmeyi Kaydet
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
