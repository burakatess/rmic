'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { PageHeader, FilterBar, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface RcaRow {
    riskId: string;
    riskDbId: string;
    kayitId?: string;
    riskStatus: string;
    ilgiliGmy?: string;
    riskSahibi?: string;
    surec?: string;
    altSurec?: string;
    riskTanimi: string;
    flagForIT: boolean;
    finansalEtki?: number;
    itibarEtkisi?: number;
    regulasyonEtkisi?: number;
    musteriEtkisi?: number;
    gizlilikEtkisi?: number;
    butunlukEtkisi?: number;
    erisilebilirlikEtkisi?: number;
    etki?: number;
    olasilik?: number;
    dogalRiskPuani?: number;
    dogalRiskSeviyesi?: string;
    butunlesikKontrolPuani?: number;
    butunlesikKontrolSeviyesi?: string;
    kalintiRiskPuani?: number;
    kalintiRiskSeviyesi?: string;
    riskIsleme?: string;
    // Control
    kontrolId?: string;
    kontrolDbId?: string;
    kontrolStatus?: string;
    kontrolTanimi?: string;
    kontrolTuru?: string;
    kontrolIslevi?: string;
    birSeviyeKontrolSikligi?: string;
    kontrolPuani?: number;
    kontrolButunlesikSeviyesi?: string;
    kontrolMutabakatTarihi?: string;
    // Action
    aksiyonId?: string;
    aksiyonDbId?: string;
    aksiyonStatus?: string;
    aksiyonTanimi?: string;
    aksiyonSahibi?: string;
    aksiyonMutabakatTarihi?: string;
    hedeflenenTamamlanmaTarihi?: string;
    kapanmaTarihi?: string;
    potaNo?: string;
    bulgReferansNo?: string;
}

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const riskSeviyeConfig: Record<string, { label: string; bg: string }> = {
    'KRİTİK': { label: 'Kritik', bg: 'bg-red-100 text-red-800 border-red-300' },
    'YÜKSEK': { label: 'Yüksek', bg: 'bg-orange-100 text-orange-800 border-orange-300' },
    'ORTA':   { label: 'Orta',   bg: 'bg-amber-100 text-amber-800 border-amber-300' },
    'DÜŞÜK':  { label: 'Düşük',  bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
};

const kontrolSeviyeConfig: Record<string, { label: string; bg: string }> = {
    'YÜKSEK': { label: 'Yüksek', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    'ORTA':   { label: 'Orta',   bg: 'bg-amber-100 text-amber-800 border-amber-300' },
    'DÜŞÜK':  { label: 'Düşük',  bg: 'bg-red-100 text-red-800 border-red-300' },
};

const aksiyonStatusConfig: Record<string, { label: string; variant: BV }> = {
    ACIK:         { label: 'Açık',         variant: 'info' },
    DEVAM_EDIYOR: { label: 'Devam Ediyor', variant: 'warning' },
    TAMAMLANDI:   { label: 'Tamamlandı',   variant: 'success' },
    GECIKTI:      { label: 'Gecikti',      variant: 'critical' },
    IPTAL:        { label: 'İptal',        variant: 'neutral' },
};

const riskStatusMap: Record<string, string> = {
    IDENTIFIED: 'Tespit Edildi',
    ASSESSED: 'Değerlendirildi',
    TREATED: 'İşlendi',
    ACCEPTED: 'Kabul Edildi',
    CLOSED: 'Kapatıldı',
};

const islemeMap: Record<string, string> = {
    KABUL: 'Kabul', AZALT: 'Azalt', TRANSFER: 'Transfer', 'KAÇIN': 'Kaçın',
};

const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('tr-TR') : '—';

function Pill({ seviye, config }: { seviye?: string; config: Record<string, { label: string; bg: string }> }) {
    if (!seviye) return <span className="text-xs text-slate-300">—</span>;
    const c = config[seviye];
    return <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${c?.bg ?? 'bg-slate-100 text-slate-700 border-slate-300'}`}>{c?.label ?? seviye}</span>;
}

// Build flat RCA rows from risks + their controls + controls' actions
function buildRcaRows(risks: any[], controls: any[], actions: any[]): RcaRow[] {
    const rows: RcaRow[] = [];

    for (const risk of risks) {
        // Find linked controls
        const linkedControls = controls.filter(c =>
            (c.risks || []).some((cr: any) => cr.riskId === risk.id || cr.risk?.id === risk.id)
        );

        if (linkedControls.length === 0) {
            // Risk with no controls → single row
            rows.push(buildRow(risk, undefined, undefined));
        } else {
            for (const ctrl of linkedControls) {
                // Find linked actions for this control
                const linkedActions = actions.filter(a => a.riskControlId === ctrl.id);
                if (linkedActions.length === 0) {
                    rows.push(buildRow(risk, ctrl, undefined));
                } else {
                    for (const action of linkedActions) {
                        rows.push(buildRow(risk, ctrl, action));
                    }
                }
            }
        }
    }
    return rows;
}

function buildRow(risk: any, ctrl: any, action: any): RcaRow {
    return {
        riskId: risk.riskId,
        riskDbId: risk.id,
        kayitId: risk.kayitId,
        riskStatus: risk.status,
        ilgiliGmy: risk.ilgiliGmy,
        riskSahibi: risk.owner ? `${risk.owner.firstName} ${risk.owner.lastName}` : risk.riskSorumlusu,
        surec: risk.surec,
        altSurec: risk.altSurec,
        riskTanimi: risk.name,
        flagForIT: risk.flagForIT,
        finansalEtki: risk.finansalEtki,
        itibarEtkisi: risk.itibarEtkisi,
        regulasyonEtkisi: risk.regulasyonEtkisi,
        musteriEtkisi: risk.musteriEtkisi,
        gizlilikEtkisi: risk.gizlilikEtkisi,
        butunlukEtkisi: risk.butunlukEtkisi,
        erisilebilirlikEtkisi: risk.erisilebilirlikEtkisi,
        etki: risk.etki,
        olasilik: risk.olasilik,
        dogalRiskPuani: risk.dogalRiskPuani,
        dogalRiskSeviyesi: risk.dogalRiskSeviyesi,
        butunlesikKontrolPuani: risk.butunlesikKontrolPuani ?? ctrl?.butunlesikKontrolPuani,
        butunlesikKontrolSeviyesi: risk.butunlesikKontrolSeviyesi ?? ctrl?.butunlesikKontrolSeviyesi,
        kalintiRiskPuani: risk.kalintiRiskPuani,
        kalintiRiskSeviyesi: risk.kalintiRiskSeviyesi,
        riskIsleme: risk.riskIsleme,
        // Control
        kontrolId: ctrl?.kontrolId,
        kontrolDbId: ctrl?.id,
        kontrolStatus: ctrl?.status,
        kontrolTanimi: ctrl?.kontrolTanimi,
        kontrolTuru: ctrl?.kontrolTuru,
        kontrolIslevi: ctrl?.kontrolIslevi,
        birSeviyeKontrolSikligi: ctrl?.birSeviyeKontrolSikligi,
        kontrolPuani: ctrl?.kontrolPuani,
        kontrolButunlesikSeviyesi: ctrl?.butunlesikKontrolSeviyesi,
        kontrolMutabakatTarihi: ctrl?.mutabakatTarihi,
        // Action
        aksiyonId: action?.aksiyonId,
        aksiyonDbId: action?.id,
        aksiyonStatus: action?.status,
        aksiyonTanimi: action?.aksiyonTanimi,
        aksiyonSahibi: action?.aksiyonSahibi,
        aksiyonMutabakatTarihi: action?.mutabakatTarihi,
        hedeflenenTamamlanmaTarihi: action?.hedeflenenTamamlanmaTarihi,
        kapanmaTarihi: action?.tamamlanmaTarihi,
        potaNo: action?.potaNo,
        bulgReferansNo: action?.bulgReferansNo,
    };
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function RcaMappingPage() {
    const { error: showError } = useToast();

    const [risks, setRisks] = useState<any[]>([]);
    const [controls, setControls] = useState<any[]>([]);
    const [actions, setActions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<Record<string, string>>({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [rRes, cRes, aRes] = await Promise.all([
                api.getRisks() as Promise<any>,
                api.getRiskControls({ limit: '500' }) as Promise<any>,
                api.getRiskActions({ limit: '500' }) as Promise<any>,
            ]);
            setRisks(Array.isArray(rRes) ? rRes : (rRes.data || rRes.risks || []));
            setControls(Array.isArray(cRes) ? cRes : (cRes.data || []));
            setActions(Array.isArray(aRes) ? aRes : (aRes.data || []));
        } catch { showError('Hata', 'RCA verileri yüklenemedi.'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const allRows = useMemo(() => buildRcaRows(risks, controls, actions), [risks, controls, actions]);

    const filtered = useMemo(() => allRows.filter(r => {
        if (search) {
            const q = search.toLowerCase();
            if (!r.riskId.toLowerCase().includes(q)
                && !r.riskTanimi.toLowerCase().includes(q)
                && !(r.ilgiliGmy || '').toLowerCase().includes(q)
                && !(r.kontrolId || '').toLowerCase().includes(q)
                && !(r.aksiyonId || '').toLowerCase().includes(q)
                && !(r.potaNo || '').toLowerCase().includes(q)) return false;
        }
        if (filters.riskSeviye && filters.riskSeviye !== 'all' && r.dogalRiskSeviyesi !== filters.riskSeviye) return false;
        if (filters.kalintiSeviye && filters.kalintiSeviye !== 'all' && r.kalintiRiskSeviyesi !== filters.kalintiSeviye) return false;
        if (filters.aksiyonStatus && filters.aksiyonStatus !== 'all' && r.aksiyonStatus !== filters.aksiyonStatus) return false;
        if (filters.flagIT === 'evet' && !r.flagForIT) return false;
        return true;
    }), [allRows, search, filters]);

    const filterConfigs = useMemo(() => [
        {
            key: 'riskSeviye', label: 'Doğal Risk',
            value: filters.riskSeviye || '',
            onChange: (v: string) => setFilters(p => ({ ...p, riskSeviye: v })),
            options: Object.keys(riskSeviyeConfig).map(k => ({ value: k, label: riskSeviyeConfig[k].label })),
        },
        {
            key: 'kalintiSeviye', label: 'Kalıntı Risk',
            value: filters.kalintiSeviye || '',
            onChange: (v: string) => setFilters(p => ({ ...p, kalintiSeviye: v })),
            options: Object.keys(riskSeviyeConfig).map(k => ({ value: k, label: riskSeviyeConfig[k].label })),
        },
        {
            key: 'aksiyonStatus', label: 'Aksiyon Statü',
            value: filters.aksiyonStatus || '',
            onChange: (v: string) => setFilters(p => ({ ...p, aksiyonStatus: v })),
            options: Object.entries(aksiyonStatusConfig).map(([k, v]) => ({ value: k, label: v.label })),
        },
        {
            key: 'flagIT', label: 'Flag 4 IT',
            value: filters.flagIT || '',
            onChange: (v: string) => setFilters(p => ({ ...p, flagIT: v })),
            options: [{ value: 'evet', label: '🚩 IT Riski' }],
        },
    ], [filters]);

    // Column groups for visual separation
    const colGroups = [
        { label: 'RİSK', cols: 14, color: 'bg-blue-600' },
        { label: 'KONTROL', cols: 8, color: 'bg-emerald-600' },
        { label: 'AKSİYON', cols: 9, color: 'bg-indigo-600' },
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            <div className="px-8 pt-8">
                <PageHeader
                    title="RCA Haritalama"
                    description="Risk → Kontrol → Aksiyon zinciri — bütünleşik görünüm"
                    breadcrumbs={[{ label: 'Risk Yönetimi' }, { label: 'RCA Haritalama' }]}
                />

                {/* KPIs */}
                <div className="grid grid-cols-5 gap-4 mb-5">
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Toplam Satır</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">{filtered.length}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-blue-200">
                        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Benzersiz Risk</p>
                        <p className="text-2xl font-bold text-blue-700 mt-1">{new Set(filtered.map(r => r.riskId)).size}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-200">
                        <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Benzersiz Kontrol</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-1">{new Set(filtered.map(r => r.kontrolId).filter(Boolean)).size}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-indigo-200">
                        <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide">Benzersiz Aksiyon</p>
                        <p className="text-2xl font-bold text-indigo-700 mt-1">{new Set(filtered.map(r => r.aksiyonId).filter(Boolean)).size}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-red-200">
                        <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Kritik Risk</p>
                        <p className="text-2xl font-bold text-red-700 mt-1">{new Set(filtered.filter(r => r.dogalRiskSeviyesi === 'KRİTİK').map(r => r.riskId)).size}</p>
                    </div>
                </div>

                <div className="mb-4 bg-white border border-slate-200 rounded-xl shadow-sm p-3">
                    <FilterBar
                        searchValue={search}
                        onSearchChange={setSearch}
                        searchPlaceholder="Risk ID, tanım, kontrol ID, aksiyon ID veya POTA no ara..."
                        filters={filterConfigs}
                        onClearAll={() => { setSearch(''); setFilters({}); }}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="px-8 pb-8 flex-1 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Yükleniyor…</div>
                ) : (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="text-xs w-full border-collapse">
                                <thead>
                                    {/* Column group headers */}
                                    <tr>
                                        {colGroups.map(g => (
                                            <th key={g.label} colSpan={g.cols} className={`${g.color} text-white text-center py-2 px-3 font-bold tracking-wider text-[11px] border-r border-white/20`}>
                                                {g.label}
                                            </th>
                                        ))}
                                    </tr>
                                    <tr className="bg-slate-100 border-b border-slate-200">
                                        {/* RISK cols */}
                                        {[
                                            'Risk ID', 'Kayıt ID', 'Risk Statü', 'İlgili GMY', 'Risk Sahibi',
                                            'Süreç', 'Alt Süreç', 'Risk Tanımı', 'IT',
                                            'Etki', 'Olasılık', 'Doğal Risk', 'Bütün. Kontrol', 'Kalıntı Risk',
                                        ].map(h => (
                                            <th key={h} className="text-left px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap border-r border-slate-200">{h}</th>
                                        ))}
                                        {/* KONTROL cols */}
                                        {[
                                            'Kontrol ID', 'Kontrol Statü', 'Kontrol Tanımı', 'Tür', 'İşlev', '1. Sıklık', 'Kontrol Puan', 'Bütün. Seviye',
                                        ].map(h => (
                                            <th key={h} className="text-left px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap border-r border-slate-200 bg-emerald-50">{h}</th>
                                        ))}
                                        {/* AKSİYON cols */}
                                        {[
                                            'Aksiyon ID', 'Aksiyon Statü', 'Aksiyon Tanımı', 'Aksiyon Sahibi',
                                            'Mutabakat Tar.', 'Hedef Tar.', 'Kapanma Tar.', 'POTA No', 'Bulgu Ref.',
                                        ].map(h => (
                                            <th key={h} className="text-left px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap border-r border-slate-200 bg-indigo-50">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length === 0 ? (
                                        <tr>
                                            <td colSpan={31} className="text-center py-16 text-slate-400">
                                                <div className="text-2xl mb-2">📊</div>
                                                <p>Kayıt bulunamadı</p>
                                                <p className="text-xs mt-1">Risk, Kontrol ve Aksiyon verisi oluşturduktan sonra burada görünür</p>
                                            </td>
                                        </tr>
                                    ) : filtered.map((row, idx) => {
                                        const aksiyonCfg = row.aksiyonStatus ? aksiyonStatusConfig[row.aksiyonStatus] : undefined;
                                        const isOverdueAction = row.aksiyonStatus !== 'TAMAMLANDI' && row.aksiyonStatus !== 'IPTAL'
                                            && row.hedeflenenTamamlanmaTarihi && new Date(row.hedeflenenTamamlanmaTarihi) < new Date();

                                        return (
                                            <tr key={idx} className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                                                {/* RISK */}
                                                <td className="px-3 py-2.5 border-r border-slate-100">
                                                    <Link href={`/risks/${row.riskDbId}`} className="font-mono font-bold text-blue-700 hover:underline">{row.riskId}</Link>
                                                </td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 text-slate-400 font-mono">{row.kayitId || '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 text-slate-600">{riskStatusMap[row.riskStatus] || row.riskStatus}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 text-slate-600">{row.ilgiliGmy || '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 text-slate-600">{row.riskSahibi || '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 text-slate-500">{row.surec || '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 text-slate-500">{row.altSurec || '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 max-w-[180px]">
                                                    <span className="text-slate-800 font-medium truncate block max-w-[170px]" title={row.riskTanimi}>{row.riskTanimi}</span>
                                                </td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 text-center">{row.flagForIT ? '🚩' : '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 text-center font-semibold text-slate-700">{row.etki?.toFixed(1) ?? '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 text-center font-semibold text-slate-700">{row.olasilik ?? '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100">
                                                    <div className="text-center">
                                                        <p className="font-bold text-slate-700">{row.dogalRiskPuani?.toFixed(1) ?? '—'}</p>
                                                        <Pill seviye={row.dogalRiskSeviyesi} config={riskSeviyeConfig} />
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 border-r border-slate-100">
                                                    <div className="text-center">
                                                        <p className="font-bold text-slate-700">{row.butunlesikKontrolPuani?.toFixed(1) ?? '—'}</p>
                                                        <Pill seviye={row.butunlesikKontrolSeviyesi} config={kontrolSeviyeConfig} />
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 border-r border-slate-100">
                                                    <div className="text-center">
                                                        <p className="font-bold text-slate-700">{row.kalintiRiskPuani?.toFixed(1) ?? '—'}</p>
                                                        <Pill seviye={row.kalintiRiskSeviyesi} config={riskSeviyeConfig} />
                                                    </div>
                                                </td>

                                                {/* KONTROL */}
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-emerald-50/30">
                                                    {row.kontrolId
                                                        ? <Link href={`/risks/controls?search=${row.kontrolId}`} className="font-mono font-bold text-emerald-700 hover:underline">{row.kontrolId}</Link>
                                                        : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-emerald-50/30 text-slate-600">{row.kontrolStatus || '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-emerald-50/30 max-w-[160px]">
                                                    <span className="text-slate-700 truncate block max-w-[150px]" title={row.kontrolTanimi}>{row.kontrolTanimi || '—'}</span>
                                                </td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-emerald-50/30 text-slate-500">{row.kontrolTuru || '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-emerald-50/30 text-slate-500">{row.kontrolIslevi || '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-emerald-50/30 text-slate-500">{row.birSeviyeKontrolSikligi || '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-emerald-50/30 text-center font-semibold text-slate-700">{row.kontrolPuani?.toFixed(1) ?? '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-emerald-50/30">
                                                    <Pill seviye={row.kontrolButunlesikSeviyesi} config={kontrolSeviyeConfig} />
                                                </td>

                                                {/* AKSİYON */}
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-indigo-50/30">
                                                    {row.aksiyonId
                                                        ? <span className="font-mono font-bold text-indigo-700">{row.aksiyonId}</span>
                                                        : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-indigo-50/30">
                                                    {aksiyonCfg ? <StatusBadge variant={aksiyonCfg.variant}>{aksiyonCfg.label}</StatusBadge> : <span className="text-slate-300">—</span>}
                                                    {isOverdueAction && <StatusBadge variant="critical" dot>Gecikmiş</StatusBadge>}
                                                </td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-indigo-50/30 max-w-[160px]">
                                                    <span className="text-slate-700 truncate block max-w-[150px]" title={row.aksiyonTanimi}>{row.aksiyonTanimi || '—'}</span>
                                                </td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-indigo-50/30 text-slate-600">{row.aksiyonSahibi || '—'}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-indigo-50/30 text-slate-500">{fmt(row.aksiyonMutabakatTarihi)}</td>
                                                <td className={`px-3 py-2.5 border-r border-slate-100 bg-indigo-50/30 ${isOverdueAction ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                                                    {fmt(row.hedeflenenTamamlanmaTarihi)}
                                                </td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-indigo-50/30 text-slate-500">{fmt(row.kapanmaTarihi)}</td>
                                                <td className="px-3 py-2.5 border-r border-slate-100 bg-indigo-50/30 text-slate-500">{row.potaNo || '—'}</td>
                                                <td className="px-3 py-2.5 bg-indigo-50/30 text-slate-500">{row.bulgReferansNo || '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {filtered.length > 0 && (
                            <div className="px-4 py-2 border-t border-slate-200 text-xs text-slate-500 bg-slate-50">
                                {filtered.length} satır gösteriliyor ({new Set(filtered.map(r => r.riskId)).size} risk, {new Set(filtered.map(r => r.kontrolId).filter(Boolean)).size} kontrol, {new Set(filtered.map(r => r.aksiyonId).filter(Boolean)).size} aksiyon)
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
