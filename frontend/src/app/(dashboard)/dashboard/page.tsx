'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface DashboardData {
    summary: {
        totalRisks: number;
        risksAboveAppetite: number;
        openFindings: number;
        criticalFindings: number;
        overdueActions: number;
        totalControls: number;
    };
    risksByScore: {
        high: number;
        medium: number;
        low: number;
    };
    riskTrend: Array<{
        month: string;
        total: number;
        high: number;
    }>;
    controlEffectiveness: Array<{
        effectivenessStatus: string;
        _count: number;
    }>;
}


export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getDashboard()
            .then((res) => setData(res as DashboardData))
            .catch((err) => console.error('Failed to load dashboard:', err))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Title */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-500 mt-1">Organizasyonun güncel risk durumu</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Risk Score Distribution */}
                <Link href="/risks?score=high" className="group">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-red-200 transition-all cursor-pointer">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Yüksek Riskler</p>
                                <p className="text-3xl font-bold text-red-600 mt-1">{data?.risksByScore?.high || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center group-hover:bg-red-200 transition-colors">
                                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-sm text-gray-400 mt-3">Skor ≥ 15</p>
                    </div>
                </Link>

                <Link href="/risks?score=medium" className="group">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-yellow-200 transition-all cursor-pointer">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Orta Riskler</p>
                                <p className="text-3xl font-bold text-yellow-600 mt-1">{data?.risksByScore?.medium || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center group-hover:bg-yellow-200 transition-colors">
                                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-sm text-gray-400 mt-3">Skor 8-14</p>
                    </div>
                </Link>

                <Link href="/risks?score=low" className="group">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-green-200 transition-all cursor-pointer">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Düşük Riskler</p>
                                <p className="text-3xl font-bold text-green-600 mt-1">{data?.risksByScore?.low || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center group-hover:bg-green-200 transition-colors">
                                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-sm text-gray-400 mt-3">Skor &lt; 8</p>
                    </div>
                </Link>

                <Link href="/risks?aboveAppetite=true" className="group">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-purple-200 transition-all cursor-pointer">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">İştah Üzerinde</p>
                                <p className="text-3xl font-bold text-purple-600 mt-1">{data?.summary?.risksAboveAppetite || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-sm text-gray-400 mt-3">Risk iştahını aşan</p>
                    </div>
                </Link>
            </div>

            {/* Critical Issues Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link href="/findings?severity=CRITICAL" className="group">
                    <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-6 shadow-lg cursor-pointer hover:shadow-xl transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-red-100">Kritik Bulgular</p>
                                <p className="text-4xl font-bold text-white mt-2">{data?.summary?.criticalFindings || 0}</p>
                                <p className="text-sm text-red-200 mt-2">Açık kritik seviye bulgular</p>
                            </div>
                            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </Link>

                <Link href="/actions?status=OVERDUE" className="group">
                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 shadow-lg cursor-pointer hover:shadow-xl transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-orange-100">Gecikmiş Aksiyonlar</p>
                                <p className="text-4xl font-bold text-white mt-2">{data?.summary?.overdueActions || 0}</p>
                                <p className="text-sm text-orange-200 mt-2">SLA süresi geçmiş</p>
                            </div>
                            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </Link>

                <Link href="/controls" className="group">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 shadow-lg cursor-pointer hover:shadow-xl transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-100">Toplam Kontrol</p>
                                <p className="text-4xl font-bold text-white mt-2">{data?.summary?.totalControls || 0}</p>
                                <p className="text-sm text-blue-200 mt-2">Aktif kontroller</p>
                            </div>
                            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </Link>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Risk Trend Chart */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Risk Trendi (Son 12 Ay)</h3>
                    <div className="h-64 flex items-end justify-between gap-2">
                        {data?.riskTrend?.map((item, index) => (
                            <div key={index} className="flex-1 flex flex-col items-center">
                                <div className="w-full flex flex-col gap-1">
                                    <div
                                        className="w-full bg-red-500 rounded-t"
                                        style={{ height: `${(item.high / Math.max(...data.riskTrend.map(t => t.total), 1)) * 150}px` }}
                                    ></div>
                                    <div
                                        className="w-full bg-blue-500 rounded-b"
                                        style={{ height: `${((item.total - item.high) / Math.max(...data.riskTrend.map(t => t.total), 1)) * 150}px` }}
                                    ></div>
                                </div>
                                <p className="text-xs text-gray-500 mt-2 whitespace-nowrap">{item.month.slice(0, 3)}</p>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center justify-center gap-6 mt-4">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-red-500 rounded"></div>
                            <span className="text-sm text-gray-600">Yüksek Risk</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-blue-500 rounded"></div>
                            <span className="text-sm text-gray-600">Diğer</span>
                        </div>
                    </div>
                </div>

                {/* Control Effectiveness */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Kontrol Etkinliği</h3>
                    <div className="space-y-4">
                        {data?.controlEffectiveness?.map((item, index) => {
                            const total = data.controlEffectiveness.reduce((sum, i) => sum + i._count, 0);
                            const percentage = total > 0 ? (item._count / total) * 100 : 0;
                            const labels: Record<string, { label: string; color: string }> = {
                                EFFECTIVE: { label: 'Etkin', color: 'bg-green-500' },
                                PARTIALLY_EFFECTIVE: { label: 'Kısmen Etkin', color: 'bg-yellow-500' },
                                INEFFECTIVE: { label: 'Etkin Değil', color: 'bg-red-500' },
                                NOT_TESTED: { label: 'Test Edilmedi', color: 'bg-gray-400' },
                            };
                            const config = labels[item.effectivenessStatus] || { label: item.effectivenessStatus, color: 'bg-gray-400' };

                            return (
                                <div key={index}>
                                    <div className="flex justify-between mb-1">
                                        <span className="text-sm font-medium text-gray-700">{config.label}</span>
                                        <span className="text-sm text-gray-500">{item._count} ({percentage.toFixed(0)}%)</span>
                                    </div>
                                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${config.color} rounded-full transition-all duration-500`}
                                            style={{ width: `${percentage}%` }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Hızlı Erişim</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Link href="/risks/new" className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl hover:bg-blue-50 hover:border-blue-200 border border-gray-100 transition-all">
                        <svg className="w-8 h-8 text-blue-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">Yeni Risk</span>
                    </Link>
                    <Link href="/controls/new" className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl hover:bg-green-50 hover:border-green-200 border border-gray-100 transition-all">
                        <svg className="w-8 h-8 text-green-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">Yeni Kontrol</span>
                    </Link>
                    <Link href="/findings/new" className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl hover:bg-yellow-50 hover:border-yellow-200 border border-gray-100 transition-all">
                        <svg className="w-8 h-8 text-yellow-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">Yeni Bulgu</span>
                    </Link>
                    <Link href="/reports" className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl hover:bg-purple-50 hover:border-purple-200 border border-gray-100 transition-all">
                        <svg className="w-8 h-8 text-purple-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">Raporlar</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}
