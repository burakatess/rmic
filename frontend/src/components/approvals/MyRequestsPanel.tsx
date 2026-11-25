'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import type { WorkflowDecisionItem } from '@/lib/api';
import type { MyRequestItem } from '@/types/workflow';
import { Button, Modal, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

/**
 * Taleplerim: kullanıcının gönderdiği, karar bekleyen onay ve silme talepleri. Her talepte kimin
 * onayında olduğu yazılır ve karar verilene kadar geri çekilebilir. Altında kayıtları hakkındaki
 * son kararlar (onay, ret, iade, silme) listelenir.
 */
type BV = 'critical' | 'warning' | 'success' | 'info' | 'neutral';

const KIND_LABEL: Record<MyRequestItem['kind'], { label: string; variant: BV }> = {
    TEST_APPROVAL: { label: 'Kontrol testi onayı', variant: 'info' },
    ACTION_APPROVAL: { label: 'Aksiyon onayı', variant: 'warning' },
    FOLLOWUP_APPROVAL: { label: 'Takip onayı', variant: 'info' },
    FINDING_CLOSURE: { label: 'Bulgu kapanışı', variant: 'success' },
    PERIOD_APPROVAL: { label: 'Dönem kontrolü onayı', variant: 'info' },
    DELETION: { label: 'Silme talebi', variant: 'critical' },
};
const RECORD_LABEL: Record<string, string> = {
    CONTROL: 'Kontrol', CONTROL_TEST: 'Kontrol testi', PERIOD_CONTROL: 'Dönem kontrolü', FINDING: 'Bulgu', ACTION: 'Aksiyon', FOLLOW_UP: 'Takip',
};
const DECISION: Record<string, { label: string; variant: BV }> = {
    ACTION_REJECTED: { label: 'Aksiyon reddedildi — düzeltin', variant: 'critical' },
    ACTION_APPROVED: { label: 'Aksiyon onaylandı', variant: 'success' },
    ACTION_REVERTED: { label: 'Aksiyon onayı geri alındı', variant: 'warning' },
    ACTION_DELETED: { label: 'Aksiyon silindi', variant: 'neutral' },
    ACTION_DELETE_REJECTED: { label: 'Aksiyon silme talebi reddedildi', variant: 'warning' },
    FOLLOWUP_REJECTED: { label: 'Takip reddedildi — düzeltin', variant: 'critical' },
    FOLLOWUP_APPROVED: { label: 'Takip onaylandı', variant: 'success' },
    FOLLOWUP_REVERTED: { label: 'Takip onayı geri alındı', variant: 'warning' },
    FOLLOWUP_DELETED: { label: 'Takip silindi', variant: 'neutral' },
    FOLLOWUP_DELETE_REJECTED: { label: 'Takip silme talebi reddedildi', variant: 'warning' },
    FINDING_CLOSED: { label: 'Bulgu kapatıldı', variant: 'success' },
    FINDING_CLOSURE_RETURNED: { label: 'Bulgu kapanışı iade edildi', variant: 'warning' },
    FINDING_DELETED: { label: 'Bulgu silindi', variant: 'neutral' },
    FINDING_DELETE_REJECTED: { label: 'Bulgu silme talebi reddedildi', variant: 'warning' },
    TEST_RETURNED: { label: 'Test geri gönderildi — düzeltin', variant: 'critical' },
    TEST_APPROVED: { label: 'Test onaylandı', variant: 'success' },
    TEST_DELETED: { label: 'Test silindi', variant: 'neutral' },
    TEST_DELETE_REJECTED: { label: 'Test silme talebi reddedildi', variant: 'warning' },
};

const fmt = (d?: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
};

export function MyRequestsPanel({ onCountChange }: { onCountChange?: (n: number) => void }) {
    const { success, error: showError } = useToast();
    const [items, setItems] = useState<MyRequestItem[] | null>(null);
    const [decisions, setDecisions] = useState<WorkflowDecisionItem[]>([]);
    const [withdrawing, setWithdrawing] = useState<MyRequestItem | null>(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        api.getMyRequests()
            .then(r => { setItems(r.items); setDecisions(r.decisions || []); onCountChange?.(r.items.length); })
            .catch(() => { setItems([]); showError('Hata', 'Talepleriniz yüklenemedi.'); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => { load(); }, [load]);

    const withdraw = async () => {
        if (!withdrawing) return;
        setBusy(true);
        try {
            const w = withdrawing.withdraw;
            if (w.via === 'DELETION') await api.withdrawDeletion(w.type, withdrawing.recordId, note);
            else await api.workflowTransition(w.entityType, withdrawing.recordId, 'WITHDRAW', note.trim() || undefined);
            success('Geri çekildi', `${withdrawing.code}: talep geri çekildi${w.via === 'DELETION' ? '; kayıt mevcut haliyle kaldı' : '; kayıt yeniden düzenlenebilir'}.`);
            setWithdrawing(null); setNote('');
            load();
        } catch (err) {
            showError('Geri çekilemedi', (err as Error).message);
        } finally { setBusy(false); }
    };

    if (items === null) return <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />;
    return (
        <div className="space-y-6" data-testid="my-requests">
            <section aria-labelledby="my-pending-title" className="space-y-2">
                <h2 id="my-pending-title" className="text-sm font-semibold text-slate-700">Karar bekleyen taleplerim</h2>
                <p className="text-xs text-slate-500">Onaya gönderdiğiniz kayıtlar ve açtığınız silme talepleri. Karar verilene kadar geri çekebilirsiniz.</p>
                {items.length === 0 ? (
                    <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">Karar bekleyen talebiniz yok.</p>
                ) : (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-2.5">Talep</th><th className="px-4 py-2.5">Kayıt</th><th className="px-4 py-2.5">Kimin onayında</th>
                                    <th className="px-4 py-2.5">Gerekçe / not</th><th className="px-4 py-2.5">Gönderim</th><th className="px-4 py-2.5" />
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(i => (
                                    <tr key={`${i.kind}:${i.recordType}:${i.recordId}`} className="border-t border-slate-100 align-top" data-testid="my-request-row">
                                        <td className="px-4 py-3">
                                            <StatusBadge variant={KIND_LABEL[i.kind].variant}>{KIND_LABEL[i.kind].label}</StatusBadge>
                                            {i.kind === 'DELETION' && <span className="block text-[11px] text-slate-500 mt-1">{RECORD_LABEL[i.recordType] ?? i.recordType}</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link href={i.link} className="font-mono font-semibold text-blue-700 hover:underline">{i.code}</Link>
                                            {i.title && <span className="block text-xs text-slate-600 max-w-[260px] truncate">{i.title}</span>}
                                        </td>
                                        <td className="px-4 py-3 max-w-[280px]">
                                            {i.approvers.length
                                                ? <span className="font-semibold text-slate-800">{i.approvers.map(a => a.name).join(', ')}</span>
                                                : <span className="text-red-700">Onaylayıcı atanmamış</span>}
                                            {i.approverNote && <span className="block text-[11px] text-slate-500 mt-0.5">{i.approverNote}</span>}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-600 max-w-[240px]">{i.reason || '—'}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{fmt(i.submittedAt)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <Button size="sm" variant="outline" onClick={() => { setNote(''); setWithdrawing(i); }}>Geri çek</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section aria-labelledby="my-decisions-title" className="space-y-2">
                <h2 id="my-decisions-title" className="text-sm font-semibold text-slate-700">Kayıtlarım hakkındaki kararlar</h2>
                <p className="text-xs text-slate-500">Retler ve geri gönderilenler düzeltilene kadar, diğer kararlar 7 gün görünür.</p>
                {decisions.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3">Son 7 günde karar yok.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                        {decisions.map(d => (
                            <li key={`${d.kind}-${d.recordId}`} className="flex flex-wrap items-center gap-3 px-3 py-2">
                                <StatusBadge variant={DECISION[d.kind]?.variant || 'neutral'}>{DECISION[d.kind]?.label || d.kind}</StatusBadge>
                                <Link href={d.link} className="font-mono text-xs font-bold text-blue-700 hover:underline">{d.code}</Link>
                                {d.finding && d.finding.findingId !== d.code && <span className="font-mono text-[11px] text-violet-700">{d.finding.findingId}</span>}
                                {d.reason && <span className="text-xs text-slate-600 flex-1 min-w-0 truncate">Gerekçe: {d.reason}</span>}
                                <span className="text-[11px] text-slate-400 ml-auto">{fmt(d.date)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <Modal open={!!withdrawing} onClose={() => !busy && setWithdrawing(null)} size="md"
                title={withdrawing ? `${withdrawing.code}: talebi geri çek` : ''}
                description={withdrawing?.withdraw.via === 'DELETION'
                    ? 'Silme talebi geri çekilir ve onaylayıcıların kutusundan düşer; kayıt mevcut haliyle kalır.'
                    : 'Onay talebi geri çekilir ve onaylayıcının kutusundan düşer; kayıt yeniden düzenlenebilir hale gelir.'}
                footer={<div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setWithdrawing(null)} disabled={busy}>Vazgeç</Button>
                    <Button variant="primary" size="sm" loading={busy} onClick={withdraw}>Geri çek</Button>
                </div>}>
                <label htmlFor="withdraw-note" className="block text-xs font-semibold text-slate-600 mb-1">Not (isteğe bağlı)</label>
                <textarea id="withdraw-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={2000}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </Modal>
        </div>
    );
}

export default MyRequestsPanel;
