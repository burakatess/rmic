'use client';

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '../ui';
import { useToast } from '../ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Action {
    id: string; actionId: string; description: string; status: string; dueDate: string;
    owner?: { id: string; firstName: string; lastName: string };
    responsibleDepartment?: string | null;
}

interface FollowUp {
    id: string; followUpId: string; status: string;
    actionId?: string | null;
    result?: string | null; resolutionOutcome?: string | null; newFollowUpDate?: string | null;
    birimCevabi?: string | null; currentStatusDetail?: string | null;
    internalControlAssessment?: string | null; targetResolutionDate?: string | null;
    testDate?: string | null; plannedDate?: string | null; explanation?: string | null; notes?: string | null;
}

interface FindingFollowUpModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    findingId: string;
    followUp?: FollowUp | null;
    actions?: Action[];
    readOnly?: boolean;
}

// ─── Config ───────────────────────────────────────────────────────────────────

// ONAYLANDI bilinçli olarak DIŞARIDA: onay, değerlendirenin bu formda seçebileceği
// bir statü değil — atanmış ikinci kontrolcünün ayrı "Onayla" işlemidir (Madde 3).
const FOLLOW_UP_STATUSES = [
    { value: 'BEKLIYOR',     label: 'Bekliyor' },
    { value: 'DEVAM_EDIYOR', label: 'Devam Ediyor' },
    { value: 'TAMAMLANDI',   label: 'Tamamlandı' },
];

const RESULT_OPTIONS = [
    { value: 'YETERLI', label: 'Yeterli', desc: 'Kanıt ve uygulama aksiyonun yeterli olduğunu gösteriyor.' },
    { value: 'YETERSIZ', label: 'Yetersiz', desc: 'Düzeltme sürmeli veya yeni bir tarihe ertelenmeli.' },
    { value: 'YENI_AKSIYON_GEREKLI', label: 'Yeni Aksiyon Gerekli', desc: 'Yeni bir düzeltici aksiyon (plan, sorumlu birim, hedef tarih) tanımlanmalı.' },
];

// Yalnız YETERSIZ değerlendirmesinde kullanıcı devam/erteleme kararını verir.
// YETERLI kapanışı açık aksiyonlara göre ikinci kontrolcü onayında sistem türetir.
const RESOLUTION_OPTIONS = [
    {
        value: 'DEVAM_EDIYOR',
        label: 'Devam Ediyor',
        desc: 'Aksiyon sürüyor, bulgu açık.',
        color: { border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-800', dot: 'bg-amber-500' },
    },
    {
        value: 'ERTELENDI',
        label: 'Ertelendi',
        desc: 'Takip gelecekteki yeni tarihte tekrar değerlendirilecek.',
        color: { border: 'border-blue-400', bg: 'bg-blue-50', text: 'text-blue-800', dot: 'bg-blue-500' },
    },
];

const fmt = (d?: string | null) => {
    if (!d) return '';
    try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; }
};

// ─── Modal ────────────────────────────────────────────────────────────────────

export function FindingFollowUpModal({ isOpen, onClose, onSuccess, findingId, followUp, actions = [], readOnly = false }: FindingFollowUpModalProps) {
    const { success, error: showError } = useToast();
    const isEdit = !!followUp;
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        actionId:                  '',
        status:                    'BEKLIYOR',
        secondControllerId:        '',
        // Birim tarafı
        birimCevabi:               '',
        currentStatusDetail:       '',
        // İKS tarafı
        internalControlAssessment: '',
        result:                    '',       // YETERLI / YETERSIZ / YENI_AKSIYON_GEREKLI
        resolutionOutcome:         '',       // kapanış kararı (4 seçenek)
        newFollowUpDate:           '',
        testDate:                  '',
        targetResolutionDate:      '',
        explanation:               '',
        notes:                     '',
    });

    // YENI_AKSIYON_GEREKLI: onayda oluşturulacak yeni aksiyonun tanımı.
    const EMPTY_NEW_ACTION = { description: '', directorateId: '', ownerId: '', dueDate: '', notes: '' };
    const [newAction, setNewAction] = useState(EMPTY_NEW_ACTION);
    const [directorates, setDirectorates] = useState<{ id: string; name: string }[]>([]);

    const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string; department?: string }[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        // Populate form
        if (followUp) {
            setForm({
                actionId:                  followUp.actionId || '',
                status:                    followUp.status === 'ONAYLANDI' ? 'TAMAMLANDI' : (followUp.status || 'BEKLIYOR'),
                secondControllerId:        (followUp as { secondControllerId?: string }).secondControllerId || '',
                birimCevabi:               followUp.birimCevabi || '',
                currentStatusDetail:       followUp.currentStatusDetail || '',
                internalControlAssessment: followUp.internalControlAssessment || '',
                result:                    followUp.result || '',
                resolutionOutcome:         followUp.resolutionOutcome || '',
                newFollowUpDate:           fmt(followUp.newFollowUpDate),
                testDate:                  fmt(followUp.testDate),
                targetResolutionDate:      fmt(followUp.targetResolutionDate),
                explanation:               followUp.explanation || '',
                notes:                     followUp.notes || '',
            });
            const draft = (followUp as { newActionDraft?: Record<string, unknown> | null }).newActionDraft;
            setNewAction(draft && typeof draft === 'object' ? {
                description:   String(draft.description ?? ''),
                directorateId: String(draft.directorateId ?? ''),
                ownerId:       String(draft.ownerId ?? ''),
                dueDate:       fmt(typeof draft.dueDate === 'string' ? draft.dueDate : null),
                notes:         String(draft.notes ?? ''),
            } : EMPTY_NEW_ACTION);
        } else {
            setNewAction(EMPTY_NEW_ACTION);
            setForm({ actionId: '', status: 'BEKLIYOR', secondControllerId: '', birimCevabi: '', currentStatusDetail: '', internalControlAssessment: '', result: '', resolutionOutcome: '', newFollowUpDate: '', testDate: '', targetResolutionDate: '', explanation: '', notes: '' });
        }
        // İkinci kontrolcü ataması için kullanıcılar.
        api.getUsers().then((res: any) => setUsers(Array.isArray(res) ? res : res?.data || [])).catch(() => setUsers([]));
        api.getDirectorates({ isActive: 'true' })
            .then((res: any) => setDirectorates(Array.isArray(res) ? res : res?.data || []))
            .catch(() => setDirectorates([]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, followUp]);

    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(p => ({ ...p, [key]: e.target.value }));

    const showNewDate = form.resolutionOutcome === 'ERTELENDI';
    const showNewAction = form.result === 'YENI_AKSIYON_GEREKLI';

    const chooseResult = (result: string) => {
        setForm(p => ({
            ...p,
            result,
            resolutionOutcome: result === 'YENI_AKSIYON_GEREKLI'
                ? 'YENI_AKSIYON_GEREKLI'
                : result === 'YETERSIZ'
                    ? (['DEVAM_EDIYOR', 'ERTELENDI'].includes(p.resolutionOutcome) ? p.resolutionOutcome : 'DEVAM_EDIYOR')
                    : '',
            newFollowUpDate: result === 'YETERSIZ' ? p.newFollowUpDate : '',
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isEdit && !form.actionId) {
            showError('Zorunlu Alan', 'Takip çalışması için ilgili aksiyonu seçiniz.');
            return;
        }

        // Validations
        if (!form.currentStatusDetail.trim()) {
            showError('Zorunlu Alan', 'Güncel Durum Açıklaması zorunludur.');
            return;
        }
        if (form.status === 'TAMAMLANDI' && !form.result) {
            showError('Zorunlu Alan', 'Tamamlanan takip için değerlendirme sonucu seçiniz.');
            return;
        }
        if (form.resolutionOutcome === 'ERTELENDI' && !form.newFollowUpDate) {
            showError('Zorunlu Alan', 'Ertelenen takip için yeni takip tarihi seçiniz.');
            return;
        }
        if (form.result === 'YENI_AKSIYON_GEREKLI') {
            if (!newAction.description.trim()) {
                showError('Zorunlu Alan', 'Yeni Aksiyon Planı zorunludur.');
                return;
            }
            if (!newAction.directorateId) {
                showError('Zorunlu Alan', 'Yeni aksiyon için Sorumlu Birim seçiniz.');
                return;
            }
            if (!newAction.dueDate) {
                showError('Zorunlu Alan', 'Yeni aksiyon için hedef tarihi seçiniz.');
                return;
            }
        }

        setSaving(true);
        try {
            const payload: Record<string, any> = {
                ...(!isEdit ? { actionId: form.actionId } : {}),
                status:                    form.status,
                birimCevabi:               form.birimCevabi || null,
                currentStatusDetail:       form.currentStatusDetail,
                internalControlAssessment: form.internalControlAssessment || null,
                result:                    form.result || null,
                resolutionOutcome:         form.resolutionOutcome || null,
                newFollowUpDate:           form.result === 'YENI_AKSIYON_GEREKLI' ? null : (form.newFollowUpDate || null),
                ...(form.result === 'YENI_AKSIYON_GEREKLI' ? {
                    newAction: {
                        description:   newAction.description.trim(),
                        directorateId: newAction.directorateId,
                        ...(newAction.ownerId ? { ownerId: newAction.ownerId } : {}),
                        dueDate:       newAction.dueDate,
                        ...(newAction.notes.trim() ? { notes: newAction.notes.trim() } : {}),
                    },
                } : {}),
                testDate:                  form.testDate || null,
                targetResolutionDate:      form.targetResolutionDate || null,
                explanation:               form.explanation || null,
                notes:                     form.notes || null,
            };

            if (isEdit && followUp) {
                // İkinci kontrolcü ataması AYRI, gerekçeli işlem (Madde 4).
                const loadedSC = (followUp as { secondControllerId?: string }).secondControllerId || '';
                if (form.secondControllerId && form.secondControllerId !== loadedSC) {
                    await api.assignSecondController(findingId, followUp.id, {
                        secondControllerId: form.secondControllerId,
                        reason: form.explanation?.trim() || 'Takip değerlendirmesi için ikinci kontrolcü atandı.',
                    });
                }
                const res = await api.updateFollowUp(findingId, followUp.id, payload) as {
                    createdFollowUp?: { followUpId: string } | null;
                    createdAction?: { actionId: string } | null;
                };
                // Mesaj, formun doluluğuna göre DEĞİL, backend'in gerçek sonucuna göre (Madde 7).
                success('Güncellendi', res?.createdAction
                    ? `Yeni aksiyon oluşturuldu: ${res.createdAction.actionId}`
                    : res?.createdFollowUp
                    ? `Takip ertelendi. Yeni takip oluşturuldu: ${res.createdFollowUp.followUpId}`
                    : form.status === 'TAMAMLANDI'
                        ? 'Takip tamamlandı, ikinci kontrolcü onayı bekleniyor.'
                        : 'Takip çalışması güncellendi.');
            } else {
                await api.createFollowUp(findingId, payload);
                success('Oluşturuldu', 'Takip çalışması oluşturuldu.');
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            showError('Hata', err?.message || 'İşlem gerçekleştirilemedi.');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-8 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-10 overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">
                            {isEdit ? (readOnly ? 'Takip Çalışması' : 'Takip Çalışmasını Düzenle') : 'Yeni Takip Çalışması'}
                        </h2>
                        {isEdit && followUp && <p className="text-xs text-slate-500 font-mono mt-0.5">{followUp.followUpId}</p>}
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <fieldset disabled={readOnly}>
                    <div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-y-auto">

                        {/* İlgili aksiyon */}
                        {actions.length > 0 && (
                            <div>
                                <label className="field-label">İlgili Aksiyon</label>
                                <select value={form.actionId} onChange={set('actionId')} disabled={isEdit}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-300 outline-none bg-white">
                                    <option value="">— Aksiyon seçiniz —</option>
                                    {actions.map(a => (
                                        <option key={a.id} value={a.id}>
                                            {a.actionId} — {a.description.slice(0, 55)}{a.description.length > 55 ? '…' : ''}
                                        </option>
                                    ))}
                                </select>
                                {isEdit && <p className="mt-1 text-xs text-slate-500">İlgili aksiyon, takip numarasının immutable hiyerarşisinin parçasıdır.</p>}
                            </div>
                        )}
                        {!isEdit && actions.length === 0 && (
                            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Takip oluşturmak için önce bu bulguya bir aksiyon ekleyin.</p>
                        )}

                        {/* ── BİRİM TARAFI ─────────────────────────────────────────── */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-px bg-slate-200" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Birim Tarafı</span>
                                <div className="flex-1 h-px bg-slate-200" />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-1.5">
                                    Birim Cevabı
                                </label>
                                <textarea value={form.birimCevabi} onChange={set('birimCevabi')} rows={3}
                                    placeholder="Birimin bu takip dönemindeki yanıtı…"
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none resize-none" />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-1.5">
                                    Güncel Durum Açıklaması <span className="text-red-500">*</span>
                                </label>
                                <textarea value={form.currentStatusDetail} onChange={set('currentStatusDetail')} rows={3} required
                                    placeholder="Bu takip dönemindeki bulgunun güncel durumunu yazın. Ana bulguda otomatik log olarak eklenir…"
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400 outline-none resize-none" />
                                <p className="text-[10px] text-slate-400 mt-1">Ana bulguda "Güncel Durum" log'una eklenir — üzerine yazılmaz.</p>
                            </div>
                        </div>

                        {/* ── İKS TARAFI ───────────────────────────────────────────── */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-px bg-slate-200" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">İKS Tarafı</span>
                                <div className="flex-1 h-px bg-slate-200" />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-1.5">
                                    İç Kontrol Değerlendirmesi
                                </label>
                                <textarea value={form.internalControlAssessment} onChange={set('internalControlAssessment')} rows={3}
                                    placeholder="İKS'nin bu takip çalışmasına yönelik değerlendirmesi…"
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-violet-300 outline-none resize-none" />
                            </div>

                            {/* Değerlendirme sonucu */}
                            <div>
                                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-2">
                                    Değerlendirme Sonucu
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    {RESULT_OPTIONS.map(opt => {
                                        const isSelected = form.result === opt.value;
                                        return (
                                            <button key={opt.value} type="button" onClick={() => chooseResult(opt.value)}
                                                className={`p-3 rounded-xl border-2 text-left transition-all ${
                                                    isSelected ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white hover:border-slate-300'
                                                }`}>
                                                <p className={`text-sm font-semibold ${isSelected ? 'text-violet-800' : 'text-slate-700'}`}>{opt.label}</p>
                                                <p className="text-[10px] text-slate-500 mt-1 leading-tight">{opt.desc}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="mt-2 text-[11px] text-slate-400">Sonuç, atanmış ikinci kontrolcünün onayından sonra aksiyon ve bulgu durumuna uygulanır.</p>
                            </div>

                            {form.result === 'YETERSIZ' && (
                                <div>
                                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-2">
                                        Yetersiz Sonrası Karar
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                    {RESOLUTION_OPTIONS.map(opt => {
                                        const isSelected = form.resolutionOutcome === opt.value;
                                        return (
                                            <button key={opt.value} type="button"
                                                onClick={() => setForm(p => ({ ...p, resolutionOutcome: opt.value }))}
                                                className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                                                    isSelected ? `${opt.color.border} ${opt.color.bg}` : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${
                                                    isSelected ? `${opt.color.border} ${opt.color.dot}` : 'border-slate-300 bg-white'
                                                }`}>
                                                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className={`text-sm font-semibold leading-tight ${isSelected ? opt.color.text : 'text-slate-700'}`}>
                                                        {opt.label}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                    </div>
                                </div>
                            )}

                            {form.result === 'YETERLI' && (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                                    Kapanış kararı elle seçilmez. Onay sırasında tüm aksiyonlar kapandıysa bulgu kapanır; açık aksiyon varsa kısmen kapalı kalır.
                                </div>
                            )}

                            {/* Erteleme → zorunlu yeni takip tarihi */}
                            {showNewDate && (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                    <div>
                                        <label className="text-xs font-semibold text-amber-800 uppercase block mb-1.5">Yeni Takip Tarihi *</label>
                                        <input type="date" aria-label="Yeni Takip Tarihi *" value={form.newFollowUpDate} onChange={set('newFollowUpDate')}
                                            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
                                    </div>
                                </div>
                            )}

                            {/* Yeni aksiyon tanımı: plan + sorumlu birim + (opsiyonel) sorumlu kişi + hedef tarih */}
                            {showNewAction && (
                                <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
                                    <p className="text-xs text-orange-800">
                                        Yeni aksiyon, ikinci kontrolcü onayından sonra bu bulgu için oluşturulur.
                                    </p>
                                    <div>
                                        <label htmlFor="new-action-description" className="text-xs font-semibold text-orange-800 uppercase block mb-1.5">Yeni Aksiyon Planı *</label>
                                        <textarea id="new-action-description" rows={3} maxLength={5000} value={newAction.description}
                                            onChange={e => setNewAction(p => ({ ...p, description: e.target.value }))}
                                            placeholder="Yapılacak düzeltici aksiyonu açıklayınız…"
                                            className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300 bg-white resize-none" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label htmlFor="new-action-directorate" className="text-xs font-semibold text-orange-800 uppercase block mb-1.5">Sorumlu Birim *</label>
                                            <select id="new-action-directorate" value={newAction.directorateId}
                                                onChange={e => setNewAction(p => ({ ...p, directorateId: e.target.value }))}
                                                className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                                                <option value="">Birim seçiniz…</option>
                                                {directorates.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="new-action-due" className="text-xs font-semibold text-orange-800 uppercase block mb-1.5">Hedef Tarih *</label>
                                            <input id="new-action-due" type="date" value={newAction.dueDate}
                                                onChange={e => setNewAction(p => ({ ...p, dueDate: e.target.value }))}
                                                className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="new-action-owner" className="text-xs font-semibold text-orange-800 uppercase block mb-1.5">Sorumlu Kişi (opsiyonel)</label>
                                        <select id="new-action-owner" value={newAction.ownerId}
                                            onChange={e => setNewAction(p => ({ ...p, ownerId: e.target.value }))}
                                            className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                                            <option value="">Mevcut aksiyonun sorumlusu</option>
                                            {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}{u.department ? ` — ${u.department}` : ''}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Durum & açıklama */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-1.5">Takip Statüsü</label>
                                    <select value={form.status} onChange={set('status')}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-300 outline-none bg-white">
                                        {FOLLOW_UP_STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-1.5">Sonuç Notu (opsiyonel)</label>
                                    <input type="text" value={form.explanation} onChange={set('explanation')}
                                        placeholder="Kısa değerlendirme notu…"
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-300 outline-none" />
                                </div>
                            </div>

                            {/* İkinci kontrolcü — onayı yalnızca bu kişi verebilir (Madde 3) */}
                            <div>
                                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-1.5">
                                    İkinci Kontrolcü (onaylayacak kişi)
                                </label>
                                <select value={form.secondControllerId} onChange={set('secondControllerId')}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-300 outline-none bg-white">
                                    <option value="">— Seçilmedi —</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName}{u.department ? ` · ${u.department}` : ''}</option>
                                    ))}
                                </select>
                                <p className="mt-1 text-[11px] text-slate-400">
                                    Onay ayrı bir adımdır: değerlendirmeyi yapan kişi onaylayamaz; onayı yalnızca atanan ikinci kontrolcü verir.
                                </p>
                            </div>
                        </div>

                        {/* Güncelleme özeti */}
                        {form.result && (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600">
                                <p className="font-semibold mb-1">İkinci kontrolcü onayından sonra uygulanacak:</p>
                                <ul className="space-y-0.5 list-disc list-inside">
                                    <li>Değerlendirme → <strong>{RESULT_OPTIONS.find(o => o.value === form.result)?.label}</strong></li>
                                    {form.result === 'YETERLI' && <li>Bulgu sonucu açık aksiyonlara göre sistem tarafından türetilir</li>}
                                    {form.result === 'YETERSIZ' && <li>Çözüm Durumu → <strong>{RESOLUTION_OPTIONS.find(o => o.value === form.resolutionOutcome)?.label}</strong></li>}
                                    {form.currentStatusDetail && <li>Güncel Durum log'una yeni satır eklenir</li>}
                                    {form.newFollowUpDate && form.result !== 'YENI_AKSIYON_GEREKLI' && <li>Yeni takip tarihi → <strong>{form.newFollowUpDate}</strong></li>}
                                    {form.result === 'YENI_AKSIYON_GEREKLI' && <li className="text-orange-700 font-semibold">Yeni aksiyon oluşturulur{newAction.dueDate ? <> — hedef tarih <strong>{newAction.dueDate}</strong></> : null}</li>}
                                </ul>
                            </div>
                        )}
                    </div>
                    </fieldset>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <p className="text-xs text-slate-400">{isEdit ? `Takip No: ${followUp?.followUpId}` : 'Yeni takip çalışması'}</p>
                        <div className="flex gap-3">
                            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>İptal</Button>
                            {!readOnly && <Button type="submit" variant="primary" size="sm" disabled={saving || !form.currentStatusDetail.trim()}>
                                {saving ? 'Kaydediliyor…' : isEdit && form.status === 'TAMAMLANDI' ? 'Kaydet ve Onaya Gönder' : isEdit ? 'Güncelle' : 'Oluştur'}
                            </Button>}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default FindingFollowUpModal;
