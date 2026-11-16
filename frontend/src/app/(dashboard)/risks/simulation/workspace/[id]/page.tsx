'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api, { ApiError } from '@/lib/api';
import { classifyLoadError, type LoadError } from '@/lib/load-error';
import { PageShell, LoadingState, ErrorState, EmptyState, Button, ConfirmDialog, Modal, Input, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';
import { ExcelTables } from './ExcelTables';
import { TestReport } from './TestReport';
import { HeatMap } from './HeatMap';
import { MethodologyPanel } from './MethodologyPanel';
import { TransferPanel } from './TransferPanel';
import { LEVELS, LEVEL_SHORT, BAR_TONE, fmt, fmtDate, LevelBadge } from './ws-ui';

/*
 * Risk Simülasyonu — Çalışma alanı. Düzen, Bilgi Güvenliği Direktörlüğü'nün "Risk Yönetimi
 * Simülatörü" şablonunu izler (risk kütüğü + risk detayı + kontrol kartları). Hesaplar
 * uygulamanın mevcut simülasyon metodolojisiyle backend'de yapılır; bu sayfa yalnız gösterir.
 */

// GRC Kontrol Excel'indeki seçenek metinleri (puanlar metodoloji v1 ile aynı).
const P_OPTIONS: Record<'p1' | 'p2' | 'p3' | 'p4' | 'p5', { label: string; options: { value: string; label: string; pts: number }[] }> = {
    p1: { label: 'P1 · Kontrol Türü', options: [
        { value: 'MANUEL', label: 'Manuel', pts: 0.5 }, { value: 'BT_MANUEL', label: 'BT Manuel', pts: 1 }, { value: 'OTOMATIK', label: 'Otomatik', pts: 1.5 }] },
    p2: { label: 'P2 · Kontrol İşlevi', options: [
        { value: 'TESPIT_EDICI', label: 'Tespit Edici', pts: 0.5 }, { value: 'DUZELTICI', label: 'Düzeltici', pts: 1 }, { value: 'ONLEYICI', label: 'Önleyici', pts: 1.5 }] },
    p3: { label: 'P3 · Kontrolün İşletilme Şekli', options: [
        { value: 'IZ_KAYDI_YOK', label: 'Kontrolün iz kaydı yoktur.', pts: 0 },
        { value: 'KULLANICI_SIFRE_SES_EMAIL', label: 'Kullanıcı adı / parola / ses kaydı / ortak alan / e-mail', pts: 0.5 },
        { value: 'SISTEM_LOG_ISLAK_IMZA', label: 'Sistem logları veya ıslak imza ile kayıt altında', pts: 1 },
        { value: 'ELEKTRONIK_IMZA', label: 'Elektronik imza ile gerçekleştiriliyor', pts: 1.5 }] },
    p4: { label: 'P4 · Kontrol İşletiminin Denetimi', options: [
        { value: 'YOK', label: 'Bulunmamaktadır.', pts: 0 }, { value: 'AYNI_EKIP', label: 'Aynı ekipteki çalışanlarca kontrol', pts: 0.5 },
        { value: 'FARKLI_EKIP', label: 'Farklı ekiplerdeki çalışanlarca kontrol', pts: 1 }, { value: 'HER_IKISI', label: 'Her ikisi de yapılmaktadır.', pts: 1.5 }] },
    p5: { label: 'P5 · Kontrol İşletiminin Raporlanması', options: [
        { value: 'YOK', label: 'Bulunmamaktadır.', pts: 0 }, { value: 'DUZENSIZ_UST_AMIR', label: 'Düzensiz aralıklarla üst amirlere', pts: 0.5 },
        { value: 'DUZENLI_UST_AMIR', label: 'Düzenli aralıklarla üst amirlere', pts: 1 }, { value: 'FARKLI_BIRIM_GOZETIM', label: 'Farklı birimlere (RKD/BGD vb.) + gözetim', pts: 1.5 }] },
};
const IMPACT_AREAS = [{ value: 'BOTH', label: 'Olasılık ve etki' }, { value: 'PROBABILITY', label: 'Yalnız olasılık' }, { value: 'IMPACT', label: 'Yalnız etki' }];
interface Row {
    scenarioId: string; riskId: string; name: string; surec?: string | null; altSurec?: string | null;
    natural: { probability: number; impact: number; puan: number; level: string } | null;
    bkp: { value: number | null; level: string | null; unknownKts: boolean };
    residual: { probability: number; impact: number; risk: number; level: string | null; overridden: boolean } | null;
    controls: { active: number; total: number };
    record: { natural: number | null; residual: number | null; residualLevel?: string | null };
    deviation: { natural: boolean; residual: boolean };
    changed: boolean;
}
interface Workspace {
    simulation: { id: string; simulationId: string; name: string; description?: string | null; createdAt: string; updatedAt?: string; isDraft?: boolean; createdBy?: { firstName: string; lastName: string } };
    source: 'PLATFORM' | 'EXCEL';
    activeTest: { id: string; name: string; startedAt: string } | null;
    riskLevels: { min: number; max: number; score: number; label: string }[];
    summary: { riskCount: number; activeControls: number; residualDistribution: Record<string, number>; recordDistribution: Record<string, number>; unknownResidual: number; deviationCount: number; changedCount: number };
    rows: Row[];
}

function DistributionCard({ title, dist, unknown }: { title: string; dist: Record<string, number>; unknown?: number }) {
    const total = LEVELS.reduce((s, l) => s + (dist[l] ?? 0), 0) + (unknown ?? 0);
    return (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">{title}</div>
            <div className="mt-2 flex h-2 rounded-full overflow-hidden bg-slate-100">
                {LEVELS.map(l => (dist[l] ?? 0) > 0 && <div key={l} className={BAR_TONE[l]} style={{ width: `${((dist[l] ?? 0) / Math.max(1, total)) * 100}%` }} />)}
                {(unknown ?? 0) > 0 && <div className="bg-slate-300" style={{ width: `${((unknown ?? 0) / Math.max(1, total)) * 100}%` }} />}
            </div>
            <div className="mt-1.5 font-mono text-[12px] text-slate-600">
                {LEVELS.map(l => `${LEVEL_SHORT[l]} ${dist[l] ?? 0}`).join(' · ')}{unknown ? ` · ? ${unknown}` : ''}
            </div>
        </div>
    );
}

function Select({ value, onChange, disabled, children, className = '' }: { value: string; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode; className?: string }) {
    return (
        <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}
            className={`w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 disabled:bg-slate-50 disabled:text-slate-400 focus:ring-2 focus:ring-blue-200 outline-none ${className}`}>
            {children}
        </select>
    );
}

// ─── Kontrol kartı ─────────────────────────────────────────────────────────
function ControlCard({ scenarioId, control, contribution, canEdit, onChanged }: {
    scenarioId: string; control: any; contribution?: { kep: number | null; kyp: number; weight: number }; canEdit: boolean; onChanged: () => void;
}) {
    const { error: showError } = useToast();
    const [saving, setSaving] = useState(false);
    const [desc, setDesc] = useState(control.description ?? '');
    const [kts, setKts] = useState<string>(control.ktsManualValue == null ? '' : String(control.ktsManualValue));
    const [weight, setWeight] = useState<string>(String(Math.round((control.weight ?? 0) * 10000) / 100));
    useEffect(() => { setDesc(control.description ?? ''); setKts(control.ktsManualValue === null || control.ktsManualValue === undefined ? '' : String(control.ktsManualValue)); setWeight(String(Math.round((control.weight ?? 0) * 10000) / 100)); }, [control.description, control.ktsManualValue, control.weight]);
    const patch = async (data: Record<string, unknown>) => {
        setSaving(true);
        try { await api.updateSimControl(scenarioId, control.id, data); onChanged(); }
        catch (e) { showError('Kontrol güncellenemedi', e instanceof ApiError ? e.message : 'Bilinmeyen hata.'); }
        finally { setSaving(false); }
    };
    const approved = control.isApproved !== false;
    const kyp = (['p1', 'p2', 'p3', 'p4', 'p5'] as const).reduce((s, k) => s + (P_OPTIONS[k].options.find(o => o.value === control[k])?.pts ?? 0), 0);
    return (
        <div className={`rounded-xl border p-4 ${approved ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'} ${saving ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-800">{control.name}</span>
                    {control.sourceRiskControlId ? <span className="text-[10px] font-semibold rounded border border-slate-300 px-1.5 py-0.5 text-slate-500">Kontrol Alanı</span>
                        : <span className="text-[10px] font-semibold rounded border border-amber-300 px-1.5 py-0.5 text-amber-700">Yalnız simülasyon</span>}
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-slate-700"><b>{fmt(kyp, 1)}</b> / 7,5</span>
                    <span className="text-[10px] font-semibold rounded border border-slate-300 px-1.5 py-0.5 text-slate-600">
                        KEP {contribution?.kep === null || contribution?.kep === undefined ? '—' : fmt(contribution.kep, 1)}
                    </span>
                    <select value={approved ? 'ON' : 'OFF'} disabled={!canEdit || saving} onChange={e => patch({ isApproved: e.target.value === 'ON' })}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" aria-label="Onay durumu">
                        <option value="ON">Onaylı</option><option value="OFF">İptal</option>
                    </select>
                </div>
            </div>
            <textarea value={desc} rows={2} maxLength={5000} disabled={!canEdit} placeholder="Kontrol tanımı…"
                onChange={e => setDesc(e.target.value)} onBlur={() => { if (desc !== (control.description ?? '')) patch({ description: desc }); }}
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 disabled:bg-slate-50" />
            <div className="mt-3 grid grid-cols-3 gap-3">
                {(['p1', 'p2', 'p3', 'p4', 'p5'] as const).map(k => (
                    <label key={k} className="block">
                        <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">{P_OPTIONS[k].label}</span>
                        <Select value={control[k]} disabled={!canEdit || saving} onChange={v => patch({ [k]: v })}>
                            {P_OPTIONS[k].options.map(o => <option key={o.value} value={o.value}>{o.label} ({fmt(o.pts, 1)})</option>)}
                        </Select>
                    </label>
                ))}
                <label className="block">
                    <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">Etki alanı</span>
                    <Select value={control.impactArea} disabled={!canEdit || saving} onChange={v => patch({ impactArea: v })}>
                        {IMPACT_AREAS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                </label>
                <label className="block">
                    <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">KTS (0–100)</span>
                    <input type="number" min={0} max={100} value={kts} disabled={!canEdit || saving} placeholder="Boş"
                        onChange={e => setKts(e.target.value)}
                        onBlur={() => { const v = kts === '' ? null : Math.max(0, Math.min(100, Number(kts))); if (v !== (control.ktsManualValue ?? null)) patch({ ktsMode: 'MANUAL', ktsManualValue: v }); }}
                        className={`w-full rounded-lg border px-2.5 py-2 text-sm ${kts === '' && approved ? 'border-amber-400 bg-amber-50/40' : 'border-slate-300'}`} />
                </label>
                <label className="block">
                    <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">Ağırlık %</span>
                    <input type="number" min={0} max={100} step="0.01" value={weight} disabled={!canEdit || saving}
                        onChange={e => setWeight(e.target.value)}
                        onBlur={() => { const v = Math.max(0, Math.min(100, Number(weight) || 0)) / 100; if (Math.abs(v - (control.weight ?? 0)) > 1e-6) patch({ weight: v }); }}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm" />
                </label>
            </div>
            {approved && kts === '' && <p className="mt-2 text-[11px] text-amber-700">KTS girilmedi — bu kontrol bütünleşik kontrol puanını &quot;bilinmiyor&quot; yapar.</p>}
        </div>
    );
}

// ─── Risk detayı (sağ panel) ───────────────────────────────────────────────
function RiskDetail({ scenarioId, row, canEdit, onChanged, fromExcel }: { scenarioId: string; row?: Row; canEdit: boolean; onChanged: () => void; fromExcel: boolean }) {
    const { error: showError, success } = useToast();
    const [scenario, setScenario] = useState<any>(null);
    const [calc, setCalc] = useState<any>(null);
    const [error, setError] = useState<LoadError | null>(null);
    const [infoOpen, setInfoOpen] = useState(true);
    const seq = useRef(0);

    const load = useCallback(async () => {
        const my = ++seq.current;
        try {
            const [s, c] = await Promise.all([api.getSimScenario(scenarioId), api.calculateSimScenario(scenarioId)]);
            if (my !== seq.current) return;
            setScenario(s); setCalc(c); setError(null);
        } catch (e) { if (my === seq.current) setError(classifyLoadError(e, 'Risk')); }
    }, [scenarioId]);
    useEffect(() => { setScenario(null); setCalc(null); load(); }, [load]);

    const refresh = () => { load(); onChanged(); };
    const patchScenario = async (data: Record<string, unknown>) => {
        try { await api.updateSimScenario(scenarioId, { ...data, expectedContentVersion: scenario.contentVersion }); refresh(); }
        catch (e) { showError('Güncellenemedi', e instanceof ApiError ? e.message : 'Bilinmeyen hata.'); load(); }
    };
    const addControl = async () => {
        try {
            const n = (scenario?.controls?.length ?? 0) + 1;
            await api.addSimControl(scenarioId, { name: `YENİ-${n}`, description: '', p1: 'MANUEL', p2: 'TESPIT_EDICI', p3: 'IZ_KAYDI_YOK', p4: 'YOK', p5: 'YOK', ktsMode: 'MANUAL', weight: 0, impactArea: 'BOTH' });
            success('Kontrol eklendi', 'P parametrelerini, KTS ve ağırlığı kartta girin.');
            refresh();
        } catch (e) { showError('Kontrol eklenemedi', e instanceof ApiError ? e.message : 'Bilinmeyen hata.'); }
    };

    if (error) return <ErrorState title={error.title} description={error.description} onRetry={error.retryable ? load : undefined} />;
    if (!scenario || !calc) return <LoadingState message="Risk yükleniyor..." />;

    const snap = scenario.sourceRiskSnapshot ?? {};
    const isIT = scenario.finalImpactChoice === 'INFOSEC';
    const dev = row?.deviation;
    const contribution = new Map<string, any>((calc.target?.bkp?.contributions ?? []).map((c: any) => [c.controlId, c]));
    const bkp = calc.target?.bkp;
    const residual = calc.residual;
    const sugg = residual?.suggestion;
    const impactSel = (field: string, label: string, disabled: boolean) => (
        <label className="block">
            <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">{label}</span>
            <Select value={scenario[field] === null || scenario[field] === undefined ? '' : String(scenario[field])} disabled={!canEdit || disabled}
                onChange={v => patchScenario({ [field]: v === '' ? null : Number(v) })}>
                <option value="">—</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </Select>
        </label>
    );
    const ip = calc.businessImpact, ii = calc.infosecImpact;
    const etkiLine = isIT
        ? `BT etkisi = 35%×${scenario.gizlilikEtkisi ?? '—'} + 30%×${scenario.butunlukEtkisi ?? '—'} + 35%×${scenario.erisilebilirlikEtkisi ?? '—'} = ${ii.raw === null ? 'hesaplanamadı (boş boyut var)' : `${fmt(ii.raw)} → ${ii.tier}`}`
        : `İş etkisi = 30%×${scenario.finansalEtki ?? '—'} + 30%×${scenario.itibarEtkisi ?? '—'} + 20%×${scenario.regulasyonEtkisi ?? '—'} + 20%×${scenario.musteriEtkisi ?? '—'} = ${ip.raw === null ? 'hesaplanamadı (boş boyut var)' : `${fmt(ip.raw)} → ${ip.tier}`}`;
    const bkpLine = bkp?.bkp === null
        ? `Bütünleşik kontrol = Σ(KEP × ağırlık) — KTS'si boş ${bkp?.contributions?.filter((c: any) => c.kep === null && c.weight > 0).length ?? 0} kontrol nedeniyle hesaplanamadı`
        : `Bütünleşik kontrol = Σ(KEP × ağırlık) = ${(bkp?.contributions ?? []).filter((c: any) => c.weight > 0).map((c: any) => `${fmt(c.kep, 1)}×${fmt(c.weight * 100, 0)}%`).join(' + ') || '0'} = %${fmt(bkp?.bkp, 1)}`;
    const resLine = residual?.risk === null || residual?.risk === undefined
        ? 'Kalıntı risk = hesaplanamadı (etki veya kontrol puanı bilinmiyor)'
        : `Kalıntı = olasılık ${scenario.naturalProbability}→${residual.probability} (−${sugg?.probabilityReduction ?? 0}) × etki ${calc.finalImpactTier}→${residual.impact} (−${sugg?.impactReduction ?? 0}) = ${residual.risk}${residual.isOverridden ? ' · elle değiştirildi' : ''}`;

    return (
        <div>
            <div className="px-5 pt-4 pb-3 border-b border-slate-200">
                <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">{[snap.surec, snap.altSurec].filter(Boolean).join(' › ') || 'Süreç belirtilmemiş'}</div>
                <div className="mt-0.5 text-[17px] text-slate-900"><b className="font-mono">{snap.riskId ?? scenario.name}</b> · {scenario.controls.filter((c: any) => c.isApproved).length} aktif kontrol</div>
                <div className="mt-1.5">
                    {dev && (dev.natural || dev.residual)
                        ? <span className="text-[11px] font-semibold rounded border border-orange-300 bg-orange-50 px-2 py-0.5 text-orange-700">Kayıttan sapıyor{dev.natural ? ' · doğal' : ''}{dev.residual ? ' · kalıntı' : ''}</span>
                        : <span className="text-[11px] font-semibold rounded border border-slate-300 px-2 py-0.5 text-slate-600">Kayıtla uyumlu</span>}
                </div>
            </div>
            <div className="p-5 space-y-4">
                <div className="rounded-xl border border-slate-200">
                    <button type="button" onClick={() => setInfoOpen(o => !o)} className="w-full text-left px-4 py-2.5 text-sm text-slate-700">
                        <b>{infoOpen ? '▾' : '▸'} Kayıt bilgileri</b> · {snap.directorate ?? '—'} · güncelleme {fmtDate(snap.updatedAt)}
                    </button>
                    {infoOpen && (
                        <div className="grid grid-cols-3 gap-x-4 gap-y-3 px-4 pb-4">
                            {[['Risk statü', snap.status], ['Süreç', snap.surec], ['Alt süreç', snap.altSurec], ['Kayıt ID', snap.kayitId], ['İlgili GMY', snap.ilgiliGmy], ['Risk sahibi', snap.riskSahibi],
                              ['Risk işleme', snap.riskIsleme], ['Mutabakat tarihi', fmtDate(snap.mutabakatTarihi)], ['Oluşturma tarihi', fmtDate(snap.createdAt)],
                              ['Güncelleme', fmtDate(snap.updatedAt)], ['Risk sorumlusu', snap.riskSorumlusu], ['Özet', snap.ozet]].map(([k, v]) => (
                                <div key={k as string}>
                                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">{k}</div>
                                    <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700 truncate" title={String(v ?? '')}>{v || '—'}</div>
                                </div>
                            ))}
                            <p className="col-span-3 text-[11px] text-slate-400">Kayıt bilgileri simülasyon oluşturulduğu andaki {fromExcel ? 'Excel kaydıdır' : 'envanter kaydıdır'}; burada değiştirilmez.</p>
                        </div>
                    )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">{snap.description || snap.name}</div>

                <div className="grid grid-cols-3 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="p-4 bg-white">
                        <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Doğal risk</div>
                        <div className="mt-1 text-[28px] font-bold text-slate-900">{calc.naturalRisk?.puan ?? '—'}</div>
                        <LevelBadge label={calc.naturalRisk?.seviye} />
                        <div className="mt-1.5 text-[11px] text-slate-500">Etki {calc.finalImpactTier ?? '—'} × olasılık {scenario.naturalProbability}</div>
                        <div className="text-[11px] font-mono text-slate-500">Kayıt: {row?.record.natural ?? '—'}</div>
                    </div>
                    <div className="p-4 bg-white border-x border-slate-200">
                        <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Bütünleşik kontrol</div>
                        <div className="mt-1 text-[28px] font-bold text-slate-900">{bkp?.bkp === null || bkp?.bkp === undefined ? '—' : `%${fmt(bkp.bkp, 1)}`}</div>
                        <LevelBadge label={row?.bkp.level} />
                        <div className="mt-1.5 text-[11px] text-slate-500">{scenario.controls.filter((c: any) => c.isApproved).length} aktif kontrol · ağırlık %{fmt((calc.weightCheck?.totalWeight ?? 0) * 100, 0)}</div>
                        {bkp?.hasUnknownKts && <div className="text-[11px] text-amber-700">KTS eksik</div>}
                    </div>
                    <div className="p-4 bg-white">
                        <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Kalıntı risk</div>
                        <div className="mt-1 text-[28px] font-bold text-slate-900">{residual?.risk ?? '—'}</div>
                        <LevelBadge label={residual?.level?.label} />
                        <div className="mt-1.5 text-[11px] text-slate-500">Olasılık {residual?.probability ?? '—'} × etki {residual?.impact ?? '—'}</div>
                        <div className="text-[11px] font-mono text-slate-500">Kayıt: {row?.record.residual ?? '—'}</div>
                    </div>
                </div>

                <div className="flex items-end justify-between gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-800">
                        <input type="checkbox" checked={isIT} disabled={!canEdit} onChange={e => patchScenario({ finalImpactChoice: e.target.checked ? 'INFOSEC' : 'BUSINESS' })} className="h-4 w-4" />
                        <b>Flag for IT</b> · BT riski (Gizlilik / Bütünlük / Erişilebilirlik ile ölçülür)
                    </label>
                    <label className="block w-40">
                        <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">Olasılık</span>
                        <Select value={String(scenario.naturalProbability)} disabled={!canEdit} onChange={v => patchScenario({ naturalProbability: Number(v) })}>
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                        </Select>
                    </label>
                </div>
                <div className={`rounded-xl border p-4 ${isIT ? 'border-slate-200 opacity-60' : 'border-slate-300'}`}>
                    <div className="flex items-center justify-between mb-2"><b className="text-sm text-slate-800">İş etkisi</b>
                        <span className={`text-[10px] font-semibold rounded border px-1.5 py-0.5 ${isIT ? 'border-slate-300 text-slate-400' : 'border-blue-600 text-blue-700'}`}>{isIT ? 'Hesapta kullanılmıyor' : 'Etki bu boyutlardan'}</span></div>
                    <div className="grid grid-cols-4 gap-3">
                        {impactSel('finansalEtki', 'Finansal (%30)', false)}{impactSel('itibarEtkisi', 'İtibar (%30)', false)}
                        {impactSel('regulasyonEtkisi', 'Regülasyon (%20)', false)}{impactSel('musteriEtkisi', 'Müşteri (%20)', false)}
                    </div>
                </div>
                <div className={`rounded-xl border p-4 ${isIT ? 'border-slate-300' : 'border-slate-200 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-2"><b className="text-sm text-slate-800">BT etkisi</b>
                        <span className={`text-[10px] font-semibold rounded border px-1.5 py-0.5 ${isIT ? 'border-blue-600 text-blue-700' : 'border-slate-300 text-slate-400'}`}>{isIT ? 'Etki bu boyutlardan' : 'Hesapta kullanılmıyor'}</span></div>
                    <div className="grid grid-cols-4 gap-3">
                        {impactSel('gizlilikEtkisi', 'Gizlilik (%35)', false)}{impactSel('butunlukEtkisi', 'Bütünlük (%30)', false)}{impactSel('erisilebilirlikEtkisi', 'Erişilebilirlik (%35)', false)}
                    </div>
                </div>
                <div className="space-y-2 font-mono text-[12px] text-slate-700">
                    {[etkiLine, bkpLine, resLine].map(l => <div key={l} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 overflow-x-auto whitespace-nowrap">{l}</div>)}
                </div>

                <div className="flex items-center justify-between pt-2">
                    <b className="text-[15px] text-slate-900">Kontroller</b>
                    {canEdit && <Button variant="secondary" size="sm" onClick={addControl}>Kontrol ekle</Button>}
                </div>
                {scenario.controls.length === 0
                    ? <EmptyState title="Bu riske bağlı kontrol yok" description="Kontrol Alanı'nda bu riske bağlı kontrol bulunmuyor; simülasyon için kontrol ekleyebilirsiniz." />
                    : <div className="space-y-3">{scenario.controls.map((c: any) => (
                        <ControlCard key={c.id} scenarioId={scenarioId} control={c} contribution={contribution.get(c.id)} canEdit={canEdit} onChanged={refresh} />
                    ))}</div>}
            </div>
        </div>
    );
}

// ─── Sayfa ─────────────────────────────────────────────────────────────────
export default function SimulationWorkspacePage() {
    const { id } = useParams<{ id: string }>();
    const { hasPermission } = useAuth();
    const canEdit = hasPermission('risk:sim:edit') || hasPermission('risk:view');
    const [ws, setWs] = useState<Workspace | null>(null);
    const [error, setError] = useState<LoadError | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [proc, setProc] = useState('');
    const [pageSize, setPageSize] = useState(30);
    const [page, setPage] = useState(1);
    const [tab, setTab] = useState<'sim' | 'tables' | 'report' | 'heat' | 'method' | 'transfer'>('sim');
    // ?tab=transfer gibi bağlantılar (ör. listedeki bekleyen talepler) ilgili sekmeyi açar.
    useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab'); if (t && ['sim', 'tables', 'report', 'heat', 'method', 'transfer'].includes(t)) setTab(t as typeof tab); }, []);
    const [refreshKey, setRefreshKey] = useState(0);
    const [testName, setTestName] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<'finish' | 'reset' | null>(null);
    const [testBusy, setTestBusy] = useState(false);
    const [saveForm, setSaveForm] = useState<{ name: string; description: string } | null>(null);
    const router = useRouter();
    const { success, error: showError } = useToast();
    const seq = useRef(0);

    const load = useCallback(async () => {
        const my = ++seq.current;
        try {
            const res = await api.getSimWorkspace(id) as Workspace;
            if (my !== seq.current) return;
            setWs(res); setError(null); setRefreshKey(k => k + 1);
            setSelected(prev => prev ?? res.rows[0]?.scenarioId ?? null);
        } catch (e) { if (my === seq.current) setError(classifyLoadError(e, 'Çalışma alanı')); }
    }, [id]);
    useEffect(() => { load(); }, [load]);

    const processes = useMemo(() => [...new Set((ws?.rows ?? []).map(r => r.surec).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'tr')), [ws]);
    const filtered = useMemo(() => (ws?.rows ?? []).filter(r =>
        (!proc || r.surec === proc) &&
        (!search || `${r.riskId} ${r.name}`.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')))), [ws, proc, search]);
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

    if (error) return <PageShell><ErrorState title={error.title} description={error.description} onRetry={error.retryable ? load : undefined} /></PageShell>;
    if (!ws) return <PageShell><LoadingState message="Çalışma alanı yükleniyor..." /></PageShell>;
    const s = ws.summary;
    const selRow = ws.rows.find(r => r.scenarioId === selected);
    const fromExcel = ws.source === 'EXCEL';
    const openRisk = (scenarioId: string) => {
        setSelected(scenarioId); setTab('sim'); setSearch(''); setProc('');
        const idx = ws.rows.findIndex(r => r.scenarioId === scenarioId);
        setPage(idx >= 0 ? Math.floor(idx / pageSize) + 1 : 1);
    };
    const test = ws.activeTest;
    const startTest = async () => {
        const name = (testName ?? '').trim();
        if (!name) { showError('Eksik bilgi', 'Test adı zorunludur.'); return; }
        setTestBusy(true);
        try { await api.startSimTest(ws.simulation.id, name); success('Simülasyon testi başladı', 'Bu andan sonraki değişiklikler raporlanır.'); setTestName(null); await load(); }
        catch (e) { showError('Başlatılamadı', e instanceof ApiError ? e.message : 'Test başlatılamadı.'); }
        finally { setTestBusy(false); }
    };
    const runConfirm = async () => {
        if (!test || !confirm) return;
        setTestBusy(true);
        try {
            if (confirm === 'finish') { await api.finishSimTest(ws.simulation.id, test.id); success('Simülasyon testi bitirildi', 'Rapor bitiş anıyla donduruldu.'); setTab('report'); }
            else { const r = await api.resetSimTest(ws.simulation.id, test.id); success('Veriler test başlangıcına döndü', `${r.restoredRisks} risk geri yüklendi.`); }
            setConfirm(null); await load();
        } catch (e) { showError('İşlem yapılamadı', e instanceof ApiError ? e.message : 'İşlem tamamlanamadı.'); }
        finally { setTestBusy(false); }
    };
    const isDraft = !!ws.simulation.isDraft;
    const saveDraft = async () => {
        if (!saveForm || !saveForm.name.trim()) { showError('Eksik bilgi', 'Simülasyon adı zorunludur.'); return; }
        setTestBusy(true);
        try {
            const saved = await api.saveSimWorkspace(ws.simulation.id, { name: saveForm.name.trim(), description: saveForm.description.trim() || undefined });
            success('Simülasyon kaydedildi', `${saved.simulationId} · ${saved.name}. Kayıtlı simülasyonlar listesinden yeniden açabilirsiniz.`);
            setSaveForm(null); await load();
        } catch (e) { showError('Kaydedilemedi', e instanceof ApiError ? e.message : 'Simülasyon kaydedilemedi.'); }
        finally { setTestBusy(false); }
    };
    const refreshLive = async () => {
        setTestBusy(true);
        try { const r = await api.openLiveSim(true); router.replace(`/risks/simulation/workspace/${r.id}`); }
        catch (e) { showError('Yenilenemedi', e instanceof ApiError ? e.message : 'Güncel veriyle yeniden kurulamadı.'); }
        finally { setTestBusy(false); }
    };
    const defaultTestName = () => `Simülasyon · ${new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`;

    return (
        <PageShell>
            <div className="mb-5">
                <div className="text-[11px] font-bold tracking-[0.12em] text-slate-500 uppercase">Risk Yönetimi · Risk Simülasyonu · {isDraft ? 'Güncel simülatör' : 'Kayıtlı simülasyon'}</div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                    <h1 className="text-[24px] font-bold text-slate-900">{isDraft ? 'Güncel simülatör' : ws.simulation.name} <span className="font-mono text-base text-slate-400">{ws.simulation.simulationId}</span></h1>
                    {isDraft
                        ? <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">Kaydedilmedi</span>
                        : <span className="rounded-full border border-teal-300 bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800">Kayıtlı</span>}
                    {isDraft && canEdit && (
                        <div className="ml-auto flex gap-2">
                            <Button variant="secondary" onClick={refreshLive} loading={testBusy && saveForm === null}>Güncel veriyle yeniden başla</Button>
                            <Button variant="primary" onClick={() => setSaveForm({ name: test?.name ?? '', description: '' })}>Kaydet</Button>
                        </div>
                    )}
                </div>
                {!isDraft && ws.simulation.description && <p className="mt-1 max-w-3xl text-sm font-medium text-slate-700">{ws.simulation.description}</p>}
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                    Etki, olasılık ve kontrol niteliklerini değiştirin; doğal risk, bütünleşik kontrol ve kalıntı risk uygulamanın simülasyon
                    metodolojisiyle anında yeniden hesaplanır. Sapma işareti, sonucun {fromExcel ? 'yüklenen Excel\'deki' : 'envanterdeki'} kayıtlı değerden farklı olduğunu gösterir.
                    Gerçek envanter değişmez.
                </p>
                <div className="mt-1 text-[12px] text-slate-500"><b className="text-slate-600">VERİ</b> {fromExcel ? 'Excel (GRC Risk ve Kontrol tabloları)' : 'Risk Envanteri + Kontrol Alanı'} · oluşturuldu {new Date(ws.simulation.createdAt).toLocaleString('tr-TR')}
                    {ws.simulation.createdBy ? ` · ${ws.simulation.createdBy.firstName} ${ws.simulation.createdBy.lastName}` : ''} · <Link href="/risks/simulation" className="text-blue-700 underline">Simülasyonlar</Link></div>
            </div>

            <div className="grid grid-cols-5 gap-3 mb-5">
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                    <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Risk / aktif kontrol</div>
                    <div className="mt-1 font-mono text-[22px] font-bold text-slate-900">{s.riskCount} / {s.activeControls}</div>
                </div>
                <DistributionCard title="Kalıntı dağılımı (simülasyon)" dist={s.residualDistribution} unknown={s.unknownResidual} />
                <DistributionCard title={fromExcel ? 'Kalıntı dağılımı (Excel kaydı)' : 'Kalıntı dağılımı (envanter kaydı)'} dist={s.recordDistribution} />
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                    <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Kayıttan sapan risk</div>
                    <div className={`mt-1 font-mono text-[22px] font-bold ${s.deviationCount ? 'text-orange-600' : 'text-slate-900'}`}>{s.deviationCount}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                    <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Yapılan değişiklik</div>
                    <div className="mt-1 font-mono text-[22px] font-bold text-slate-900">{s.changedCount}</div>
                </div>
            </div>
            {s.unknownResidual > 0 && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
                    {s.unknownResidual} riskte kalıntı hesaplanamıyor: etki boyutlarından biri boş veya aktif bir kontrolün KTS değeri girilmemiş. Eksik alanları risk kartında doldurabilirsiniz.
                </div>
            )}

            <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-[13px] ${test ? 'border-teal-300 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-600'}`}>
                {test ? (<>
                    <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-teal-600" />
                    <span><b>Simülasyon devam ediyor</b> · {test.name} · başladı {new Date(test.startedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    <div className="ml-auto flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setTab('report')}>Raporu gör</Button>
                        {canEdit && <Button size="sm" variant="secondary" onClick={() => setConfirm('reset')}>Başlangıca dön</Button>}
                        {canEdit && !isDraft && <Button size="sm" variant="primary" onClick={() => setConfirm('finish')}>Simülasyonu bitir</Button>}
                    {canEdit && isDraft && <Button size="sm" variant="primary" onClick={() => setSaveForm({ name: test.name, description: '' })}>Bitir ve kaydet</Button>}
                    </div>
                </>) : testName !== null ? (<>
                    <span>Simülasyon başlar; bu andan sonraki değişiklikler raporlanır.</span>
                    <input autoFocus value={testName} onChange={e => setTestName(e.target.value)} maxLength={200} aria-label="Simülasyon adı"
                        className="min-w-[260px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" placeholder="Simülasyon adı" />
                    <Button size="sm" variant="primary" onClick={startTest} loading={testBusy}>Başlat</Button>
                    <Button size="sm" variant="secondary" onClick={() => setTestName(null)} disabled={testBusy}>Vazgeç</Button>
                </>) : (<>
                    <span>{isDraft
                        ? 'Simülasyonu başlatın, değişikliklerinizi yapın ve kaydedin. Başlangıçtan bu yana yapılanlar raporlanır.'
                        : 'Bu kayıtlı simülasyonda yeniden değişiklik yapıp test etmek için simülasyonu başlatın.'}</span>
                    {canEdit && <Button size="sm" variant="primary" className="ml-auto" onClick={() => setTestName(defaultTestName())}>Simülasyonu başlat</Button>}
                </>)}
            </div>

            <div className="mb-4 flex gap-1 border-b border-slate-200">
                {([['sim', 'Simülatör'], ['tables', 'Excel tabloları'], ['report', 'Simülasyon raporu'], ['heat', 'Isı haritası'], ['method', 'Metodoloji ve sınırlar'], ['transfer', 'Envantere aktar']] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setTab(k)}
                        className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === k ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
                ))}
            </div>

            {tab === 'tables' ? <ExcelTables simulationId={ws.simulation.id} onOpenRisk={openRisk} />
                : tab === 'report' ? <TestReport simulationId={ws.simulation.id} activeTestId={test?.id ?? null} refreshKey={refreshKey} onOpenRisk={openRisk} />
                : tab === 'method' ? <MethodologyPanel simulationId={ws.simulation.id} canEdit={canEdit} onChanged={load} />
                : tab === 'transfer' ? <TransferPanel simulationId={ws.simulation.id} isDraft={isDraft} onChanged={load} />
                : tab === 'heat' ? <HeatMap rows={ws.rows} riskLevels={ws.riskLevels} recordLabel={fromExcel ? 'Excel kaydı' : 'Envanter kaydı'} onOpenRisk={openRisk} /> : (
            <div className="grid grid-cols-[minmax(0,46%)_minmax(0,54%)] gap-4 items-start">
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="px-4 pt-4 pb-3">
                        <div className="text-[15px] text-slate-900"><b>Risk kütüğü</b> <span className="text-slate-500">{ws.rows.length}</span></div>
                        <div className="mt-3 flex gap-2">
                            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="ID veya tanımda ara" className="w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <select value={proc} onChange={e => { setProc(e.target.value); setPage(1); }} className="flex-1 rounded-lg border border-slate-300 px-2.5 py-2 text-sm">
                                <option value="">Tüm süreçler</option>{processes.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>
                    <table className="w-full text-sm">
                        <thead><tr className="text-left text-[11px] font-bold tracking-wider text-slate-500 uppercase border-y border-slate-200">
                            <th className="py-2 pl-4 w-32 whitespace-nowrap">ID</th><th className="py-2">Risk</th><th className="py-2 w-24">Doğal</th><th className="py-2 w-24">Kontrol</th><th className="py-2 pr-3 w-24">Kalıntı</th>
                        </tr></thead>
                        <tbody>
                            {visible.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Filtreye uyan risk yok.</td></tr>}
                            {visible.map(r => (
                                <tr key={r.scenarioId} onClick={() => setSelected(r.scenarioId)}
                                    className={`border-b border-slate-100 cursor-pointer align-top ${selected === r.scenarioId ? 'bg-teal-50/70' : 'hover:bg-slate-50'}`}>
                                    <td className="py-2.5 pl-4">
                                        <div className="font-mono text-slate-800 whitespace-nowrap">{r.riskId}</div>
                                        {(r.deviation.natural || r.deviation.residual) && <div className="text-[10px] font-semibold text-orange-600">● sapma</div>}
                                        {r.changed && <div className="text-[10px] font-semibold text-blue-600">● değişti</div>}
                                    </td>
                                    <td className="py-2.5 pr-2 text-slate-800"><div className="line-clamp-2">{r.name}</div></td>
                                    <td className="py-2.5"><div className="font-mono">{r.natural ? `${r.natural.impact}×${r.natural.probability}=${r.natural.puan}` : '—'}</div><LevelBadge label={r.natural?.level} /></td>
                                    <td className="py-2.5"><div className="font-mono">{r.bkp.value === null ? (r.bkp.unknownKts ? 'KTS?' : '—') : `%${fmt(r.bkp.value, 1)}`}</div><LevelBadge label={r.bkp.level} /></td>
                                    <td className="py-2.5 pr-3"><div className="font-mono">{r.residual ? r.residual.risk : '—'}</div><LevelBadge label={r.residual?.level} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-600">
                        <label className="flex items-center gap-2">Sayfa başına
                            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="rounded-lg border border-slate-300 px-2 py-1">{[15, 30, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</select>
                        </label>
                        <span className="font-mono">{filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} / {filtered.length}</span>
                        <div className="flex gap-1">
                            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">‹ Önceki</button>
                            <span className="px-2 py-1">{page} / {pages}</span>
                            <button type="button" disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">Sonraki ›</button>
                        </div>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    {selected ? <RiskDetail key={selected} scenarioId={selected} row={selRow} canEdit={canEdit} onChanged={load} fromExcel={fromExcel} />
                        : <EmptyState title="Risk seçin" description="Soldaki kütükten bir risk seçtiğinizde ayrıntıları burada açılır." />}
                </div>
            </div>
            )}
            <Modal open={saveForm !== null} onClose={() => !testBusy && setSaveForm(null)} title="Simülasyonu kaydet" size="md"
                footer={<><Button variant="secondary" onClick={() => setSaveForm(null)} disabled={testBusy}>Vazgeç</Button><Button variant="primary" onClick={saveDraft} loading={testBusy}>Kaydet</Button></>}>
                {saveForm && (
                    <div className="space-y-4">
                        <Input label="Ad" value={saveForm.name} onChange={e => setSaveForm({ ...saveForm, name: e.target.value })} maxLength={200} placeholder="örn. Ana kontrol KTS 90 senaryosu" />
                        <Textarea label="Açıklama (isteğe bağlı)" value={saveForm.description} onChange={e => setSaveForm({ ...saveForm, description: e.target.value })} rows={3} maxLength={5000} />
                        <p className="text-xs text-slate-500">
                            {test ? 'Devam eden simülasyon bitirilir; raporu bu anın durumuyla saklanır. ' : ''}
                            Kayıtlı simülasyonlar listesinden açıp neler yaptığınızı görebilir, yeniden değiştirip test edebilirsiniz. Güncel simülatör bir sonraki açılışta en güncel veriyle yeniden kurulur.
                        </p>
                    </div>
                )}
            </Modal>
            <ConfirmDialog open={confirm !== null} onClose={() => !testBusy && setConfirm(null)} onConfirm={runConfirm} loading={testBusy}
                variant={confirm === 'reset' ? 'danger' : 'warning'}
                title={confirm === 'reset' ? 'Başlangıca dönülsün mü?' : 'Simülasyon bitirilsin mi?'}
                message={confirm === 'reset'
                    ? 'Test başladığından bu yana simülasyonda yapılan tüm değişiklikler geri alınır (risk girdileri ve kontroller). Gerçek envanter etkilenmez. Değişiklik günlüğü korunur.'
                    : 'Rapor bu anın durumuyla dondurulur ve test geçmişte saklanır. Simülasyonda çalışmaya devam edebilir, yeni bir test başlatabilirsiniz.'}
                confirmLabel={confirm === 'reset' ? 'Başlangıca dön' : 'Simülasyonu bitir'} cancelLabel="Vazgeç" />
        </PageShell>
    );
}
