'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

export interface LinkedRiskRow {
    id: string; riskId: string; name: string; description?: string | null;
    residualRiskScore?: number | null; inherentRiskScore?: number | null;
    owner?: { firstName: string; lastName: string } | null;
}
interface RiskCandidate { id: string; riskId: string; name: string; description?: string | null; residualRiskScore?: number | null }

const scoreCls = (v: number) => (v >= 15 ? 'bg-red-100 text-red-700' : v >= 8 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700');

/**
 * Kayıt ↔ risk eşleştirmesi (mevcut Risk Envanteri). Risk kodu, adı ve tanımı okunur; kod risk detayına
 * gider. Arama koda, ada ve tanıma göre yapılır; bir kayıt birden çok riskle eşleşir, aynı risk iki kez
 * eşleştirilemez (sunucu da reddeder). Yeni risk oluşturulmaz.
 */
export function RiskLinksPanel({ risks, editable, onLink, onUnlink }: {
    risks: LinkedRiskRow[];
    editable: boolean;
    onLink: (riskId: string) => Promise<unknown>;
    onUnlink: (riskId: string) => Promise<unknown>;
}) {
    const { success, error: showError } = useToast();
    const [picking, setPicking] = useState(false);
    const [search, setSearch] = useState('');
    const [cands, setCands] = useState<RiskCandidate[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const linked = useMemo(() => new Set(risks.map(r => r.id)), [risks]);

    useEffect(() => {
        if (!picking) return;
        const h = setTimeout(() => {
            api.getRisks({ ...(search.trim() ? { search: search.trim() } : {}), limit: 20 })
                .then((r: unknown) => setCands(((r as { data?: RiskCandidate[] })?.data ?? (Array.isArray(r) ? r as RiskCandidate[] : []))))
                .catch(() => setCands([]));
        }, 250);
        return () => clearTimeout(h);
    }, [picking, search]);

    const run = async (riskId: string, fn: (id: string) => Promise<unknown>, ok: string) => {
        setBusy(riskId);
        try { await fn(riskId); success('Kaydedildi', ok); }
        catch (e) { showError('İşlem yapılamadı', (e as Error).message); }
        finally { setBusy(null); }
    };

    return (
        <div className="space-y-4" data-testid="risk-links">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">İlişkili Riskler ({risks.length})</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Risk Envanteri&apos;ndeki mevcut risklerle eşleştirilir; eşleştirme risk detayında da görünür.</p>
                </div>
                {editable && <Button variant={picking ? 'secondary' : 'primary'} size="md" onClick={() => setPicking(p => !p)}>{picking ? 'Kapat' : '+ Risk eşleştir'}</Button>}
            </div>

            {picking && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <input value={search} onChange={e => setSearch(e.target.value)} autoFocus aria-label="Risk ara"
                        placeholder="Risk kodu, adı veya tanımı ile ara"
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    <ul className="mt-3 max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg" data-testid="risk-candidates">
                        {cands === null && <li className="px-3 py-3 text-sm text-slate-400">Aranıyor…</li>}
                        {cands?.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">Eşleşen risk bulunamadı.</li>}
                        {cands?.map(c => {
                            const already = linked.has(c.id);
                            return (
                                <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
                                    <div className="min-w-0 flex-1">
                                        <span className="font-mono text-xs font-bold text-blue-700">{c.riskId}</span>
                                        <span className="ml-2 text-sm font-semibold text-slate-900">{c.name}</span>
                                        {c.description && <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{c.description}</p>}
                                    </div>
                                    {already
                                        ? <span className="text-xs font-semibold text-emerald-700 shrink-0">Eşleştirildi</span>
                                        : <Button size="sm" variant="outline" loading={busy === c.id} onClick={() => run(c.id, onLink, `${c.riskId} eşleştirildi.`)}>Ekle</Button>}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {risks.length === 0 ? (
                <p className="text-sm text-slate-500 bg-white border border-dashed border-slate-200 rounded-xl p-6 text-center">Bu kayıt henüz bir riskle eşleştirilmemiş.</p>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {risks.map(r => {
                        const score = r.residualRiskScore ?? r.inherentRiskScore ?? null;
                        return (
                            <article key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm" data-testid="risk-link-card">
                                <div className="flex items-start justify-between gap-3">
                                    <Link href={`/risks/${r.id}`} className="font-mono text-sm font-bold text-blue-700 hover:underline">{r.riskId}</Link>
                                    <div className="flex items-center gap-2">
                                        {score != null && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreCls(score)}`}>Skor: {score}</span>}
                                        {editable && (
                                            <button type="button" disabled={busy === r.id} onClick={() => run(r.id, onUnlink, `${r.riskId} eşleştirmesi kaldırıldı.`)}
                                                className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">Kaldır</button>
                                        )}
                                    </div>
                                </div>
                                <p className="text-sm font-semibold text-slate-900 mt-1">{r.name}</p>
                                {r.description && <p className="text-sm text-slate-600 mt-1 leading-relaxed">{r.description}</p>}
                                {r.owner && <p className="text-xs text-slate-400 mt-2">Sahip: {r.owner.firstName} {r.owner.lastName}</p>}
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
