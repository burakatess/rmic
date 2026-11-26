'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { PageHeader, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface LinkedRisk { id: string; riskId: string; name: string; }
interface Finding {
    id: string;
    findingId: string;
    summary?: string;
    description?: string;
    severity: string;
    directorate?: { name: string } | null;
    directorateRel?: { name: string } | null;
    linkedRisks: LinkedRisk[];
}
interface Risk { id: string; riskId: string; name: string; category?: string; }

const SEVERITY: Record<string, { label: string; variant: 'critical' | 'high' | 'medium' | 'low' }> = {
    CRITICAL: { label: 'Kritik', variant: 'critical' },
    HIGH: { label: 'Yüksek', variant: 'high' },
    MEDIUM: { label: 'Orta', variant: 'medium' },
    LOW: { label: 'Düşük', variant: 'low' },
};

export default function FindingRiskMappingPage() {
    const { success, error: showError } = useToast();
    const [findings, setFindings] = useState<Finding[]>([]);
    const [risks, setRisks] = useState<Risk[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
    const [search, setSearch] = useState('');

    // Risk ekleme modalı
    const [linkModal, setLinkModal] = useState<Finding | null>(null);
    const [riskSearch, setRiskSearch] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [f, r] = await Promise.all([
                api.getFindings(),
                api.getRisks(),
            ]);
            const fList = (Array.isArray(f) ? f : (f as any).data) || [];
            const rList = (Array.isArray(r) ? r : (r as any).data) || [];
            setFindings(fList.map((x: any) => ({ ...x, linkedRisks: x.linkedRisks || [] })));
            setRisks(rList.map((x: any) => ({ id: x.id, riskId: x.riskId, name: x.name, category: x.category?.name })));
        } catch {
            showError('Hata', 'Veriler yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── Filtreleme ──
    const filtered = useMemo(() => {
        let list = findings;
        if (filter === 'mapped') list = list.filter(f => f.linkedRisks.length > 0);
        if (filter === 'unmapped') list = list.filter(f => f.linkedRisks.length === 0);
        if (search) {
            const q = search.toLowerCase();
            list = list.filter(f => f.findingId.toLowerCase().includes(q) || (f.summary || '').toLowerCase().includes(q));
        }
        return list;
    }, [findings, filter, search]);

    const mappedCount = findings.filter(f => f.linkedRisks.length > 0).length;
    const unmappedCount = findings.length - mappedCount;

    // ── Risk bağla/çöz (optimistic) ──
    const linkRisk = async (finding: Finding, risk: Risk) => {
        setFindings(prev => prev.map(f => f.id === finding.id
            ? { ...f, linkedRisks: [...f.linkedRisks, { id: risk.id, riskId: risk.riskId, name: risk.name }] } : f));
        try {
            await api.linkRiskToFinding(finding.id, risk.id);
            success('Eşleştirildi', `${risk.riskId} bulguya bağlandı.`);
        } catch {
            showError('Hata', 'Risk bağlanamadı.');
            fetchData();
        }
    };
    const unlinkRisk = async (finding: Finding, riskId: string, riskDbId: string) => {
        setFindings(prev => prev.map(f => f.id === finding.id
            ? { ...f, linkedRisks: f.linkedRisks.filter(r => r.id !== riskDbId) } : f));
        try {
            await api.unlinkRiskFromFinding(finding.id, riskDbId);
        } catch {
            showError('Hata', 'Bağ kaldırılamadı.');
            fetchData();
        }
    };

    const availableRisks = useMemo(() => {
        if (!linkModal) return [];
        const linkedIds = new Set(linkModal.linkedRisks.map(r => r.id));
        let list = risks.filter(r => !linkedIds.has(r.id));
        if (riskSearch) {
            const q = riskSearch.toLowerCase();
            list = list.filter(r => r.riskId.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
        }
        return list;
    }, [linkModal, risks, riskSearch]);

    // linkModal açık finding'in güncel halini bul (optimistic sonrası)
    const currentLinkFinding = linkModal ? findings.find(f => f.id === linkModal.id) ?? linkModal : null;

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            <div className="px-8 pt-8">
                <PageHeader
                    title="Bulgu-Risk Eşleştirme"
                    description="Her bulguyu Risk Envanteri'nden en az bir risk ile eşleştirin."
                    breadcrumbs={[{ label: 'Bulgu & Aksiyon' }, { label: 'Bulgu-Risk Eşleştirme' }]}
                />

                {/* KPI */}
                <div className="grid grid-cols-3 gap-4 my-6">
                    <button onClick={() => setFilter('all')} className={`bg-white rounded-xl p-4 border text-left transition-all ${filter === 'all' ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
                        <p className="text-xs font-medium text-slate-500 uppercase">Toplam Bulgu</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">{findings.length}</p>
                    </button>
                    <button onClick={() => setFilter('mapped')} className={`bg-white rounded-xl p-4 border text-left transition-all ${filter === 'mapped' ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'}`}>
                        <p className="text-xs font-medium text-emerald-600 uppercase">Riski Eşlenmiş</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-1">{mappedCount}</p>
                    </button>
                    <button onClick={() => setFilter('unmapped')} className={`bg-white rounded-xl p-4 border text-left transition-all ${filter === 'unmapped' ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-200'}`}>
                        <p className="text-xs font-medium text-rose-600 uppercase">Risk Eşlenmemiş</p>
                        <p className="text-2xl font-bold text-rose-700 mt-1">{unmappedCount}</p>
                    </button>
                </div>

                <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Bulgu no veya özet ara..."
                    className="w-full max-w-md px-3 py-2 border border-slate-200 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>

            <div className="px-8 pb-8 flex-1 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-40 text-slate-400">
                        <div className="animate-spin w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full" />
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Bulgu</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Önem</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Direktörlük</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Eşleşen Riskler</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">İşlem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Bulgu bulunamadı</td></tr>
                                ) : filtered.map(f => {
                                    const sev = SEVERITY[f.severity];
                                    const dir = f.directorate?.name || f.directorateRel?.name || '—';
                                    return (
                                        <tr key={f.id} className="hover:bg-slate-50/50">
                                            <td className="px-4 py-3">
                                                <Link href={`/findings/${f.id}`} className="font-mono font-bold text-violet-600 hover:underline">{f.findingId}</Link>
                                                <p className="text-xs text-slate-500 max-w-xs truncate">{f.summary || f.description}</p>
                                            </td>
                                            <td className="px-4 py-3">{sev ? <StatusBadge variant={sev.variant}>{sev.label}</StatusBadge> : '—'}</td>
                                            <td className="px-4 py-3 text-slate-600 text-xs">{dir}</td>
                                            <td className="px-4 py-3">
                                                {f.linkedRisks.length === 0 ? (
                                                    <span className="text-xs text-rose-500 font-medium">Risk eşlenmemiş</span>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1">
                                                        {f.linkedRisks.map(r => (
                                                            <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs" title={r.name}>
                                                                {r.riskId}
                                                                <button onClick={() => unlinkRisk(f, r.riskId, r.id)} className="text-blue-400 hover:text-red-500">×</button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <button onClick={() => { setLinkModal(f); setRiskSearch(''); }}
                                                    className="px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg">
                                                    + Risk Ekle
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Risk Ekle Modalı */}
            {currentLinkFinding && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setLinkModal(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h3 className="font-bold text-slate-900">Risk Bağla — <span className="font-mono text-violet-600">{currentLinkFinding.findingId}</span></h3>
                            <p className="text-xs text-slate-500 mt-0.5">Risk Envanteri'nden bir risk seçin</p>
                        </div>
                        <div className="px-6 py-3 border-b border-slate-100">
                            <input value={riskSearch} onChange={e => setRiskSearch(e.target.value)} placeholder="Risk ara..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                            {availableRisks.length === 0 ? (
                                <p className="text-center text-slate-400 text-sm py-8">Eşleştirilebilecek risk yok</p>
                            ) : availableRisks.map(r => (
                                <button key={r.id} onClick={() => linkRisk(currentLinkFinding, r)}
                                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 rounded-lg flex items-center gap-3">
                                    <span className="font-mono text-xs font-bold text-blue-600">{r.riskId}</span>
                                    <span className="text-sm text-slate-700 flex-1 truncate">{r.name}</span>
                                    {r.category && <span className="text-[10px] text-slate-400">{r.category}</span>}
                                </button>
                            ))}
                        </div>
                        <div className="px-6 py-3 border-t border-slate-100 flex justify-end">
                            <button onClick={() => setLinkModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Kapat</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
