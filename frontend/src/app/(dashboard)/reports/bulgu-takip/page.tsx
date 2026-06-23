'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { PageHeader } from '@/components/ui';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Directorate { id: string; name: string; }

interface TespitBulgu {
    id: string; findingId: string; summary?: string; severity: string;
    resolutionStatus?: string; workflowStatus?: string;
    targetResolutionDate?: string; createdAt: string;
    directorate?: { name: string };
    responsiblePerson?: string; gmy?: string; source?: string;
}
interface TakipCalisma {
    id: string; followUpId: string; status: string;
    plannedDate?: string; result?: string; approvalStatus?: string;
    createdAt: string;
    finding?: { findingId: string; summary?: string; severity?: string };
    directorate?: { name: string };
}
interface TakipliAcikBulgu {
    id: string; findingId: string; summary?: string; severity: string;
    resolutionStatus?: string; targetResolutionDate?: string;
    directorate?: { name: string };
    sonTakip?: { status: string; plannedDate?: string; result?: string; approvalStatus?: string; createdAt: string } | null;
}
interface TakipsizBulgu {
    id: string; findingId: string; summary?: string; severity: string;
    resolutionStatus?: string; workflowStatus?: string;
    targetResolutionDate?: string; createdAt: string;
    directorate?: { name: string };
    responsiblePerson?: string; neden?: string;
}
interface BulgeTakipReport {
    period: { label: string; start: string; end: string };
    tespitEdilenBulgular: TespitBulgu[];
    takipCalismalari: TakipCalisma[];
    takipliAcikBulgular: TakipliAcikBulgu[];
    takipsizBulgular: TakipsizBulgu[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_LABELS: Record<string, string> = { CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük' };
const SEVERITY_COLORS: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-700 border border-red-200',
    HIGH: 'bg-orange-100 text-orange-700 border border-orange-200',
    MEDIUM: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
    LOW: 'bg-blue-100 text-blue-700 border border-blue-200',
};
const STATUS_LABELS: Record<string, string> = {
    BEKLIYOR: 'Bekliyor', DEVAM_EDIYOR: 'Devam Ediyor', TAMAMLANDI: 'Tamamlandı',
    ONAYLANDI: 'Onaylandı', DEVAM_EDIYOR_2: 'Devam', KAPATILDI: 'Kapatıldı',
    ERTELENDI: 'Ertelendi', KISMEN_KAPATILDI: 'Kısm. Kapatıldı', YENI_AKSIYON_GEREKLI: 'Yeni Aksiyon',
};
const RESULT_LABELS: Record<string, string> = { YETERLI: 'Yeterli', YETERSIZ: 'Yetersiz', YENI_AKSIYON_GEREKLI: 'Yeni Aksiyon' };
const SOURCE_LABELS: Record<string, string> = {
    INTERNAL_AUDIT: 'İç Denetim', EXTERNAL_AUDIT: 'Dış Denetim',
    CONTROL_TEST: 'Kontrol Testi', INCIDENT: 'Olay', SELF_ASSESSMENT: 'Öz Değerlendirme', OTHER: 'Diğer',
};

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

function fmt(d?: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('tr-TR');
}
function severityBadge(s: string) {
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${SEVERITY_COLORS[s] ?? 'bg-slate-100 text-slate-600'}`}>{SEVERITY_LABELS[s] ?? s}</span>;
}

// ─── Slide builder ────────────────────────────────────────────────────────────

type Slide = { type: 'cover' | 'summary' | 'section' | 'final'; title?: string; subtitle?: string; data?: any[] | null; columns?: { key: string; label: string }[]; sectionColor?: string; total?: number; counts?: Record<string, number>; messages?: string[] };

function buildSlides(report: BulgeTakipReport): Slide[] {
    const slides: Slide[] = [];
    const PAGE = 10;

    slides.push({ type: 'cover', title: 'Bulgu Takip Raporu', subtitle: report.period.label });
    slides.push({
        type: 'summary', title: 'Özet',
        counts: {
            'Tespit Edilen Bulgular': report.tespitEdilenBulgular.length,
            'Takip Çalışmaları': report.takipCalismalari.length,
            'Takipli Açık Bulgular': report.takipliAcikBulgular.length,
            'Takipsiz / Tarihi Belirsiz': report.takipsizBulgular.length,
        },
    });

    const sections: { label: string; color: string; data: any[]; cols: { key: string; label: string }[] }[] = [
        {
            label: '1 — Tespit Edilen Bulgular', color: 'indigo',
            data: report.tespitEdilenBulgular,
            cols: [
                { key: 'findingId', label: 'Bulgu No' }, { key: 'summary', label: 'Özet' },
                { key: 'severity', label: 'Önem' }, { key: 'directorate.name', label: 'Direktörlük' },
                { key: 'targetResolutionDate', label: 'Hedef Tarih' }, { key: 'resolutionStatus', label: 'Durum' },
            ],
        },
        {
            label: '2 — Takip Çalışmaları', color: 'teal',
            data: report.takipCalismalari,
            cols: [
                { key: 'followUpId', label: 'Takip No' }, { key: 'finding.findingId', label: 'Bulgu No' },
                { key: 'finding.summary', label: 'Özet' }, { key: 'directorate.name', label: 'Direktörlük' },
                { key: 'createdAt', label: 'Tarih' }, { key: 'status', label: 'Durum' }, { key: 'result', label: 'Sonuç' },
            ],
        },
        {
            label: '3 — Takipli Açık Bulgular', color: 'amber',
            data: report.takipliAcikBulgular,
            cols: [
                { key: 'findingId', label: 'Bulgu No' }, { key: 'summary', label: 'Özet' },
                { key: 'severity', label: 'Önem' }, { key: 'directorate.name', label: 'Direktörlük' },
                { key: 'sonTakip.createdAt', label: 'Son Takip' }, { key: 'sonTakip.result', label: 'Sonuç' },
                { key: 'targetResolutionDate', label: 'Hedef Tarih' },
            ],
        },
        {
            label: '4 — Takipsiz / Tarihi Belirsiz Bulgular', color: 'rose',
            data: report.takipsizBulgular,
            cols: [
                { key: 'findingId', label: 'Bulgu No' }, { key: 'summary', label: 'Özet' },
                { key: 'severity', label: 'Önem' }, { key: 'directorate.name', label: 'Direktörlük' },
                { key: 'createdAt', label: 'Açılış Tarihi' }, { key: 'responsiblePerson', label: 'Sorumlu' }, { key: 'neden', label: 'Not' },
            ],
        },
    ];

    for (const sec of sections) {
        for (let i = 0; i < Math.max(1, Math.ceil(sec.data.length / PAGE)); i++) {
            slides.push({
                type: 'section', title: sec.label, sectionColor: sec.color, total: sec.data.length,
                data: sec.data.slice(i * PAGE, (i + 1) * PAGE),
                columns: sec.cols,
            });
        }
    }

    const msgs: string[] = [];
    if (report.takipsizBulgular.length > 0)
        msgs.push(`${report.takipsizBulgular.filter(f => f.neden === 'Takip Yok').length} bulgu için henüz takip çalışması başlatılmamıştır.`);
    if (report.takipsizBulgular.filter(f => f.neden === 'Tarih Belirsiz').length > 0)
        msgs.push(`${report.takipsizBulgular.filter(f => f.neden === 'Tarih Belirsiz').length} bulgunun hedef tamamlanma tarihi belirlenmemiştir.`);
    if (report.takipliAcikBulgular.length > 0)
        msgs.push(`${report.takipliAcikBulgular.length} bulguda takip çalışması devam etmektedir; kapatma süreci izlenmelidir.`);
    slides.push({ type: 'final', title: 'Sonuç & Aksiyon Önerileri', messages: msgs });

    return slides;
}

function getVal(obj: any, key: string): string {
    const val = key.split('.').reduce((o, k) => o?.[k], obj);
    if (val == null) return '—';
    if (key.includes('Date') || key.includes('At') || key === 'createdAt' || key === 'plannedDate') return fmt(val);
    if (key === 'severity') return SEVERITY_LABELS[val] ?? val;
    if (key === 'status') return STATUS_LABELS[val] ?? val;
    if (key === 'result') return RESULT_LABELS[val] ?? val;
    return String(val);
}

// ─── Slide Renderer ───────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; badge: string }> = {
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-700' },
    teal: { bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200', badge: 'bg-teal-100 text-teal-700' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700' },
};
const SECTION_COUNTS_COLORS = ['bg-indigo-100 text-indigo-800 border-indigo-200', 'bg-teal-100 text-teal-800 border-teal-200', 'bg-amber-100 text-amber-800 border-amber-200', 'bg-rose-100 text-rose-800 border-rose-200'];

function SlideView({ slide, index, total }: { slide: Slide; index: number; total: number }) {
    if (slide.type === 'cover') {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl p-12">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mb-8">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <h1 className="text-4xl font-bold mb-4 text-center">{slide.title}</h1>
                <p className="text-xl text-white/70 text-center">{slide.subtitle}</p>
                <p className="mt-6 text-sm text-white/40">{new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
        );
    }

    if (slide.type === 'summary') {
        const entries = Object.entries(slide.counts ?? {});
        return (
            <div className="flex flex-col h-full p-10">
                <h2 className="text-2xl font-bold text-slate-800 mb-8">📊 Özet</h2>
                <div className="grid grid-cols-2 gap-6 flex-1">
                    {entries.map(([label, count], i) => (
                        <div key={label} className={`rounded-2xl border-2 p-6 flex flex-col justify-between ${SECTION_COUNTS_COLORS[i]}`}>
                            <p className="text-sm font-semibold opacity-80">{label}</p>
                            <p className="text-5xl font-bold mt-4">{count}</p>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (slide.type === 'section' && slide.columns && slide.data) {
        const c = COLOR_MAP[slide.sectionColor ?? 'indigo'];
        return (
            <div className="flex flex-col h-full p-8">
                <div className={`flex items-center gap-3 mb-5 pb-4 border-b ${c.border}`}>
                    <h2 className={`text-xl font-bold ${c.text}`}>{slide.title}</h2>
                    <span className={`ml-auto px-2.5 py-1 rounded-full text-xs font-bold border ${c.badge} ${c.border}`}>
                        {slide.data.length} / {slide.total} kayıt
                    </span>
                </div>
                <div className="flex-1 overflow-hidden">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className={`${c.bg}`}>
                                {slide.columns.map(col => (
                                    <th key={col.key} className={`text-left px-3 py-2 font-semibold ${c.text} first:rounded-l-lg last:rounded-r-lg`}>{col.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {slide.data.map((row: any, i: number) => (
                                <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                    {slide.columns!.map(col => (
                                        <td key={col.key} className="px-3 py-2 text-slate-700 max-w-32 truncate">
                                            {col.key === 'severity' ? severityBadge(row.severity ?? row.finding?.severity ?? '') : getVal(row, col.key)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (slide.type === 'final') {
        return (
            <div className="flex flex-col h-full p-10 bg-gradient-to-br from-slate-50 to-white">
                <h2 className="text-2xl font-bold text-slate-800 mb-8">✅ Sonuç & Aksiyon Önerileri</h2>
                <div className="space-y-4">
                    {(slide.messages ?? []).map((msg, i) => (
                        <div key={i} className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                            <span className="w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                            <p className="text-slate-700 text-sm leading-relaxed">{msg}</p>
                        </div>
                    ))}
                    {(slide.messages?.length ?? 0) === 0 && (
                        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                            <span className="text-green-600 text-lg">✓</span>
                            <p className="text-green-700 text-sm">Dönem itibarıyla kritik bir aksiyon kalemi tespit edilmemiştir.</p>
                        </div>
                    )}
                </div>
                <p className="mt-auto text-xs text-slate-400 pt-6 border-t border-slate-100">
                    Bu rapor otomatik olarak oluşturulmuştur. {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
            </div>
        );
    }

    return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BulgeTakipRaporPage() {
    const now = new Date();
    const [mode, setMode] = useState<'month' | 'range'>('month');
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [directorateId, setDirectorateId] = useState('');
    const [directorates, setDirectorates] = useState<Directorate[]>([]);
    const [report, setReport] = useState<BulgeTakipReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [sunumModu, setSunumModu] = useState(false);
    const [slideIndex, setSlideIndex] = useState(0);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        api.request<Directorate[]>('/directorates').then(d => setDirectorates(d || []));
    }, []);

    const slides = report ? buildSlides(report) : [];

    useEffect(() => {
        if (!sunumModu) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') setSlideIndex(i => Math.min(i + 1, slides.length - 1));
            if (e.key === 'ArrowLeft') setSlideIndex(i => Math.max(i - 1, 0));
            if (e.key === 'Escape') setSunumModu(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [sunumModu, slides.length]);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (mode === 'month') { params.set('year', String(year)); params.set('month', String(month)); }
            else { if (startDate) params.set('startDate', startDate); if (endDate) params.set('endDate', endDate); }
            if (directorateId) params.set('directorateId', directorateId);
            const data = await api.request<BulgeTakipReport>(`/reports/bulgu-takip?${params}`);
            setReport(data);
            setSlideIndex(0);
        } finally { setLoading(false); }
    }, [mode, year, month, startDate, endDate, directorateId]);

    useEffect(() => { fetchReport(); }, []);

    const handleExcel = () => {
        if (!report) return;
        const wb = XLSX.utils.book_new();

        const sheet1 = XLSX.utils.json_to_sheet(report.tespitEdilenBulgular.map(f => ({
            'Bulgu No': f.findingId, 'Özet': f.summary ?? '', 'Önem': SEVERITY_LABELS[f.severity] ?? f.severity,
            'Direktörlük': f.directorate?.name ?? '', 'Hedef Tarih': fmt(f.targetResolutionDate),
            'Çözüm Durumu': STATUS_LABELS[f.resolutionStatus ?? ''] ?? f.resolutionStatus ?? '',
            'Kaynak': SOURCE_LABELS[f.source ?? ''] ?? f.source ?? '', 'Açılış Tarihi': fmt(f.createdAt),
            'Sorumlu': f.responsiblePerson ?? '', 'GMY': f.gmy ?? '',
        })));
        XLSX.utils.book_append_sheet(wb, sheet1, '1-Tespit Edilen Bulgular');

        const sheet2 = XLSX.utils.json_to_sheet(report.takipCalismalari.map(f => ({
            'Takip No': f.followUpId, 'Bağlı Bulgu': f.finding?.findingId ?? '', 'Bulgu Özeti': f.finding?.summary ?? '',
            'Direktörlük': f.directorate?.name ?? '', 'Tarih': fmt(f.createdAt),
            'Durum': STATUS_LABELS[f.status] ?? f.status, 'Sonuç': RESULT_LABELS[f.result ?? ''] ?? f.result ?? '',
            'Onay Durumu': STATUS_LABELS[f.approvalStatus ?? ''] ?? f.approvalStatus ?? '',
        })));
        XLSX.utils.book_append_sheet(wb, sheet2, '2-Takip Çalışmaları');

        const sheet3 = XLSX.utils.json_to_sheet(report.takipliAcikBulgular.map(f => ({
            'Bulgu No': f.findingId, 'Özet': f.summary ?? '', 'Önem': SEVERITY_LABELS[f.severity] ?? f.severity,
            'Direktörlük': f.directorate?.name ?? '', 'Hedef Tarih': fmt(f.targetResolutionDate),
            'Son Takip Tarihi': f.sonTakip ? fmt(f.sonTakip.createdAt) : '—',
            'Son Takip Sonucu': RESULT_LABELS[f.sonTakip?.result ?? ''] ?? f.sonTakip?.result ?? '—',
            'Son Takip Durumu': STATUS_LABELS[f.sonTakip?.status ?? ''] ?? f.sonTakip?.status ?? '—',
        })));
        XLSX.utils.book_append_sheet(wb, sheet3, '3-Takipli Açık Bulgular');

        const sheet4 = XLSX.utils.json_to_sheet(report.takipsizBulgular.map(f => ({
            'Bulgu No': f.findingId, 'Özet': f.summary ?? '', 'Önem': SEVERITY_LABELS[f.severity] ?? f.severity,
            'Direktörlük': f.directorate?.name ?? '', 'Açılış Tarihi': fmt(f.createdAt),
            'Hedef Tarih': fmt(f.targetResolutionDate), 'Sorumlu': f.responsiblePerson ?? '',
            'Not': f.neden ?? '', 'Çözüm Durumu': STATUS_LABELS[f.resolutionStatus ?? ''] ?? f.resolutionStatus ?? '',
        })));
        XLSX.utils.book_append_sheet(wb, sheet4, '4-Takipsiz-Tarihi Belirsiz');

        const label = mode === 'month' ? `${year}_${month}` : `${startDate}_${endDate}`;
        XLSX.writeFile(wb, `Bulgu_Takip_Raporu_${label}.xlsx`);
    };

    // ── Table Section Helper ──────────────────────────────────────────────────

    function Section({ title, badge, badgeColor, count, children }: { title: string; badge: string; badgeColor: string; count: number; children: React.ReactNode }) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6 print:break-before-page">
                <div className={`flex items-center gap-3 px-6 py-4 border-b border-slate-100 ${badgeColor.replace('text-', 'bg-').replace('-700', '-50')}`}>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${badgeColor} bg-white border`}>{badge}</span>
                    <h3 className="font-bold text-slate-800">{title}</h3>
                    <span className="ml-auto text-sm font-semibold text-slate-500">{count} kayıt</span>
                </div>
                <div className="overflow-x-auto">{children}</div>
            </div>
        );
    }

    function Th({ children }: { children: React.ReactNode }) {
        return <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-100 whitespace-nowrap">{children}</th>;
    }
    function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
        return <td className={`px-4 py-2.5 text-sm text-slate-700 border-b border-slate-50 ${className}`}>{children}</td>;
    }
    function Empty() {
        return <tr><td colSpan={20} className="px-4 py-8 text-center text-slate-400 text-sm">Bu dönemde kayıt bulunamadı</td></tr>;
    }

    // ── Sunum Modu Overlay ────────────────────────────────────────────────────

    if (sunumModu && report) {
        return (
            <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSunumModu(false)} className="text-slate-400 hover:text-white transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <span className="text-white font-semibold text-sm">Bulgu Takip Raporu — {report.period.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-slate-400 text-sm">{slideIndex + 1} / {slides.length}</span>
                        <button onClick={() => window.print()} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors">
                            Yazdır / PDF
                        </button>
                    </div>
                </div>

                {/* Slide */}
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="w-full max-w-5xl aspect-video bg-white rounded-2xl shadow-2xl overflow-hidden">
                        <SlideView slide={slides[slideIndex]} index={slideIndex} total={slides.length} />
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-center gap-4 py-4 bg-slate-800 border-t border-slate-700">
                    <button
                        onClick={() => setSlideIndex(i => Math.max(i - 1, 0))}
                        disabled={slideIndex === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        Önceki
                    </button>
                    <div className="flex gap-1.5">
                        {slides.map((_, i) => (
                            <button key={i} onClick={() => setSlideIndex(i)}
                                className={`w-2 h-2 rounded-full transition-all ${i === slideIndex ? 'bg-white w-4' : 'bg-slate-500 hover:bg-slate-400'}`} />
                        ))}
                    </div>
                    <button
                        onClick={() => setSlideIndex(i => Math.min(i + 1, slides.length - 1))}
                        disabled={slideIndex === slides.length - 1}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        Sonraki
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
            </div>
        );
    }

    // ── Normal Rapor Görünümü ─────────────────────────────────────────────────

    return (
        <div className="flex flex-col min-h-full bg-slate-50/50 pb-10" ref={printRef}>
            {/* Header */}
            <div className="px-8 pt-8 pb-4 print:hidden">
                <PageHeader
                    title="Bulgu Takip Raporu"
                    description="Tespit edilen bulgular, takip çalışmaları ve bekleyen bulguların dönemsel görünümü"
                />
            </div>

            {/* Filter Toolbar */}
            <div className="px-8 py-4 bg-white border-y border-slate-100 print:hidden">
                <div className="flex flex-wrap gap-3 items-end">
                    {/* Mode Toggle */}
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                        <button onClick={() => setMode('month')} className={`px-3 py-2 text-sm font-medium transition-colors ${mode === 'month' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Ay Seçimi</button>
                        <button onClick={() => setMode('range')} className={`px-3 py-2 text-sm font-medium transition-colors ${mode === 'range' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Tarih Aralığı</button>
                    </div>

                    {mode === 'month' ? (
                        <>
                            <select value={year} onChange={e => setYear(+e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300">
                                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <select value={month} onChange={e => setMonth(+e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300">
                                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                            </select>
                        </>
                    ) : (
                        <>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
                            <span className="text-slate-400 self-center">—</span>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
                        </>
                    )}

                    <select value={directorateId} onChange={e => setDirectorateId(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300">
                        <option value="">Tüm Direktörlükler</option>
                        {directorates.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>

                    <button onClick={fetchReport} disabled={loading} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm rounded-lg transition-colors disabled:opacity-60">
                        {loading ? 'Yükleniyor...' : 'Raporu Oluştur'}
                    </button>

                    {report && (
                        <div className="flex gap-2 ml-auto">
                            <button onClick={() => { setSlideIndex(0); setSunumModu(true); }}
                                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
                                Sunum Modu
                            </button>
                            <button onClick={handleExcel}
                                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Excel
                            </button>
                            <button onClick={() => window.print()}
                                className="flex items-center gap-2 px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                PDF
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Report Sections */}
            <div className="px-8 py-6">
                {loading && (
                    <div className="flex items-center justify-center h-40 text-slate-400">
                        <div className="animate-spin w-6 h-6 border-2 border-teal-300 border-t-teal-600 rounded-full mr-3" />
                        Rapor oluşturuluyor...
                    </div>
                )}

                {!loading && !report && (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                        <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <p>Filtre seçerek raporu oluşturun</p>
                    </div>
                )}

                {!loading && report && (
                    <>
                        {/* Print Header */}
                        <div className="hidden print:block mb-6">
                            <h1 className="text-2xl font-bold">Bulgu Takip Raporu</h1>
                            <p className="text-slate-500">Dönem: {report.period.label}</p>
                        </div>

                        {/* Özet Bar */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            {[
                                { label: 'Tespit Edilen Bulgu', val: report.tespitEdilenBulgular.length, color: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
                                { label: 'Takip Çalışması', val: report.takipCalismalari.length, color: 'bg-teal-50 border-teal-200 text-teal-800' },
                                { label: 'Takipli Açık Bulgu', val: report.takipliAcikBulgular.length, color: 'bg-amber-50 border-amber-200 text-amber-800' },
                                { label: 'Takipsiz / Tarihi Belirsiz', val: report.takipsizBulgular.length, color: 'bg-rose-50 border-rose-200 text-rose-800' },
                            ].map(item => (
                                <div key={item.label} className={`rounded-xl border-2 p-4 ${item.color}`}>
                                    <p className="text-xs font-semibold opacity-70 mb-1">{item.label}</p>
                                    <p className="text-3xl font-bold">{item.val}</p>
                                </div>
                            ))}
                        </div>

                        {/* Section 1 */}
                        <Section title="Tespit Edilen Bulgular" badge="Bölüm 1" badgeColor="text-indigo-700 border-indigo-200" count={report.tespitEdilenBulgular.length}>
                            <table className="w-full">
                                <thead><tr>
                                    <Th>Bulgu No</Th><Th>Özet</Th><Th>Önem</Th><Th>Direktörlük</Th>
                                    <Th>Hedef Tarih</Th><Th>Çözüm Durumu</Th><Th>Kaynak</Th>
                                </tr></thead>
                                <tbody>
                                    {report.tespitEdilenBulgular.length === 0 ? <Empty /> : report.tespitEdilenBulgular.map(f => (
                                        <tr key={f.id} className="hover:bg-slate-50">
                                            <Td className="font-mono text-xs font-bold text-slate-600">{f.findingId}</Td>
                                            <Td className="max-w-56"><span className="line-clamp-2">{f.summary ?? f.findingId}</span></Td>
                                            <Td>{severityBadge(f.severity)}</Td>
                                            <Td>{f.directorate?.name ?? '—'}</Td>
                                            <Td>{fmt(f.targetResolutionDate)}</Td>
                                            <Td><span className="text-xs">{STATUS_LABELS[f.resolutionStatus ?? ''] ?? f.resolutionStatus ?? '—'}</span></Td>
                                            <Td className="text-xs text-slate-500">{SOURCE_LABELS[f.source ?? ''] ?? f.source ?? '—'}</Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        {/* Section 2 */}
                        <Section title="Gerçekleştirilen Takip Çalışmaları" badge="Bölüm 2" badgeColor="text-teal-700 border-teal-200" count={report.takipCalismalari.length}>
                            <table className="w-full">
                                <thead><tr>
                                    <Th>Takip No</Th><Th>Bağlı Bulgu</Th><Th>Önem</Th><Th>Direktörlük</Th>
                                    <Th>Tarih</Th><Th>Durum</Th><Th>Sonuç</Th><Th>Onay</Th>
                                </tr></thead>
                                <tbody>
                                    {report.takipCalismalari.length === 0 ? <Empty /> : report.takipCalismalari.map(f => (
                                        <tr key={f.id} className="hover:bg-slate-50">
                                            <Td className="font-mono text-xs font-bold text-slate-600">{f.followUpId}</Td>
                                            <Td className="text-xs text-slate-600">{f.finding?.findingId ?? '—'}</Td>
                                            <Td>{severityBadge(f.finding?.severity ?? '')}</Td>
                                            <Td>{f.directorate?.name ?? '—'}</Td>
                                            <Td>{fmt(f.createdAt)}</Td>
                                            <Td><span className="text-xs">{STATUS_LABELS[f.status] ?? f.status}</span></Td>
                                            <Td>{f.result ? <span className="text-xs">{RESULT_LABELS[f.result] ?? f.result}</span> : '—'}</Td>
                                            <Td>{f.approvalStatus ? <span className="text-xs">{STATUS_LABELS[f.approvalStatus] ?? f.approvalStatus}</span> : '—'}</Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        {/* Section 3 */}
                        <Section title="Takipli Açık Bulgular" badge="Bölüm 3" badgeColor="text-amber-700 border-amber-200" count={report.takipliAcikBulgular.length}>
                            <table className="w-full">
                                <thead><tr>
                                    <Th>Bulgu No</Th><Th>Özet</Th><Th>Önem</Th><Th>Direktörlük</Th>
                                    <Th>Son Takip</Th><Th>Son Sonuç</Th><Th>Hedef Tarih</Th>
                                </tr></thead>
                                <tbody>
                                    {report.takipliAcikBulgular.length === 0 ? <Empty /> : report.takipliAcikBulgular.map(f => (
                                        <tr key={f.id} className="hover:bg-slate-50">
                                            <Td className="font-mono text-xs font-bold text-slate-600">{f.findingId}</Td>
                                            <Td className="max-w-56"><span className="line-clamp-2">{f.summary ?? f.findingId}</span></Td>
                                            <Td>{severityBadge(f.severity)}</Td>
                                            <Td>{f.directorate?.name ?? '—'}</Td>
                                            <Td>{f.sonTakip ? fmt(f.sonTakip.createdAt) : '—'}</Td>
                                            <Td>{f.sonTakip?.result ? <span className="text-xs">{RESULT_LABELS[f.sonTakip.result] ?? f.sonTakip.result}</span> : '—'}</Td>
                                            <Td>{fmt(f.targetResolutionDate)}</Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        {/* Section 4 */}
                        <Section title="Takipsiz / Hedef Tarihi Belirsiz Bulgular" badge="Bölüm 4" badgeColor="text-rose-700 border-rose-200" count={report.takipsizBulgular.length}>
                            <table className="w-full">
                                <thead><tr>
                                    <Th>Bulgu No</Th><Th>Özet</Th><Th>Önem</Th><Th>Direktörlük</Th>
                                    <Th>Açılış Tarihi</Th><Th>Sorumlu</Th><Th>Not</Th>
                                </tr></thead>
                                <tbody>
                                    {report.takipsizBulgular.length === 0 ? <Empty /> : report.takipsizBulgular.map(f => (
                                        <tr key={f.id} className="hover:bg-slate-50">
                                            <Td className="font-mono text-xs font-bold text-slate-600">{f.findingId}</Td>
                                            <Td className="max-w-56"><span className="line-clamp-2">{f.summary ?? f.findingId}</span></Td>
                                            <Td>{severityBadge(f.severity)}</Td>
                                            <Td>{f.directorate?.name ?? '—'}</Td>
                                            <Td>{fmt(f.createdAt)}</Td>
                                            <Td className="text-xs">{f.responsiblePerson ?? '—'}</Td>
                                            <Td>
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${f.neden === 'Takip Yok' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {f.neden}
                                                </span>
                                            </Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>
                    </>
                )}
            </div>
        </div>
    );
}
