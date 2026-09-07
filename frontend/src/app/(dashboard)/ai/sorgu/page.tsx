'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { PageShell, PageHeader } from '@/components/ui';
import type { AiQueryResult } from '@/types/ai';

interface Turn {
    role: 'user' | 'ai';
    text: string;
    usedData?: string[];
    notInData?: boolean;
}

const SUGGESTIONS = [
    'Bu yıl kaç kritik bulgu açıldı?',
    'Gecikmiş açık bulgu sayısı nedir?',
    'Etkin olmayan kontrol kaç tane?',
    'Bana atanmış açık testleri listele',
];

export default function AiQueryPage() {
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [turns, setTurns] = useState<Turn[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        api.getAiStatus().then((s) => setEnabled(s.enabled)).catch(() => setEnabled(false));
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [turns, loading]);

    const ask = async (q: string) => {
        const question = q.trim();
        if (!question || loading) return;
        setTurns((t) => [...t, { role: 'user', text: question }]);
        setInput('');
        setLoading(true);
        try {
            const res: AiQueryResult = await api.askAi(question);
            setTurns((t) => [
                ...t,
                { role: 'ai', text: res.answer, usedData: res.usedData, notInData: res.notInData },
            ]);
        } catch (e) {
            setTurns((t) => [
                ...t,
                { role: 'ai', text: e instanceof Error ? e.message : 'Sorgu başarısız oldu.' },
            ]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageShell>
            <PageHeader
                title="Doğal Dil Sorgu"
                description="GRC verisi hakkında soru sorun. Salt okunur — özet sayımlar ve size atanmış kalemler üzerinden yanıtlanır."
                breadcrumbs={[{ label: 'Yapay Zeka' }, { label: 'Doğal Dil Sorgu' }]}
            />

            {enabled === false && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                    Yapay zeka modülü kapalı. <code className="font-mono">backend/.env</code> içinde{' '}
                    <code className="font-mono">AI_ENABLED=true</code> ve <code className="font-mono">AI_API_KEY</code> gerekli.
                </div>
            )}

            {enabled !== false && (
                <div className="mx-auto flex max-w-3xl flex-col rounded-xl border border-slate-200 bg-white">
                    <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ minHeight: 320, maxHeight: '55vh' }}>
                        {turns.length === 0 && (
                            <div className="pt-6 text-center">
                                <p className="text-sm text-slate-400">Örnek sorular:</p>
                                <div className="mt-3 flex flex-wrap justify-center gap-2">
                                    {SUGGESTIONS.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => ask(s)}
                                            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {turns.map((t, i) => (
                            <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                                <div
                                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                                        t.role === 'user'
                                            ? 'bg-blue-600 text-white'
                                            : 'border border-slate-200 bg-slate-50 text-slate-700'
                                    }`}
                                >
                                    <p className="whitespace-pre-wrap">{t.text}</p>
                                    {t.role === 'ai' && !!t.usedData?.length && (
                                        <p className="mt-1.5 text-[10px] text-slate-400">
                                            Kaynak: {t.usedData.join(' · ')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-400">
                                    Yanıtlanıyor…
                                </div>
                            </div>
                        )}
                        <div ref={endRef} />
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            ask(input);
                        }}
                        className="flex gap-2 border-t border-slate-100 p-3"
                    >
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Sorunuzu yazın…"
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        />
                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            Sor
                        </button>
                    </form>
                    <p className="px-4 pb-3 text-[10px] text-slate-400">
                        Yanıtlar yalnızca hazır özet veri üzerinden üretilir; kesin rapor için ilgili modül ekranını kullanın.
                    </p>
                </div>
            )}
        </PageShell>
    );
}
