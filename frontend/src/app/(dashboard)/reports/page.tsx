'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface ExecutiveSummary {
    riskSummary: {
        total: number;
        high: number;
        medium: number;
        low: number;
        aboveAppetite: number;
        averageScore: number;
    };
    controlSummary: {
        total: number;
        effective: number;
        partiallyEffective: number;
        ineffective: number;
        notTested: number;
        effectivenessRate: number;
    };
    findingSummary: {
        total: number;
        open: number;
        critical: number;
        high: number;
    };
    actionSummary: {
        total: number;
        open: number;
        overdue: number;
        completionRate: number;
    };
}

export default function ReportsPage() {
    const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSummary();
    }, []);

    const loadSummary = async () => {
        try {
            const data = await api.getExecutiveSummary() as ExecutiveSummary;
            setSummary(data);
        } catch (error) {
            console.error('Failed to load summary:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Raporlama & Analitik</h1>
                    <p className="text-gray-500 mt-1">Yönetim raporları ve performans metrikleri</p>
                </div>
                <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-medium rounded-xl hover:from-indigo-600 hover:to-indigo-700 transition-all shadow-sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Rapor İndir
                </button>
            </div>

            {/* Executive Summary */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 text-white">
                <h2 className="text-xl font-semibold mb-6">Yönetici Özeti</h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {/* Risk Summary */}
                    <div className="bg-white/10 backdrop-blur rounded-2xl p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
                                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <span className="text-sm text-gray-300">Riskler</span>
                        </div>
                        <p className="text-3xl font-bold">{summary?.riskSummary?.total || 0}</p>
                        <p className="text-sm text-gray-400 mt-1">{summary?.riskSummary?.high || 0} yüksek risk</p>
                    </div>

                    {/* Control Summary */}
                    <div className="bg-white/10 backdrop-blur rounded-2xl p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                            </div>
                            <span className="text-sm text-gray-300">Kontroller</span>
                        </div>
                        <p className="text-3xl font-bold">{summary?.controlSummary?.total || 0}</p>
                        <p className="text-sm text-gray-400 mt-1">%{(summary?.controlSummary?.effectivenessRate || 0).toFixed(0)} etkinlik</p>
                    </div>

                    {/* Finding Summary */}
                    <div className="bg-white/10 backdrop-blur rounded-2xl p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            </div>
                            <span className="text-sm text-gray-300">Bulgular</span>
                        </div>
                        <p className="text-3xl font-bold">{summary?.findingSummary?.open || 0}</p>
                        <p className="text-sm text-gray-400 mt-1">{summary?.findingSummary?.critical || 0} kritik açık</p>
                    </div>

                    {/* Action Summary */}
                    <div className="bg-white/10 backdrop-blur rounded-2xl p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
                                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                            <span className="text-sm text-gray-300">Aksiyonlar</span>
                        </div>
                        <p className="text-3xl font-bold">{summary?.actionSummary?.open || 0}</p>
                        <p className="text-sm text-gray-400 mt-1">{summary?.actionSummary?.overdue || 0} gecikmiş</p>
                    </div>
                </div>
            </div>

            {/* Report Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all cursor-pointer">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Risk Trend Raporu</h3>
                    <p className="text-sm text-gray-500 mb-4">Son 12 aylık risk seviyesi değişimleri</p>
                    <span className="text-sm text-blue-600 font-medium">Görüntüle →</span>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all cursor-pointer">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Kontrol Etkinlik Raporu</h3>
                    <p className="text-sm text-gray-500 mb-4">Kontrol test sonuçları ve etkinlik analizi</p>
                    <span className="text-sm text-green-600 font-medium">Görüntüle →</span>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all cursor-pointer">
                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Aksiyon Performans Raporu</h3>
                    <p className="text-sm text-gray-500 mb-4">SLA uyumu ve tamamlanma oranları</p>
                    <span className="text-sm text-orange-600 font-medium">Görüntüle →</span>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all cursor-pointer">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Denetim Özet Raporu</h3>
                    <p className="text-sm text-gray-500 mb-4">Denetim planları ve bulgu dağılımı</p>
                    <span className="text-sm text-purple-600 font-medium">Görüntüle →</span>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all cursor-pointer">
                    <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Uyum Durumu Raporu</h3>
                    <p className="text-sm text-gray-500 mb-4">Regülasyon eşleştirme ve uyum oranları</p>
                    <span className="text-sm text-indigo-600 font-medium">Görüntüle →</span>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all cursor-pointer">
                    <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Risk Isı Haritası</h3>
                    <p className="text-sm text-gray-500 mb-4">Olasılık-Etki matrisi görselleştirmesi</p>
                    <span className="text-sm text-red-600 font-medium">Görüntüle →</span>
                </div>
            </div>
        </div>
    );
}
