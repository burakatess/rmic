'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import {
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// Types
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

interface TrendData {
    month: string;
    year: number;
    total: number;
    high: number;
    medium: number;
    low: number;
    avgScore: number;
}

interface HeatmapCell {
    count: number;
    risks: Array<{ id: string; riskId: string; name: string }>;
}

// Colors
const COLORS = {
    high: '#EF4444',
    medium: '#F59E0B',
    low: '#10B981',
    primary: '#8B5CF6',
    blue: '#3B82F6',
};

const PIE_COLORS = ['#EF4444', '#F59E0B', '#10B981'];

// Heat map color based on risk score (probability * impact position)
const getHeatmapColor = (row: number, col: number): string => {
    const score = (5 - row) * (col + 1); // Convert position to score
    if (score >= 15) return 'bg-red-500 hover:bg-red-600';
    if (score >= 10) return 'bg-orange-400 hover:bg-orange-500';
    if (score >= 5) return 'bg-yellow-400 hover:bg-yellow-500';
    return 'bg-green-400 hover:bg-green-500';
};

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [trendData, setTrendData] = useState<TrendData[]>([]);
    const [heatmapData, setHeatmapData] = useState<HeatmapCell[][]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [dashboardRes, trendRes, heatmapRes] = await Promise.all([
                    api.getDashboard(),
                    api.request('/reports/risk-trend-enhanced'),
                    api.request('/reports/risk-heatmap'),
                ]);
                setData(dashboardRes as DashboardData);
                setTrendData(trendRes as TrendData[]);
                setHeatmapData(heatmapRes as HeatmapCell[][]);
            } catch (err) {
                console.error('Failed to load dashboard:', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    // Prepare pie chart data
    const pieData = [
        { name: 'Yüksek', value: data?.risksByScore?.high || 0 },
        { name: 'Orta', value: data?.risksByScore?.medium || 0 },
        { name: 'Düşük', value: data?.risksByScore?.low || 0 },
    ].filter(d => d.value > 0);

    // Control effectiveness for donut
    const controlData = data?.controlEffectiveness?.map(item => {
        const labels: Record<string, string> = {
            EFFECTIVE: 'Etkin',
            PARTIALLY_EFFECTIVE: 'Kısmen Etkin',
            INEFFECTIVE: 'Etkin Değil',
            NOT_TESTED: 'Test Edilmedi',
        };
        return {
            name: labels[item.effectivenessStatus] || item.effectivenessStatus,
            value: item._count,
        };
    }) || [];

    const CONTROL_COLORS = ['#10B981', '#F59E0B', '#EF4444', '#9CA3AF'];

    return (
        <div className="space-y-6">
            {/* Page Title */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-500 mt-1">Organizasyonun güncel risk durumu ve analitikler</p>
            </div>

            {/* KPI Cards Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link href="/risks?score=high" className="group">
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-red-200 transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Yüksek Riskler</p>
                                <p className="text-3xl font-bold text-red-600 mt-1">{data?.risksByScore?.high || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Skor ≥ 15</p>
                    </div>
                </Link>

                <Link href="/risks?score=medium" className="group">
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-yellow-200 transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Orta Riskler</p>
                                <p className="text-3xl font-bold text-yellow-600 mt-1">{data?.risksByScore?.medium || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Skor 8-14</p>
                    </div>
                </Link>

                <Link href="/risks?score=low" className="group">
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-green-200 transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Düşük Riskler</p>
                                <p className="text-3xl font-bold text-green-600 mt-1">{data?.risksByScore?.low || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Skor &lt; 8</p>
                    </div>
                </Link>

                <Link href="/risks?aboveAppetite=true" className="group">
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-purple-200 transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">İştah Üzerinde</p>
                                <p className="text-3xl font-bold text-purple-600 mt-1">{data?.summary?.risksAboveAppetite || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Risk iştahını aşan</p>
                    </div>
                </Link>
            </div>

            {/* Critical Issues Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link href="/findings?severity=CRITICAL">
                    <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-5 shadow-lg hover:shadow-xl transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-red-100">Kritik Bulgular</p>
                                <p className="text-4xl font-bold text-white mt-2">{data?.summary?.criticalFindings || 0}</p>
                                <p className="text-xs text-red-200 mt-2">Açık kritik seviye</p>
                            </div>
                            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </Link>

                <Link href="/actions?status=OVERDUE">
                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-5 shadow-lg hover:shadow-xl transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-orange-100">Gecikmiş Aksiyonlar</p>
                                <p className="text-4xl font-bold text-white mt-2">{data?.summary?.overdueActions || 0}</p>
                                <p className="text-xs text-orange-200 mt-2">SLA süresi geçmiş</p>
                            </div>
                            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </Link>

                <Link href="/controls">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 shadow-lg hover:shadow-xl transition-all">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-100">Toplam Kontrol</p>
                                <p className="text-4xl font-bold text-white mt-2">{data?.summary?.totalControls || 0}</p>
                                <p className="text-xs text-blue-200 mt-2">Aktif kontroller</p>
                            </div>
                            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </Link>
            </div>

            {/* Charts Row 1 - Trend & Heat Map */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Risk Trend Chart */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Risk Trendi (Son 12 Ay)</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData}>
                                <defs>
                                    <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS.high} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={COLORS.high} stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorMedium" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS.medium} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={COLORS.medium} stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorLow" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS.low} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={COLORS.low} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'white',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                    }}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="high" name="Yüksek" stackId="1" stroke={COLORS.high} fill="url(#colorHigh)" />
                                <Area type="monotone" dataKey="medium" name="Orta" stackId="1" stroke={COLORS.medium} fill="url(#colorMedium)" />
                                <Area type="monotone" dataKey="low" name="Düşük" stackId="1" stroke={COLORS.low} fill="url(#colorLow)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Risk Heat Map */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Risk Isı Haritası (Olasılık × Etki)</h3>
                    <div className="flex gap-4">
                        {/* Y Axis Label */}
                        <div className="flex flex-col justify-between text-xs text-gray-500 py-1">
                            <span>5</span>
                            <span>4</span>
                            <span>3</span>
                            <span>2</span>
                            <span>1</span>
                        </div>

                        {/* Heat Map Grid */}
                        <div className="flex-1">
                            <div className="grid grid-cols-5 gap-1">
                                {heatmapData.map((row, rowIndex) =>
                                    row.map((cell, colIndex) => (
                                        <div
                                            key={`${rowIndex}-${colIndex}`}
                                            className={`aspect-square rounded-lg flex items-center justify-center text-white font-bold text-sm cursor-pointer transition-all ${getHeatmapColor(rowIndex, colIndex)} ${cell.count > 0 ? 'ring-2 ring-white ring-offset-1' : 'opacity-70'}`}
                                            onMouseEnter={() => setHoveredCell({ row: rowIndex, col: colIndex })}
                                            onMouseLeave={() => setHoveredCell(null)}
                                        >
                                            {cell.count > 0 ? cell.count : ''}
                                        </div>
                                    ))
                                )}
                            </div>
                            {/* X Axis Labels */}
                            <div className="grid grid-cols-5 gap-1 mt-2">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="text-center text-xs text-gray-500">{i}</div>
                                ))}
                            </div>
                            <div className="text-center text-xs text-gray-400 mt-1">Etki →</div>
                        </div>

                        {/* Y Axis Title */}
                        <div className="flex items-center">
                            <span className="text-xs text-gray-400 transform -rotate-90 whitespace-nowrap">Olasılık →</span>
                        </div>
                    </div>

                    {/* Tooltip */}
                    {hoveredCell && heatmapData[hoveredCell.row]?.[hoveredCell.col]?.risks?.length > 0 && (
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm font-medium text-gray-700 mb-2">
                                Olasılık: {5 - hoveredCell.row}, Etki: {hoveredCell.col + 1}
                            </p>
                            <div className="space-y-1">
                                {heatmapData[hoveredCell.row][hoveredCell.col].risks.slice(0, 5).map(risk => (
                                    <Link key={risk.id} href={`/risks/${risk.id}`} className="block text-xs text-purple-600 hover:underline">
                                        {risk.riskId}: {risk.name}
                                    </Link>
                                ))}
                                {heatmapData[hoveredCell.row][hoveredCell.col].risks.length > 5 && (
                                    <p className="text-xs text-gray-500">+{heatmapData[hoveredCell.row][hoveredCell.col].risks.length - 5} daha...</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Charts Row 2 - Pie Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Risk Distribution Pie */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Risk Dağılımı</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={3}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {pieData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Control Effectiveness Pie */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Kontrol Etkinliği</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={controlData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={3}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {controlData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={CONTROL_COLORS[index % CONTROL_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Average Risk Score Trend */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Ortalama Risk Skoru Trendi</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                            <YAxis domain={[0, 25]} tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px'
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="avgScore"
                                name="Ort. Skor"
                                stroke={COLORS.primary}
                                strokeWidth={3}
                                dot={{ fill: COLORS.primary, strokeWidth: 2, r: 4 }}
                                activeDot={{ r: 6, fill: COLORS.primary }}
                            />
                            {/* Risk appetite line */}
                            <Line
                                type="monotone"
                                dataKey={() => 12}
                                name="Risk İştahı"
                                stroke="#DC2626"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                dot={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
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
