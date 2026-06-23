'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/ui';

export default function ReportsPage() {
    return (
        <div className="flex flex-col h-full bg-slate-50/50 pb-8">
            <div className="px-8 pt-8">
                <PageHeader
                    title="Raporlama & Analitik"
                    description="Yönetim raporları, resmi ekler ve dışa aktarımlar"
                />

                {/* Report Appendices Section */}
                <div className="mt-6">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">Resmi Ekler ve Zorunlu Raporlar</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Monthly Management Report Card */}
                        <Link href="/reports/monthly" className="group bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer block relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-[100px] -mr-8 -mt-8 transition-transform group-hover:scale-110" />
                            <div className="relative">
                                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-600 transition-colors">
                                    <svg className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="font-bold text-slate-900 text-lg">Aylık Yönetim Raporu</h3>
                                </div>
                                <div className="flex gap-2 mb-4">
                                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold tracking-wider rounded uppercase">Görüntüle</span>
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold tracking-wider rounded uppercase">Word</span>
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold tracking-wider rounded uppercase">Excel</span>
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold tracking-wider rounded uppercase">PDF</span>
                                </div>
                                <p className="text-sm text-slate-500 mb-6 font-medium">Bulgular, aksiyonlar, takip çalışmaları ve grafiklerle üst yönetim raporu.</p>
                                <span className="text-sm text-indigo-600 font-semibold group-hover:text-indigo-700 flex items-center gap-1">
                                    Oluştur <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                </span>
                            </div>
                        </Link>

                        {/* Bulgu Takip Report Card */}
                        <Link href="/reports/bulgu-takip" className="group bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:border-teal-300 hover:shadow-md transition-all cursor-pointer block relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-teal-50 rounded-bl-[100px] -mr-8 -mt-8 transition-transform group-hover:scale-110" />
                            <div className="relative">
                                <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mb-5 group-hover:bg-teal-600 transition-colors">
                                    <svg className="w-6 h-6 text-teal-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                    </svg>
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="font-bold text-slate-900 text-lg">Bulgu Takip Raporu</h3>
                                </div>
                                <div className="flex gap-2 mb-4">
                                    <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-bold tracking-wider rounded uppercase">Görüntüle</span>
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold tracking-wider rounded uppercase">Sunum</span>
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold tracking-wider rounded uppercase">Excel</span>
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold tracking-wider rounded uppercase">PDF</span>
                                </div>
                                <p className="text-sm text-slate-500 mb-6 font-medium">Tespit edilen bulgular, takip çalışmaları ve bekleyen bulguların dönemsel raporu.</p>
                                <span className="text-sm text-teal-600 font-semibold group-hover:text-teal-700 flex items-center gap-1">
                                    Oluştur <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                </span>
                            </div>
                        </Link>

                        {/* EK-6 Report Card */}
                        <Link href="/reports/ek6" className="group bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer block relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-[100px] -mr-8 -mt-8 transition-transform group-hover:scale-110" />
                            
                            <div className="relative">
                                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-5 group-hover:bg-blue-600 transition-colors">
                                    <svg className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="font-bold text-slate-900 text-lg">EK-6 Rapor Eki</h3>
                                </div>
                                <div className="flex gap-2 mb-4">
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold tracking-wider rounded uppercase">Word</span>
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold tracking-wider rounded uppercase">PDF</span>
                                </div>
                                <p className="text-sm text-slate-500 mb-6 font-medium">Periyodik Kontroller (BT Birimleri) için taslak ve çıktı alma aracı.</p>
                                <span className="text-sm text-blue-600 font-semibold group-hover:text-blue-700 flex items-center gap-1">
                                    Oluştur <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                </span>
                            </div>
                        </Link>
                        
                        {/* Other Reports Card - Template */}
                        <div className="group bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all cursor-not-allowed block relative overflow-hidden opacity-75">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-[100px] -mr-8 -mt-8 transition-transform group-hover:scale-110" />
                            
                            <div className="relative">
                                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-5">
                                    <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="font-bold text-slate-900 text-lg">Yönetim Beyanı</h3>
                                </div>
                                <div className="flex gap-2 mb-4">
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold tracking-wider rounded uppercase">Word Taslak</span>
                                </div>
                                <p className="text-sm text-slate-500 mb-6 font-medium">Yönetim kurulu için periyodik kontrol beyan taslağı.</p>
                                <span className="text-sm text-slate-400 font-semibold flex items-center gap-1">
                                    Yakında
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
