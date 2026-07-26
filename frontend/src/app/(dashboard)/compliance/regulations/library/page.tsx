'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageShell, PageHeader, AdvancedFilterPanel, Modal, EmptyState, LoadingState } from '@/components/ui';
import type { AdvancedFilterField } from '@/components/ui';
import api from '@/lib/api';

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

const REG_COLORS: Record<string, { badge: string; text: string; bg: string; dot: string }> = {
    'SPK-VII-128.10': { badge: 'bg-indigo-100 text-indigo-700', text: 'text-indigo-700', bg: 'bg-indigo-50', dot: 'bg-indigo-500' },
    'CBDDO-BIG-2020': { badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
};
const DEFAULT_COLOR = { badge: 'bg-slate-100 text-slate-600', text: 'text-slate-600', bg: 'bg-slate-50', dot: 'bg-slate-400' };

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

    const activeFilterCount = (selectedReg ? 1 : 0) + (selectedCat !== 'Tümü' ? 1 : 0);

    const filterFields: AdvancedFilterField[] = [
        {
            type: 'select',
            key: 'regulation',
            label: 'Regülasyon',
            value: selectedReg,
            onChange: setSelectedReg,
            options: regulations.map(r => ({ value: r.id, label: r.code })),
        },
        {
            type: 'select',
            key: 'category',
            label: 'Kategori',
            value: selectedCat === 'Tümü' ? '' : selectedCat,
            onChange: (v) => setSelectedCat(v || 'Tümü'),
            options: CATEGORIES.filter(c => c !== 'Tümü').map(c => ({ value: c, label: c })),
        },
    ];

    const allCrossRefs = selectedArticle ? getCrossRefs(selectedArticle) : [];
    const selectedColor = selectedArticle
        ? (REG_COLORS[selectedArticle.regulation?.code ?? ''] || DEFAULT_COLOR)
        : DEFAULT_COLOR;

    return (
        <PageShell>
            <PageHeader
                title="Regülasyon Kütüphanesi"
                description="SPK ve CBDDO regülasyon maddelerinin aranabilir envanter görünümü"
                breadcrumbs={[
                    { label: 'Uyum' },
                    { label: 'Regülasyonlar', href: '/compliance/regulations' },
                    { label: 'Kütüphane' },
                ]}
                actions={
                    <div className="flex gap-3 text-sm">
                        {regulations.map(r => {
                            const c = REG_COLORS[r.code] || DEFAULT_COLOR;
                            return (
                                <div key={r.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white shadow-sm">
                                    <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                                    <span className={`font-semibold ${c.text}`}>{r.code}</span>
                                    <span className="text-slate-500">{r._count.articles} madde</span>
                                </div>
                            );
                        })}
                    </div>
                }
            />

            {/* Filters */}
            <AdvancedFilterPanel
                searchValue={q}
                onSearchChange={setQ}
                searchPlaceholder="Madde kodu, başlık veya içerik ara..."
                fields={filterFields}
                activeCount={activeFilterCount}
                onClearAll={() => { setQ(''); setSelectedReg(''); setSelectedCat('Tümü'); }}
            />

            {/* Result count */}
            <div className="flex items-center justify-end mb-3">
                <span className="text-xs text-slate-500 font-medium">
                    {loading ? 'Yükleniyor...' : `${articles.length} madde`}
                </span>
            </div>

            {/* Article Grid */}
            {loading ? (
                <LoadingState message="Maddeler yükleniyor..." compact />
            ) : articles.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <EmptyState
                        title="Madde bulunamadı"
                        description="Arama veya filtre kriterlerinizi değiştirerek tekrar deneyin."
                    />
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
                                className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all ${isHighlighted ? 'ring-2 ring-amber-400 shadow-md' : ''}`}
                            >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${c.badge}`}>
                                            {article.regulation?.code}
                                        </span>
                                        <span className="font-bold text-slate-800">{article.articleCode}</span>
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
                                                        className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold rounded-full hover:bg-amber-100 transition-colors cursor-pointer"
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

            {/* Detail Modal */}
            <Modal
                open={!!selectedArticle}
                onClose={() => setSelectedArticle(null)}
                title={selectedArticle ? `${selectedArticle.articleCode} — ${selectedArticle.title}` : ''}
                description={selectedArticle?.regulation?.name}
                size="lg"
            >
                {selectedArticle && (
                    <div className="space-y-5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${selectedColor.badge}`}>
                                {selectedArticle.regulation?.code}
                            </span>
                            {selectedArticle.category && (
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${CAT_COLORS[selectedArticle.category] ?? 'bg-slate-100 text-slate-600'}`}>
                                    {selectedArticle.category}
                                </span>
                            )}
                        </div>

                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Madde Metni</h3>
                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedArticle.description}</p>
                        </div>

                        {allCrossRefs.length > 0 && (
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                    Çapraz Referanslar ({allCrossRefs.length})
                                </h3>
                                <div className="space-y-2">
                                    {allCrossRefs.map((r, i) => {
                                        const rc = REG_COLORS[r.regCode] || DEFAULT_COLOR;
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => handleCrossRefClick(r.id)}
                                                className="w-full text-left flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors group cursor-pointer"
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
                )}
            </Modal>
        </PageShell>
    );
}
