'use client';

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button, StatusBadge } from '../ui';
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
}

// ─── Config ───────────────────────────────────────────────────────────────────

const FOLLOW_UP_STATUSES = [
    { value: 'BEKLIYOR',     label: 'Bekliyor' },
    { value: 'DEVAM_EDIYOR', label: 'Devam Ediyor' },
    { value: 'TAMAMLANDI',   label: 'Tamamlandı' },
    { value: 'ONAYLANDI',    label: 'Onaylandı' },
];

// 4 sonuç seçeneği (Madde 6)
const RESOLUTION_OPTIONS = [
    {
        value: 'KAPATILDI',
        label: 'Bulgu Kapatıldı',
        icon: '✅',
        desc: 'Aksiyon tamamlandı, kanıtlar yeterli.',
        color: { border: 'border-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-800', dot: 'bg-emerald-500' },
    },
    {
        value: 'DEVAM_EDIYOR',
        label: 'Devam Ediyor',
        icon: '🔄',
        desc: 'Aksiyon sürüyor, bulgu açık.',
        color: { border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-800', dot: 'bg-amber-500' },
    },
    {
        value: 'KISMEN_KAPATILDI',
        label: 'Kısmen Kapatıldı',
        icon: '⏳',
        desc: 'Bir kısmı tamamlandı, izleme devam ediyor.',
        color: { border: 'border-blue-400', bg: 'bg-blue-50', text: 'text-blue-800', dot: 'bg-blue-500' },
    },
    {
        value: 'YENI_AKSIYON_GEREKLI',
        label: 'Yeni Aksiyon Gerekli',
        icon: '⚡',
        desc: 'Yeni düzeltici aksiyon tanımlanmalı.',
        color: { border: 'border-orange-400', bg: 'bg-orange-50', text: 'text-orange-800', dot: 'bg-orange-500' },
    },
];

const fmt = (d?: string | null) => {
    if (!d) return '';
    try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; }
};

// ─── Modal ────────────────────────────────────────────────────────────────────

export function FindingFollowUpModal({ isOpen, onClose, onSuccess, findingId, followUp, actions = [] }: FindingFollowUpModalProps) {
    const { success, error: showError } = useToast();
    const isEdit = !!followUp;
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        actionId:                  '',
        status:                    'BEKLIYOR',
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

    // "Yeni Aksiyon Gerekli" seçilince inline aksiyon formu
    const [newActionForm, setNewActionForm] = useState({
        description:          '',
        ownerId:              '',
        responsibleDepartment:'',
        dueDate:              '',
        notes:                '',
    });
    const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string; department?: string }[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        // Populate form
        if (followUp) {
            setForm({
                actionId:                  followUp.actionId || '',
                status:                    followUp.status || 'BEKLIYOR',
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
        } else {
            setForm({ actionId: '', status: 'BEKLIYOR', birimCevabi: '', currentStatusDetail: '', internalControlAssessment: '', result: '', resolutionOutcome: '', newFollowUpDate: '', testDate: '', targetResolutionDate: '', explanation: '', notes: '' });
        }
        // Load users for new action
        api.getUsers().then((res: any) => setUsers(Array.isArray(res) ? res : res?.data || [])).catch(() => setUsers([]));
    }, [isOpen, followUp]);

    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(p => ({ ...p, [key]: e.target.value }));

    const setNA = (key: keyof typeof newActionForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setNewActionForm(p => ({ ...p, [key]: e.target.value }));

    const showNewActionForm = form.resolutionOutcome === 'YENI_AKSIYON_GEREKLI';
    const showNewDate = form.resolutionOutcome === 'DEVAM_EDIYOR' || form.resolutionOutcome === 'KISMEN_KAPATILDI';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validations
        if (!form.currentStatusDetail.trim()) {
            showError('Zorunlu Alan', 'Güncel Durum Açıklaması zorunludur.');
            return;
        }
        if (form.resolutionOutcome === 'YENI_AKSIYON_GEREKLI' && !newActionForm.description.trim()) {
            showError('Zorunlu Alan', 'Yeni aksiyon açıklaması giriniz.');
            return;
        }
        if (form.resolutionOutcome === 'YENI_AKSIYON_GEREKLI' && !newActionForm.ownerId) {
            showError('Zorunlu Alan', 'Yeni aksiyon için sorumlu kişi seçiniz.');
            return;
        }
        if (form.resolutionOutcome === 'YENI_AKSIYON_GEREKLI' && !newActionForm.dueDate) {
            showError('Zorunlu Alan', 'Yeni aksiyon için hedef tarih giriniz.');
            return;
        }

        setSaving(true);
        try {
            const isNewActionCase = form.resolutionOutcome === 'YENI_AKSIYON_GEREKLI'
                && newActionForm.description && newActionForm.ownerId && newActionForm.dueDate;

            const payload: Record<string, any> = {
                actionId:                  form.actionId || null,
                status:                    form.status,
                birimCevabi:               form.birimCevabi || null,
                currentStatusDetail:       form.currentStatusDetail,
                internalControlAssessment: form.internalControlAssessment || null,
                result:                    form.result || null,
                resolutionOutcome:         form.resolutionOutcome || null,
                newFollowUpDate:           form.newFollowUpDate || null,
                testDate:                  form.testDate || null,
                targetResolutionDate:      form.targetResolutionDate || null,
                explanation:               form.explanation || null,
                notes:                     form.notes || null,
                newActionRequired:         form.resolutionOutcome === 'YENI_AKSIYON_GEREKLI',
                // Backend, YENI_AKSIYON_GEREKLI sonucunda bu bilgiyle (veya boşsa fallback ile)
                // aynı istekte otomatik yeni Action + FollowUp oluşturur — ayrı bir çağrı gerekmez.
                ...(isNewActionCase ? {
                    newAction: {
                        description:           newActionForm.description,
                        ownerId:               newActionForm.ownerId,
                        responsibleDepartment: newActionForm.responsibleDepartment || undefined,
                        dueDate:               newActionForm.dueDate,
                        notes:                 newActionForm.notes || undefined,
                    },
                } : {}),
            };

            if (isEdit && followUp) {
                await api.updateFollowUp(findingId, followUp.id, payload);
                success('Güncellendi', isNewActionCase
                    ? 'Takip çalışması güncellendi ve yeni düzeltici aksiyon oluşturuldu.'
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
                            {isEdit ? 'Takip Çalışmasını Düzenle' : 'Yeni Takip Çalışması'}
                        </h2>
                        {isEdit && followUp && <p className="text-xs text-slate-500 font-mono mt-0.5">{followUp.followUpId}</p>}
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-y-auto">

                        {/* İlgili aksiyon */}
                        {actions.length > 0 && (
                            <div>
                                <label className="field-label">İlgili Aksiyon</label>
                                <select value={form.actionId} onChange={set('actionId')}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-300 outline-none bg-white">
                                    <option value="">— Aksiyon seçiniz (opsiyonel) —</option>
                                    {actions.map(a => (
                                        <option key={a.id} value={a.id}>
                                            {a.actionId} — {a.description.slice(0, 55)}{a.description.length > 55 ? '…' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
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

                            {/* Sonuç — 4 kart */}
                            <div>
                                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-2">
                                    Kapanış Kararı
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
                                                        {opt.icon} {opt.label}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Devam/Kısmen → yeni takip tarihi */}
                            {showNewDate && (
                                <div className="grid grid-cols-2 gap-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                    <div>
                                        <label className="text-xs font-semibold text-amber-800 uppercase block mb-1.5">Yeni Bulgu Test Tarihi</label>
                                        <input type="date" value={form.testDate} onChange={set('testDate')}
                                            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-amber-800 uppercase block mb-1.5">Öngörülen Tamamlanma</label>
                                        <input type="date" value={form.targetResolutionDate} onChange={set('targetResolutionDate')}
                                            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
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
                        </div>

                        {/* ── YENİ AKSİYON FORMU (YENI_AKSIYON_GEREKLI seçilince) ── */}
                        {showNewActionForm && (
                            <div className="border-2 border-orange-300 rounded-xl p-5 bg-orange-50 space-y-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-base">⚡</span>
                                    <h4 className="text-sm font-bold text-orange-800">Yeni Düzeltici Aksiyon</h4>
                                </div>
                                <p className="text-xs text-orange-700">Bu takip tamamlandığında sistem otomatik olarak aşağıdaki aksiyonu oluşturacak.</p>

                                <div>
                                    <label className="text-xs font-semibold text-orange-800 uppercase block mb-1.5">Aksiyon Açıklaması *</label>
                                    <textarea value={newActionForm.description} onChange={setNA('description')} rows={2}
                                        placeholder="Yapılacak düzeltici aksiyon…"
                                        className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none resize-none bg-white" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-semibold text-orange-800 uppercase block mb-1.5">Aksiyon Sahibi *</label>
                                        <select value={newActionForm.ownerId} onChange={setNA('ownerId')}
                                            className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none bg-white">
                                            <option value="">Kişi seçiniz</option>
                                            {users.map(u => (
                                                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}{u.department ? ` — ${u.department}` : ''}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-orange-800 uppercase block mb-1.5">Sorumlu Direktörlük</label>
                                        <input type="text" value={newActionForm.responsibleDepartment} onChange={setNA('responsibleDepartment')}
                                            placeholder="Direktörlük adı…"
                                            className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none bg-white" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-semibold text-orange-800 uppercase block mb-1.5">Hedef Tamamlanma Tarihi *</label>
                                        <input type="date" value={newActionForm.dueDate} onChange={setNA('dueDate')}
                                            className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none bg-white" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-orange-800 uppercase block mb-1.5">Not</label>
                                        <input type="text" value={newActionForm.notes} onChange={setNA('notes')}
                                            placeholder="Opsiyonel not…"
                                            className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none bg-white" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Güncelleme özeti */}
                        {form.resolutionOutcome && (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600">
                                <p className="font-semibold mb-1">Ana bulguda otomatik güncellenecek:</p>
                                <ul className="space-y-0.5 list-disc list-inside">
                                    <li>Çözüm Durumu → <strong>{RESOLUTION_OPTIONS.find(o => o.value === form.resolutionOutcome)?.label}</strong></li>
                                    {form.currentStatusDetail && <li>Güncel Durum log'una yeni satır eklenir</li>}
                                    {form.resolutionOutcome === 'KAPATILDI' && <li>Kapanma Tarihi → <strong>Bugün</strong>, Test Tarihi temizlenir</li>}
                                    {form.testDate && <li>Bulgu Test Tarihi → <strong>{form.testDate}</strong></li>}
                                    {showNewActionForm && <li className="text-orange-700 font-semibold">⚡ Yeni aksiyon oluşturulur</li>}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <p className="text-xs text-slate-400">{isEdit ? `ID: ${followUp?.followUpId}` : 'Yeni takip çalışması'}</p>
                        <div className="flex gap-3">
                            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>İptal</Button>
                            <Button type="submit" variant="primary" size="sm" disabled={saving || !form.currentStatusDetail.trim()}>
                                {saving ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Oluştur'}
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default FindingFollowUpModal;
