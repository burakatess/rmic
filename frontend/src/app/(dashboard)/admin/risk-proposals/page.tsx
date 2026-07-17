'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { PageHeader, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth/AuthProvider';

interface Proposal {
    id: string;
    riskTanimi: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reviewNote?: string | null;
    createdAt: string;
    finding?: { id: string; findingId: string; summary?: string; severity?: string } | null;
    directorate?: { id: string; name: string } | null;
    requestedBy?: { firstName: string; lastName: string; email: string } | null;
}

const STATUS: Record<string, { label: string; variant: 'warning' | 'success' | 'critical' }> = {
    PENDING: { label: 'Bekliyor', variant: 'warning' },
    APPROVED: { label: 'Onaylandı', variant: 'success' },
    REJECTED: { label: 'Reddedildi', variant: 'critical' },
};

function fmt(d: string) { return new Date(d).toLocaleString('tr-TR'); }

export default function RiskProposalsPage() {
    const { user } = useAuth();
    const { success, error: showError } = useToast();
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [rejectModal, setRejectModal] = useState<Proposal | null>(null);
    const [rejectNote, setRejectNote] = useState('');

    const isAdmin = user?.role?.name === 'SYSTEM_ADMIN' || user?.role?.permissions?.includes('*');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setProposals(await api.getRiskProposals(statusFilter || undefined));
        } catch (err: any) {
            showError('Hata', err.message || 'Talepler yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, showError]);

    useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

    const approve = async (p: Proposal) => {
        try { await api.approveRiskProposal(p.id); success('Onaylandı', 'Talep onaylandı.'); load(); }
        catch { showError('Hata', 'Onaylanamadı.'); }
    };
    const doReject = async () => {
        if (!rejectModal) return;
        try {
            await api.rejectRiskProposal(rejectModal.id, rejectNote);
            success('Reddedildi', 'Talep reddedildi.');
            setRejectModal(null); setRejectNote(''); load();
        } catch { showError('Hata', 'Reddedilemedi.'); }
    };

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-slate-400">
                <p className="font-medium">Bu sayfa yalnızca Sistem Yöneticisi rolüne açıktır</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader title="Risk Öneri Talepleri" description="Bulgulara ilişkin yeni risk tanımı önerilerini inceleyin ve onaylayın" />

            <div className="flex gap-2">
                {['', 'PENDING', 'APPROVED', 'REJECTED'].map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {s === '' ? 'Tümü' : STATUS[s].label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40 text-slate-400">
                    <div className="animate-spin w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full" />
                </div>
            ) : proposals.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">Talep bulunamadı</div>
            ) : (
                <div className="space-y-3">
                    {proposals.map(p => (
                        <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <StatusBadge variant={STATUS[p.status].variant}>{STATUS[p.status].label}</StatusBadge>
                                        {p.finding && (
                                            <Link href={`/findings/${p.finding.id}`} className="font-mono text-xs font-bold text-violet-600 hover:underline">
                                                {p.finding.findingId}
                                            </Link>
                                        )}
                                        {p.directorate && <span className="text-xs text-slate-500">📍 {p.directorate.name}</span>}
                                    </div>
                                    <p className="text-sm text-slate-800 mb-2">{p.riskTanimi}</p>
                                    {p.finding?.summary && <p className="text-xs text-slate-400 mb-1">Bulgu: {p.finding.summary}</p>}
                                    <p className="text-[11px] text-slate-400">
                                        {p.requestedBy ? `${p.requestedBy.firstName} ${p.requestedBy.lastName}` : '—'} · {fmt(p.createdAt)}
                                    </p>
                                    {p.reviewNote && <p className="text-[11px] text-rose-500 mt-1">Red gerekçesi: {p.reviewNote}</p>}
                                </div>
                                {p.status === 'PENDING' && (
                                    <div className="flex flex-col gap-2 shrink-0">
                                        <button onClick={() => approve(p)}
                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors">
                                            Onayla
                                        </button>
                                        <button onClick={() => { setRejectModal(p); setRejectNote(''); }}
                                            className="px-3 py-1.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-medium rounded-lg transition-colors">
                                            Reddet
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {rejectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRejectModal(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h3 className="font-bold text-slate-900">Talebi Reddet</h3>
                        </div>
                        <div className="p-6">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Red Gerekçesi</label>
                            <textarea rows={3} value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                                placeholder="Reddetme gerekçesini yazın..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-300" />
                        </div>
                        <div className="px-6 py-3 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setRejectModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">İptal</button>
                            <button onClick={doReject}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg transition-colors">
                                Reddet
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
