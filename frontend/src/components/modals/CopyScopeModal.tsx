'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Modal, Button, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

interface CopyScopeModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function CopyScopeModal({ open, onClose, onSuccess }: CopyScopeModalProps) {
    const { success, error: showError } = useToast();
    const [years, setYears] = useState<number[]>([]);
    const currentYear = new Date().getFullYear();
    const [fromYear, setFromYear] = useState(currentYear);
    const [toYear, setToYear] = useState(currentYear + 1);
    const [preview, setPreview] = useState<{ total: number; toCopy: number; alreadyExists: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPreview(null);
        api.getScopeYears().then(r => setYears(r.years)).catch(() => setYears([currentYear, currentYear + 1]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const runPreview = async () => {
        setLoading(true);
        try {
            const r = await api.copyControlScope({ fromYear, toYear, dryRun: true });
            setPreview(r);
        } catch {
            showError('Hata', 'Önizleme alınamadı.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const r = await api.copyControlScope({ fromYear, toYear });
            success('Başarılı', `${r.copied} kontrol ${toYear} kapsamına kopyalandı (${r.skipped} zaten vardı, atlandı).`);
            onSuccess();
            onClose();
        } catch {
            showError('Hata', 'Kopyalama işlemi başarısız oldu.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Önceki Yıldan Kapsam Kopyala" size="sm"
            description="Yalnızca kapsam ve planlama ayarları kopyalanır — test sonuçları, kanıtlar ve onaylar kopyalanmaz."
            footer={
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Vazgeç</Button>
                    <Button variant="outline" onClick={runPreview} disabled={loading || fromYear === toYear}>
                        {loading ? 'Hesaplanıyor...' : 'Önizle'}
                    </Button>
                    <Button variant="primary" onClick={handleSubmit} disabled={submitting || fromYear === toYear}>
                        {submitting ? 'Kopyalanıyor...' : 'Kopyala'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Kaynak Yıl</label>
                    <Select value={String(fromYear)} placeholder="Yıl seçin"
                        options={years.map(y => ({ value: String(y), label: String(y) }))}
                        onChange={(e) => { setFromYear(Number(e.target.value)); setPreview(null); }} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Hedef Yıl</label>
                    <Select value={String(toYear)} placeholder="Yıl seçin"
                        options={years.map(y => ({ value: String(y), label: String(y) }))}
                        onChange={(e) => { setToYear(Number(e.target.value)); setPreview(null); }} />
                </div>
                {fromYear === toYear && (
                    <p className="text-sm text-rose-600">Kaynak ve hedef yıl aynı olamaz.</p>
                )}
                {preview && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                        {fromYear} kapsamındaki <span className="font-bold">{preview.total}</span> kontrolden{' '}
                        <span className="font-bold">{preview.toCopy}</span> tanesi {toYear}&apos;e kopyalanacak
                        {preview.alreadyExists > 0 && <> ({preview.alreadyExists} tanesi zaten {toYear} kapsamında, atlanacak)</>}.
                    </div>
                )}
            </div>
        </Modal>
    );
}
