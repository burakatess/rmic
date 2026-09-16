'use client';

import { useState, useEffect } from 'react';
import { Modal, Button } from '@/components/ui';

/** prompt()/confirm() yerine — gerekçe gerektiren onay akışları için (geri gönder, final iptal vb.) */
export function ReasonModal({
    open, title, description, confirmLabel, reasonRequired, saving, onConfirm, onClose,
}: {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel: string;
    /** true ise gerekçe boşken Onayla disabled */
    reasonRequired: boolean;
    saving: boolean;
    onConfirm: (reason: string) => void;
    onClose: () => void;
}) {
    const [reason, setReason] = useState('');
    useEffect(() => { if (open) setReason(''); }, [open]);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            description={description}
            size="sm"
            footer={
                <>
                    <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
                    <Button
                        variant="primary"
                        onClick={() => onConfirm(reason)}
                        loading={saving}
                        disabled={saving || (reasonRequired && !reason.trim())}
                    >
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Gerekçe {reasonRequired ? <span className="text-red-500">*</span> : <span className="text-slate-400">(opsiyonel)</span>}
            </label>
            <textarea
                autoFocus
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder="Gerekçenizi yazın..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 resize-none
                           focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all duration-150"
            />
        </Modal>
    );
}
