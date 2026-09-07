'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/lib/api';
import { PageShell, PageHeader, Button, KpiCard as SharedKpiCard, type KpiVariant } from '@/components/ui';
import {
    PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Directorate { id: string; name: string; }

interface MonthlyFinding {
    id: string; findingId: string; summary?: string; description?: string;
    severity: string; resolutionStatus: string; workflowStatus?: string;
    targetResolutionDate?: string; closedDate?: string; createdAt: string;
    directorate?: { name: string };
    responsiblePerson?: string; gmy?: string;
}
interface MonthlyAction {
    id: string; actionId: string; description: string;
    status: string; dueDate: string;
    finding?: { findingId: string; summary?: string };
    owner?: { firstName: string; lastName: string };
    directorate?: { name: string };
}
interface MonthlyFollowUp {
    id: string; followUpId: string; status: string;
    plannedDate?: string; result?: string; approvalStatus?: string;
    finding?: { findingId: string; summary?: string };
    directorate?: { name: string };
}
interface MonthlyReport {
    period: { label: string; start: string; end: string };
    directorate: { id: string; name: string } | null;
    summary: {
        newFindings: number; closedFindings: number; postponedFindings: number;
        totalOpenFindings: number; criticalOpen: number;
        overdueActions: number; approachingActions: number;
        followUpsCompleted: number; followUpsPending: number;
    };
    findingsBySeverity: { severity: string; count: number }[];
    findingsByResolutionStatus: { status: string; count: number }[];
    actionsByStatus: { status: string; count: number }[];
    findingsByDirectorate: { name: string; count: number }[];
    monthlyTrend: { month: string; newFindings: number; closedFindings: number }[];
    newFindings: MonthlyFinding[];
    closedFindings: MonthlyFinding[];
    postponedFindings: MonthlyFinding[];
    overdueActions: MonthlyAction[];
    approachingActions: MonthlyAction[];
    followUps: MonthlyFollowUp[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = [
    { value: '', label: 'Tüm Yıl' },
    { value: '1', label: 'Ocak' }, { value: '2', label: 'Şubat' },
    { value: '3', label: 'Mart' }, { value: '4', label: 'Nisan' },
    { value: '5', label: 'Mayıs' }, { value: '6', label: 'Haziran' },
    { value: '7', label: 'Temmuz' }, { value: '8', label: 'Ağustos' },
    { value: '9', label: 'Eylül' }, { value: '10', label: 'Ekim' },
    { value: '11', label: 'Kasım' }, { value: '12', label: 'Aralık' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

const SEVERITY_COLORS: Record<string, string> = {
    CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#F59E0B', LOW: '#10B981',
};
const SEVERITY_LABELS: Record<string, string> = {
    CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük',
};
const RESOLUTION_LABELS: Record<string, string> = {
    DEVAM_EDIYOR: 'Devam Ediyor', KISMEN_KAPATILDI: 'Kısmen Kapatıldı',
    KAPATILDI: 'Kapatıldı', ERTELENDI: 'Ertelendi', YENI_AKSIYON_GEREKLI: 'Yeni Aksiyon',
};
const ACTION_STATUS_LABELS: Record<string, string> = {
    BEKLIYOR: 'Bekliyor', DEVAM_EDIYOR: 'Devam Ediyor', TAMAMLANDI: 'Tamamlandı',
    YETERSIZ: 'Yetersiz', KAPATILDI: 'Kapatıldı',
};
const ACTION_COLORS = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

const fmt = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('tr-TR') : '—';

const dayDiff = (d: string) =>
    Math.round((new Date().getTime() - new Date(d).getTime()) / 86400000);

// ─── Sub-components ───────────────────────────────────────────────────────────

const KPI_COLOR_TO_VARIANT: Record<'red' | 'amber' | 'green' | 'indigo' | 'slate', KpiVariant> = {
    red: 'critical', amber: 'warning', green: 'success', indigo: 'primary', slate: 'default',
};

function KpiCard({ label, value, sub, color }: {
    label: string; value: number; sub?: string; color: 'red' | 'amber' | 'green' | 'indigo' | 'slate';
}) {
    return (
        <SharedKpiCard title={label} value={value} subtitle={sub} variant={KPI_COLOR_TO_VARIANT[color]} />
    );
}

function SectionTitle({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
    return (
        <div className="flex items-center gap-3 mb-4 mt-8">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">{icon}</div>
            <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
            {count !== undefined && (
                <span className="ml-1 px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">{count}</span>
            )}
        </div>
    );
}

function SimpleTable({ headers, rows, emptyText = 'Kayıt bulunamadı.' }: {
    headers: string[];
    rows: React.ReactNode[][];
    emptyText?: string;
}) {
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="grc-table">
                <thead>
                    <tr>
                        {headers.map(h => (
                            <th key={h}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-slate-400 text-sm">{emptyText}</td></tr>
                    ) : (
                        rows.map((row, i) => (
                            <tr key={i}>
                                {row.map((cell, j) => (
                                    <td key={j} className="text-slate-700">{cell}</td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MonthlyReportPage() {
    const [mode, setMode] = useState<'month' | 'range'>('month');
    const [year, setYear] = useState(String(CURRENT_YEAR));
    const [month, setMonth] = useState(String(new Date().getMonth() + 1));
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [directorateId, setDirectorateId] = useState('');
    const [directorates, setDirectorates] = useState<Directorate[]>([]);
    const [report, setReport] = useState<MonthlyReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [downloadingWord, setDownloadingWord] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api.request('/directorates').then((d: any) => setDirectorates(Array.isArray(d) ? d : d?.data ?? [])).catch(() => { });
    }, []);

    const buildParams = useCallback(() => {
        const p = new URLSearchParams();
        if (mode === 'month') {
            p.set('year', year);
            if (month) p.set('month', month);
        } else {
            if (startDate) p.set('startDate', startDate);
            if (endDate) p.set('endDate', endDate);
        }
        if (directorateId) p.set('directorateId', directorateId);
        return p;
    }, [mode, year, month, startDate, endDate, directorateId]);

    const handleLoad = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await api.request(`/reports/monthly?${buildParams()}`) as MonthlyReport;
            setReport(data);
        } catch {
            setError('Rapor verisi yüklenirken hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadWord = async () => {
        setDownloadingWord(true);
        try {
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/reports/monthly/word?${buildParams()}`,
                { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } }
            );
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Aylik_Yonetim_Raporu_${year}${month ? '_' + month : ''}.docx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            alert('Word dosyası indirilemedi.');
        } finally {
            setDownloadingWord(false);
        }
    };

    const handleExcel = () => {
        if (!report) return;
        const wb = XLSX.utils.book_new();

        const addSheet = (name: string, headers: string[], rows: (string | number)[][]) => {
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            XLSX.utils.book_append_sheet(wb, ws, name);
        };

        addSheet('Yeni Bulgular',
            ['Bulgu No', 'Özet', 'Önem', 'Direktörlük', 'Hedef Tarih', 'Çözüm Durumu'],
            report.newFindings.map(f => [
                f.findingId, f.summary || f.description?.substring(0, 100) || '',
                SEVERITY_LABELS[f.severity] || f.severity,
                f.directorate?.name || '',
                fmt(f.targetResolutionDate),
                RESOLUTION_LABELS[f.resolutionStatus] || f.resolutionStatus,
            ])
        );

        addSheet('Vadesi Geçmiş Aksiyonlar',
            ['Aksiyon No', 'Bağlı Bulgu', 'Sorumlu', 'Vade Tarihi', 'Gecikme (Gün)', 'Durum'],
            report.overdueActions.map(a => [
                a.actionId, a.finding?.findingId || '',
                `${a.owner?.firstName || ''} ${a.owner?.lastName || ''}`.trim(),
                fmt(a.dueDate), dayDiff(a.dueDate),
                ACTION_STATUS_LABELS[a.status] || a.status,
            ])
        );

        addSheet('Tarihi Yaklaşan Aksiyonlar',
            ['Aksiyon No', 'Bağlı Bulgu', 'Sorumlu', 'Vade Tarihi', 'Durum'],
            report.approachingActions.map(a => [
                a.actionId, a.finding?.findingId || '',
                `${a.owner?.firstName || ''} ${a.owner?.lastName || ''}`.trim(),
                fmt(a.dueDate), ACTION_STATUS_LABELS[a.status] || a.status,
            ])
        );

        addSheet('Takip Çalışmaları',
            ['Takip No', 'Bağlı Bulgu', 'Planlanan Tarih', 'Sonuç', 'Onay'],
            report.followUps.map(f => [
                f.followUpId, f.finding?.findingId || '',
                fmt(f.plannedDate),
                f.result === 'YETERLI' ? 'Yeterli' : f.result === 'YETERSIZ' ? 'Yetersiz' : f.result === 'YENI_AKSIYON_GEREKLI' ? 'Yeni Aksiyon' : '—',
                f.approvalStatus === 'ONAYLANDI' ? 'Onaylandı' : f.approvalStatus === 'REDDEDILDI' ? 'Reddedildi' : 'Bekliyor',
            ])
        );

        addSheet('Kapanan Bulgular',
            ['Bulgu No', 'Özet', 'Önem', 'Direktörlük', 'Kapanış Tarihi', 'Karar'],
            report.closedFindings.map(f => [
                f.findingId, f.summary || f.description?.substring(0, 100) || '',
                SEVERITY_LABELS[f.severity] || f.severity,
                f.directorate?.name || '',
                fmt(f.closedDate),
                RESOLUTION_LABELS[f.resolutionStatus] || f.resolutionStatus,
            ])
        );

        addSheet('Ertelenen Bulgular',
            ['Bulgu No', 'Özet', 'Önem', 'Direktörlük', 'Hedef Tarih', 'Sorumlu'],
            report.postponedFindings.map(f => [
                f.findingId, f.summary || f.description?.substring(0, 100) || '',
                SEVERITY_LABELS[f.severity] || f.severity,
                f.directorate?.name || '', fmt(f.targetResolutionDate),
                f.responsiblePerson || '',
            ])
        );

        XLSX.writeFile(wb, `Aylik_Rapor_${year}${month ? '_' + month : ''}.xlsx`);
    };

    const pieData = useMemo(() =>
        report?.findingsBySeverity.map(d => ({
            name: SEVERITY_LABELS[d.severity] || d.severity,
            value: d.count,
            fill: SEVERITY_COLORS[d.severity] || '#94A3B8',
        })) ?? []
    , [report]);

    const actionPieData = useMemo(() =>
        report?.actionsByStatus.map((d, i) => ({
            name: ACTION_STATUS_LABELS[d.status] || d.status,
            value: d.count,
            fill: ACTION_COLORS[i % ACTION_COLORS.length],
        })) ?? []
    , [report]);

    return (
        <PageShell className="print:px-4 print:pt-4 print:pb-0">
            <PageHeader
                title="Aylık Yönetim Raporu"
                description="Bulgu, aksiyon ve takip çalışmalarının yönetim özeti"
                breadcrumbs={[{ label: 'Raporlama & Analitik', href: '/reports' }, { label: 'Aylık Yönetim Raporu' }]}
            />

            {/* Filters */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 print:hidden">
                {/* Mode toggle */}
                <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-1">Periyot:</span>
                    <button
                        onClick={() => setMode('month')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${mode === 'month' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        Ay Seçimi
                    </button>
                    <button
                        onClick={() => setMode('range')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${mode === 'range' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        Tarih Aralığı
                    </button>
                </div>

                <div className="flex flex-wrap items-end gap-4">
                    {mode === 'month' ? (
                        <>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Yıl</label>
                                <select value={year} onChange={e => setYear(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus-visible:ring-2 ring-blue-100">
                                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Ay</label>
                                <select value={month} onChange={e => setMonth(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus-visible:ring-2 ring-blue-100">
                                    {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Başlangıç</label>
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus-visible:ring-2 ring-blue-100" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Bitiş</label>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus-visible:ring-2 ring-blue-100" />
                            </div>
                        </>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Direktörlük</label>
                        <select value={directorateId} onChange={e => setDirectorateId(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus-visible:ring-2 ring-blue-100 min-w-[180px]">
                            <option value="">Tüm Direktörlükler</option>
                            {directorates.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>

                    <Button onClick={handleLoad} loading={loading}>
                        {loading ? 'Yükleniyor...' : 'Raporu Oluştur'}
                    </Button>

                    {report && (
                        <div className="flex gap-2 ml-auto">
                            <Button
                                variant="secondary"
                                onClick={handleDownloadWord}
                                loading={downloadingWord}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                            >
                                {downloadingWord ? 'İndiriliyor...' : 'Word'}
                            </Button>
                            <Button
                                variant="success"
                                onClick={handleExcel}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                            >
                                Excel
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => window.print()}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>}
                            >
                                Yazdır / PDF
                            </Button>
                        </div>
                    )}
                </div>

                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </div>

            {/* Empty state */}
            {!report && !loading && (
                <div className="mt-6 bg-white rounded-xl border border-slate-200 p-16 text-center">
                    <div className="w-16 h-16 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <p className="text-slate-600 font-medium">Filtre seçip "Raporu Oluştur" butonuna tıklayın.</p>
                </div>
            )}

            {/* Report content */}
            {report && (
                <div className="mt-6 space-y-6 print:mx-0 print:mt-0">
                    {/* Print header */}
                    <div className="hidden print:block text-center mb-6">
                        <h1 className="text-2xl font-bold text-slate-900">AYLIK YÖNETİM RAPORU</h1>
                        <p className="text-lg text-blue-700 font-semibold mt-1">{report.period.label}</p>
                        {report.directorate && <p className="text-slate-600">{report.directorate.name}</p>}
                        <p className="text-sm text-slate-400 mt-1">Oluşturulma: {new Date().toLocaleDateString('tr-TR')}</p>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <KpiCard label="Yeni Bulgu" value={report.summary.newFindings} color="indigo" />
                        <KpiCard label="Kapanan Bulgu" value={report.summary.closedFindings} color="green" />
                        <KpiCard label="Ertelenen Bulgu" value={report.summary.postponedFindings} color="amber" />
                        <KpiCard label="Vadesi Geçmiş Aksiyon" value={report.summary.overdueActions} color="red" />
                        <KpiCard label="Tarihi Yaklaşan Aksiyon" value={report.summary.approachingActions} sub="30 gün içinde" color="amber" />
                        <KpiCard label="Bekleyen Takip" value={report.summary.followUpsPending} color="slate" />
                    </div>

                    {/* Additional KPIs row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <SharedKpiCard title="Toplam Açık Bulgu" value={report.summary.totalOpenFindings} variant="default" />
                        <SharedKpiCard title="Kritik Açık Bulgu" value={report.summary.criticalOpen} variant="critical" />
                        <SharedKpiCard title="Tamamlanan Takip" value={report.summary.followUpsCompleted} variant="success" />
                        <SharedKpiCard title="Direktörlük" value={report.directorate?.name ?? 'Tüm Direktörlükler'} variant="default" />
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Pie: Severity */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h3 className="text-sm font-bold text-slate-700 mb-4">Açık Bulgular — Önem Dağılımı</h3>
                            {pieData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                                            {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : <p className="text-center text-slate-400 py-10 text-sm">Veri bulunamadı.</p>}
                        </div>

                        {/* Bar: Directorate */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h3 className="text-sm font-bold text-slate-700 mb-4">Direktörlük Bazında Açık Bulgular</h3>
                            {report.findingsByDirectorate.length > 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={report.findingsByDirectorate} layout="vertical" margin={{ left: 16, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                                        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                                        <Tooltip />
                                        <Bar dataKey="count" name="Bulgu" fill="#6366F1" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <p className="text-center text-slate-400 py-10 text-sm">Veri bulunamadı.</p>}
                        </div>

                        {/* Pie: Action status */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h3 className="text-sm font-bold text-slate-700 mb-4">Aksiyon Durum Dağılımı</h3>
                            {actionPieData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie data={actionPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                                            {actionPieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : <p className="text-center text-slate-400 py-10 text-sm">Veri bulunamadı.</p>}
                        </div>

                        {/* Line: 6-month trend */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h3 className="text-sm font-bold text-slate-700 mb-4">6 Aylık Bulgu Trendi</h3>
                            {report.monthlyTrend.length > 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <LineChart data={report.monthlyTrend} margin={{ left: 0, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                        <Tooltip />
                                        <Legend />
                                        <Line type="monotone" dataKey="newFindings" name="Yeni Bulgu" stroke="#6366F1" strokeWidth={2} dot />
                                        <Line type="monotone" dataKey="closedFindings" name="Kapanan" stroke="#10B981" strokeWidth={2} dot />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : <p className="text-center text-slate-400 py-10 text-sm">Veri bulunamadı.</p>}
                        </div>
                    </div>

                    {/* Section: New Findings */}
                    <SectionTitle
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                        title="Yeni Tespit Edilen Bulgular"
                        count={report.newFindings.length}
                    />
                    <SimpleTable
                        headers={['Bulgu No', 'Özet', 'Önem', 'Direktörlük', 'Hedef Tarih', 'Çözüm Durumu']}
                        rows={report.newFindings.map(f => [
                            <span key="id" className="font-mono text-xs font-bold text-blue-700">{f.findingId}</span>,
                            <span key="s" className="text-xs">{f.summary || f.description?.substring(0, 80) || '—'}</span>,
                            <span key="sev" className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${f.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : f.severity === 'HIGH' ? 'bg-orange-100 text-orange-700' : f.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {SEVERITY_LABELS[f.severity] || f.severity}
                            </span>,
                            f.directorate?.name || '—',
                            fmt(f.targetResolutionDate),
                            RESOLUTION_LABELS[f.resolutionStatus] || f.resolutionStatus,
                        ])}
                    />

                    {/* Section: Overdue Actions */}
                    <SectionTitle
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        title="Vadesi Geçmiş Aksiyonlar"
                        count={report.overdueActions.length}
                    />
                    <SimpleTable
                        headers={['Aksiyon No', 'Bağlı Bulgu', 'Sorumlu', 'Vade Tarihi', 'Gecikme', 'Durum']}
                        rows={report.overdueActions.map(a => [
                            <span key="id" className="font-mono text-xs font-bold text-blue-700">{a.actionId}</span>,
                            <span key="f" className="font-mono text-xs text-slate-500">{a.finding?.findingId || '—'}</span>,
                            `${a.owner?.firstName || ''} ${a.owner?.lastName || ''}`.trim() || '—',
                            <span key="d" className="text-red-600 font-semibold text-xs">{fmt(a.dueDate)}</span>,
                            <span key="dd" className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded">{dayDiff(a.dueDate)} gün</span>,
                            ACTION_STATUS_LABELS[a.status] || a.status,
                        ])}
                        emptyText="Vadesi geçmiş aksiyon bulunmuyor."
                    />

                    {/* Section: Approaching Actions */}
                    <SectionTitle
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                        title="Tarihi Yaklaşan Aksiyonlar (30 Gün)"
                        count={report.approachingActions.length}
                    />
                    <SimpleTable
                        headers={['Aksiyon No', 'Bağlı Bulgu', 'Sorumlu', 'Vade Tarihi', 'Direktörlük', 'Durum']}
                        rows={report.approachingActions.map(a => [
                            <span key="id" className="font-mono text-xs font-bold text-blue-700">{a.actionId}</span>,
                            <span key="f" className="font-mono text-xs text-slate-500">{a.finding?.findingId || '—'}</span>,
                            `${a.owner?.firstName || ''} ${a.owner?.lastName || ''}`.trim() || '—',
                            <span key="d" className="text-amber-600 font-semibold text-xs">{fmt(a.dueDate)}</span>,
                            a.directorate?.name || '—',
                            ACTION_STATUS_LABELS[a.status] || a.status,
                        ])}
                        emptyText="30 gün içinde vadesi dolacak aksiyon yok."
                    />

                    {/* Section: Follow-ups */}
                    <SectionTitle
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
                        title="Bulgu Takip Çalışmaları"
                        count={report.followUps.length}
                    />
                    <SimpleTable
                        headers={['Takip No', 'Bağlı Bulgu', 'Planlanan Tarih', 'Sonuç', 'Onay Durumu']}
                        rows={report.followUps.map(f => [
                            <span key="id" className="font-mono text-xs font-bold text-blue-700">{f.followUpId}</span>,
                            <span key="fn" className="font-mono text-xs text-slate-500">{f.finding?.findingId || '—'}</span>,
                            fmt(f.plannedDate),
                            f.result ? (
                                <span key="r" className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${f.result === 'YETERLI' ? 'bg-emerald-100 text-emerald-700' : f.result === 'YETERSIZ' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {f.result === 'YETERLI' ? 'Yeterli' : f.result === 'YETERSIZ' ? 'Yetersiz' : 'Yeni Aksiyon'}
                                </span>
                            ) : '—',
                            f.approvalStatus === 'ONAYLANDI' ? (
                                <span key="a" className="inline-flex px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded">Onaylandı</span>
                            ) : f.approvalStatus === 'REDDEDILDI' ? (
                                <span key="a" className="inline-flex px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">Reddedildi</span>
                            ) : (
                                <span key="a" className="inline-flex px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded">Bekliyor</span>
                            ),
                        ])}
                        emptyText="Bu dönemde takip çalışması bulunamadı."
                    />

                    {/* Section: Closed Findings */}
                    <SectionTitle
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        title="Dönemde Kapanan Bulgular"
                        count={report.closedFindings.length}
                    />
                    <SimpleTable
                        headers={['Bulgu No', 'Özet', 'Önem', 'Direktörlük', 'Kapanış Tarihi', 'Karar']}
                        rows={report.closedFindings.map(f => [
                            <span key="id" className="font-mono text-xs font-bold text-blue-700">{f.findingId}</span>,
                            <span key="s" className="text-xs">{f.summary || f.description?.substring(0, 80) || '—'}</span>,
                            <span key="sev" className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${f.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : f.severity === 'HIGH' ? 'bg-orange-100 text-orange-700' : f.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {SEVERITY_LABELS[f.severity] || f.severity}
                            </span>,
                            f.directorate?.name || '—',
                            <span key="cd" className="text-emerald-600 font-semibold text-xs">{fmt(f.closedDate)}</span>,
                            RESOLUTION_LABELS[f.resolutionStatus] || f.resolutionStatus,
                        ])}
                        emptyText="Bu dönemde kapanan bulgu bulunamadı."
                    />

                    {/* Section: Postponed Findings */}
                    <SectionTitle
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        title="Ertelenen Bulgular"
                        count={report.postponedFindings.length}
                    />
                    <SimpleTable
                        headers={['Bulgu No', 'Özet', 'Önem', 'Direktörlük', 'Hedef Tarih', 'Sorumlu']}
                        rows={report.postponedFindings.map(f => [
                            <span key="id" className="font-mono text-xs font-bold text-blue-700">{f.findingId}</span>,
                            <span key="s" className="text-xs">{f.summary || f.description?.substring(0, 80) || '—'}</span>,
                            <span key="sev" className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${f.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : f.severity === 'HIGH' ? 'bg-orange-100 text-orange-700' : f.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {SEVERITY_LABELS[f.severity] || f.severity}
                            </span>,
                            f.directorate?.name || '—',
                            <span key="td" className="text-amber-600 font-semibold text-xs">{fmt(f.targetResolutionDate)}</span>,
                            f.responsiblePerson || '—',
                        ])}
                        emptyText="Ertelenen bulgu bulunamadı."
                    />
                </div>
            )}

            <style jsx global>{`
                @media print {
                    nav, aside, .print\\:hidden { display: none !important; }
                    body { background: white; }
                    .print\\:mx-0 { margin-left: 0 !important; margin-right: 0 !important; }
                }
            `}</style>
        </PageShell>
    );
}
