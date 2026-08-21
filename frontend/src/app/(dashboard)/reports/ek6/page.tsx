'use client';

import { useState, useRef } from 'react';
import api from '@/lib/api';
import { PageShell, PageHeader, Button, EmptyState } from '@/components/ui';

interface EK6Row {
    siraNo: number;
    direktorluk: string;
    kontrolNo: string;
    kontrolSikligi: string;
    kontrolTanimi: string;
    bulgu: string;
}

interface EK6ReportData {
    title: string;
    period: string;
    generatedAt: string;
    totalControls: number;
    data: EK6Row[];
}

const months = [
    { value: '', label: 'Tüm Yıl' },
    { value: '1', label: 'Ocak' },
    { value: '2', label: 'Şubat' },
    { value: '3', label: 'Mart' },
    { value: '4', label: 'Nisan' },
    { value: '5', label: 'Mayıs' },
    { value: '6', label: 'Haziran' },
    { value: '7', label: 'Temmuz' },
    { value: '8', label: 'Ağustos' },
    { value: '9', label: 'Eylül' },
    { value: '10', label: 'Ekim' },
    { value: '11', label: 'Kasım' },
    { value: '12', label: 'Aralık' },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function EK6ReportPage() {
    const [year, setYear] = useState(String(currentYear));
    const [month, setMonth] = useState('');
    const [loading, setLoading] = useState(false);
    const [downloadingWord, setDownloadingWord] = useState(false);
    const [reportData, setReportData] = useState<EK6ReportData | null>(null);
    const [error, setError] = useState('');
    const printRef = useRef<HTMLDivElement>(null);

    const handlePreview = async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({ year });
            if (month) params.append('month', month);

            const data = await api.request(`/reports/ek6/data?${params}`) as EK6ReportData;
            setReportData(data);
        } catch (err) {
            setError('Rapor verisi yüklenirken hata oluştu');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadWord = async () => {
        setDownloadingWord(true);
        try {
            const params = new URLSearchParams({ year });
            if (month) params.append('month', month);

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/reports/ek6/word?${params}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                },
            });

            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = month ? `EK-6_${year}_${month}.docx` : `EK-6_${year}.docx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (err) {
            setError('Word dosyası indirilemedi');
            console.error(err);
        } finally {
            setDownloadingWord(false);
        }
    };

    const handlePrintPDF = () => {
        window.print();
    };

    return (
        <PageShell fullHeight className="print:bg-white print:p-0">
            {/* Header section (hidden in print) */}
            <div className="print:hidden">
                <PageHeader
                    title="EK-6 Rapor Eki"
                    description="Periyodik Kontroller (BT Birimleri)"
                    breadcrumbs={[
                        { label: 'Raporlama', href: '/reports' },
                        { label: 'EK-6 Raporu' }
                    ]}
                />

                {/* Filters */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 mb-6 flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Yıl</label>
                        <select
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            className="px-4 py-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm min-w-[120px]"
                        >
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Dönem</label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="px-4 py-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm min-w-[150px]"
                        >
                            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>

                    <Button
                        onClick={handlePreview}
                        disabled={loading}
                        variant="primary"
                        icon={
                            loading ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            )
                        }
                    >
                        Önizle
                    </Button>

                    <div className="ml-auto flex items-center gap-3">
                        <Button
                            onClick={handleDownloadWord}
                            disabled={downloadingWord || !reportData}
                            variant="outline"
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                            icon={
                                downloadingWord ? (
                                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                )
                            }
                        >
                            Word İndir
                        </Button>
                        <Button
                            onClick={handlePrintPDF}
                            disabled={!reportData}
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
                        >
                            PDF Çıktısı Al
                        </Button>
                    </div>

                    {error && <div className="w-full mt-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">{error}</div>}
                </div>
            </div>

            {/* Print & Preview Section */}
            <div className="flex-1 print:px-0 print:py-0">
                {reportData ? (
                    <div ref={printRef} className="bg-white rounded-xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:m-0">
                        <div className="p-8 text-center border-b border-slate-100 print:border-none print:pb-4">
                            <h2 className="text-xl font-bold text-slate-900 print:text-2xl">{reportData.title}</h2>
                            <p className="text-sm text-slate-500 mt-2 print:text-base">
                                Dönem: <span className="font-medium text-slate-700">{reportData.period}</span> | Toplam: <span className="font-medium text-slate-700">{reportData.totalControls} kontrol</span>
                            </p>
                        </div>
                        
                        <div className="overflow-x-auto print:overflow-visible">
                            <table className="grc-table w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 print:bg-gray-100">
                                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-16 text-center print:border print:border-gray-300">No</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider print:border print:border-gray-300">İlgili Direktörlük</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-28 print:border print:border-gray-300">Kontrol No</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-32 print:border print:border-gray-300">Kontrol Sıklığı</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider print:border print:border-gray-300">Kontrol Tanımı</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-36 print:border print:border-gray-300">Bulgu</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 print:divide-gray-300">
                                    {reportData.data.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-12 print:border print:border-gray-300">
                                                <EmptyState 
                                                    title="Test Edilmiş Kontrol Yok" 
                                                    description="Seçilen dönemde test edilmiş kontrol bulunamadı."
                                                />
                                            </td>
                                        </tr>
                                    ) : (
                                        reportData.data.map((row) => (
                                            <tr key={row.siraNo} className="hover:bg-slate-50 print:hover:bg-transparent print:break-inside-avoid">
                                                <td className="px-4 py-3 text-sm text-slate-600 text-center print:border print:border-gray-300">{row.siraNo}</td>
                                                <td className="px-4 py-3 text-sm text-slate-800 print:border print:border-gray-300">{row.direktorluk}</td>
                                                <td className="px-4 py-3 text-sm text-slate-600 font-mono print:border print:border-gray-300">{row.kontrolNo}</td>
                                                <td className="px-4 py-3 text-sm text-slate-600 print:border print:border-gray-300">{row.kontrolSikligi}</td>
                                                <td className="px-4 py-3 text-sm text-slate-800 print:border print:border-gray-300">{row.kontrolTanimi}</td>
                                                <td className="px-4 py-3 text-sm font-medium print:border print:border-gray-300">
                                                    <span className={row.bulgu === 'Bulgu Yok' ? 'text-emerald-600 print:text-black' : 'text-red-600 print:text-black'}>
                                                        {row.bulgu}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-right print:bg-white print:border-none print:mt-4">
                            <p className="text-xs text-slate-500 print:text-gray-600">
                                Oluşturulma Tarihi: {new Date(reportData.generatedAt).toLocaleDateString('tr-TR')}
                            </p>
                        </div>
                    </div>
                ) : !loading ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 print:hidden overflow-hidden">
                        <EmptyState 
                            title="Rapor Önizleme" 
                            description="Yıl ve dönem seçerek rapor önizlemesi alabilirsiniz." 
                            icon={<svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                        />
                    </div>
                ) : null}
            </div>
        </PageShell>
    );
}
