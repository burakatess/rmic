'use client';

import Link from 'next/link';
import { PageShell, PageHeader, Button } from '@/components/ui';

// ─── Format Rozeti ────────────────────────────────────────────────────────────

type FormatTone = 'view' | 'word' | 'excel' | 'pdf' | 'presentation' | 'neutral';

const formatToneClasses: Record<FormatTone, string> = {
    view: 'bg-blue-50 text-blue-700',
    word: 'bg-sky-50 text-sky-700',
    excel: 'bg-emerald-50 text-emerald-700',
    pdf: 'bg-red-50 text-red-700',
    presentation: 'bg-violet-50 text-violet-700',
    neutral: 'bg-slate-100 text-slate-600',
};

function FormatBadge({ tone, children }: { tone: FormatTone; children: React.ReactNode }) {
    return (
        <span className={`px-2 py-0.5 text-[10px] font-bold tracking-wider rounded uppercase ${formatToneClasses[tone]}`}>
            {children}
        </span>
    );
}

// ─── Rapor Kartı ──────────────────────────────────────────────────────────────

interface ReportCardProps {
    href?: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    formats: { label: string; tone: FormatTone }[];
    disabled?: boolean;
}

function ReportCard({ href, title, description, icon, formats, disabled }: ReportCardProps) {
    const body = (
        <div className={`group bg-white rounded-xl border border-slate-200 p-5 shadow-sm transition-all ${
            disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-blue-300 hover:shadow-md cursor-pointer'
        }`}>
            <div className="flex items-start justify-between gap-3">
                <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    disabled ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-600'
                }`}>
                    {icon}
                </span>
                {!disabled && (
                    <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors mt-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                )}
            </div>
            <h3 className="font-bold text-slate-800 text-base mt-3">{title}</h3>
            <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
                {formats.map((f, i) => <FormatBadge key={i} tone={f.tone}>{f.label}</FormatBadge>)}
            </div>
            <p className="text-sm text-slate-500">{description}</p>
            {disabled && <p className="text-xs text-slate-400 font-semibold mt-3">Yakında</p>}
        </div>
    );

    if (disabled || !href) return body;
    return <Link href={href}>{body}</Link>;
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
    return (
        <PageShell>
            <PageHeader
                title="Raporlama & Analitik"
                description="Yönetim raporları, resmi ekler ve dışa aktarımlar"
                breadcrumbs={[{ label: 'Raporlama & Analitik' }]}
            />

            <section>
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Resmi Ekler ve Zorunlu Raporlar</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <ReportCard
                        href="/reports/monthly"
                        title="Aylık Yönetim Raporu"
                        description="Bulgular, aksiyonlar, takip çalışmaları ve grafiklerle üst yönetim raporu."
                        formats={[
                            { label: 'Görüntüle', tone: 'view' },
                            { label: 'Word', tone: 'word' },
                            { label: 'Excel', tone: 'excel' },
                            { label: 'PDF', tone: 'pdf' },
                        ]}
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        }
                    />

                    <ReportCard
                        href="/reports/bulgu-takip"
                        title="Bulgu Takip Raporu"
                        description="Tespit edilen bulgular, takip çalışmaları ve bekleyen bulguların dönemsel raporu."
                        formats={[
                            { label: 'Görüntüle', tone: 'view' },
                            { label: 'Sunum', tone: 'presentation' },
                            { label: 'Excel', tone: 'excel' },
                            { label: 'PDF', tone: 'pdf' },
                        ]}
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                        }
                    />

                    <ReportCard
                        href="/reports/ek6"
                        title="EK-6 Rapor Eki"
                        description="Periyodik Kontroller (BT Birimleri) için taslak ve çıktı alma aracı."
                        formats={[
                            { label: 'Word', tone: 'word' },
                            { label: 'PDF', tone: 'pdf' },
                        ]}
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        }
                    />

                    <ReportCard
                        disabled
                        title="Yönetim Beyanı"
                        description="Yönetim kurulu için periyodik kontrol beyan taslağı."
                        formats={[{ label: 'Word Taslak', tone: 'neutral' }]}
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        }
                    />
                </div>
            </section>
        </PageShell>
    );
}
