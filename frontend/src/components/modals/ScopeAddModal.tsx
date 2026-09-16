'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Modal, Button, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

const FREQUENCY_OPTIONS = [
    { value: 'ANNUAL', label: 'Yıllık (1 task)' },
    { value: 'SEMI_ANNUAL', label: 'Altı Aylık (2 task)' },
    { value: 'QUARTERLY', label: 'Üç Aylık (4 task)' },
    { value: 'MONTHLY', label: 'Aylık (12 task)' },
    { value: 'WEEKLY', label: 'Haftalık (~52 task)' },
];

interface PreviewYear {
    year: number;
    alreadyInScope: boolean;
    newTaskCount: number;
    totalPeriodCount: number;
}

interface ScopeAddModalProps {
    open: boolean;
    onClose: () => void;
    controlIds: string[];
    onSuccess: () => void;
}

export default function ScopeAddModal({ open, onClose, controlIds, onSuccess }: ScopeAddModalProps) {
    const { success, error: showError } = useToast();
    const [years, setYears] = useState<number[]>([]);
    const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
    const [frequency, setFrequency] = useState('');
    const [includePastPeriods, setIncludePastPeriods] = useState(false);
    const [preview, setPreview] = useState<PreviewYear[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const currentYear = new Date().getFullYear();

    useEffect(() => {
        if (!open) return;
        setPreview(null);
        setSelectedYears(new Set([currentYear]));
        setFrequency('');
        setIncludePastPeriods(false);
        api.getScopeYears().then(r => setYears(r.years)).catch(() => setYears([currentYear, currentYear + 1]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const toggleYear = (y: number) => {
        setPreview(null);
        setSelectedYears(prev => {
            const n = new Set(prev);
            n.has(y) ? n.delete(y) : n.add(y);
            return n;
        });
    };

    const runPreview = async () => {
        if (selectedYears.size === 0 || controlIds.length === 0) return;
        setLoading(true);
        try {
            if (controlIds.length === 1) {
                const r = await api.addControlScope(controlIds[0], {
                    years: Array.from(selectedYears), frequency: frequency || undefined,
                    includePastPeriods, dryRun: true,
                });
                setPreview(r.results);
            } else {
                // Toplu önizleme: her yıl için ayrı bulk dryRun çağrısı, sonuçlar toplanır.
                const results: PreviewYear[] = [];
                for (const year of selectedYears) {
                    const r = await api.bulkAddControlScope({ controlIds, year, frequency: frequency || undefined, includePastPeriods, dryRun: true });
                    const newTaskCount = r.results.reduce((s: number, x: any) => s + (x.newTaskCount || 0), 0);
                    const totalPeriodCount = r.results.reduce((s: number, x: any) => s + (x.totalPeriodCount || 0), 0);
                    results.push({ year, alreadyInScope: false, newTaskCount, totalPeriodCount });
                }
                setPreview(results);
            }
        } catch {
            showError('Hata', 'Önizleme alınamadı.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (selectedYears.size === 0 || controlIds.length === 0) return;
        setSubmitting(true);
        try {
            if (controlIds.length === 1) {
                await api.addControlScope(controlIds[0], {
                    years: Array.from(selectedYears), frequency: frequency || undefined, includePastPeriods,
                });
            } else {
                for (const year of selectedYears) {
                    await api.bulkAddControlScope({ controlIds, year, frequency: frequency || undefined, includePastPeriods });
                }
            }
            success('Başarılı', `${controlIds.length} kontrol seçilen yıl(lar)ın kapsamına alındı.`);
            onSuccess();
            onClose();
        } catch {
            showError('Hata', 'Kapsama alma işlemi başarısız oldu.');
        } finally {
            setSubmitting(false);
        }
    };

    const includesCurrentYear = selectedYears.has(currentYear);

    return (
        <Modal open={open} onClose={onClose} title="Yıl Kapsamına Al" size="md"
            description={`${controlIds.length} kontrol için kapsam yılı seçin`}
            footer={
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Vazgeç</Button>
                    <Button variant="outline" onClick={runPreview} disabled={loading || selectedYears.size === 0}>
                        {loading ? 'Hesaplanıyor...' : 'Önizle'}
                    </Button>
                    <Button variant="primary" onClick={handleSubmit} disabled={submitting || selectedYears.size === 0}>
                        {submitting ? 'Kaydediliyor...' : 'Kapsama Al'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Kapsam Yılı/Yılları</label>
                    <div className="flex flex-wrap gap-2">
                        {years.map(y => (
                            <button
                                key={y} type="button" onClick={() => toggleYear(y)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                                    selectedYears.has(y)
                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                                }`}
                            >
                                {y}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Periyodiklik (opsiyonel geçersiz kılma)</label>
                    <Select value={frequency} placeholder="Kontrolün varsayılanı" options={FREQUENCY_OPTIONS}
                        onChange={(e) => { setFrequency(e.target.value); setPreview(null); }} />
                </div>

                {includesCurrentYear && (
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input type="checkbox" checked={includePastPeriods}
                            onChange={(e) => { setIncludePastPeriods(e.target.checked); setPreview(null); }} />
                        Geçmiş dönemleri de dahil et ({currentYear} için bugüne kadar geçen dönemler)
                    </label>
                )}

                {preview && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-1">
                        <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Önizleme</p>
                        {preview.map(p => (
                            <p key={p.year} className="text-sm text-emerald-900">
                                <span className="font-semibold">{p.year}:</span> {p.totalPeriodCount} dönem, <span className="font-bold">{p.newTaskCount}</span> yeni task oluşacak
                                {p.alreadyInScope && <span className="text-emerald-600"> (zaten kapsamda — eksik dönemler tamamlanacak)</span>}
                            </p>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
