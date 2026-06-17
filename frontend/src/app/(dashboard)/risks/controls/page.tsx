'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { PageHeader, DataTable, FilterBar, StatusBadge, Button, Modal } from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface RiskControl {
    id: string;
    kontrolId: string;
    kayitId?: string;
    status: string;
    ilgiliGmy?: string;
    riskSahibi?: string;
    surec?: string;
    altSurec?: string;
    riskTanimi?: string;
    kontrolTanimi: string;
    kontrolTuru?: string;
    kontrolIslevi?: string;
    kontrolIsletimeSekli?: string;
    kontrolIsletimDenetimi?: string;
    kontrolIsletimRaporlama?: string;
    birSeviyeKontrolSikligi?: string;
    kontrolPuani?: number;
    kontrolSkoru?: string;
    butunlesikKontrolPuani?: number;
    butunlesikKontrolSkoru?: string;
    butunlesikKontrolSeviyesi?: string;
    riskSorumlusu?: string;
    ozet?: string;
    mutabakatTarihi?: string;
    risks?: { risk: { id: string; riskId: string; name: string; dogalRiskSeviyesi?: string } }[];
    actions?: { id: string; aksiyonId: string; status: string }[];
    _count?: { risks: number; actions: number };
    createdAt: string;
    updatedAt: string;
}

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const statusConfig: Record<string, { label: string; variant: BV }> = {
    AKTIF:  { label: 'Aktif', variant: 'success' },
    TASLAK: { label: 'Taslak', variant: 'warning' },
    PASIF:  { label: 'Pasif', variant: 'neutral' },
};

const seviyeConfig: Record<string, { label: string; bg: string }> = {
    'YÜKSEK': { label: 'Yüksek', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    'ORTA':   { label: 'Orta',   bg: 'bg-amber-100 text-amber-800 border-amber-300' },
    'DÜŞÜK':  { label: 'Düşük',  bg: 'bg-red-100 text-red-800 border-red-300' },
};

const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('tr-TR') : '—';

function SeviyePill({ s }: { s?: string }) {
    if (!s) return <span className="text-xs text-slate-300">—</span>;
    const c = seviyeConfig[s];
    return <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${c?.bg ?? 'bg-slate-100 text-slate-700 border-slate-300'}`}>{c?.label ?? s}</span>;
}

// ─── Form ──────────────────────────────────────────────────────────────────────
const emptyForm = {
    kontrolTanimi: '', kontrolTuru: '', kontrolIslevi: '',
    kontrolIsletimeSekli: '', kontrolIsletimDenetimi: '', kontrolIsletimRaporlama: '',
    birSeviyeKontrolSikligi: '',
    ilgiliGmy: '', riskSahibi: '', surec: '', altSurec: '', riskTanimi: '',
    riskSorumlusu: '', ozet: '', mutabakatTarihi: '',
    kontrolPuani: '', butunlesikKontrolPuani: '',
    butunlesikKontrolSeviyesi: '', kayitId: '',
    riskIds: [] as string[],
};

function KontrolFormModal({ open, onClose, onSaved, editing, risks }: {
    open: boolean; onClose: () => void; onSaved: () => void;
    editing?: RiskControl | null; risks: any[];
}) {
    const { success, error: showError } = useToast();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(emptyForm);

    useEffect(() => {
        if (editing) {
            setForm({
                kontrolTanimi: editing.kontrolTanimi || '',
                kontrolTuru: editing.kontrolTuru || '',
                kontrolIslevi: editing.kontrolIslevi || '',
                kontrolIsletimeSekli: editing.kontrolIsletimeSekli || '',
                kontrolIsletimDenetimi: editing.kontrolIsletimDenetimi || '',
                kontrolIsletimRaporlama: editing.kontrolIsletimRaporlama || '',
                birSeviyeKontrolSikligi: editing.birSeviyeKontrolSikligi || '',
                ilgiliGmy: editing.ilgiliGmy || '',
                riskSahibi: editing.riskSahibi || '',
                surec: editing.surec || '',
                altSurec: editing.altSurec || '',
                riskTanimi: editing.riskTanimi || '',
                riskSorumlusu: editing.riskSorumlusu || '',
                ozet: editing.ozet || '',
                mutabakatTarihi: editing.mutabakatTarihi ? editing.mutabakatTarihi.split('T')[0] : '',
                kontrolPuani: String(editing.kontrolPuani ?? ''),
                butunlesikKontrolPuani: String(editing.butunlesikKontrolPuani ?? ''),
                butunlesikKontrolSeviyesi: editing.butunlesikKontrolSeviyesi || '',
                kayitId: editing.kayitId || '',
                riskIds: (editing.risks || []).map((r: any) => r.risk.id),
            });
        } else {
            setForm(emptyForm);
        }
    }, [editing, open]);

    const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }));

    const toggleRisk = (riskId: string) =>
        setForm(prev => ({
            ...prev,
            riskIds: prev.riskIds.includes(riskId)
                ? prev.riskIds.filter(id => id !== riskId)
                : [...prev.riskIds, riskId],
        }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.kontrolTanimi.trim()) { showError('Zorunlu', 'Kontrol tanımı gerekli'); return; }

        setSaving(true);
        try {
            const payload = {
                ...form,
                kontrolPuani: form.kontrolPuani ? Number(form.kontrolPuani) : undefined,
                butunlesikKontrolPuani: form.butunlesikKontrolPuani ? Number(form.butunlesikKontrolPuani) : undefined,
                mutabakatTarihi: form.mutabakatTarihi || undefined,
            };

            if (editing) {
                await api.updateRiskControl(editing.id, payload);
                success('Güncellendi', 'Kontrol güncellendi.');
            } else {
                await api.createRiskControl(payload);
                success('Oluşturuldu', 'Kontrol kaydı oluşturuldu.');
            }
            onSaved();
            onClose();
        } catch (err: any) {
            showError('Hata', err?.message || 'İşlem gerçekleştirilemedi.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title={editing ? 'Kontrolü Düzenle' : 'Yeni Risk Kontrolü'} size="xl">
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">

                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Kontrol Bilgileri</p>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Kontrol Tanımı <span className="text-red-500">*</span></label>
                        <textarea value={form.kontrolTanimi} onChange={set('kontrolTanimi')} rows={3} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Kontrolün detaylı tanımı…" required />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Kontrol Türü</label>
                            <select value={form.kontrolTuru} onChange={set('kontrolTuru')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500">
                                <option value="">—</option>
                                <option>Önleyici</option>
                                <option>Düzeltici</option>
                                <option>Tespit Edici</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Kontrol İşlevi</label>
                            <select value={form.kontrolIslevi} onChange={set('kontrolIslevi')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500">
                                <option value="">—</option>
                                <option>Manuel</option>
                                <option>Otomatik</option>
                                <option>Yarı Otomatik</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">1. Seviye Sıklığı</label>
                            <select value={form.birSeviyeKontrolSikligi} onChange={set('birSeviyeKontrolSikligi')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500">
                                <option value="">—</option>
                                <option>Günlük</option>
                                <option>Haftalık</option>
                                <option>Aylık</option>
                                <option>3 Aylık</option>
                                <option>6 Aylık</option>
                                <option>Yıllık</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">İşletim Şekli</label>
                            <input value={form.kontrolIsletimeSekli} onChange={set('kontrolIsletimeSekli')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" placeholder="İşletim şekli…" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Denetim</label>
                            <input value={form.kontrolIsletimDenetimi} onChange={set('kontrolIsletimDenetimi')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" placeholder="Denetim yöntemi…" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Raporlama</label>
                            <input value={form.kontrolIsletimRaporlama} onChange={set('kontrolIsletimRaporlama')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" placeholder="Raporlama yöntemi…" />
                        </div>
                    </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Organizasyon</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">İlgili GMY</label>
                            <input value={form.ilgiliGmy} onChange={set('ilgiliGmy')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Risk Sahibi</label>
                            <input value={form.riskSahibi} onChange={set('riskSahibi')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Süreç</label>
                            <input value={form.surec} onChange={set('surec')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Alt Süreç</label>
                            <input value={form.altSurec} onChange={set('altSurec')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Risk Sorumlusu</label>
                            <input value={form.riskSorumlusu} onChange={set('riskSorumlusu')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Mutabakat Tarihi</label>
                            <input type="date" value={form.mutabakatTarihi} onChange={set('mutabakatTarihi')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                        </div>
                    </div>
                </div>

                <div className="bg-blue-50 rounded-xl p-4 space-y-3 border border-blue-100">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Puanlama</p>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Kontrol Puanı</label>
                            <input type="number" min="0" max="25" step="0.1" value={form.kontrolPuani} onChange={set('kontrolPuani')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" placeholder="0-25" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Bütünleşik Puan</label>
                            <input type="number" min="0" max="25" step="0.1" value={form.butunlesikKontrolPuani} onChange={set('butunlesikKontrolPuani')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" placeholder="0-25" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Bütünleşik Seviye</label>
                            <select value={form.butunlesikKontrolSeviyesi} onChange={set('butunlesikKontrolSeviyesi')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500">
                                <option value="">—</option>
                                <option>DÜŞÜK</option>
                                <option>ORTA</option>
                                <option>YÜKSEK</option>
                            </select>
                        </div>
                    </div>
                </div>

                {risks.length > 0 && (
                    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">İlişkili Riskler</p>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                            {risks.map((r: any) => (
                                <label key={r.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-100 cursor-pointer">
                                    <input type="checkbox" checked={form.riskIds.includes(r.id)} onChange={() => toggleRisk(r.id)} className="mt-0.5 w-4 h-4 accent-blue-600" />
                                    <div>
                                        <span className="text-xs font-mono font-semibold text-blue-700">{r.riskId}</span>
                                        <span className="text-xs text-slate-600 ml-2">{r.name}</span>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose} type="button">İptal</Button>
                    <Button type="submit" variant="primary" loading={saving}>{editing ? 'Güncelle' : 'Oluştur'}</Button>
                </div>
            </form>
        </Modal>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function KontrolAlaniPage() {
    const { hasPermission } = useAuth();
    const { success, error: showError } = useToast();
    const searchParams = useSearchParams();
    const preFilterRiskId = searchParams.get('riskId');

    const [controls, setControls] = useState<RiskControl[]>([]);
    const [allRisks, setAllRisks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [colFilters, setColFilters] = useState<Record<string, string>>({});
    const [page, setPage] = useState(1);
    const pageSize = 20;

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<RiskControl | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [ctrlRes, riskRes] = await Promise.all([
                api.getRiskControls(preFilterRiskId ? { riskId: preFilterRiskId } : {}) as Promise<any>,
                api.getRisks() as Promise<any>,
            ]);
            const cList = Array.isArray(ctrlRes) ? ctrlRes : (ctrlRes.data || []);
            const rList = Array.isArray(riskRes) ? riskRes : (riskRes.data || riskRes.risks || []);
            setControls(cList);
            setAllRisks(rList);
        } catch { showError('Hata', 'Veriler yüklenemedi.'); }
        finally { setLoading(false); }
    }, [preFilterRiskId]);

    useEffect(() => { load(); }, [load]);

    const baseFiltered = useMemo(() => controls.filter(c => {
        if (search) {
            const q = search.toLowerCase();
            if (!c.kontrolId.toLowerCase().includes(q) && !c.kontrolTanimi.toLowerCase().includes(q) && !(c.ilgiliGmy || '').toLowerCase().includes(q)) return false;
        }
        if (filters.status && filters.status !== 'all' && c.status !== filters.status) return false;
        if (filters.seviye && filters.seviye !== 'all' && c.butunlesikKontrolSeviyesi !== filters.seviye) return false;
        return true;
    }), [controls, search, filters]);

    const aktif = controls.filter(c => c.status === 'AKTIF').length;
    const yuksek = controls.filter(c => c.butunlesikKontrolSeviyesi === 'YÜKSEK').length;

    const columns: ColumnDef<RiskControl>[] = useMemo(() => [
        {
            key: 'kontrolId', header: 'Kontrol ID', sortable: true, defaultWidth: 130,
            filter: { type: 'text', placeholder: 'Kontrol ID...', fn: (c: RiskControl, v) => c.kontrolId.toLowerCase().includes(v.toLowerCase()) },
            render: (c) => <span className="font-mono text-xs font-bold text-blue-700">{c.kontrolId}</span>,
        },
        {
            key: 'kayitId', header: 'Kayıt ID', defaultWidth: 90,
            filter: { type: 'text', placeholder: 'Kayıt ID...', fn: (c: RiskControl, v) => (c.kayitId || '').toLowerCase().includes(v.toLowerCase()) },
            render: (c) => <span className="text-xs text-slate-400 font-mono">{c.kayitId || '—'}</span>,
        },
        {
            key: 'status', header: 'Statü', defaultWidth: 90,
            filter: { type: 'select', options: Object.entries(statusConfig).map(([k, v]) => ({ value: k, label: v.label })), fn: (c: RiskControl, v) => c.status === v },
            render: (c) => {
                const cfg = statusConfig[c.status];
                return cfg ? <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge> : <span className="text-xs">{c.status}</span>;
            },
        },
        {
            key: 'risks', header: 'Risk ID', defaultWidth: 120,
            render: (c) => (
                <div className="flex flex-col gap-0.5">
                    {(c.risks || []).slice(0, 2).map(rm => (
                        <Link key={rm.risk.id} href={`/risks/${rm.risk.id}`} className="text-xs font-mono text-blue-600 hover:underline">{rm.risk.riskId}</Link>
                    ))}
                    {(c.risks || []).length > 2 && <span className="text-[10px] text-slate-400">+{(c.risks || []).length - 2} daha</span>}
                    {!(c.risks || []).length && <span className="text-xs text-slate-300">—</span>}
                </div>
            ),
        },
        {
            key: 'ilgiliGmy', header: 'İlgili GMY', defaultWidth: 120,
            filter: { type: 'text', placeholder: 'GMY ara...', fn: (c: RiskControl, v) => (c.ilgiliGmy || '').toLowerCase().includes(v.toLowerCase()) },
            render: (c) => <span className="text-xs text-slate-600">{c.ilgiliGmy || '—'}</span>,
        },
        {
            key: 'riskSahibi', header: 'Risk Sahibi', defaultWidth: 120,
            filter: { type: 'text', placeholder: 'Sahip ara...', fn: (c: RiskControl, v) => (c.riskSahibi || '').toLowerCase().includes(v.toLowerCase()) },
            render: (c) => <span className="text-xs text-slate-600">{c.riskSahibi || '—'}</span>,
        },
        {
            key: 'surec', header: 'Süreç', defaultWidth: 110,
            filter: { type: 'text', placeholder: 'Süreç...', fn: (c: RiskControl, v) => (c.surec || '').toLowerCase().includes(v.toLowerCase()) },
            render: (c) => <span className="text-xs text-slate-500">{c.surec || '—'}</span>,
        },
        {
            key: 'kontrolTanimi', header: 'Kontrol Tanımı', defaultWidth: 220,
            filter: { type: 'text', placeholder: 'Tanım ara...', fn: (c: RiskControl, v) => c.kontrolTanimi.toLowerCase().includes(v.toLowerCase()) },
            render: (c) => <span className="text-xs text-slate-800 font-medium truncate block max-w-[210px]" title={c.kontrolTanimi}>{c.kontrolTanimi}</span>,
        },
        {
            key: 'kontrolTuru', header: 'Tür', defaultWidth: 100,
            render: (c) => <span className="text-xs text-slate-500">{c.kontrolTuru || '—'}</span>,
        },
        {
            key: 'kontrolIslevi', header: 'İşlev', defaultWidth: 100,
            render: (c) => <span className="text-xs text-slate-500">{c.kontrolIslevi || '—'}</span>,
        },
        {
            key: 'birSeviyeKontrolSikligi', header: '1. Sıklık', defaultWidth: 90,
            render: (c) => <span className="text-xs text-slate-500">{c.birSeviyeKontrolSikligi || '—'}</span>,
        },
        {
            key: 'kontrolPuani', header: 'Kontrol Puan', defaultWidth: 100,
            render: (c) => <span className="text-xs text-center font-semibold text-slate-700">{c.kontrolPuani != null ? c.kontrolPuani.toFixed(1) : '—'}</span>,
        },
        {
            key: 'butunlesik', header: 'Bütün. Kontrol', defaultWidth: 120,
            render: (c) => (
                <div className="text-center">
                    {c.butunlesikKontrolPuani != null && <p className="text-xs font-bold text-slate-700">{c.butunlesikKontrolPuani.toFixed(1)}</p>}
                    <SeviyePill s={c.butunlesikKontrolSeviyesi} />
                </div>
            ),
        },
        {
            key: 'mutabakatTarihi', header: 'Mutabakat Tar.', defaultWidth: 110,
            render: (c) => <span className="text-xs text-slate-500">{fmt(c.mutabakatTarihi)}</span>,
        },
        {
            key: 'actions', header: 'Aksiyonlar', defaultWidth: 90,
            render: (c) => (
                <Link href={`/risks/actions?riskControlId=${c.id}`} className="text-xs text-indigo-600 hover:underline font-medium">
                    {c._count?.actions ?? c.actions?.length ?? 0} aksiyon
                </Link>
            ),
        },
        {
            key: 'ops', header: '', defaultWidth: 60,
            render: (c) => (
                <button onClick={() => { setEditing(c); setModalOpen(true); }}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
            ),
        },
    ], []);

    const filtered = useMemo(() => {
        if (!Object.values(colFilters).some(v => v)) return baseFiltered;
        return baseFiltered.filter(c => columns.every(col => {
            const val = colFilters[col.key];
            return !val || !col.filter?.fn || col.filter.fn(c, val);
        }));
    }, [baseFiltered, colFilters, columns]);

    const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

    const filterConfigs = useMemo(() => [
        {
            key: 'status', label: 'Statü',
            value: filters.status || '',
            onChange: (v: string) => { setFilters(p => ({ ...p, status: v })); setPage(1); },
            options: Object.entries(statusConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            key: 'seviye', label: 'Bütün. Seviye',
            value: filters.seviye || '',
            onChange: (v: string) => { setFilters(p => ({ ...p, seviye: v })); setPage(1); },
            options: Object.keys(seviyeConfig).map(k => ({ value: k, label: seviyeConfig[k].label })),
        },
    ], [filters]);

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            <div className="px-8 pt-8">
                <PageHeader
                    title="Kontrol Alanı"
                    description="Risk'e yönelik kontroller — kontrol tanımı, tür, işlev ve puanlama"
                    breadcrumbs={[{ label: 'Risk Yönetimi' }, { label: 'Kontrol Alanı' }]}
                    actions={
                        hasPermission('risk:create') ? (
                            <Button variant="primary"
                                onClick={() => { setEditing(null); setModalOpen(true); }}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                            >
                                Yeni Kontrol
                            </Button>
                        ) : undefined
                    }
                />

                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Toplam Kontrol</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">{controls.length}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-200">
                        <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Aktif</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-1">{aktif}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-200">
                        <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Yüksek Seviye</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-1">{yuksek}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ortalama Puan</p>
                        <p className="text-2xl font-bold text-slate-700 mt-1">
                            {controls.length ? (controls.reduce((s, c) => s + (c.butunlesikKontrolPuani || 0), 0) / controls.length).toFixed(1) : '—'}
                        </p>
                    </div>
                </div>

                <div className="mb-4 bg-white border border-slate-200 rounded-xl shadow-sm p-3">
                    <FilterBar
                        searchValue={search}
                        onSearchChange={(v) => { setSearch(v); setPage(1); }}
                        searchPlaceholder="Kontrol ID, tanım veya GMY ara..."
                        filters={filterConfigs}
                        onClearAll={() => { setSearch(''); setFilters({}); setPage(1); }}
                    />
                </div>
            </div>

            <div className="px-8 pb-8 flex-1 overflow-auto">
                <DataTable
                    columns={columns}
                    data={paginated}
                    rowKey={(c) => c.id}
                    loading={loading}
                    totalCount={filtered.length}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    storageKey="risk-controls-table"
                    emptyTitle="Kontrol bulunamadı"
                    emptyDescription="Henüz risk kontrolü eklenmemiş. Yeni Kontrol butonunu kullanın."
                    columnFilters={colFilters}
                    onColumnFilterChange={(k, v) => { setColFilters(p => ({ ...p, [k]: v })); setPage(1); }}
                />
            </div>

            <KontrolFormModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSaved={load}
                editing={editing}
                risks={allRisks}
            />
        </div>
    );
}
