'use client';

import { useState } from 'react';
import api, { ApiError } from '@/lib/api';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { DeletionApproversNote } from '@/components/workflow/DeletionApproversNote';

export type RiskDeletionType = 'RISK' | 'RISK_CONTROL' | 'RISK_ACTION';

const NOUN: Record<RiskDeletionType, string> = { RISK: 'Risk', RISK_CONTROL: 'Kontrol', RISK_ACTION: 'Aksiyon' };

/**
 * Risk Yönetimi silme talebi (Risk Envanteri, Kontrol Alanı, Aksiyon Tablosu). Kayıt hemen silinmez:
 * talep, talep eden dışındaki bir yöneticinin onayına gider (Talepler & Onaylar → Silme Talepleri).
 * Onaylanana kadar kayıt olduğu gibi kalır; talep eden "Taleplerim"den geri çekebilir.
 */
export function RiskDeletionRequestModal({ type, targets, onClose, onDone }: {
    type: RiskDeletionType;
    targets: Array<{ id: string; code: string; title?: string | null }>;
    onClose: () => void;
    onDone: () => void;
}) {
    const { success, error: showError } = useToast();
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    // Gönderilemeyen talepler pencerede kalır (engel nedeni okunabilsin); başarılı olanlar listeden çıkar.
    const [errors, setErrors] = useState<Record<string, string>>({});
    const noun = NOUN[type];

    const submit = async () => {
        if (!reason.trim()) return;
        setBusy(true);
        const failed: Record<string, string> = {};
        let sent = 0;
        // Yeniden denemede yalnız önceki denemede gönderilemeyenler gönderilir.
        const retryOnly = Object.keys(errors).length > 0;
        for (const t of targets) {
            if (retryOnly && !(t.id in errors)) continue;
            try {
                await api.requestDeletion(type, t.id, reason.trim());
                sent++;
            } catch (err) {
                failed[t.id] = err instanceof ApiError ? err.message : 'Talep gönderilemedi.';
            }
        }
        setBusy(false);
        setErrors(failed);
        if (sent > 0) { success('Silme talebi gönderildi', `${sent} kayıt yönetici onayına gönderildi; onaylanana kadar kayıt mevcut haliyle kalır.`); onDone(); }
        if (Object.keys(failed).length) showError('Talep gönderilemedi', 'Nedeni pencerede yazıyor.');
        else onClose();
    };

    return (
        <Modal open onClose={() => !busy && onClose()} size="md"
            title={targets.length === 1 ? `${noun} Silme Talebi` : `${targets.length} Kayıt İçin Silme Talebi`}
            description="Kayıt hemen silinmez. Talep yönetici onayına gider; onaylanınca kayıt “Silindi” olarak işaretlenir ve listelerden düşer (iz korunur)."
            footer={<div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Vazgeç</Button>
                <Button variant="danger" size="sm" onClick={submit} loading={busy} disabled={!reason.trim()}>Silme Talebi Gönder</Button>
            </div>}>
            <DeletionApproversNote />
            {type !== 'RISK_ACTION' && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    {type === 'RISK'
                        ? 'Bağlı bulgusu veya aksiyonu olan risk silinemez; önce eşleştirmeleri kaldırın. Kontrol, regülasyon ve Kontrol Alanı/Aksiyon Tablosu bağları onayda kaldırılır.'
                        : 'Riske veya aksiyona bağlı kontrol silinemez; önce bağlantıları kaldırın.'}
                </p>
            )}
            <div className="max-h-48 overflow-y-auto space-y-1.5 mb-3">
                {targets.map(t => (
                    <div key={t.id} className={`text-sm border rounded-lg px-3 py-2 ${errors[t.id] ? 'border-red-200 bg-red-50' : 'border-slate-100'}`}>
                        <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-blue-700">{t.code}</span>
                            {t.title && <span className="text-slate-600 truncate">{t.title}</span>}
                        </div>
                        {errors[t.id] && <p className="text-xs text-red-700 mt-1" role="alert">{errors[t.id]}</p>}
                    </div>
                ))}
            </div>
            <label htmlFor="risk-del-reason" className="block text-xs font-semibold text-slate-600 mb-1">Silme Gerekçesi *</label>
            <textarea id="risk-del-reason" value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={2000} autoFocus
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </Modal>
    );
}

export default RiskDeletionRequestModal;
