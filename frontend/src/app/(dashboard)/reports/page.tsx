'use client';

import Link from 'next/link';

export default function ReportsPage() {
    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Raporlama & Analitik</h1>
                <p className="text-gray-500 mt-1">Yönetim raporları ve resmi ekler</p>
            </div>

            {/* Report Appendices Section */}
            <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Rapor Ekleri</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* EK-6 Report Card */}
                    <Link href="/reports/ek6" className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-6 shadow-sm border border-blue-200 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer block">
                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-gray-900">EK-6 Rapor Eki</h3>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">WORD</span>
                        </div>
                        <p className="text-sm text-gray-500 mb-4">Periyodik Kontroller (BT Birimleri)</p>
                        <span className="text-sm text-blue-600 font-medium">Oluştur →</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}
