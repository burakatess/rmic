'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { PageHeader, PageShell, KpiCard, KpiGrid, LoadingState } from '@/components/ui';
import { useAuth } from '@/components/auth/AuthProvider';
import MyWorkSection from '@/components/dashboard/MyWorkSection';
import {
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardData {
    summary: {
        totalRisks: number;
        risksAboveAppetite: number;
        openFindings: number;
        criticalFindings: number;
        criticalHighFindings: number;
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
    controlTestStatusDistribution: Array<{ status: string; _count: number }>;
    findingWorkflowStatusDistribution: Array<{ workflowStatus: string; _count: number }>;
    followUpResultDistribution: Array<{ result: string; _count: number }>;
    overdueActionsByDirectorate: Array<{ directorateId: string | null; directorateName: string; count: number }>;
    findingsByDirectorate: Array<{ directorateId: string | null; directorateName: string; count: number }>;
}

const CONTROL_TEST_STATUS_LABELS: Record<string, string> = {
    BEKLIYOR: 'Bekliyor', DEVAM_EDIYOR: 'Devam Ediyor', TAMAMLANDI: 'Tamamlandı', ONAYLANDI: 'Onaylandı',
};
const WORKFLOW_STATUS_LABELS: Record<string, string> = {
    TASLAK: 'Taslak', MUTABAKATA_GONDERILDI: 'Mutabakata Gönderildi',
    IC_KONTROL_ONAYINA_GONDERILDI: 'İç Kontrol Onayında', MUTABAKAT_YAPILDI: 'Mutabakat Yapıldı', IPTAL: 'İptal',
};
const FOLLOWUP_RESULT_LABELS: Record<string, string> = {
    YETERLI: 'Yeterli', YETERSIZ: 'Yetersiz', YENI_AKSIYON_GEREKLI: 'Yeni Aksiyon Gerekli',
};

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

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
    high: '#EF4444',
    medium: '#F59E0B',
    low: '#10B981',
    primary: '#4F46E5',
    blue: '#3B82F6',
};

const PIE_COLORS = ['#EF4444', '#F59E0B', '#10B981'];
const CONTROL_COLORS = ['#10B981', '#F59E0B', '#EF4444', '#9CA3AF'];

// Heat map color based on risk score (probability * impact position)
const getHeatmapColor = (row: number, col: number): string => {
    const score = (5 - row) * (col + 1);
    if (score >= 15) return 'bg-red-500 hover:bg-red-600 ring-red-200';
    if (score >= 10) return 'bg-amber-400 hover:bg-amber-500 ring-amber-200';
    if (score >= 5) return 'bg-yellow-400 hover:bg-yellow-500 ring-yellow-200';
    return 'bg-emerald-400 hover:bg-emerald-500 ring-emerald-200';
};

// ─── Ortak section kartı ─────────────────────────────────────────────────────

function SectionCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white rounded-xl p-6 shadow-sm border border-slate-200 ${className}`}>
            <h3 className="text-sm font-semibold text-slate-700 mb-4">{title}</h3>
            {children}
        </div>
    );
}

// ─── Rol Bazlı Dashboard ──────────────────────────────────────────────────────

function RoleDashboard({ roleName, firstName }: { roleName: string; firstName?: string }) {
    const [heatmapData, setHeatmapData] = useState<HeatmapCell[][]>([]);
    const [actionPerf, setActionPerf] = useState<any | null>(null);
    const showHeatmap = roleName === 'RISK_ANALYST';
    const showActionPerf = roleName === 'IKS_MANAGER' || roleName === 'AUDITOR';

    useEffect(() => {
        if (showHeatmap) {
            api.request('/reports/risk-heatmap').then((d: any) => setHeatmapData(d)).catch(() => { });
        }
        if (showActionPerf) {
            api.request('/reports/action-performance').then((d: any) => setActionPerf(d)).catch(() => { });
        }
    }, [showHeatmap, showActionPerf]);

    const roleLabels: Record<string, string> = {
        IKS_EMPLOYEE: 'İKS Çalışanı', IKS_MANAGER: 'İKS Yöneticisi',
        AUDITOR: 'Denetçi', RISK_ANALYST: 'Risk Analisti', VIEWER: 'İzleyici',
    };

    return (
        <PageShell>
            <div className="space-y-6">
                <PageHeader
                    title={`Hoş geldiniz${firstName ? `, ${firstName}` : ''}`}
                    description={`${roleLabels[roleName] ?? roleName} paneli — bu ayki işleriniz ve öncelikleriniz`}
                />

                <MyWorkSection />

                {showActionPerf && actionPerf && (
                    <SectionCard title="Aksiyon Performansı">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {Object.entries(actionPerf).filter(([, v]) => typeof v === 'number').slice(0, 4).map(([k, v]) => (
                                <div key={k} className="bg-slate-50 rounded-lg p-4">
                                    <p className="text-xs text-slate-500">{k}</p>
                                    <p className="text-2xl font-bold tabular-nums text-slate-800">{String(v)}</p>
                                </div>
                            ))}
                        </div>
                    </SectionCard>
                )}

                {showHeatmap && heatmapData.length > 0 && (
                    <SectionCard title="Risk Isı Haritası">
                        <div className="grid grid-cols-5 gap-1 max-w-md">
                            {heatmapData.map((row, ri) => row.map((cell, ci) => (
                                <div key={`${ri}-${ci}`}
                                    className={`aspect-square rounded flex items-center justify-center text-white text-sm font-bold ${getHeatmapColor(ri, ci)}`}>
                                    {cell.count > 0 ? cell.count : ''}
                                </div>
                            )))}
                        </div>
                    </SectionCard>
                )}
            </div>
        </PageShell>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const { user } = useAuth();
    const roleName = user?.role?.name ?? 'VIEWER';
    const isFullDashboard = roleName === 'SYSTEM_ADMIN' || roleName === 'ADMIN'
        || roleName === 'RISK_CONTROL_MANAGER' || user?.role?.permissions?.includes('*');

    if (!isFullDashboard) {
        return <RoleDashboard roleName={roleName} firstName={user?.firstName} />;
    }
    return <AdminDashboard />;
}

function AdminDashboard() {
    const router = useRouter();
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
            <PageShell>
                <LoadingState message="Panel verileri yükleniyor..." />
            </PageShell>
        );
    }

    const pieData = [
        { name: 'Yüksek', value: data?.risksByScore?.high || 0 },
        { name: 'Orta', value: data?.risksByScore?.medium || 0 },
        { name: 'Düşük', value: data?.risksByScore?.low || 0 },
    ].filter(d => d.value > 0);

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

    return (
        <PageShell>
            <PageHeader
                title="GRC Yönetim Paneli"
                description="Organizasyonun güncel risk, kontrol ve bulgu durumu analizleri"
            />

            {/* Risk Dağılımı KPI'ları — tümü click-to-filter */}
            <KpiGrid columns={4}>
                <KpiCard
                    title="Yüksek Riskler"
                    value={data?.risksByScore?.high || 0}
                    variant="critical"
                    subtitle="Skor ≥ 15 olan riskler"
                    onClick={() => router.push('/risks?score=high')}
                    icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    }
                />
                <KpiCard
                    title="Orta Riskler"
                    value={data?.risksByScore?.medium || 0}
                    variant="warning"
                    subtitle="Skor 8-14 arası riskler"
                    onClick={() => router.push('/risks?score=medium')}
                    icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    }
                />
                <KpiCard
                    title="Düşük Riskler"
                    value={data?.risksByScore?.low || 0}
                    variant="success"
                    subtitle="Skor < 8 olan riskler"
                    onClick={() => router.push('/risks?score=low')}
                    icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    }
                />
                <KpiCard
                    title="İştah Üzerinde"
                    value={data?.summary?.risksAboveAppetite || 0}
                    variant="violet"
                    subtitle="Risk iştahını aşanlar"
                    onClick={() => router.push('/risks?aboveAppetite=true')}
                    icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    }
                />
            </KpiGrid>

            {/* Kritik Konular KPI'ları */}
            <KpiGrid columns={3} className="mb-6">
                <KpiCard
                    title="Açık Kritik Bulgular"
                    value={data?.summary?.criticalFindings || 0}
                    variant="critical"
                    subtitle={`Kritik + Yüksek: ${data?.summary?.criticalHighFindings ?? 0}`}
                    onClick={() => router.push('/findings?severity=CRITICAL')}
                    icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    }
                />
                <KpiCard
                    title="Gecikmiş Aksiyonlar"
                    value={data?.summary?.overdueActions || 0}
                    variant="high"
                    subtitle="Filtreli aksiyon listesi"
                    onClick={() => router.push('/actions?status=OVERDUE')}
                    icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    }
                />
                <KpiCard
                    title="Toplam Kontrol Sayısı"
                    value={data?.summary?.totalControls || 0}
                    variant="primary"
                    subtitle="Kontrol envanteri"
                    onClick={() => router.push('/controls')}
                    icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    }
                />
            </KpiGrid>

            {/* Charts Row 1 - Trend & Heat Map */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Risk Trend Chart */}
                <SectionCard title="Risk Trendi (Son 12 Ay)">
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
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                                <Area type="monotone" dataKey="high" name="Yüksek" stackId="1" stroke={COLORS.high} fill="url(#colorHigh)" strokeWidth={2} />
                                <Area type="monotone" dataKey="medium" name="Orta" stackId="1" stroke={COLORS.medium} fill="url(#colorMedium)" strokeWidth={2} />
                                <Area type="monotone" dataKey="low" name="Düşük" stackId="1" stroke={COLORS.low} fill="url(#colorLow)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </SectionCard>

                {/* Risk Heat Map */}
                <SectionCard title="Risk Isı Haritası (Olasılık × Etki)">
                    <div className="flex gap-4 h-72">
                        {/* Y Axis Label */}
                        <div className="flex flex-col justify-between text-xs font-medium text-slate-400 py-1 pb-6">
                            <span>5</span>
                            <span>4</span>
                            <span>3</span>
                            <span>2</span>
                            <span>1</span>
                        </div>

                        {/* Heat Map Grid */}
                        <div className="flex-1 flex flex-col">
                            <div className="grid grid-cols-5 gap-1.5 flex-1">
                                {heatmapData.map((row, rowIndex) =>
                                    row.map((cell, colIndex) => (
                                        <div
                                            key={`${rowIndex}-${colIndex}`}
                                            className={`rounded-lg flex items-center justify-center text-white font-bold text-base cursor-pointer transition-all hover:ring-2 ring-offset-2 ${getHeatmapColor(rowIndex, colIndex)} ${cell.count === 0 && 'opacity-60 saturate-50'}`}
                                            onMouseEnter={() => setHoveredCell({ row: rowIndex, col: colIndex })}
                                            onMouseLeave={() => setHoveredCell(null)}
                                        >
                                            {cell.count > 0 ? cell.count : ''}
                                        </div>
                                    ))
                                )}
                            </div>
                            {/* X Axis Labels */}
                            <div className="grid grid-cols-5 gap-1.5 mt-3">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="text-center text-xs font-medium text-slate-400">{i}</div>
                                ))}
                            </div>
                            <div className="text-center text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-1">Etki Derecesi →</div>
                        </div>

                        {/* Y Axis Title */}
                        <div className="flex items-center">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest transform -rotate-90 whitespace-nowrap">Olasılık →</span>
                        </div>
                    </div>

                    {/* Hover Tooltip for Heatmap */}
                    {hoveredCell && heatmapData[hoveredCell.row]?.[hoveredCell.col]?.risks?.length > 0 && (
                        <div className="absolute bg-white border border-slate-200 shadow-xl rounded-xl p-4 mt-2 z-10 min-w-[250px] animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex items-center gap-2 mb-3">
                                <div className={`w-3 h-3 rounded-full ${getHeatmapColor(hoveredCell.row, hoveredCell.col)}`} />
                                <p className="text-sm font-bold text-slate-800">
                                    Skor: {(5 - hoveredCell.row) * (hoveredCell.col + 1)} <span className="text-slate-400 font-normal">(O: {5 - hoveredCell.row}, E: {hoveredCell.col + 1})</span>
                                </p>
                            </div>
                            <div className="space-y-2">
                                {heatmapData[hoveredCell.row][hoveredCell.col].risks.slice(0, 5).map(risk => (
                                    <Link key={risk.id} href={`/risks/${risk.id}`} className="block text-xs font-medium text-slate-600 hover:text-blue-600 truncate">
                                        <span className="text-slate-400 mr-2">{risk.riskId}</span>
                                        {risk.name}
                                    </Link>
                                ))}
                                {heatmapData[hoveredCell.row][hoveredCell.col].risks.length > 5 && (
                                    <p className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block mt-2">
                                        +{heatmapData[hoveredCell.row][hoveredCell.col].risks.length - 5} risk daha
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </SectionCard>
            </div>

            {/* Charts Row 2 - Pie Charts & Avg Trend */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <SectionCard title="Risk Dağılımı">
                    <div className="h-60">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%" cy="50%"
                                    innerRadius={65} outerRadius={85}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                    labelLine={false}
                                >
                                    {pieData.map((_, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </SectionCard>

                <SectionCard title="Kontrol Etkinliği">
                    <div className="h-60">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={controlData}
                                    cx="50%" cy="50%"
                                    innerRadius={65} outerRadius={85}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                    labelLine={false}
                                >
                                    {controlData.map((_, index) => <Cell key={`cell-${index}`} fill={CONTROL_COLORS[index % CONTROL_COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </SectionCard>

                <SectionCard title="Ort. Risk Skoru Trendi">
                    <div className="h-60">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 25]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                                <Line type="monotone" dataKey="avgScore" name="Ort. Skor" stroke={COLORS.primary} strokeWidth={3} dot={{ fill: COLORS.primary, strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: COLORS.primary }} />
                                {/* Not: Sabit "Risk İştahı" referans çizgisi kaldırıldı — sistemde
                                    organizasyon geneli tek bir eşik değeri (skaler) tutulmuyor,
                                    yalnızca risk bazlı isAboveAppetite bayrağı var. Yanıltıcı sabit
                                    veri göstermek yerine çizgi kaldırıldı; "İştah Üzerinde" KPI kartı
                                    (yukarıda) gerçek veriye dayalı eşdeğer bilgiyi zaten sağlıyor. */}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </SectionCard>
            </div>

            {/* Durum Dağılımları */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <SectionCard title="Kontrol Testi Durum Dağılımı">
                    <div className="space-y-2">
                        {(data?.controlTestStatusDistribution ?? []).map(d => (
                            <div key={d.status} className="flex items-center justify-between text-sm">
                                <span className="text-slate-600">{CONTROL_TEST_STATUS_LABELS[d.status] ?? d.status}</span>
                                <span className="font-bold tabular-nums text-slate-800">{d._count}</span>
                            </div>
                        ))}
                        {(!data?.controlTestStatusDistribution || data.controlTestStatusDistribution.length === 0) && (
                            <p className="text-xs text-slate-400">Veri yok</p>
                        )}
                    </div>
                </SectionCard>

                <SectionCard title="Mutabakat Workflow Durumu">
                    <div className="space-y-2">
                        {(data?.findingWorkflowStatusDistribution ?? []).map(d => (
                            <div key={d.workflowStatus} className="flex items-center justify-between text-sm">
                                <span className="text-slate-600">{WORKFLOW_STATUS_LABELS[d.workflowStatus] ?? d.workflowStatus}</span>
                                <span className="font-bold tabular-nums text-slate-800">{d._count}</span>
                            </div>
                        ))}
                        {(!data?.findingWorkflowStatusDistribution || data.findingWorkflowStatusDistribution.length === 0) && (
                            <p className="text-xs text-slate-400">Veri yok</p>
                        )}
                    </div>
                </SectionCard>

                <SectionCard title="Takip Çalışması Sonuç Dağılımı">
                    <div className="space-y-2">
                        {(data?.followUpResultDistribution ?? []).map(d => (
                            <div key={d.result} className="flex items-center justify-between text-sm">
                                <span className="text-slate-600">{FOLLOWUP_RESULT_LABELS[d.result] ?? d.result}</span>
                                <span className="font-bold tabular-nums text-slate-800">{d._count}</span>
                            </div>
                        ))}
                        {(!data?.followUpResultDistribution || data.followUpResultDistribution.length === 0) && (
                            <p className="text-xs text-slate-400">Veri yok</p>
                        )}
                    </div>
                </SectionCard>
            </div>

            {/* Direktörlük Bazlı Dağılımlar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <SectionCard title="Direktörlük Bazlı Açık Bulgular">
                    <div className="space-y-2">
                        {(data?.findingsByDirectorate ?? []).map(d => (
                            <div key={d.directorateId ?? 'none'} className="flex items-center justify-between text-sm">
                                <span className="text-slate-600">{d.directorateName}</span>
                                <span className="font-bold tabular-nums text-slate-800">{d.count}</span>
                            </div>
                        ))}
                        {(!data?.findingsByDirectorate || data.findingsByDirectorate.length === 0) && (
                            <p className="text-xs text-slate-400">Açık bulgu yok</p>
                        )}
                    </div>
                </SectionCard>

                <SectionCard title="Direktörlük Bazlı Gecikmiş Aksiyonlar">
                    <div className="space-y-2">
                        {(data?.overdueActionsByDirectorate ?? []).map(d => (
                            <div key={d.directorateId ?? 'none'} className="flex items-center justify-between text-sm">
                                <span className="text-slate-600">{d.directorateName}</span>
                                <span className="font-bold tabular-nums text-red-600">{d.count}</span>
                            </div>
                        ))}
                        {(!data?.overdueActionsByDirectorate || data.overdueActionsByDirectorate.length === 0) && (
                            <p className="text-xs text-slate-400">Gecikmiş aksiyon yok</p>
                        )}
                    </div>
                </SectionCard>
            </div>

            {/* Quick Actions Footer */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Link href="/risks/new" className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </div>
                    <span className="font-semibold text-slate-700">Yeni Risk</span>
                </Link>
                <Link href="/controls/new" className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all group">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </div>
                    <span className="font-semibold text-slate-700">Yeni Kontrol</span>
                </Link>
                <Link href="/findings/new" className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-violet-300 hover:shadow-md transition-all group">
                    <div className="p-3 bg-violet-50 text-violet-600 rounded-lg group-hover:bg-violet-600 group-hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </div>
                    <span className="font-semibold text-slate-700">Yeni Bulgu</span>
                </Link>
                <Link href="/reports" className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-slate-400 hover:shadow-md transition-all group">
                    <div className="p-3 bg-slate-100 text-slate-600 rounded-lg group-hover:bg-slate-700 group-hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <span className="font-semibold text-slate-700">Raporlar</span>
                </Link>
            </div>
        </PageShell>
    );
}
