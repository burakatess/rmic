'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
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
    riskId: string;
    kayitId?: string;
    name: string;
    description: string;
    status: string;
    ozet?: string;
    ilgiliGmy?: string;
    surec?: string;
    altSurec?: string;
    flagForIT: boolean;
    riskSorumlusu?: string;
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
    ilgiliGmy: string; surec: string; altSurec: string;
    flagForIT: boolean; riskSorumlusu: string; riskIsleme: string;
    finansalEtki: string; itibarEtkisi: string; regulasyonEtkisi: string; musteriEtkisi: string;
    gizlilikEtkisi: string; butunlukEtkisi: string; erisilebilirlikEtkisi: string;
    olasilik: string;
    categoryId: string; ownerId: string;
}

const emptyForm: RiskFormState = {
    name: '', description: '', ozet: '',
    ilgiliGmy: '', surec: '', altSurec: '',
    flagForIT: false, riskSorumlusu: '', riskIsleme: '',
    finansalEtki: '', itibarEtkisi: '', regulasyonEtkisi: '', musteriEtkisi: '',
    gizlilikEtkisi: '', butunlukEtkisi: '', erisilebilirlikEtkisi: '',
    olasilik: '',
    categoryId: '', ownerId: '',
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

function RiskFormModal({ open, onClose, onSaved, editing, users, categories }: {
    open: boolean; onClose: () => void; onSaved: () => void;
    editing?: Risk | null;
    users: any[]; categories: any[];
}) {
    const { success, error: showError } = useToast();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<RiskFormState>(emptyForm);

    useEffect(() => {
        if (editing) {
            setForm({
                name: editing.name || '',
                description: editing.description || '',
                ozet: editing.ozet || '',
                ilgiliGmy: editing.ilgiliGmy || '',
                surec: editing.surec || '',
                altSurec: editing.altSurec || '',
                flagForIT: editing.flagForIT || false,
                riskSorumlusu: editing.riskSorumlusu || '',
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
            });
        } else {
            setForm(emptyForm);
        }
    }, [editing, open]);

    const set = (field: keyof RiskFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }));

    const etki = calcEtki(form, form.flagForIT);
    const olasilik = Number(form.olasilik) || 0;
    const dogalPuan = etki * olasilik;
    const dogalSeviye = dogalPuan > 0 ? calcSeviye(dogalPuan) : undefined;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) { showError('Zorunlu', 'Risk adı gerekli'); return; }
        if (!form.categoryId) { showError('Zorunlu', 'Kategori seçin'); return; }
        if (!form.ownerId) { showError('Zorunlu', 'Risk sahibi seçin'); return; }

        setSaving(true);
        try {
            const payload = {
                name: form.name,
                description: form.description,
                ozet: form.ozet || undefined,
                ilgiliGmy: form.ilgiliGmy || undefined,
                surec: form.surec || undefined,
                altSurec: form.altSurec || undefined,
                flagForIT: form.flagForIT,
                riskSorumlusu: form.riskSorumlusu || undefined,
                riskIsleme: form.riskIsleme || undefined,
                finansalEtki: form.finansalEtki ? Number(form.finansalEtki) : undefined,
                itibarEtkisi: form.itibarEtkisi ? Number(form.itibarEtkisi) : undefined,
                regulasyonEtkisi: form.regulasyonEtkisi ? Number(form.regulasyonEtkisi) : undefined,
                musteriEtkisi: form.musteriEtkisi ? Number(form.musteriEtkisi) : undefined,
                gizlilikEtkisi: form.gizlilikEtkisi ? Number(form.gizlilikEtkisi) : undefined,
                butunlukEtkisi: form.butunlukEtkisi ? Number(form.butunlukEtkisi) : undefined,
                erisilebilirlikEtkisi: form.erisilebilirlikEtkisi ? Number(form.erisilebilirlikEtkisi) : undefined,
                etki: etki > 0 ? etki : undefined,
                olasilik: olasilik > 0 ? olasilik : undefined,
                dogalRiskPuani: dogalPuan > 0 ? dogalPuan : undefined,
                dogalRiskSkoru: dogalPuan > 0 ? Math.round(dogalPuan) : undefined,
                dogalRiskSeviyesi: dogalSeviye,
                categoryId: form.categoryId,
                ownerId: form.ownerId,
                inherentProbability: olasilik || 1,
                inherentImpact: Math.round(etki) || 1,
                inherentRiskScore: Math.round(dogalPuan) || 1,
            };

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
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">İlgili GMY</label>
                            <input value={form.ilgiliGmy} onChange={set('ilgiliGmy')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" placeholder="GMY adı…" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Risk Sorumlusu</label>
                            <input value={form.riskSorumlusu} onChange={set('riskSorumlusu')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" placeholder="Sorumlu adı…" />
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
    const [loading, setLoading] = useState(true);
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
        const score = searchParams.get('score');
        if (score === 'high' || score === 'medium' || score === 'low') {
            setQuickFilter(`score-${score}`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [risksRes, usersRes, catsRes] = await Promise.all([
                api.getRisks() as Promise<any>,
                api.getUsers() as Promise<any>,
                api.getRiskCategories?.() as Promise<any> ?? Promise.resolve([]),
            ]);
            const rList = Array.isArray(risksRes) ? risksRes : (risksRes.data || risksRes.risks || []);
            const uList = Array.isArray(usersRes) ? usersRes : (usersRes.data || usersRes.users || []);
            const cList = Array.isArray(catsRes) ? catsRes : (catsRes.data || []);
            setRisks(rList);
            setUsers(uList);
            setCategories(cList);
        } catch { showError('Hata', 'Veriler yüklenemedi.'); }
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
            type: 'select', key: 'flagIT', label: 'Flag 4 IT',
            value: filters.flagIT || '',
            onChange: (v) => { setFilters(p => ({ ...p, flagIT: v })); setPage(1); },
            options: [{ value: 'evet', label: 'IT Riski' }],
        },
    ], [filters]);

    // ── Aktif filtre chip'leri ──
    const filterLabels: Record<string, string> = { status: 'Statü', seviye: 'Seviye', isleme: 'İşleme', flagIT: 'IT' };
    const filterValueLabel = (key: string, value: string): string => {
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
                emptyTitle="Risk bulunamadı"
                emptyDescription="Filtrelerinizi değiştirin veya yeni bir risk kaydı oluşturun."
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
