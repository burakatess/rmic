'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { Button, Modal, Select, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { PermissionGate } from '@/components/auth/AuthProvider';

const frequencyLabel: Record<string, string> = {
    DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık',
    QUARTERLY: '3 Aylık', SEMI_ANNUAL: '6 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi',
};

const FREQUENCY_OPTIONS = Object.entries(frequencyLabel).map(([value, label]) => ({ value, label }));

interface YearScope {
    id: string;
    year: number;
    status: 'ACTIVE' | 'REMOVED';
    frequency: string;
    addedBy?: { firstName: string; lastName: string } | null;
    addedAt?: string;
    removedBy?: { firstName: string; lastName: string } | null;
    removedAt?: string | null;
    removalReason?: string | null;
    _count?: { tasks: number };
}

interface OngoingTask { id: string; testNo: string; periodLabel: string }

export default function ControlScopePanel({ controlId, yearScopes, onChanged }: {
    controlId: string; yearScopes: YearScope[]; onChanged: () => void;
}) {
    const { success, error: showError } = useToast();
    const [removeTarget, setRemoveTarget] = useState<YearScope | null>(null);
    const [removeReason, setRemoveReason] = useState('');
    const [ongoingTasks, setOngoingTasks] = useState<OngoingTask[] | null>(null);
    const [decisions, setDecisions] = useState<Record<string, 'CONTINUE' | 'CANCEL'>>({});
    const [periodicityTarget, setPeriodicityTarget] = useState<YearScope | null>(null);
    const [newFrequency, setNewFrequency] = useState('');
    const [periodicityReason, setPeriodicityReason] = useState('');
    const [periodicityPreview, setPeriodicityPreview] = useState<{ toCancelCount: number; toCreateCount: number; protectedCount: number } | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [history, setHistory] = useState<any[]>([]);
    const [busy, setBusy] = useState(false);

    const openRemove = (s: YearScope) => {
        setRemoveTarget(s); setRemoveReason(''); setOngoingTasks(null); setDecisions({});
    };

    const submitRemove = async () => {
        if (!removeTarget || !removeReason.trim()) { showError('Hata', 'Gerekçe zorunludur.'); return; }
        setBusy(true);
        try {
            const decisionList = Object.entries(decisions).map(([taskId, action]) => ({ taskId, action }));
            const r = await api.removeControlScope(controlId, removeTarget.year, { reason: removeReason, decisions: decisionList });
            if (r.requiresDecision) {
                setOngoingTasks(r.ongoingTasks);
                showError('Karar Gerekli', 'Devam eden tasklar için devam/iptal kararı verin.');
                return;
            }
            success('Başarılı', `${removeTarget.year} kapsamdan çıkarıldı.`);
            setRemoveTarget(null);
            onChanged();
        } catch {
            showError('Hata', 'Kapsamdan çıkarma başarısız oldu.');
        } finally {
            setBusy(false);
        }
    };

    const openPeriodicity = (s: YearScope) => {
        setPeriodicityTarget(s); setNewFrequency(s.frequency); setPeriodicityReason(''); setPeriodicityPreview(null);
    };

    const previewPeriodicity = async () => {
        if (!periodicityTarget) return;
        setBusy(true);
        try {
            const r = await api.changeControlScopePeriodicity(controlId, periodicityTarget.year, { frequency: newFrequency, reason: periodicityReason || 'önizleme', dryRun: true });
            setPeriodicityPreview(r);
        } catch {
            showError('Hata', 'Önizleme alınamadı.');
        } finally {
            setBusy(false);
        }
    };

    const submitPeriodicity = async () => {
        if (!periodicityTarget || !periodicityReason.trim()) { showError('Hata', 'Gerekçe zorunludur.'); return; }
        setBusy(true);
        try {
            await api.changeControlScopePeriodicity(controlId, periodicityTarget.year, { frequency: newFrequency, reason: periodicityReason });
            success('Başarılı', 'Periyodiklik güncellendi.');
            setPeriodicityTarget(null);
            onChanged();
        } catch {
            showError('Hata', 'Periyodiklik değişikliği başarısız oldu.');
        } finally {
            setBusy(false);
        }
    };

    const handleReactivate = async (s: YearScope) => {
        setBusy(true);
        try {
            await api.reactivateControlScope(controlId, s.year);
            success('Başarılı', `${s.year} kapsamı yeniden etkinleştirildi.`);
            onChanged();
        } catch {
            showError('Hata', 'Yeniden etkinleştirme başarısız oldu.');
        } finally {
            setBusy(false);
        }
    };

    const openHistory = async () => {
        setHistoryOpen(true);
        try {
            const r = await api.getControlScopeHistory(controlId);
            setHistory(r.data);
        } catch {
            setHistory([]);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5 bg-slate-50/60 border-b border-slate-100">
                <div>
                    <h3 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider">Yıllık Kapsam Yönetimi</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Kontrolün hangi yılların kapsamına alındığı, periyodikliği ve geçmişi</p>
                </div>
                <button onClick={openHistory} className="text-xs font-bold text-emerald-700 hover:underline">Geçmişi Gör</button>
            </div>

            <div className="p-5 space-y-3">
                {yearScopes.length === 0 && <p className="text-sm text-slate-400">Bu kontrol henüz hiçbir yılın kapsamına alınmadı.</p>}
                {yearScopes.map(s => (
                    <div key={s.id} className={`rounded-xl border p-4 flex items-center justify-between ${s.status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-black text-slate-800">{s.year}</span>
                                <StatusBadge variant={s.status === 'ACTIVE' ? 'success' : 'neutral'}>{s.status === 'ACTIVE' ? 'Kapsamda' : 'Kapsam Dışı'}</StatusBadge>
                                <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded">{frequencyLabel[s.frequency] || s.frequency}</span>
                                <span className="text-xs text-slate-400">{s._count?.tasks ?? 0} task</span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">
                                {s.status === 'ACTIVE'
                                    ? <>{s.addedBy ? `${s.addedBy.firstName} ${s.addedBy.lastName}` : '—'} tarafından eklendi{s.addedAt ? `, ${new Date(s.addedAt).toLocaleDateString('tr-TR')}` : ''}</>
                                    : <>Çıkarma gerekçesi: {s.removalReason || '—'} {s.removedAt ? `(${new Date(s.removedAt).toLocaleDateString('tr-TR')})` : ''}</>}
                            </p>
                        </div>
                        <PermissionGate permission="control:*">
                            <div className="flex items-center gap-2">
                                {s.status === 'ACTIVE' ? (
                                    <>
                                        <Button variant="outline" size="sm" onClick={() => openPeriodicity(s)}>Periyodikliği Değiştir</Button>
                                        <Button variant="danger" size="sm" onClick={() => openRemove(s)}>Kapsamdan Çıkar</Button>
                                    </>
                                ) : (
                                    <Button variant="outline" size="sm" onClick={() => handleReactivate(s)} disabled={busy}>Yeniden Etkinleştir</Button>
                                )}
                            </div>
                        </PermissionGate>
                    </div>
                ))}
            </div>

            {/* Kapsamdan çıkarma modalı */}
            <Modal open={!!removeTarget} onClose={() => setRemoveTarget(null)} title={`${removeTarget?.year} Kapsamından Çıkar`} size="md"
                footer={<div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setRemoveTarget(null)}>Vazgeç</Button>
                    <Button variant="danger" onClick={submitRemove} disabled={busy}>{busy ? 'İşleniyor...' : 'Kapsamdan Çıkar'}</Button>
                </div>}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Gerekçe <span className="text-red-500">*</span></label>
                        <textarea rows={2} value={removeReason} onChange={(e) => setRemoveReason(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Kapsamdan çıkarma nedenini yazın..." />
                    </div>
                    {ongoingTasks && ongoingTasks.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Devam eden tasklar — karar verin</p>
                            {ongoingTasks.map(t => (
                                <div key={t.id} className="flex items-center justify-between text-sm">
                                    <span className="text-amber-900">{t.testNo} — {t.periodLabel}</span>
                                    <div className="flex gap-1">
                                        <button onClick={() => setDecisions(p => ({ ...p, [t.id]: 'CONTINUE' }))}
                                            className={`px-2 py-1 rounded text-xs font-bold border ${decisions[t.id] === 'CONTINUE' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-200'}`}>Devam Etsin</button>
                                        <button onClick={() => setDecisions(p => ({ ...p, [t.id]: 'CANCEL' }))}
                                            className={`px-2 py-1 rounded text-xs font-bold border ${decisions[t.id] === 'CANCEL' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white border-slate-200'}`}>İptal Et</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Periyodiklik değişikliği modalı */}
            <Modal open={!!periodicityTarget} onClose={() => setPeriodicityTarget(null)} title={`${periodicityTarget?.year} Periyodikliğini Değiştir`} size="md"
                footer={<div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setPeriodicityTarget(null)}>Vazgeç</Button>
                    <Button variant="outline" onClick={previewPeriodicity} disabled={busy}>Önizle</Button>
                    <Button variant="primary" onClick={submitPeriodicity} disabled={busy}>{busy ? 'İşleniyor...' : 'Uygula'}</Button>
                </div>}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Yeni Periyodiklik</label>
                        <Select value={newFrequency} options={FREQUENCY_OPTIONS} onChange={(e) => { setNewFrequency(e.target.value); setPeriodicityPreview(null); }} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Gerekçe <span className="text-red-500">*</span></label>
                        <textarea rows={2} value={periodicityReason} onChange={(e) => setPeriodicityReason(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Değişiklik nedenini yazın..." />
                    </div>
                    {periodicityPreview && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 space-y-1">
                            <p><span className="font-bold">{periodicityPreview.toCreateCount}</span> yeni task oluşacak</p>
                            <p><span className="font-bold">{periodicityPreview.toCancelCount}</span> başlamamış task kapsam dışı bırakılacak</p>
                            <p><span className="font-bold">{periodicityPreview.protectedCount}</span> devam eden/tamamlanmış task korunacak (dokunulmayacak)</p>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Geçmiş modalı */}
            <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Kapsam Geçmişi" size="lg">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {history.length === 0 && <p className="text-sm text-slate-400">Kayıt bulunamadı.</p>}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {history.map((h: any) => (
                        <div key={h.id} className="text-sm border-b border-slate-100 pb-2">
                            <span className="font-bold text-slate-700">{h.action}</span>
                            <span className="text-slate-400"> · {h.year} · {new Date(h.createdAt).toLocaleString('tr-TR')} · {h.user ? `${h.user.firstName} ${h.user.lastName}` : 'Sistem'}</span>
                        </div>
                    ))}
                </div>
            </Modal>
        </div>
    );
}
