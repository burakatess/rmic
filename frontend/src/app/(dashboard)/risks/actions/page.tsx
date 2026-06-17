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
interface RiskAction {
    id: string;
    aksiyonId: string;
    kayitId?: string;
    status: string;
    aksiyonTanimi: string;
    aksiyonSahibi?: string;
    aksiyonSorumlusu?: string;
    atanan?: string;
    ilgiliGmy?: string;
    ozet?: string;
    potaNo?: string;
    bulgReferansNo?: string;
    mutabakatTarihi?: string;
    hedeflenenTamamlanmaTarihi?: string;
    tamamlanmaTarihi?: string;
    riskControl?: { id: string; kontrolId: string; kontrolTanimi: string };
    risks?: { risk: { id: string; riskId: string; name: string } }[];
    _count?: { risks: number };
    createdAt: string;
    updatedAt: string;
}

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const statusConfig: Record<string, { label: string; variant: BV }> = {
    ACIK:         { label: 'Açık',         variant: 'info' },
    DEVAM_EDIYOR: { label: 'Devam Ediyor', variant: 'warning' },
    TAMAMLANDI:   { label: 'Tamamlandı',   variant: 'success' },
    GECIKTI:      { label: 'Gecikti',      variant: 'critical' },
    IPTAL:        { label: 'İptal',        variant: 'neutral' },
};

const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('tr-TR') : '—';

function isOverdue(row: RiskAction): boolean {
    if (!row.hedeflenenTamamlanmaTarihi) return false;
    if (row.status === 'TAMAMLANDI' || row.status === 'IPTAL') return false;
    return new Date(row.hedeflenenTamamlanmaTarihi) < new Date();
}

// ─── Form ──────────────────────────────────────────────────────────────────────
const emptyForm = {
    aksiyonTanimi: '', aksiyonSahibi: '', aksiyonSorumlusu: '', atanan: '',
    ilgiliGmy: '', ozet: '', potaNo: '', bulgReferansNo: '',
    mutabakatTarihi: '', hedeflenenTamamlanmaTarihi: '', tamamlanmaTarihi: '',
    riskControlId: '',
    riskIds: [] as string[],
};

function AksiyonFormModal({ open, onClose, onSaved, editing, risks, riskControls }: {
    open: boolean; onClose: () => void; onSaved: () => void;
    editing?: RiskAction | null; risks: any[]; riskControls: any[];
}) {
    const { success, error: showError } = useToast();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(emptyForm);

    useEffect(() => {
        if (editing) {
            setForm({
                aksiyonTanimi: editing.aksiyonTanimi || '',
                aksiyonSahibi: editing.aksiyonSahibi || '',
                aksiyonSorumlusu: editing.aksiyonSorumlusu || '',
                atanan: editing.atanan || '',
                ilgiliGmy: editing.ilgiliGmy || '',
                ozet: editing.ozet || '',
                potaNo: editing.potaNo || '',
                bulgReferansNo: editing.bulgReferansNo || '',
                mutabakatTarihi: editing.mutabakatTarihi ? editing.mutabakatTarihi.split('T')[0] : '',
                hedeflenenTamamlanmaTarihi: editing.hedeflenenTamamlanmaTarihi ? editing.hedeflenenTamamlanmaTarihi.split('T')[0] : '',
                tamamlanmaTarihi: editing.tamamlanmaTarihi ? editing.tamamlanmaTarihi.split('T')[0] : '',
                riskControlId: editing.riskControl?.id || '',
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
        if (!form.aksiyonTanimi.trim()) { showError('Zorunlu', 'Aksiyon tanımı gerekli'); return; }

        setSaving(true);
        try {
            const payload = {
                ...form,
                riskControlId: form.riskControlId || undefined,
                mutabakatTarihi: form.mutabakatTarihi || undefined,
                hedeflenenTamamlanmaTarihi: form.hedeflenenTamamlanmaTarihi || undefined,
                tamamlanmaTarihi: form.tamamlanmaTarihi || undefined,
            };

            if (editing) {
                await api.updateRiskAction(editing.id, payload);
                success('Güncellendi', 'Aksiyon güncellendi.');
            } else {
                await api.createRiskAction(payload);
                success('Oluşturuldu', 'Aksiyon kaydı oluşturuldu.');
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
        <Modal open={open} onClose={onClose} title={editing ? 'Aksiyonu Düzenle' : 'Yeni Risk Aksiyonu'} size="xl">
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">

                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Aksiyon Bilgileri</p>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Aksiyon Tanımı <span className="text-red-500">*</span></label>
                        <textarea value={form.aksiyonTanimi} onChange={set('aksiyonTanimi')} rows={3} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Aksiyonun detaylı tanımı…" required />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Aksiyon Sahibi</label>
                            <input value={form.aksiyonSahibi} onChange={set('aksiyonSahibi')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Aksiyon Sorumlusu</label>
                            <input value={form.aksiyonSorumlusu} onChange={set('aksiyonSorumlusu')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Atanan</label>
                            <input value={form.atanan} onChange={set('atanan')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">İlgili GMY</label>
                            <input value={form.ilgiliGmy} onChange={set('ilgiliGmy')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">POTA No</label>
                            <input value={form.potaNo} onChange={set('potaNo')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Bulgu Referans No</label>
                            <input value={form.bulgReferansNo} onChange={set('bulgReferansNo')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                        </div>
                    </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Tarihler</p>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Mutabakat Tarihi</label>
                            <input type="date" value={form.mutabakatTarihi} onChange={set('mutabakatTarihi')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Hedeflenen Tamamlanma</label>
                            <input type="date" value={form.hedeflenenTamamlanmaTarihi} onChange={set('hedeflenenTamamlanmaTarihi')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Kapanma Tarihi</label>
                            <input type="date" value={form.tamamlanmaTarihi} onChange={set('tamamlanmaTarihi')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" />
                        </div>
                    </div>
                </div>

                {riskControls.length > 0 && (
                    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Bağlı Kontrol</p>
                        <select value={form.riskControlId} onChange={set('riskControlId')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500">
                            <option value="">— Kontrol seçin (opsiyonel) —</option>
                            {riskControls.map((rc: any) => (
                                <option key={rc.id} value={rc.id}>[{rc.kontrolId}] {rc.kontrolTanimi?.slice(0, 50)}</option>
                            ))}
                        </select>
                    </div>
                )}

                {risks.length > 0 && (
                    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">İlişkili Riskler</p>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                            {risks.map((r: any) => (
                                <label key={r.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-100 cursor-pointer">
                                    <input type="checkbox" checked={form.riskIds.includes(r.id)} onChange={() => toggleRisk(r.id)} className="mt-0.5 w-4 h-4 accent-indigo-600" />
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
                    <Button type="submit" variant="primary" loading={saving}
                        className="bg-indigo-600 hover:bg-indigo-700 ring-indigo-600">
                        {editing ? 'Güncelle' : 'Oluştur'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AksiyonTablosuPage() {
    const { hasPermission } = useAuth();
    const { success, error: showError } = useToast();
    const searchParams = useSearchParams();
    const preFilterRiskId = searchParams.get('riskId');
    const preFilterControlId = searchParams.get('riskControlId');

    const [actions, setActions] = useState<RiskAction[]>([]);
    const [allRisks, setAllRisks] = useState<any[]>([]);
    const [allControls, setAllControls] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [colFilters, setColFilters] = useState<Record<string, string>>({});
    const [page, setPage] = useState(1);
    const pageSize = 20;

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<RiskAction | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (preFilterRiskId) params.riskId = preFilterRiskId;
            if (preFilterControlId) params.riskControlId = preFilterControlId;

            const [actRes, riskRes, ctrlRes] = await Promise.all([
                api.getRiskActions(params) as Promise<any>,
                api.getRisks() as Promise<any>,
                api.getRiskControls({}) as Promise<any>,
            ]);
            const aList = Array.isArray(actRes) ? actRes : (actRes.data || []);
            const rList = Array.isArray(riskRes) ? riskRes : (riskRes.data || riskRes.risks || []);
            const cList = Array.isArray(ctrlRes) ? ctrlRes : (ctrlRes.data || []);
            setActions(aList);
            setAllRisks(rList);
            setAllControls(cList);
        } catch { showError('Hata', 'Veriler yüklenemedi.'); }
        finally { setLoading(false); }
    }, [preFilterRiskId, preFilterControlId]);

    useEffect(() => { load(); }, [load]);

    const baseFiltered = useMemo(() => actions.filter(a => {
        if (search) {
            const q = search.toLowerCase();
            if (!a.aksiyonId.toLowerCase().includes(q) && !a.aksiyonTanimi.toLowerCase().includes(q)
                && !(a.aksiyonSahibi || '').toLowerCase().includes(q) && !(a.potaNo || '').toLowerCase().includes(q)) return false;
        }
        if (filters.status && filters.status !== 'all' && a.status !== filters.status) return false;
        if (filters.overdue === 'evet' && !isOverdue(a)) return false;
        return true;
    }), [actions, search, filters]);

    const acik = actions.filter(a => a.status === 'ACIK' || a.status === 'DEVAM_EDIYOR').length;
    const gecikti = actions.filter(a => isOverdue(a)).length;
    const tamamlandi = actions.filter(a => a.status === 'TAMAMLANDI').length;

    const columns: ColumnDef<RiskAction>[] = useMemo(() => [
        {
            key: 'aksiyonId', header: 'Aksiyon ID', sortable: true, defaultWidth: 130,
            filter: { type: 'text', placeholder: 'ID ara...', fn: (a: RiskAction, v) => a.aksiyonId.toLowerCase().includes(v.toLowerCase()) },
            render: (a) => <span className="font-mono text-xs font-bold text-indigo-700">{a.aksiyonId}</span>,
        },
        {
            key: 'kayitId', header: 'Kayıt ID', defaultWidth: 90,
            filter: { type: 'text', placeholder: 'Kayıt ID...', fn: (a: RiskAction, v) => (a.kayitId || '').toLowerCase().includes(v.toLowerCase()) },
            render: (a) => <span className="text-xs text-slate-400 font-mono">{a.kayitId || '—'}</span>,
        },
        {
            key: 'status', header: 'Aksiyon Statü', defaultWidth: 120,
            filter: { type: 'select', options: Object.entries(statusConfig).map(([k, v]) => ({ value: k, label: v.label })), fn: (a: RiskAction, v) => a.status === v },
            render: (a) => {
                const cfg = statusConfig[a.status];
                const overdue = isOverdue(a);
                return (
                    <div className="flex flex-col gap-1">
                        {cfg ? <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge> : <span className="text-xs">{a.status}</span>}
                        {overdue && <StatusBadge variant="critical" dot>Gecikmiş</StatusBadge>}
                    </div>
                );
            },
        },
        {
            key: 'aksiyonTanimi', header: 'Aksiyon Tanımı', defaultWidth: 220,
            filter: { type: 'text', placeholder: 'Tanım ara...', fn: (a: RiskAction, v) => a.aksiyonTanimi.toLowerCase().includes(v.toLowerCase()) },
            render: (a) => <span className="text-xs text-slate-800 font-medium truncate block max-w-[210px]" title={a.aksiyonTanimi}>{a.aksiyonTanimi}</span>,
        },
        {
            key: 'aksiyonSahibi', header: 'Aksiyon Sahibi', defaultWidth: 130,
            filter: { type: 'text', placeholder: 'Sahip ara...', fn: (a: RiskAction, v) => (a.aksiyonSahibi || '').toLowerCase().includes(v.toLowerCase()) },
            render: (a) => <span className="text-xs text-slate-600">{a.aksiyonSahibi || '—'}</span>,
        },
        {
            key: 'mutabakatTarihi', header: 'Mutabakat Tar.', defaultWidth: 110,
            render: (a) => <span className="text-xs text-slate-500">{fmt(a.mutabakatTarihi)}</span>,
        },
        {
            key: 'hedefTarih', header: 'Hedef Tar.', defaultWidth: 110,
            render: (a) => (
                <span className={`text-xs ${isOverdue(a) ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                    {fmt(a.hedeflenenTamamlanmaTarihi)}
                </span>
            ),
        },
        {
            key: 'tamamlanmaTarihi', header: 'Kapanma Tar.', defaultWidth: 110,
            render: (a) => <span className="text-xs text-slate-500">{fmt(a.tamamlanmaTarihi)}</span>,
        },
        {
            key: 'potaNo', header: 'POTA No', defaultWidth: 100,
            filter: { type: 'text', placeholder: 'POTA No...', fn: (a: RiskAction, v) => (a.potaNo || '').toLowerCase().includes(v.toLowerCase()) },
            render: (a) => <span className="text-xs text-slate-500">{a.potaNo || '—'}</span>,
        },
        {
            key: 'bulgRef', header: 'Bulgu Ref.', defaultWidth: 110,
            render: (a) => <span className="text-xs text-slate-500">{a.bulgReferansNo || '—'}</span>,
        },
        {
            key: 'ilgiliGmy', header: 'İlgili GMY', defaultWidth: 120,
            render: (a) => <span className="text-xs text-slate-600">{a.ilgiliGmy || '—'}</span>,
        },
        {
            key: 'riskControl', header: 'Bağlı Kontrol', defaultWidth: 130,
            render: (a) => a.riskControl
                ? <span className="text-xs font-mono text-blue-600">{a.riskControl.kontrolId}</span>
                : <span className="text-xs text-slate-300">—</span>,
        },
        {
            key: 'risks', header: 'Risk ID', defaultWidth: 120,
            render: (a) => (
                <div className="flex flex-col gap-0.5">
                    {(a.risks || []).slice(0, 2).map(rm => (
                        <Link key={rm.risk.id} href={`/risks/${rm.risk.id}`} className="text-xs font-mono text-blue-600 hover:underline">{rm.risk.riskId}</Link>
                    ))}
                    {(a.risks || []).length > 2 && <span className="text-[10px] text-slate-400">+{(a.risks || []).length - 2} daha</span>}
                    {!(a.risks || []).length && <span className="text-xs text-slate-300">—</span>}
                </div>
            ),
        },
        {
            key: 'ops', header: '', defaultWidth: 60,
            render: (a) => (
                <button onClick={() => { setEditing(a); setModalOpen(true); }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
            ),
        },
    ], []);

    const filtered = useMemo(() => {
        if (!Object.values(colFilters).some(v => v)) return baseFiltered;
        return baseFiltered.filter(a => columns.every(col => {
            const val = colFilters[col.key];
            return !val || !col.filter?.fn || col.filter.fn(a, val);
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
            key: 'overdue', label: 'Gecikmiş',
            value: filters.overdue || '',
            onChange: (v: string) => { setFilters(p => ({ ...p, overdue: v })); setPage(1); },
            options: [{ value: 'evet', label: '⚠ Gecikmiş' }],
        },
    ], [filters]);

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            <div className="px-8 pt-8">
                <PageHeader
                    title="Aksiyon Tablosu"
                    description="Risk'e yönelik aksiyonlar — sahibi, sorumlusu, mutabakat ve tamamlanma tarihleri"
                    breadcrumbs={[{ label: 'Risk Yönetimi' }, { label: 'Aksiyon Tablosu' }]}
                    actions={
                        hasPermission('risk:create') ? (
                            <Button variant="primary"
                                onClick={() => { setEditing(null); setModalOpen(true); }}
                                className="bg-indigo-600 hover:bg-indigo-700 ring-indigo-600"
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                            >
                                Yeni Aksiyon
                            </Button>
                        ) : undefined
                    }
                />

                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Toplam Aksiyon</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">{actions.length}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-amber-200">
                        <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Açık / Devam Eden</p>
                        <p className="text-2xl font-bold text-amber-700 mt-1">{acik}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-red-200">
                        <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Gecikmiş</p>
                        <p className="text-2xl font-bold text-red-700 mt-1">{gecikti}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-200">
                        <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Tamamlanan</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-1">{tamamlandi}</p>
                    </div>
                </div>

                <div className="mb-4 bg-white border border-slate-200 rounded-xl shadow-sm p-3">
                    <FilterBar
                        searchValue={search}
                        onSearchChange={(v) => { setSearch(v); setPage(1); }}
                        searchPlaceholder="Aksiyon ID, tanım, sahibi veya POTA no ara..."
                        filters={filterConfigs}
                        onClearAll={() => { setSearch(''); setFilters({}); setPage(1); }}
                    />
                </div>
            </div>

            <div className="px-8 pb-8 flex-1 overflow-auto">
                <DataTable
                    columns={columns}
                    data={paginated}
                    rowKey={(a) => a.id}
                    loading={loading}
                    totalCount={filtered.length}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    storageKey="risk-actions-table"
                    emptyTitle="Aksiyon bulunamadı"
                    emptyDescription="Henüz risk aksiyonu eklenmemiş."
                    columnFilters={colFilters}
                    onColumnFilterChange={(k, v) => { setColFilters(p => ({ ...p, [k]: v })); setPage(1); }}
                />
            </div>

            <AksiyonFormModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSaved={load}
                editing={editing}
                risks={allRisks}
                riskControls={allControls}
            />
        </div>
    );
}
