'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import type { DeletionRequestRow } from '@/types/workflow';

const TYPE_LABEL: Record<DeletionRequestRow['type'], string> = {
    CONTROL_TEST: 'Kontrol Testi', PERIOD_CONTROL: 'Dönem Kontrolü', FINDING: 'Bulgu', ACTION: 'Aksiyon Planı', FOLLOW_UP: 'Takip Çalışması',
};

/** Yönetici onayı bekleyen silme talepleri (bulgu, aksiyon planı, takip, kontrol testi, dönem kontrolü). Talep eden kendi talebine karar veremez. */
export function DeletionRequestsPanel({ onCountChange }: { onCountChange?: (n: number) => void }) {
    const { success, error: showError } = useToast();
    const [rows, setRows] = useState<DeletionRequestRow[] | null>(null);
    const [rejecting, setRejecting] = useState<DeletionRequestRow | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(() => {
        api.getDeletionRequests().then(r => { setRows(r); onCountChange?.(r.filter(x => x.canDecide).length); }).catch(() => setRows([]));
    }, [onCountChange]);
    useEffect(() => { load(); }, [load]);

    const decide = async (r: DeletionRequestRow, approve: boolean, why?: string) => {
        setBusy(r.id);
        try {
            await api.decideDeletion(r.type, r.id, approve, why);
            success(approve ? 'Silme onaylandı' : 'Talep reddedildi', approve ? `${r.code} silindi (kayıt tarihçe için korunur).` : `${r.code} mevcut haliyle kaldı.`);
            setRejecting(null); setReason('');
            load();
        } catch (e) {
            showError('İşlem yapılamadı', (e as Error).message);
        } finally { setBusy(null); }
    };

    if (!rows) return <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />;
    if (rows.length === 0) return <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">Bekleyen silme talebi yok.</p>;
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden" data-testid="deletion-requests">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <tr><th className="px-4 py-2.5">Kayıt</th><th className="px-4 py-2.5">Gerekçe</th><th className="px-4 py-2.5">Talep eden</th><th className="px-4 py-2.5">Tarih</th><th className="px-4 py-2.5" /></tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={`${r.type}:${r.id}`} className="border-t border-slate-100 align-top">
                            <td className="px-4 py-3">
                                <span className="text-[10.5px] font-semibold text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">{TYPE_LABEL[r.type]}</span>
                                <Link href={r.href} className="block font-mono font-semibold text-blue-700 hover:underline mt-1">{r.code}</Link>
                                <span className="text-slate-600">{r.title}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-700 max-w-[320px]">{r.reason || '—'}</td>
                            <td className="px-4 py-3">{r.requestedBy?.name ?? '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{new Date(r.requestedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                            <td className="px-4 py-3">
                                {r.canDecide ? (
                                    <div className="flex gap-2 justify-end">
                                        <Button size="sm" variant="danger" loading={busy === r.id} onClick={() => decide(r, true)}>Silmeyi onayla</Button>
                                        <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => { setReason(''); setRejecting(r); }}>Reddet</Button>
                                    </div>
                                ) : <span className="text-xs text-slate-500">Başka bir yöneticinin kararını bekliyor</span>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <Modal open={!!rejecting} onClose={() => !busy && setRejecting(null)} size="md" title={rejecting ? `${rejecting.code}: silme talebini reddet` : ''} description="Gerekçe talep edene iletilir ve kayıt mevcut haliyle kalır."
                footer={<div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRejecting(null)}>Vazgeç</Button>
                    <Button variant="primary" size="sm" disabled={!reason.trim()} loading={!!busy} onClick={() => rejecting && decide(rejecting, false, reason.trim())}>Reddet</Button>
                </div>}>
                <label htmlFor="del-reject" className="block text-xs font-semibold text-slate-600 mb-1">Ret gerekçesi *</label>
                <textarea id="del-reject" value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={2000} autoFocus className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </Modal>
        </div>
    );
}
