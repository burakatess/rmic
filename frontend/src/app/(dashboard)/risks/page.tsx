'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api, { type GmyOption } from '@/lib/api';
import { classifyLoadError, type LoadError } from '@/lib/load-error';
import {
    PageHeader, PageShell, DataTable, StatusBadge, Button, Modal,
    KpiCard, KpiGrid, QuickFilterBar, AdvancedFilterPanel, ActiveFilterChips, SavedViewMenu,
} from '@/components/ui';
import type { ColumnDef, ActiveFilterChip, QuickFilterItem, AdvancedFilterField } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Risk {
    id: string;
    directorateId?: string | null;
    directorate?: { id: string; name: string } | null;
    isOrgWide?: boolean;
    riskId: string;
    kayitId?: string;
    name: string;
    description: string;
    status: string;
    ozet?: string;
    ilgiliGmy?: string;
    gmyId?: string | null;
    surec?: string;
    altSurec?: string;
    flagForIT: boolean;
    riskSorumlusu?: string;
    riskSorumlusuId?: string | null;
    mutabakatTarihi?: string;
    riskIsleme?: string;
    // Impact dimensions
    finansalEtki?: number;
    itibarEtkisi?: number;
    regulasyonEtkisi?: number;
    musteriEtkisi?: number;
    gizlilikEtkisi?: number;
    butunlukEtkisi?: number;
    erisilebilirlikEtkisi?: number;
    etki?: number;
    olasilik?: number;
    // Scores
    dogalRiskPuani?: number;
    dogalRiskSkoru?: number;
    dogalRiskSeviyesi?: string;
    butunlesikKontrolPuani?: number;
    butunlesikKontrolSkoru?: number;
    butunlesikKontrolSeviyesi?: string;
    kalintiRiskPuani?: number;
    kalintiRiskSkoru?: number;
    kalintiRiskSeviyesi?: string;
    // Relations
    owner: { id: string; firstName: string; lastName: string; email: string };
    category: { id: string; name: string };
    riskControls?: { riskControl: any }[];
    riskActions?: { riskAction: any }[];
    createdAt: string;
    updatedAt: string;
}

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const seviyelConfig: Record<string, { label: string; variant: BV; bg: string }> = {
    'KRİTİK': { label: 'Kritik', variant: 'critical', bg: 'bg-red-100 text-red-800 border-red-300' },
    'YÜKSEK': { label: 'Yüksek', variant: 'high', bg: 'bg-orange-100 text-orange-800 border-orange-300' },
    'ORTA':   { label: 'Orta',   variant: 'warning', bg: 'bg-amber-100 text-amber-800 border-amber-300' },
    'DÜŞÜK':  { label: 'Düşük',  variant: 'success', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
};

const islemeConfig: Record<string, { label: string; variant: BV }> = {
    'KABUL':    { label: 'Kabul', variant: 'neutral' },
    'AZALT':    { label: 'Azalt', variant: 'warning' },
    'TRANSFER': { label: 'Transfer', variant: 'info' },
    'KAÇIN':    { label: 'Kaçın', variant: 'high' },
};

const statusConfig: Record<string, { label: string; variant: BV }> = {
    IDENTIFIED: { label: 'Tespit Edildi', variant: 'info' },
    ASSESSED:   { label: 'Değerlendirildi', variant: 'warning' },
    TREATED:    { label: 'İşlendi', variant: 'primary' },
    ACCEPTED:   { label: 'Kabul Edildi', variant: 'neutral' },
    CLOSED:     { label: 'Kapatıldı', variant: 'success' },
};

const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('tr-TR') : '—';

const FlagIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
    </svg>
);

function SeviyePill({ seviye }: { seviye?: string }) {
    if (!seviye) return <span className="text-xs text-slate-400">—</span>;
    const cfg = seviyelConfig[seviye];
    if (!cfg) return <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-300">{seviye}</span>;
    return <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.bg}`}>{cfg.label}</span>;
}

function ScoreCell({ puan, seviye }: { puan?: number; seviye?: string }) {
    if (puan == null) return <span className="text-xs text-slate-300">—</span>;
    const cfg = seviye ? seviyelConfig[seviye] : undefined;
    return (
        <div className="text-center">
            <div className={`font-bold text-sm tabular-nums ${cfg ? (cfg.variant === 'critical' ? 'text-red-600' : cfg.variant === 'high' ? 'text-orange-600' : cfg.variant === 'warning' ? 'text-amber-600' : 'text-emerald-600') : 'text-slate-600'}`}>
                {puan.toFixed(1)}
            </div>
            {seviye && <SeviyePill seviye={seviye} />}
        </div>
    );
}

// ─── Risk Form Modal ───────────────────────────────────────────────────────────
interface RiskFormState {
    name: string; description: string; ozet: string;
    // İlgili GMY ve Risk Sorumlusu veritabanında tanımlı kayıtlardan seçilir (kimlik).
    gmyId: string; surec: string; altSurec: string;
    flagForIT: boolean; riskSorumlusuId: string; riskIsleme: string;
    finansalEtki: string; itibarEtkisi: string; regulasyonEtkisi: string; musteriEtkisi: string;
    gizlilikEtkisi: string; butunlukEtkisi: string; erisilebilirlikEtkisi: string;
    olasilik: string;
    categoryId: string; ownerId: string;
    // Riskin organizasyon yerleşimi: birim riski (directorateId) VEYA kurum geneli risk.
    directorateId: string; isOrgWide: boolean;
}

const emptyForm: RiskFormState = {
    name: '', description: '', ozet: '',
    gmyId: '', surec: '', altSurec: '',
    flagForIT: false, riskSorumlusuId: '', riskIsleme: '',
    finansalEtki: '', itibarEtkisi: '', regulasyonEtkisi: '', musteriEtkisi: '',
    gizlilikEtkisi: '', butunlukEtkisi: '', erisilebilirlikEtkisi: '',
    olasilik: '',
    categoryId: '', ownerId: '',
    directorateId: '', isOrgWide: false,
};

function calcEtki(form: RiskFormState, isBT: boolean): number {
    if (isBT) {
        const g = Number(form.gizlilikEtkisi) || 0;
        const b = Number(form.butunlukEtkisi) || 0;
        const e = Number(form.erisilebilirlikEtkisi) || 0;
        return g * 0.35 + b * 0.30 + e * 0.35;
    }
    const f = Number(form.finansalEtki) || 0;
    const i = Number(form.itibarEtkisi) || 0;
    const r = Number(form.regulasyonEtkisi) || 0;
    const m = Number(form.musteriEtkisi) || 0;
    return f * 0.30 + i * 0.30 + r * 0.20 + m * 0.20;
}

function calcSeviye(puan: number): string {
    if (puan >= 15) return 'KRİTİK';
    if (puan >= 8)  return 'YÜKSEK';
    if (puan >= 4)  return 'ORTA';
    return 'DÜŞÜK';
}

function RiskFormModal({ open, onClose, onSaved, editing, users, categories, directorates, gmys }: {
    open: boolean; onClose: () => void; onSaved: () => void;
    editing?: Risk | null;
    users: any[]; categories: any[]; directorates: { id: string; name: string }[]; gmys: GmyOption[];
}) {
    const { success, error: showError } = useToast();
    const { hasPermission } = useAuth();
    // Direktörlük değişikliği erişimi etkiler → ayrı izin (backend de denetler, 403).
    const canChangePlacement = !editing || hasPermission('risk:directorate:change');
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<RiskFormState>(emptyForm);

    useEffect(() => {
        if (editing) {
            setForm({
                name: editing.name || '',
                description: editing.description || '',
                ozet: editing.ozet || '',
                gmyId: editing.gmyId || '',
                surec: editing.surec || '',
                altSurec: editing.altSurec || '',
                flagForIT: editing.flagForIT || false,
                riskSorumlusuId: editing.riskSorumlusuId || '',
                riskIsleme: editing.riskIsleme || '',
                finansalEtki: String(editing.finansalEtki ?? ''),
                itibarEtkisi: String(editing.itibarEtkisi ?? ''),
                regulasyonEtkisi: String(editing.regulasyonEtkisi ?? ''),
                musteriEtkisi: String(editing.musteriEtkisi ?? ''),
                gizlilikEtkisi: String(editing.gizlilikEtkisi ?? ''),
                butunlukEtkisi: String(editing.butunlukEtkisi ?? ''),
                erisilebilirlikEtkisi: String(editing.erisilebilirlikEtkisi ?? ''),
                olasilik: String(editing.olasilik ?? ''),
                categoryId: editing.category?.id || '',
                ownerId: editing.owner?.id || '',
                directorateId: editing.directorateId || '',
                isOrgWide: !!editing.isOrgWide,
            });
        } else {
            setForm(emptyForm);
        }
    }, [editing, open]);

    const set = (field: keyof RiskFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }));

    // Önizleme sunucu hesabıyla (risk-scoring.util.ts) aynı: kayan nokta artığı 2 haneyle
    // temizlenir, aksi hâlde 7,999… gibi değerler eşikte farklı seviye gösterirdi.
    const round2 = (x: number) => Math.round(x * 100) / 100;
    const etki = round2(calcEtki(form, form.flagForIT));
    const olasilik = Number(form.olasilik) || 0;
    const dogalPuan = round2(etki * olasilik);
    const dogalSeviye = dogalPuan > 0 ? calcSeviye(dogalPuan) : undefined;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) { showError('Zorunlu', 'Risk adı gerekli'); return; }
        if (!form.categoryId) { showError('Zorunlu', 'Kategori seçin'); return; }
        if (!form.ownerId) { showError('Zorunlu', 'Risk sahibi seçin'); return; }
        if (!editing && !form.isOrgWide && !form.directorateId) {
            showError('Zorunlu', 'Sorumlu direktörlük seçin veya riski "Kurum geneli risk" olarak işaretleyin.');
            return;
        }

        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                name: form.name,
                description: form.description,
                ozet: form.ozet || undefined,
                surec: form.surec || undefined,
                altSurec: form.altSurec || undefined,
                flagForIT: form.flagForIT,
                riskIsleme: form.riskIsleme || undefined,
                finansalEtki: form.finansalEtki ? Number(form.finansalEtki) : undefined,
                itibarEtkisi: form.itibarEtkisi ? Number(form.itibarEtkisi) : undefined,
                regulasyonEtkisi: form.regulasyonEtkisi ? Number(form.regulasyonEtkisi) : undefined,
                musteriEtkisi: form.musteriEtkisi ? Number(form.musteriEtkisi) : undefined,
                gizlilikEtkisi: form.gizlilikEtkisi ? Number(form.gizlilikEtkisi) : undefined,
                butunlukEtkisi: form.butunlukEtkisi ? Number(form.butunlukEtkisi) : undefined,
                erisilebilirlikEtkisi: form.erisilebilirlikEtkisi ? Number(form.erisilebilirlikEtkisi) : undefined,
                // Etki, doğal puan ve seviye SUNUCUDA hesaplanır (yalnız girdiler gönderilir).
                olasilik: olasilik > 0 ? olasilik : undefined,
                categoryId: form.categoryId,
                ownerId: form.ownerId,
                inherentProbability: Math.min(5, Math.max(1, olasilik || 1)),
                inherentImpact: Math.min(5, Math.max(1, Math.round(etki) || 1)),
            };
            // Yerleşim yalnız değiştiyse gönderilir (değişiklik ayrı izin ister).
            const placementChanged = !editing
                || (form.directorateId || null) !== (editing.directorateId ?? null)
                || form.isOrgWide !== !!editing.isOrgWide;
            if (placementChanged) {
                payload.directorateId = form.isOrgWide ? (editing ? null : undefined) : (form.directorateId || undefined);
                payload.isOrgWide = form.isOrgWide;
            }

            // GMY ve sorumlu yalnız değiştiyse gönderilir: eski (serbest metinli) kayıtta seçim
            // yapılmadan kaydetmek mevcut metni silmez.
            if (!editing || (form.gmyId || null) !== (editing.gmyId ?? null)) payload.gmyId = form.gmyId || (editing ? null : undefined);
            if (!editing || (form.riskSorumlusuId || null) !== (editing.riskSorumlusuId ?? null)) payload.riskSorumlusuId = form.riskSorumlusuId || (editing ? null : undefined);

            if (editing) {
                await api.updateRisk(editing.id, payload);
                success('Güncellendi', 'Risk başarıyla güncellendi.');
            } else {
                await api.createRisk(payload);
                success('Oluşturuldu', 'Risk kaydı oluşturuldu.');
            }
            onSaved();
            onClose();
        } catch (err: any) {
            showError('Hata', err?.message || 'İşlem gerçekleştirilemedi.');
        } finally {
            setSaving(false);
        }
    };

    const impactOpts = [
        { value: '1', label: '1 — Önemsiz' },
        { value: '2', label: '2 — Düşük' },
        { value: '3', label: '3 — Orta' },
        { value: '4', label: '4 — Yüksek' },
        { value: '5', label: '5 — Kritik' },
    ];

    return (
        <Modal open={open} onClose={onClose} title={editing ? 'Riski Düzenle' : 'Yeni Risk Kaydı'} size="xl">
            <form onSubmit={handleSubmit} className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">

                {/* Temel Bilgiler */}
                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Risk Tanımı</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Risk Adı / Tanımı <span className="text-red-500">*</span></label>
                            <input value={form.name} onChange={set('name')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Risk adını girin…" required />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Özet / Açıklama</label>
                            <textarea value={form.description} onChange={set('description')} rows={3} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" placeholder="Detaylı açıklama…" />
                        </div>
                    </div>
                </div>

                {/* Organizasyon */}
                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Organizasyon</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Kategori <span className="text-red-500">*</span></label>
                            <select value={form.categoryId} onChange={set('categoryId')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500" required>
                                <option value="">-- Seçin --</option>
                                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Risk Sahibi <span className="text-red-500">*</span></label>
                            <select value={form.ownerId} onChange={set('ownerId')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500" required>
                                <option value="">-- Seçin --</option>
                                {users.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                            </select>
                        </div>
                        <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3">
                            <div>
                                <label htmlFor="risk-directorate" className="block text-xs font-semibold text-slate-600 mb-1">
                                    Sorumlu Direktörlük {!form.isOrgWide && <span className="text-red-500">*</span>}
                                </label>
                                <select id="risk-directorate" value={form.directorateId} disabled={form.isOrgWide || !canChangePlacement}
                                    onChange={set('directorateId')}
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100">
                                    <option value="">-- Seçin --</option>
                                    {directorates.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                            <label className="flex items-start gap-2 text-xs text-slate-600 md:mt-6">
                                <input type="checkbox" checked={form.isOrgWide} disabled={!canChangePlacement}
                                    onChange={e => setForm(p => ({ ...p, isOrgWide: e.target.checked, directorateId: e.target.checked ? '' : p.directorateId }))} />
                                <span><strong>Kurum geneli risk</strong> — tek bir direktörlüğe ait değil. Birim kullanıcılarına açılmaz; yalnız kurum geneli kapsamlı kullanıcılar ve risk sahibi görür.</span>
                            </label>
                            {editing && !canChangePlacement && (
                                <p className="md:col-span-2 text-[11px] text-slate-500">Direktörlük değişikliği için risk:directorate:change yetkisi gerekir.</p>
                            )}
                            {editing && !editing.directorateId && !editing.isOrgWide && (
                                <p className="md:col-span-2 text-[11px] text-amber-700">Bu risk henüz bir direktörlüğe eşlenmemiş; birim kullanıcıları göremez.</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">İlgili GMY</label>
                            <select value={form.gmyId} onChange={set('gmyId')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                                <option value="">-- Seçin --</option>
                                {gmys.map(g => <option key={g.id} value={g.id}>{g.name}{g.code ? ` (${g.code})` : ''}</option>)}
                                {editing?.gmyId && !gmys.some(g => g.id === editing.gmyId) && (
                                    <option value={editing.gmyId}>{editing.ilgiliGmy ?? 'Pasif GMY'} (pasif)</option>
                                )}
                            </select>
                            {editing && !editing.gmyId && editing.ilgiliGmy && (
                                <p className="mt-1 text-[11px] text-amber-700">Eski kayıt: “{editing.ilgiliGmy}” — listeden seçilene kadar korunur.</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Risk Sorumlusu</label>
                            <select value={form.riskSorumlusuId} onChange={set('riskSorumlusuId')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                                <option value="">-- Seçin --</option>
                                {users.filter((u: any) => u.isActive !== false || u.id === editing?.riskSorumlusuId).map((u: any) => (
                                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}{u.department ? ` — ${u.department}` : ''}</option>
                                ))}
                            </select>
                            {editing && !editing.riskSorumlusuId && editing.riskSorumlusu && (
                                <p className="mt-1 text-[11px] text-amber-700">Eski kayıt: “{editing.riskSorumlusu}” — listeden seçilene kadar korunur.</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Süreç</label>
                            <input value={form.surec} onChange={set('surec')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" placeholder="Ana süreç…" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Alt Süreç</label>
                            <input value={form.altSurec} onChange={set('altSurec')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" placeholder="Alt süreç…" />
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                            <input type="checkbox" id="flagIT" checked={form.flagForIT} onChange={e => setForm(p => ({ ...p, flagForIT: e.target.checked }))} className="w-4 h-4 accent-blue-600" />
                            <label htmlFor="flagIT" className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                <FlagIcon className="w-3.5 h-3.5 text-red-500" /> Flag 4 IT
                            </label>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Risk İşleme</label>
                            <select value={form.riskIsleme} onChange={set('riskIsleme')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500">
                                <option value="">-- Seçin --</option>
                                <option value="KABUL">Kabul</option>
                                <option value="AZALT">Azalt</option>
                                <option value="TRANSFER">Transfer</option>
                                <option value="KAÇIN">Kaçın</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Etki Boyutları */}
                <div className="bg-blue-50 rounded-xl p-4 space-y-3 border border-blue-100">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Etki Boyutları (1-5)</p>
                    {!form.flagForIT ? (
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { key: 'finansalEtki', label: 'Finansal (%30)' },
                                { key: 'itibarEtkisi', label: 'İtibar (%30)' },
                                { key: 'regulasyonEtkisi', label: 'Regülasyon (%20)' },
                                { key: 'musteriEtkisi', label: 'Müşteri (%20)' },
                            ].map(({ key, label }) => (
                                <div key={key}>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                                    <select value={(form as any)[key]} onChange={set(key as keyof RiskFormState)} className="w-full text-sm border border-slate-300 rounded-lg px-2 py-2 bg-white focus:ring-2 focus:ring-blue-500">
                                        <option value="">—</option>
                                        {impactOpts.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { key: 'gizlilikEtkisi', label: 'Gizlilik (%35)' },
                                { key: 'butunlukEtkisi', label: 'Bütünlük (%30)' },
                                { key: 'erisilebilirlikEtkisi', label: 'Erişilebilirlik (%35)' },
                            ].map(({ key, label }) => (
                                <div key={key}>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                                    <select value={(form as any)[key]} onChange={set(key as keyof RiskFormState)} className="w-full text-sm border border-slate-300 rounded-lg px-2 py-2 bg-white focus:ring-2 focus:ring-blue-500">
                                        <option value="">—</option>
                                        {impactOpts.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="grid grid-cols-4 gap-3 border-t border-blue-200 pt-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Olasılık (1-5)</label>
                            <select value={form.olasilik} onChange={set('olasilik')} className="w-full text-sm border border-slate-300 rounded-lg px-2 py-2 bg-white focus:ring-2 focus:ring-blue-500">
                                <option value="">—</option>
                                {impactOpts.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
                            </select>
                        </div>
                        <div className="col-span-3 bg-white rounded-lg p-3 border border-blue-200">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Hesaplanan Doğal Risk</p>
                            <div className="flex items-center gap-4">
                                <div><p className="text-[10px] text-slate-400">Etki</p><p className="font-bold text-blue-700">{etki.toFixed(2)}</p></div>
                                <div><p className="text-[10px] text-slate-400">× Olasılık</p><p className="font-bold text-blue-700">{olasilik}</p></div>
                                <div><p className="text-[10px] text-slate-400">= Puan</p><p className="font-bold text-blue-700">{dogalPuan.toFixed(2)}</p></div>
                                {dogalSeviye && <SeviyePill seviye={dogalSeviye} />}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose} type="button">İptal</Button>
                    <Button type="submit" variant="primary" loading={saving}>
                        {editing ? 'Güncelle' : 'Oluştur'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
function RiskInventoryContent() {
    const { hasPermission, user } = useAuth();
    const { error: showError } = useToast();
    const searchParams = useSearchParams();

    const [risks, setRisks] = useState<Risk[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [directorates, setDirectorates] = useState<{ id: string; name: string }[]>([]);
    const [gmys, setGmys] = useState<GmyOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState<LoadError | null>(null);
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [colFilters, setColFilters] = useState<Record<string, string>>({});
    const [quickFilter, setQuickFilter] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const pageSize = 20;

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Risk | null>(null);

    // Dashboard KPI linkleri (?score=high|medium|low) quick filter olarak uygulanır
    useEffect(() => {
        if (searchParams.get('new') === '1') { setEditing(null); setModalOpen(true); }
        const score = searchParams.get('score');
        if (score === 'high' || score === 'medium' || score === 'low') {
            setQuickFilter(`score-${score}`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setListError(null);
        try {
            // Risk listesi yan isteklerden BAĞIMSIZ yüklenir: kullanıcı/kategori/birim listeleri
            // yalnız oluşturma formu içindir ve bazı roller (birim kullanıcısı, görüntüleyici,
            // risk analisti) /admin/users'a erişemez — bu 403 listeyi boşaltmamalı.
            const [risksRes, usersRes, catsRes, dirRes, gmyRes] = await Promise.all([
                // Liste istemci tarafında filtrelenir; sunucu varsayılanı 20 kayıtla sınırlıydı.
                api.getRisks({ limit: 500 }) as Promise<any>,
                (api.getUserChoices() as Promise<any>).catch(() => []),
                ((api.getRiskCategories?.() as Promise<any>) ?? Promise.resolve([])).catch(() => []),
                api.getDirectorates({ isActive: 'true' }).catch(() => []) as Promise<any>,
                api.getGmys().catch(() => [] as GmyOption[]),
            ]);
            setDirectorates(Array.isArray(dirRes) ? dirRes : (dirRes?.data || []));
            setGmys(gmyRes);
            const rList = Array.isArray(risksRes) ? risksRes : (risksRes.data || risksRes.risks || []);
            const uList = Array.isArray(usersRes) ? usersRes : (usersRes.data || usersRes.users || []);
            const cList = Array.isArray(catsRes) ? catsRes : (catsRes.data || []);
            setRisks(rList);
            setUsers(uList);
            setCategories(cList);
        } catch (e) {
            // Boş sonuç ile yüklenemeyen liste ayrı gösterilir.
            const le = classifyLoadError(e, 'Risk listesi');
            setListError(le);
            showError(le.title, le.description);
        }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Quick filter predicate'leri (dashboard skor eşikleriyle aynı: ≥15 / 8-14 / <8)
    const quickFilterFns: Record<string, (r: Risk) => boolean> = useMemo(() => ({
        'benim': (r) => r.owner?.id === user?.id,
        'acik': (r) => r.status !== 'CLOSED',
        'kritik': (r) => r.dogalRiskSeviyesi === 'KRİTİK' || r.kalintiRiskSeviyesi === 'KRİTİK',
        'it': (r) => r.flagForIT,
        'score-high': (r) => (r.dogalRiskPuani ?? 0) >= 15,
        'score-medium': (r) => (r.dogalRiskPuani ?? 0) >= 8 && (r.dogalRiskPuani ?? 0) < 15,
        'score-low': (r) => (r.dogalRiskPuani ?? 0) > 0 && (r.dogalRiskPuani ?? 0) < 8,
    }), [user?.id]);

    const baseFiltered = useMemo(() => risks.filter(r => {
        if (search) {
            const q = search.toLowerCase();
            if (!r.riskId.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q) && !(r.ilgiliGmy || '').toLowerCase().includes(q) && !(r.surec || '').toLowerCase().includes(q)) return false;
        }
        if (filters.status && filters.status !== 'all' && r.status !== filters.status) return false;
        if (filters.seviye && filters.seviye !== 'all' && r.dogalRiskSeviyesi !== filters.seviye) return false;
        if (filters.isleme && filters.isleme !== 'all' && r.riskIsleme !== filters.isleme) return false;
        if (filters.flagIT && filters.flagIT === 'evet' && !r.flagForIT) return false;
        if (filters.directorate) {
            if (filters.directorate === '__orgwide') { if (!r.isOrgWide) return false; }
            else if (filters.directorate === '__none') { if (r.directorateId || r.isOrgWide) return false; }
            else if (r.directorateId !== filters.directorate) return false;
        }
        if (quickFilter && quickFilterFns[quickFilter] && !quickFilterFns[quickFilter](r)) return false;
        return true;
    }), [risks, search, filters, quickFilter, quickFilterFns]);

    // KPIs
    const kritik = risks.filter(r => r.dogalRiskSeviyesi === 'KRİTİK' || r.kalintiRiskSeviyesi === 'KRİTİK').length;
    const yuksek = risks.filter(r => r.dogalRiskSeviyesi === 'YÜKSEK' || r.kalintiRiskSeviyesi === 'YÜKSEK').length;
    const acik = risks.filter(r => r.status !== 'CLOSED').length;
    const itCount = risks.filter(r => r.flagForIT).length;

    const columns: ColumnDef<Risk>[] = useMemo(() => [
        {
            key: 'riskId', header: 'Risk ID', sortable: true, defaultWidth: 130,
            filter: { type: 'text', placeholder: 'Risk ID...', fn: (r: Risk, v) => r.riskId.toLowerCase().includes(v.toLowerCase()) },
            render: (r) => (
                <Link href={`/risks/${r.id}`} className="font-mono text-xs font-bold text-blue-700 hover:underline">
                    {r.riskId}
                </Link>
            ),
        },
        {
            key: 'kayitId', header: 'Kayıt ID', defaultWidth: 90,
            filter: { type: 'text', placeholder: 'Kayıt ID...', fn: (r: Risk, v) => (r.kayitId || '').toLowerCase().includes(v.toLowerCase()) },
            render: (r) => <span className="text-xs text-slate-400 font-mono">{r.kayitId || '—'}</span>,
        },
        {
            key: 'status', header: 'Statü', defaultWidth: 120,
            filter: { type: 'select', options: Object.entries(statusConfig).map(([k, v]) => ({ value: k, label: v.label })), fn: (r: Risk, v) => r.status === v },
            render: (r) => {
                const c = statusConfig[r.status];
                return c ? <StatusBadge variant={c.variant}>{c.label}</StatusBadge> : <span className="text-xs">{r.status}</span>;
            },
        },
        {
            key: 'ilgiliGmy', header: 'İlgili GMY', defaultWidth: 130,
            filter: { type: 'text', placeholder: 'GMY ara...', fn: (r: Risk, v) => (r.ilgiliGmy || '').toLowerCase().includes(v.toLowerCase()) },
            render: (r) => <span className="text-xs text-slate-600">{r.ilgiliGmy || '—'}</span>,
        },
        {
            key: 'owner', header: 'Risk Sahibi', defaultWidth: 140,
            filter: { type: 'text', placeholder: 'Sahip ara...', fn: (r: Risk, v) => `${r.owner?.firstName || ''} ${r.owner?.lastName || ''}`.toLowerCase().includes(v.toLowerCase()) },
            render: (r) => <span className="text-xs text-slate-700">{r.owner?.firstName} {r.owner?.lastName}</span>,
        },
        {
            key: 'surec', header: 'Süreç', defaultWidth: 120,
            filter: { type: 'text', placeholder: 'Süreç...', fn: (r: Risk, v) => (r.surec || '').toLowerCase().includes(v.toLowerCase()) },
            render: (r) => <span className="text-xs text-slate-600">{r.surec || '—'}</span>,
        },
        {
            key: 'altSurec', header: 'Alt Süreç', defaultWidth: 120,
            filter: { type: 'text', placeholder: 'Alt süreç...', fn: (r: Risk, v) => (r.altSurec || '').toLowerCase().includes(v.toLowerCase()) },
            render: (r) => <span className="text-xs text-slate-500">{r.altSurec || '—'}</span>,
        },
        {
            key: 'name', header: 'Risk Tanımı', defaultWidth: 200,
            filter: { type: 'text', placeholder: 'Tanım ara...', fn: (r: Risk, v) => r.name.toLowerCase().includes(v.toLowerCase()) },
            render: (r) => <span className="text-xs text-slate-800 font-medium truncate block max-w-[190px]" title={r.name}>{r.name}</span>,
        },
        {
            key: 'flagForIT', header: 'IT', defaultWidth: 60,
            render: (r) => r.flagForIT ? <FlagIcon className="w-4 h-4 text-red-500" /> : <span className="text-slate-300 text-xs">—</span>,
        },
        {
            key: 'dogalRisk', header: 'Doğal Risk', defaultWidth: 100,
            render: (r) => <ScoreCell puan={r.dogalRiskPuani} seviye={r.dogalRiskSeviyesi} />,
        },
        {
            key: 'butunlesikKontrol', header: 'Bütün. Kontrol', defaultWidth: 110,
            render: (r) => <ScoreCell puan={r.butunlesikKontrolPuani} seviye={r.butunlesikKontrolSeviyesi} />,
        },
        {
            key: 'kalintiRisk', header: 'Kalıntı Risk', defaultWidth: 100,
            render: (r) => <ScoreCell puan={r.kalintiRiskPuani} seviye={r.kalintiRiskSeviyesi} />,
        },
        {
            key: 'riskIsleme', header: 'Risk İşleme', defaultWidth: 100,
            filter: { type: 'select', options: Object.entries(islemeConfig).map(([k, v]) => ({ value: k, label: v.label })), fn: (r: Risk, v) => r.riskIsleme === v },
            render: (r) => {
                if (!r.riskIsleme) return <span className="text-xs text-slate-300">—</span>;
                const c = islemeConfig[r.riskIsleme];
                return c ? <StatusBadge variant={c.variant}>{c.label}</StatusBadge> : <span className="text-xs">{r.riskIsleme}</span>;
            },
        },
        {
            key: 'mutabakatTarihi', header: 'Mutabakat Tar.', defaultWidth: 120,
            render: (r) => <span className="text-xs text-slate-500">{fmt(r.mutabakatTarihi)}</span>,
        },
        {
            key: 'riskControls', header: 'Kontroller', defaultWidth: 80,
            render: (r) => (
                <Link href={`/risks/controls?riskId=${r.id}`} className="text-xs text-blue-600 hover:underline font-medium">
                    {r.riskControls?.length ?? 0} kontrol
                </Link>
            ),
        },
        {
            key: 'riskActions', header: 'Aksiyonlar', defaultWidth: 80,
            render: (r) => (
                <Link href={`/risks/actions?riskId=${r.id}`} className="text-xs text-indigo-600 hover:underline font-medium">
                    {r.riskActions?.length ?? 0} aksiyon
                </Link>
            ),
        },
        {
            key: 'ops', header: '', defaultWidth: 70,
            render: (r) => (
                <div className="flex items-center gap-1">
                    <button onClick={() => { setEditing(r); setModalOpen(true); }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer" title="Düzenle" aria-label="Düzenle">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                </div>
            ),
        },
    ], []);

    const filtered = useMemo(() => {
        if (!Object.values(colFilters).some(v => v)) return baseFiltered;
        return baseFiltered.filter(r => columns.every(col => {
            const val = colFilters[col.key];
            return !val || !col.filter?.fn || col.filter.fn(r, val);
        }));
    }, [baseFiltered, colFilters, columns]);

    const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

    // ── Quick filter chip'leri (canlı sayaçlarla) ──
    const quickFilterItems: QuickFilterItem[] = useMemo(() => [
        { key: 'benim', label: 'Benim Kayıtlarım', count: risks.filter(quickFilterFns['benim']).length },
        { key: 'acik', label: 'Açık', count: acik },
        { key: 'kritik', label: 'Kritik', count: kritik },
        { key: 'it', label: 'IT Riski', count: itCount },
    ], [risks, quickFilterFns, acik, kritik, itCount]);

    const quickFilterLabels: Record<string, string> = {
        'benim': 'Benim Kayıtlarım', 'acik': 'Açık', 'kritik': 'Kritik', 'it': 'IT Riski',
        'score-high': 'Yüksek Skor (≥15)', 'score-medium': 'Orta Skor (8-14)', 'score-low': 'Düşük Skor (<8)',
    };

    // ── Gelişmiş filtre alanları ──
    const advancedFields: AdvancedFilterField[] = useMemo(() => [
        {
            type: 'select', key: 'status', label: 'Statü',
            value: filters.status || '',
            onChange: (v) => { setFilters(p => ({ ...p, status: v })); setPage(1); },
            options: Object.entries(statusConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            type: 'select', key: 'seviye', label: 'Risk Seviyesi',
            value: filters.seviye || '',
            onChange: (v) => { setFilters(p => ({ ...p, seviye: v })); setPage(1); },
            options: Object.keys(seviyelConfig).map(k => ({ value: k, label: seviyelConfig[k].label })),
        },
        {
            type: 'select', key: 'isleme', label: 'Risk İşleme',
            value: filters.isleme || '',
            onChange: (v) => { setFilters(p => ({ ...p, isleme: v })); setPage(1); },
            options: Object.keys(islemeConfig).map(k => ({ value: k, label: islemeConfig[k].label })),
        },
        {
            type: 'select', key: 'directorate', label: 'Direktörlük',
            value: filters.directorate || '',
            onChange: (v) => { setFilters(p => ({ ...p, directorate: v })); setPage(1); },
            options: [
                ...directorates.map(d => ({ value: d.id, label: d.name })),
                { value: '__orgwide', label: 'Kurum geneli risk' },
                { value: '__none', label: 'Eşlenmemiş' },
            ],
        },
        {
            type: 'select', key: 'flagIT', label: 'Flag 4 IT',
            value: filters.flagIT || '',
            onChange: (v) => { setFilters(p => ({ ...p, flagIT: v })); setPage(1); },
            options: [{ value: 'evet', label: 'IT Riski' }],
        },
    ], [filters, directorates]);

    // ── Aktif filtre chip'leri ──
    const filterLabels: Record<string, string> = { status: 'Statü', seviye: 'Seviye', isleme: 'İşleme', flagIT: 'IT', directorate: 'Direktörlük' };
    const filterValueLabel = (key: string, value: string): string => {
        if (key === 'directorate') return value === '__orgwide' ? 'Kurum geneli' : value === '__none' ? 'Eşlenmemiş' : (directorates.find(d => d.id === value)?.name ?? value);
        if (key === 'status') return statusConfig[value]?.label ?? value;
        if (key === 'seviye') return seviyelConfig[value]?.label ?? value;
        if (key === 'isleme') return islemeConfig[value]?.label ?? value;
        if (key === 'flagIT') return 'IT Riski';
        return value;
    };
    const activeChips: ActiveFilterChip[] = useMemo(() => {
        const chips: ActiveFilterChip[] = [];
        if (search) chips.push({ key: 'search', label: 'Arama', value: search, onRemove: () => { setSearch(''); setPage(1); } });
        if (quickFilter) chips.push({
            key: 'quick', label: 'Hızlı Filtre', value: quickFilterLabels[quickFilter] ?? quickFilter,
            onRemove: () => { setQuickFilter(null); setPage(1); },
        });
        Object.entries(filters).forEach(([k, v]) => {
            if (v && v !== 'all') chips.push({
                key: k, label: filterLabels[k] ?? k, value: filterValueLabel(k, v),
                onRemove: () => { setFilters(p => ({ ...p, [k]: '' })); setPage(1); },
            });
        });
        return chips;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, filters, quickFilter]);

    const clearAll = () => { setSearch(''); setFilters({}); setQuickFilter(null); setColFilters({}); setPage(1); };

    return (
        <PageShell>
            <PageHeader
                title="Risk Envanteri"
                description="Kurumsal risk kaydı — tüm riskler, etki analizleri ve skorlar"
                breadcrumbs={[{ label: 'Risk Yönetimi' }, { label: 'Risk Envanteri' }]}
                actions={
                    hasPermission('risk:create') ? (
                        <Button variant="primary"
                            onClick={() => { setEditing(null); setModalOpen(true); }}
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                        >
                            Yeni Risk
                        </Button>
                    ) : undefined
                }
            />

            {/* KPI'lar — tümü click-to-filter */}
            <KpiGrid columns={5}>
                <KpiCard title="Toplam Risk" value={risks.length} variant="default"
                    active={!quickFilter && activeChips.length === 0}
                    onClick={clearAll} />
                <KpiCard title="Açık" value={acik} variant="info"
                    active={quickFilter === 'acik'}
                    onClick={() => { setQuickFilter(quickFilter === 'acik' ? null : 'acik'); setPage(1); }} />
                <KpiCard title="Kritik" value={kritik} variant="critical"
                    active={quickFilter === 'kritik'}
                    onClick={() => { setQuickFilter(quickFilter === 'kritik' ? null : 'kritik'); setPage(1); }} />
                <KpiCard title="Yüksek" value={yuksek} variant="high"
                    active={filters.seviye === 'YÜKSEK'}
                    onClick={() => { setFilters(p => ({ ...p, seviye: p.seviye === 'YÜKSEK' ? '' : 'YÜKSEK' })); setPage(1); }} />
                <KpiCard title="IT Riski" value={itCount} variant="primary"
                    active={quickFilter === 'it'}
                    icon={<FlagIcon className="w-4 h-4" />}
                    onClick={() => { setQuickFilter(quickFilter === 'it' ? null : 'it'); setPage(1); }} />
            </KpiGrid>

            {/* Hızlı filtreler */}
            <QuickFilterBar
                items={quickFilterItems}
                active={quickFilter}
                onChange={(k) => { setQuickFilter(k); setPage(1); }}
            />

            {/* Gelişmiş filtre paneli */}
            <AdvancedFilterPanel
                searchValue={search}
                onSearchChange={(v) => { setSearch(v); setPage(1); }}
                searchPlaceholder="Risk ID, tanım, GMY veya süreç ara..."
                fields={advancedFields}
                activeCount={Object.values(filters).filter(v => v && v !== 'all').length}
                onClearAll={clearAll}
            />

            {/* Aktif filtre chip'leri */}
            <ActiveFilterChips chips={activeChips} onClearAll={clearAll} />

            <DataTable
                columns={columns}
                data={paginated}
                rowKey={(r) => r.id}
                loading={loading}
                totalCount={filtered.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                storageKey="risk-inventory-table"
                emptyTitle={listError ? listError.title : 'Risk bulunamadı'}
                emptyDescription={listError ? listError.description : 'Filtrelerinizi değiştirin veya yeni bir risk kaydı oluşturun.'}
                columnFilters={colFilters}
                onColumnFilterChange={(k, v) => { setColFilters(p => ({ ...p, [k]: v })); setPage(1); }}
                stickyFirstColumn
                onRefresh={load}
                toolbar={
                    <SavedViewMenu
                        storageKey="risk-inventory-table"
                        getPayload={() => ({ search, filters, quickFilter, columnFilters: colFilters })}
                        onApply={(p) => {
                            setSearch(typeof p.search === 'string' ? p.search : '');
                            setFilters((p.filters as Record<string, string>) || {});
                            setQuickFilter(typeof p.quickFilter === 'string' ? p.quickFilter : null);
                            setColFilters((p.columnFilters as Record<string, string>) || {});
                            setPage(1);
                        }}
                    />
                }
            />

            <RiskFormModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSaved={load}
                editing={editing}
                users={users}
                categories={categories}
                directorates={directorates}
                gmys={gmys}
            />
        </PageShell>
    );
}

export default function RiskInventoryPage() {
    return (
        <Suspense fallback={<PageShell><div className="py-24" /></PageShell>}>
            <RiskInventoryContent />
        </Suspense>
    );
}
