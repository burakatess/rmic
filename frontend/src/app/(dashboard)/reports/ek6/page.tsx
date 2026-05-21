'use client';

import { useState } from 'react';
import api from '@/lib/api';

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
    const [downloading, setDownloading] = useState(false);
    const [reportData, setReportData] = useState<EK6ReportData | null>(null);
    const [error, setError] = useState('');

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
        setDownloading(true);
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
            setDownloading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1400px] mx-auto px-6 py-6">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">EK-6 Rapor Eki</h1>
                    <p className="text-gray-500 mt-1">Periyodik Kontroller (BT Birimleri)</p>
                </div>

                {/* Filters & Actions */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
                    <div className="flex flex-wrap items-end gap-4">
                        {/* Year Selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Yıl</label>
                            <select
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                className="px-4 py-2.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                                {years.map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>

                        {/* Month Selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Dönem</label>
                            <select
                                value={month}
                                onChange={(e) => setMonth(e.target.value)}
                                className="px-4 py-2.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                                {months.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Preview Button */}
                        <button
                            onClick={handlePreview}
                            disabled={loading}
                            className="px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            )}
                            Önizle
                        </button>

                        {/* Download Word Button */}
                        <button
                            onClick={handleDownloadWord}
                            disabled={downloading || !reportData}
                            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {downloading ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            )}
                            Word İndir
                        </button>
                    </div>

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                {/* Report Preview */}
                {reportData && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        {/* Report Title */}
                        <div className="p-6 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-gray-900 text-center">{reportData.title}</h2>
                            <p className="text-sm text-gray-500 text-center mt-2">
                                Dönem: {reportData.period} | Toplam: {reportData.totalControls} kontrol
                            </p>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-blue-100">
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200 w-16">Sıra No</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">İlgili Direktörlük</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200 w-28">Kontrol No</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200 w-28">Kontrol Sıklığı</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">Kontrol Tanımı</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200 w-36">Bulgu</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {reportData.data.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                                Seçilen dönemde test edilmiş kontrol bulunamadı.
                                            </td>
                                        </tr>
                                    ) : (
                                        reportData.data.map((row) => (
                                            <tr key={row.siraNo} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 text-sm text-gray-900 text-center">{row.siraNo}</td>
                                                <td className="px-4 py-3 text-sm text-gray-900">{row.direktorluk}</td>
                                                <td className="px-4 py-3 text-sm text-gray-900 font-mono">{row.kontrolNo}</td>
                                                <td className="px-4 py-3 text-sm text-gray-900">{row.kontrolSikligi}</td>
                                                <td className="px-4 py-3 text-sm text-gray-900">{row.kontrolTanimi}</td>
                                                <td className="px-4 py-3 text-sm">
                                                    <span className={`${row.bulgu === 'Bulgu Yok' ? 'text-green-600' : 'text-red-600 font-medium'}`}>
                                                        {row.bulgu}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 text-right">
                            <p className="text-xs text-gray-500">
                                Oluşturulma Tarihi: {new Date(reportData.generatedAt).toLocaleDateString('tr-TR')}
                            </p>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!reportData && !loading && (
                    <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="text-lg font-medium text-gray-700 mb-2">Rapor Önizleme</h3>
                        <p className="text-gray-500">Yıl ve dönem seçerek önizleme yapın</p>
                    </div>
                )}
            </div>
        </div>
    );
}
