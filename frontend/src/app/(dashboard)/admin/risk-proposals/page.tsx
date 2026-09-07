'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { PageShell, PageHeader, StatusBadge, Button, Modal } from '@/components/ui';
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
            <PageShell>
                <div className="flex flex-col items-center justify-center h-96 text-slate-400">
                    <p className="font-medium">Bu sayfa yalnızca Sistem Yöneticisi rolüne açıktır</p>
                </div>
            </PageShell>
        );
    }

    return (
        <PageShell>
            <PageHeader
                title="Risk Öneri Talepleri"
                description="Bulgulara ilişkin yeni risk tanımı önerilerini inceleyin ve onaylayın"
                breadcrumbs={[{ label: 'Sistem Yönetimi' }, { label: 'Risk Öneri Talepleri' }]}
            />

            <div className="flex gap-2 mb-6">
                {['', 'PENDING', 'APPROVED', 'REJECTED'].map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors cursor-pointer ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {s === '' ? 'Tümü' : STATUS[s].label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40 text-slate-400">
                    <div className="animate-spin w-6 h-6 border-2 border-blue-300 border-t-blue-600 rounded-full" />
                </div>
            ) : proposals.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">Talep bulunamadı</div>
            ) : (
                <div className="space-y-3">
                    {proposals.map(p => (
                        <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <StatusBadge variant={STATUS[p.status].variant}>{STATUS[p.status].label}</StatusBadge>
                                        {p.finding && (
                                            <Link href={`/findings/${p.finding.id}`} className="font-mono text-xs font-bold text-blue-600 hover:underline">
                                                {p.finding.findingId}
                                            </Link>
                                        )}
                                        {p.directorate && <span className="text-xs text-slate-500">{p.directorate.name}</span>}
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
                                        <Button size="sm" variant="success" onClick={() => approve(p)}>Onayla</Button>
                                        <Button size="sm" variant="danger" onClick={() => { setRejectModal(p); setRejectNote(''); }}>Reddet</Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal
                open={!!rejectModal}
                onClose={() => setRejectModal(null)}
                title="Talebi Reddet"
                size="sm"
                footer={
                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" onClick={() => setRejectModal(null)}>İptal</Button>
                        <Button variant="danger" onClick={doReject}>Reddet</Button>
                    </div>
                }
            >
                <label className="block text-sm font-medium text-slate-700 mb-1">Red Gerekçesi</label>
                <textarea rows={3} value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                    placeholder="Reddetme gerekçesini yazın..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus-visible:ring-2 ring-blue-100" />
            </Modal>
        </PageShell>
    );
}
