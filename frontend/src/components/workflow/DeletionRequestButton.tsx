'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

/**
 * Yönetici onaylı silme talebi. Kayıt silinmez; talep yönetici onayına gider (talep eden onaylayamaz).
 * Bekleyen talep varsa düğme yerine bilgi rozeti gösterilir.
 */
export function DeletionRequestButton({ type, id, code, pending, onDone, size = 'sm', variant = 'outline' }: {
    type: 'CONTROL_TEST' | 'PERIOD_CONTROL'; id: string; code: string; pending?: boolean; onDone?: () => void;
    size?: 'xs' | 'sm'; variant?: 'outline' | 'ghost' | 'danger';
}) {
    const { success, error: showError } = useToast();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    if (pending) {
        return <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 whitespace-nowrap" title="Yönetici onayı bekleniyor">Silme onayı bekliyor</span>;
    }
    const submit = async () => {
        setBusy(true);
        try {
            const r = await api.requestDeletion(type, id, reason.trim());
            success('Silme talebi gönderildi', r.message);
            setOpen(false); setReason('');
            onDone?.();
        } catch (e) {
            showError('Talep oluşturulamadı', (e as Error).message);
        } finally { setBusy(false); }
    };
    return (
        <>
            <Button size={size} variant={variant} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>Silme talebi</Button>
            <Modal open={open} onClose={() => !busy && setOpen(false)} size="md"
                title={`${code} için silme talebi`}
                description="Kayıt hemen silinmez: talep yönetici onayına gider ve onaylanana kadar mevcut haliyle kalır. Talebi siz onaylayamazsınız."
                footer={<div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>Vazgeç</Button>
                    <Button variant="danger" size="sm" loading={busy} disabled={!reason.trim()} onClick={submit}>Onaya gönder</Button>
                </div>}>
                <div onClick={e => e.stopPropagation()}>
                    <label htmlFor={`del-${id}`} className="block text-xs font-semibold text-slate-600 mb-1">Silme gerekçesi *</label>
                    <textarea id={`del-${id}`} value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={2000} autoFocus
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
            </Modal>
        </>
    );
}
