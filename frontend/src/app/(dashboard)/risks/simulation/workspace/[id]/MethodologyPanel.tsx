'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { ApiError } from '@/lib/api';
import { classifyLoadError, type LoadError } from '@/lib/load-error';
import { LoadingState, ErrorState, Button, Modal, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';

/*
 * Metodoloji ve sınırlar. Simülasyonun kullandığı ayarı gösterir; herkes bu simülasyonda
 * deneme ayarı uygulayabilir (resmî ayarı değiştirmez). Sistem Yöneticisi aynı formdan yeni
 * bir resmî sürüm yayınlayabilir; yeni simülasyonlar onu kullanır.
 */

type PMap = Record<string, number>;
export interface MethodologySettings {
    p1: PMap; p2: PMap; p3: PMap; p4: PMap; p5: PMap;
    kypWeightPct: number;
    businessWeightsPct: { financial: number; reputation: number; regulatory: number; customer: number };
    infosecWeightsPct: { confidentiality: number; integrity: number; availability: number };
    riskLevelUpperBounds: number[];
    bkpUpperBounds: number[];
    bkpTierReductions: number[];
    rounding: 'ROUND_HALF_UP' | 'CEIL' | 'FLOOR';
}
interface ForSim {
    current: { id: string; version: number | null; isTrial: boolean; basedOnVersion: number | null; changeNote: string | null; settings: MethodologySettings };
    official: { id: string; version: number; settings: MethodologySettings };
    usesLatestOfficial: boolean;
}
interface Official { versions: { id: string; version: number; isActive: boolean; changeNote: string | null; createdAt: string; createdBy?: { firstName: string; lastName: string } }[] }

const P_DEFS: { key: 'p1' | 'p2' | 'p3' | 'p4' | 'p5'; title: string; options: [string, string][] }[] = [
    { key: 'p1', title: 'P1 · Kontrol türü', options: [['MANUEL', 'Manuel'], ['BT_MANUEL', 'BT Manuel'], ['OTOMATIK', 'Otomatik']] },
    { key: 'p2', title: 'P2 · Kontrol işlevi', options: [['TESPIT_EDICI', 'Tespit Edici'], ['DUZELTICI', 'Düzeltici'], ['ONLEYICI', 'Önleyici']] },
    { key: 'p3', title: 'P3 · Kontrolün işletilme şekli', options: [['IZ_KAYDI_YOK', 'Kontrolün iz kaydı yoktur.'], ['KULLANICI_SIFRE_SES_EMAIL', 'Kullanıcı adı / parola / ses kaydı / ortak alan / e-mail'], ['SISTEM_LOG_ISLAK_IMZA', 'Sistem logları veya ıslak imza ile kayıt altında'], ['ELEKTRONIK_IMZA', 'Elektronik imza ile gerçekleştiriliyor']] },
    { key: 'p4', title: 'P4 · Kontrol işletiminin denetimi', options: [['YOK', 'Bulunmamaktadır.'], ['AYNI_EKIP', 'Aynı ekipteki çalışanlarca kontrol'], ['FARKLI_EKIP', 'Farklı ekiplerdeki çalışanlarca kontrol'], ['HER_IKISI', 'Her ikisi de yapılmaktadır.']] },
    { key: 'p5', title: 'P5 · Kontrol işletiminin raporlanması', options: [['YOK', 'Bulunmamaktadır.'], ['DUZENSIZ_UST_AMIR', 'Düzensiz aralıklarla üst amirlere'], ['DUZENLI_UST_AMIR', 'Düzenli aralıklarla üst amirlere'], ['FARKLI_BIRIM_GOZETIM', 'Farklı birimlere (RKD/BGD vb.) + gözetim']] },
];
const LEVELS = ['Çok Düşük', 'Düşük', 'Orta', 'Yüksek', 'Çok Yüksek'];
const BKP = ['Çok Zayıf', 'Zayıf', 'Orta', 'Güçlü', 'Çok Güçlü'];
const n2 = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

function Num({ value, onChange, disabled, step = 0.1, min = 0, max = 100, suffix }: { value: number; onChange: (v: number) => void; disabled?: boolean; step?: number; min?: number; max?: number; suffix?: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            <input type="number" value={Number.isFinite(value) ? value : ''} step={step} min={min} max={max} disabled={disabled}
                onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right font-mono text-sm disabled:bg-slate-50 disabled:text-slate-500" />
            {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
        </span>
    );
}

function Section({ no, title, children, note }: { no: number; title: string; children: React.ReactNode; note?: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-[15px] font-semibold text-slate-900">{no} · {title}</div>
            {children}
            {note && <p className="mt-3 text-[12px] text-slate-500">{note}</p>}
        </div>
    );
}

export function MethodologyPanel({ simulationId, canEdit, onChanged }: { simulationId: string; canEdit: boolean; onChanged: () => void }) {
    const { user } = useAuth();
    const isAdmin = user?.role?.name === 'SYSTEM_ADMIN' || user?.role?.name === 'ADMIN';
    const [data, setData] = useState<ForSim | null>(null);
    const [official, setOfficial] = useState<Official | null>(null);
    const [form, setForm] = useState<MethodologySettings | null>(null);
    const [error, setError] = useState<LoadError | null>(null);
    const [busy, setBusy] = useState(false);
    const [publishNote, setPublishNote] = useState<string | null>(null);
    const { success, error: showError } = useToast();
    const seq = useRef(0);

    const load = useCallback(async () => {
        const my = ++seq.current;
        try {
            const [d, o] = await Promise.all([api.getWorkspaceMethodology(simulationId), api.getSimMethodologies()]);
            if (my !== seq.current) return;
            setData(d); setOfficial(o); setForm(structuredClone(d.current.settings)); setError(null);
        } catch (e) { if (my === seq.current) setError(classifyLoadError(e, 'Metodoloji')); }
    }, [simulationId]);
    useEffect(() => { load(); }, [load]);

    const dirty = useMemo(() => !!data && !!form && JSON.stringify(form) !== JSON.stringify(data.current.settings), [data, form]);
    const set = (fn: (f: MethodologySettings) => void) => setForm(prev => { if (!prev) return prev; const next = structuredClone(prev); fn(next); return next; });

    if (error) return <ErrorState title={error.title} description={error.description} onRetry={error.retryable ? load : undefined} />;
    if (!data || !form) return <LoadingState message="Metodoloji yükleniyor..." />;

    const editable = canEdit;
    const bizSum = Object.values(form.businessWeightsPct).reduce((a, b) => a + (b || 0), 0);
    const itSum = Object.values(form.infosecWeightsPct).reduce((a, b) => a + (b || 0), 0);
    const divisor = P_DEFS.reduce((a, p) => a + Math.max(...Object.values(form[p.key]).map(v => v || 0)), 0);
    const u = form.riskLevelUpperBounds;
    const ranges = LEVELS.map((l, i) => {
        const lo = i === 0 ? 1 : (u[i - 1] ?? 0) + 1; const hi = i === 4 ? 25 : u[i];
        return `${l}: ${lo === hi ? lo : `${lo}–${hi}`}`;
    });

    const apply = async () => {
        setBusy(true);
        try { await api.setTrialMethodology(simulationId, form); success('Deneme ayarı uygulandı', 'Bu simülasyonun riskleri yeni ayarla yeniden hesaplandı. Resmî ayar değişmedi.'); await load(); onChanged(); }
        catch (e) { showError('Uygulanamadı', e instanceof ApiError ? e.message : 'Ayar uygulanamadı.'); }
        finally { setBusy(false); }
    };
    const useOfficial = async () => {
        setBusy(true);
        try { await api.useOfficialMethodology(simulationId); success('Resmî ayar uygulandı', `Simülasyon resmî sürüm v${data.official.version} ile hesaplanıyor.`); await load(); onChanged(); }
        catch (e) { showError('Uygulanamadı', e instanceof ApiError ? e.message : 'Resmî ayar uygulanamadı.'); }
        finally { setBusy(false); }
    };
    const publish = async () => {
        if (!publishNote?.trim()) { showError('Eksik bilgi', 'Değişiklik notu zorunludur.'); return; }
        setBusy(true);
        try { const r = await api.publishSimMethodology(form, publishNote.trim()); success('Resmî ayar yayınlandı', `Sürüm v${r.version}; yeni simülasyonlar bu sürümü kullanır.`); setPublishNote(null); await load(); }
        catch (e) { showError('Yayınlanamadı', e instanceof ApiError ? e.message : 'Resmî ayar yayınlanamadı.'); }
        finally { setBusy(false); }
    };

    return (
        <div className="space-y-4">
            <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${data.current.isTrial ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                <div className="min-w-0 flex-1 text-[13px]">
                    {data.current.isTrial
                        ? <><b className="text-amber-900">Deneme ayarı</b> <span className="text-amber-800">· resmî v{data.current.basedOnVersion} tabanlı · yalnız bu simülasyonda geçerli</span></>
                        : <><b className="text-slate-900">Resmî ayar v{data.current.version}</b>{data.current.changeNote && <span className="text-slate-500"> · {data.current.changeNote}</span>}</>}
                    {!data.usesLatestOfficial && !data.current.isTrial && <div className="text-[12px] text-amber-700">Daha yeni bir resmî sürüm var (v{data.official.version}). Bu simülasyon kendi sürümüyle hesaplanmaya devam eder.</div>}
                </div>
                {editable && (data.current.isTrial || !data.usesLatestOfficial) && <Button size="sm" variant="secondary" onClick={useOfficial} loading={busy}>Güncel resmî ayarı uygula (v{data.official.version})</Button>}
                {editable && dirty && <Button size="sm" variant="secondary" onClick={() => setForm(structuredClone(data.current.settings))} disabled={busy}>Değişiklikleri geri al</Button>}
                {editable && <Button size="sm" variant="primary" onClick={apply} disabled={!dirty} loading={busy && publishNote === null}>Bu simülasyonda dene</Button>}
                {isAdmin && <Button size="sm" variant="outline" onClick={() => setPublishNote('')} disabled={busy}>Resmî ayar olarak yayınla</Button>}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Section no={1} title="Etki ağırlıkları" note="Grup içinde bir boyut boşsa o grubun etkisi hesaplanmaz. Ağırlıklı etki seçilen kurala göre 1–5 kademeye yuvarlanır.">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <div className="col-span-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">İş etkisi (Flag for IT boş) · toplam <span className={Math.abs(bizSum - 100) > 0.01 ? 'text-red-600' : ''}>%{n2(bizSum)}</span></div>
                        {([['financial', 'Finansal'], ['reputation', 'İtibar'], ['regulatory', 'Regülasyon'], ['customer', 'Müşteri']] as const).map(([k, l]) => (
                            <label key={k} className="flex items-center justify-between gap-2">{l}<Num value={form.businessWeightsPct[k]} disabled={!editable} onChange={v => set(f => { f.businessWeightsPct[k] = v; })} suffix="%" /></label>
                        ))}
                        <div className="col-span-2 mt-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">BT etkisi (Flag for IT = 1) · toplam <span className={Math.abs(itSum - 100) > 0.01 ? 'text-red-600' : ''}>%{n2(itSum)}</span></div>
                        {([['confidentiality', 'Gizlilik'], ['integrity', 'Bütünlük'], ['availability', 'Erişilebilirlik']] as const).map(([k, l]) => (
                            <label key={k} className="flex items-center justify-between gap-2">{l}<Num value={form.infosecWeightsPct[k]} disabled={!editable} onChange={v => set(f => { f.infosecWeightsPct[k] = v; })} suffix="%" /></label>
                        ))}
                        <label className="col-span-2 mt-2 flex items-center justify-between gap-2">Etki yuvarlama
                            <select value={form.rounding} disabled={!editable} onChange={e => set(f => { f.rounding = e.target.value as MethodologySettings['rounding']; })} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                                <option value="ROUND_HALF_UP">En yakın (yarım yukarı)</option><option value="CEIL">Yukarı</option><option value="FLOOR">Aşağı</option>
                            </select>
                        </label>
                    </div>
                </Section>

                <Section no={2} title="Doğal risk seviye sınırları" note={<>Doğal risk puanı = etki × olasılık (1–25). {ranges.join(' · ')}</>}>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        {LEVELS.slice(0, 4).map((l, i) => (
                            <label key={l} className="flex items-center justify-between gap-2">{l} üst sınırı<Num value={u[i]} step={1} min={1} max={24} disabled={!editable} onChange={v => set(f => { f.riskLevelUpperBounds[i] = v; })} /></label>
                        ))}
                    </div>
                </Section>

                <Section no={3} title="Bütünleşik kontrol kademeleri" note="Bütünleşik kontrol puanı 0–100. Seviyeye göre kalıntı riskte olasılık/etki kademesi bu kadar düşürülür.">
                    <table className="w-full text-sm">
                        <thead><tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-1">Seviye</th><th className="py-1">Üst sınır</th><th className="py-1">Kademe düşürme</th></tr></thead>
                        <tbody>
                            {BKP.map((l, i) => (
                                <tr key={l} className="border-t border-slate-100">
                                    <td className="py-1.5">{l}</td>
                                    <td className="py-1.5">{i < 4 ? <Num value={form.bkpUpperBounds[i]} step={1} disabled={!editable} onChange={v => set(f => { f.bkpUpperBounds[i] = v; })} /> : <span className="font-mono text-slate-500">100</span>}</td>
                                    <td className="py-1.5"><Num value={form.bkpTierReductions[i]} step={1} min={0} max={4} disabled={!editable} onChange={v => set(f => { f.bkpTierReductions[i] = v; })} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Section>

                <Section no={4} title="Kontrol etkinlik puanı" note={`Kontrol puanı = P1 + … + P5 (en fazla ${n2(divisor)}). Kontrol etkinlik puanı = (kontrol puanı / ${n2(divisor)} × 100) × kontrol puanı payı + KTS × KTS payı.`}>
                    <label className="flex items-center justify-between gap-2 text-sm">Kontrol puanı payı<Num value={form.kypWeightPct} step={5} disabled={!editable} onChange={v => set(f => { f.kypWeightPct = v; })} suffix="%" /></label>
                    <div className="mt-2 flex items-center justify-between text-sm text-slate-600"><span>KTS payı</span><span className="font-mono">%{n2(100 - (form.kypWeightPct || 0))}</span></div>
                </Section>
            </div>

            <Section no={5} title="Kontrol puanı: P parametreleri" note="Seçenek metinleri GRC Kontrol Excel'indeki hücre değerleridir; burada yalnız puanlar değiştirilir.">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {P_DEFS.map(p => (
                        <div key={p.key} className="rounded-xl border border-slate-200 p-3">
                            <div className="mb-2 text-sm font-semibold text-slate-800">{p.title} <span className="font-normal text-slate-500">· en fazla {n2(Math.max(...Object.values(form[p.key]).map(v => v || 0)))}</span></div>
                            {p.options.map(([k, l]) => (
                                <label key={k} className="flex items-center justify-between gap-2 py-0.5 text-[13px]">
                                    <span className="min-w-0 truncate" title={l}>{l}</span>
                                    <Num value={form[p.key][k]} step={0.5} max={5} disabled={!editable} onChange={v => set(f => { f[p.key][k] = v; })} />
                                </label>
                            ))}
                        </div>
                    ))}
                </div>
            </Section>

            {official && (
                <Section no={6} title="Resmî sürüm geçmişi">
                    <table className="w-full text-[13px]">
                        <thead><tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-1">Sürüm</th><th className="py-1">Not</th><th className="py-1">Yayınlayan</th><th className="py-1">Tarih</th></tr></thead>
                        <tbody>
                            {official.versions.map(v => (
                                <tr key={v.id} className="border-t border-slate-100">
                                    <td className="py-1.5 font-mono">v{v.version}{v.isActive && <span className="ml-2 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">GÜNCEL</span>}</td>
                                    <td className="py-1.5">{v.changeNote ?? '—'}</td>
                                    <td className="py-1.5">{v.createdBy ? `${v.createdBy.firstName} ${v.createdBy.lastName}` : '—'}</td>
                                    <td className="py-1.5">{new Date(v.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Section>
            )}

            <Modal open={publishNote !== null} onClose={() => !busy && setPublishNote(null)} title="Resmî ayar olarak yayınla" size="md"
                footer={<><Button variant="secondary" onClick={() => setPublishNote(null)} disabled={busy}>Vazgeç</Button><Button variant="primary" onClick={publish} loading={busy}>Yayınla</Button></>}>
                <div className="space-y-3">
                    <p className="text-sm text-slate-600">
                        Formdaki ayarlar yeni bir resmî sürüm (v{data.official.version + 1}) olarak yayınlanır. Yeni simülasyonlar ve güncel simülatör bu sürümü kullanır;
                        kayıtlı simülasyonlar kendi sürümünde kalır (istenirse &quot;Güncel resmî ayarı uygula&quot; ile geçirilir).
                    </p>
                    <Textarea label="Değişiklik notu" value={publishNote ?? ''} onChange={e => setPublishNote(e.target.value)} rows={3} maxLength={2000} placeholder="örn. Etki yuvarlaması yukarı olarak değiştirildi" />
                </div>
            </Modal>
        </div>
    );
}
