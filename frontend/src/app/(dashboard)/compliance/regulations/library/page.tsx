'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui';
import api from '@/lib/api';
import Link from 'next/link';

interface CrossRef {
    id: string;
    note?: string;
    target?: { id: string; articleCode: string; title: string; regulation: { id: string; code: string; name: string } };
    source?: { id: string; articleCode: string; title: string; regulation: { id: string; code: string; name: string } };
}

interface Article {
    id: string;
    regulationId: string;
    articleCode: string;
    title: string;
    description: string;
    category: string | null;
    regulation: { id: string; code: string; name: string };
    crossRefsFrom: CrossRef[];
    crossRefsTo: CrossRef[];
}

interface Regulation {
    id: string;
    code: string;
    name: string;
    issuer?: string;
    _count: { articles: number };
}

const CATEGORIES = ['Tümü', 'Yönetişim', 'Risk', 'Teknik', 'Erişim', 'Personel', 'Fiziksel', 'Denetim', 'Süreklilik', 'Genel', 'Varlık', 'Kontrol', 'Olay', 'Geliştirme', 'Değişiklik', 'Tedarikçi'];

const REG_COLORS: Record<string, { border: string; badge: string; text: string; bg: string; dot: string }> = {
    'SPK-VII-128.10': { border: 'border-indigo-300', badge: 'bg-indigo-100 text-indigo-700', text: 'text-indigo-700', bg: 'bg-indigo-50', dot: 'bg-indigo-500' },
    'CBDDO-BIG-2020': { border: 'border-emerald-300', badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
};
const DEFAULT_COLOR = { border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600', text: 'text-slate-600', bg: 'bg-slate-50', dot: 'bg-slate-400' };

const CAT_COLORS: Record<string, string> = {
    Yönetişim: 'bg-violet-100 text-violet-700',
    Risk: 'bg-red-100 text-red-700',
    Teknik: 'bg-blue-100 text-blue-700',
    Erişim: 'bg-amber-100 text-amber-700',
    Personel: 'bg-pink-100 text-pink-700',
    Fiziksel: 'bg-orange-100 text-orange-700',
    Denetim: 'bg-cyan-100 text-cyan-700',
    Süreklilik: 'bg-teal-100 text-teal-700',
    Genel: 'bg-slate-100 text-slate-600',
    Varlık: 'bg-lime-100 text-lime-700',
    Kontrol: 'bg-purple-100 text-purple-700',
    Olay: 'bg-rose-100 text-rose-700',
    Geliştirme: 'bg-sky-100 text-sky-700',
    Değişiklik: 'bg-yellow-100 text-yellow-700',
    Tedarikçi: 'bg-fuchsia-100 text-fuchsia-700',
};

function getCrossRefs(article: Article): Array<{ id: string; code: string; title: string; regCode: string; note?: string }> {
    const from = (article.crossRefsFrom || []).map(r => ({
        id: r.target?.id ?? '',
        code: r.target?.articleCode ?? '',
        title: r.target?.title ?? '',
        regCode: r.target?.regulation?.code ?? '',
        note: r.note,
    }));
    const to = (article.crossRefsTo || []).map(r => ({
        id: r.source?.id ?? '',
        code: r.source?.articleCode ?? '',
        title: r.source?.title ?? '',
        regCode: r.source?.regulation?.code ?? '',
        note: r.note,
    }));
    return [...from, ...to];
}

export default function RegulationLibraryPage() {
    const [regulations, setRegulations] = useState<Regulation[]>([]);
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState('');
    const [selectedReg, setSelectedReg] = useState('');
    const [selectedCat, setSelectedCat] = useState('Tümü');
    const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
    const [highlightId, setHighlightId] = useState<string | null>(null);

    useEffect(() => {
        api.request<Regulation[]>('/regulations').then(data => setRegulations(data || []));
    }, []);

    const search = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            if (selectedReg) params.set('regulationId', selectedReg);
            if (selectedCat !== 'Tümü') params.set('category', selectedCat);
            const data = await api.request<Article[]>(`/articles/search?${params}`);
            setArticles(data || []);
        } finally {
            setLoading(false);
        }
    }, [q, selectedReg, selectedCat]);

    useEffect(() => { search(); }, [search]);

    const handleCrossRefClick = (refId: string) => {
        const art = articles.find(a => a.id === refId);
        if (art) {
            setSelectedArticle(art);
            setHighlightId(refId);
            setTimeout(() => setHighlightId(null), 2000);
        }
    };

    const allCrossRefs = selectedArticle ? getCrossRefs(selectedArticle) : [];

    return (
        <div className="flex flex-col min-h-full bg-slate-50/50 pb-10">
            {/* Header */}
            <div className="px-8 pt-8 pb-4 border-b border-slate-100 bg-white">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                            <Link href="/compliance/regulations" className="hover:text-slate-700">Regülasyonlar</Link>
                            <span>›</span>
                            <span className="text-slate-700 font-medium">Kütüphane</span>
                        </div>
                        <PageHeader
                            title="Regülasyon Kütüphanesi"
                            description="SPK ve CBDDO regülasyon maddelerinin aranabilir envanter görünümü"
                        />
                    </div>
                    <div className="flex gap-3 text-sm">
                        {regulations.map(r => {
                            const c = REG_COLORS[r.code] || DEFAULT_COLOR;
                            return (
                                <div key={r.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${c.border} ${c.bg}`}>
                                    <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                                    <span className={`font-semibold ${c.text}`}>{r.code}</span>
                                    <span className="text-slate-500">{r._count.articles} madde</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="px-8 py-4 bg-white border-b border-slate-100 flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-64">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Madde kodu, başlık veya içerik ara..."
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        value={q}
                        onChange={e => setQ(e.target.value)}
                    />
                </div>

                <select
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={selectedReg}
                    onChange={e => setSelectedReg(e.target.value)}
                >
                    <option value="">Tüm Regülasyonlar</option>
                    {regulations.map(r => (
                        <option key={r.id} value={r.id}>{r.code}</option>
                    ))}
                </select>

                <select
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={selectedCat}
                    onChange={e => setSelectedCat(e.target.value)}
                >
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>

                <span className="ml-auto text-sm text-slate-500 font-medium">
                    {loading ? 'Yükleniyor...' : `${articles.length} madde`}
                </span>
            </div>

            {/* Article Grid */}
            <div className="px-8 py-6">
                {loading ? (
                    <div className="flex items-center justify-center h-40 text-slate-400">
                        <div className="animate-spin w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full mr-3" />
                        Yükleniyor...
                    </div>
                ) : articles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                        <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Madde bulunamadı
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {articles.map(article => {
                            const c = REG_COLORS[article.regulation?.code ?? ''] || DEFAULT_COLOR;
                            const crossRefs = getCrossRefs(article);
                            const isHighlighted = highlightId === article.id;
                            return (
                                <div
                                    key={article.id}
                                    onClick={() => setSelectedArticle(article)}
                                    className={`bg-white rounded-xl border ${c.border} p-5 cursor-pointer hover:shadow-md transition-all ${isHighlighted ? 'ring-2 ring-amber-400 shadow-md' : ''}`}
                                >
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${c.badge}`}>
                                                {article.regulation?.code}
                                            </span>
                                            <span className={`font-bold text-slate-800`}>{article.articleCode}</span>
                                            {article.category && (
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${CAT_COLORS[article.category] ?? 'bg-slate-100 text-slate-600'}`}>
                                                    {article.category}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <h3 className="font-semibold text-slate-900 mb-2 text-sm leading-snug">{article.title}</h3>
                                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed mb-3">{article.description}</p>

                                    {crossRefs.length > 0 && (
                                        <div className="border-t border-slate-100 pt-2.5 mt-2.5">
                                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Çapraz Referans</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {crossRefs.slice(0, 4).map((r, i) => {
                                                    const rc = REG_COLORS[r.regCode] || DEFAULT_COLOR;
                                                    return (
                                                        <button
                                                            key={i}
                                                            onClick={e => { e.stopPropagation(); handleCrossRefClick(r.id); }}
                                                            className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold rounded-full hover:bg-amber-100 transition-colors"
                                                            title={r.note}
                                                        >
                                                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${rc.dot} mr-1`} />
                                                            {r.code}
                                                        </button>
                                                    );
                                                })}
                                                {crossRefs.length > 4 && (
                                                    <span className="px-2 py-0.5 text-slate-400 text-[10px]">+{crossRefs.length - 4} daha</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selectedArticle && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedArticle(null)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        {(() => {
                            const c = REG_COLORS[selectedArticle.regulation?.code ?? ''] || DEFAULT_COLOR;
                            const crossRefs = getCrossRefs(selectedArticle);
                            return (
                                <>
                                    <div className={`p-6 border-b border-slate-100 ${c.bg} rounded-t-2xl`}>
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${c.badge}`}>
                                                        {selectedArticle.regulation?.code}
                                                    </span>
                                                    <span className="text-lg font-bold text-slate-800">{selectedArticle.articleCode}</span>
                                                    {selectedArticle.category && (
                                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${CAT_COLORS[selectedArticle.category] ?? 'bg-slate-100 text-slate-600'}`}>
                                                            {selectedArticle.category}
                                                        </span>
                                                    )}
                                                </div>
                                                <h2 className="text-xl font-bold text-slate-900">{selectedArticle.title}</h2>
                                                <p className="text-xs text-slate-500 mt-1">{selectedArticle.regulation?.name}</p>
                                            </div>
                                            <button onClick={() => setSelectedArticle(null)} className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-6 space-y-5">
                                        <div>
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Madde Metni</h3>
                                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedArticle.description}</p>
                                        </div>

                                        {crossRefs.length > 0 && (
                                            <div>
                                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                                    Çapraz Referanslar ({crossRefs.length})
                                                </h3>
                                                <div className="space-y-2">
                                                    {crossRefs.map((r, i) => {
                                                        const rc = REG_COLORS[r.regCode] || DEFAULT_COLOR;
                                                        return (
                                                            <button
                                                                key={i}
                                                                onClick={() => handleCrossRefClick(r.id)}
                                                                className="w-full text-left flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors group"
                                                            >
                                                                <span className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${rc.dot}`} />
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-0.5">
                                                                        <span className={`text-[10px] font-bold ${rc.text}`}>{r.regCode}</span>
                                                                        <span className="font-semibold text-sm text-slate-800">{r.code}</span>
                                                                        <span className="text-sm text-slate-600 truncate">— {r.title}</span>
                                                                    </div>
                                                                    {r.note && <p className="text-xs text-amber-700">{r.note}</p>}
                                                                </div>
                                                                <svg className="w-4 h-4 text-amber-400 group-hover:text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                                </svg>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}
