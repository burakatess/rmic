'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api, { ApiError } from '@/lib/api';
import { PageShell, PageHeader, Button, Modal, Input, Select, Textarea, StatusBadge, KpiCard, KpiGrid, Tabs, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';

const P1_OPTIONS = [{ value: 'MANUEL', label: 'Manuel (0.5)' }, { value: 'BT_MANUEL', label: 'BT Manuel (1.0)' }, { value: 'OTOMATIK', label: 'Otomatik (1.5)' }];
const P2_OPTIONS = [{ value: 'TESPIT_EDICI', label: 'Tespit Edici (0.5)' }, { value: 'DUZELTICI', label: 'Düzeltici (1.0)' }, { value: 'ONLEYICI', label: 'Önleyici (1.5)' }];
const P3_OPTIONS = [
    { value: 'IZ_KAYDI_YOK', label: 'İz kaydı yok (0)' },
    { value: 'KULLANICI_SIFRE_SES_EMAIL', label: 'Kullanıcı/şifre/ses/e-posta (0.5)' },
    { value: 'SISTEM_LOG_ISLAK_IMZA', label: 'Sistem logu / ıslak imza (1.0)' },
    { value: 'ELEKTRONIK_IMZA', label: 'Elektronik imza (1.5)' },
];
const P4_OPTIONS = [
    { value: 'YOK', label: 'Yok (0)' }, { value: 'AYNI_EKIP', label: 'Aynı ekip (0.5)' },
    { value: 'FARKLI_EKIP', label: 'Farklı ekip (1.0)' }, { value: 'HER_IKISI', label: 'Her ikisi (1.5)' },
];
const P5_OPTIONS = [
    { value: 'YOK', label: 'Yok (0)' }, { value: 'DUZENSIZ_UST_AMIR', label: 'Düzensiz üst amir (0.5)' },
    { value: 'DUZENLI_UST_AMIR', label: 'Düzenli üst amir (1.0)' }, { value: 'FARKLI_BIRIM_GOZETIM', label: 'Farklı birim + gözetim (1.5)' },
];
const IMPACT_AREA_OPTIONS = [{ value: 'PROBABILITY', label: 'Olasılığı azaltır' }, { value: 'IMPACT', label: 'Etkiyi azaltır' }, { value: 'BOTH', label: 'Her ikisini de azaltır' }];

const CONTROL_TABLE_COLS = [
    { key: 'name', label: 'Kontrol', defaultWidth: 220, minWidth: 140 },
    { key: 'p1', label: 'P1', defaultWidth: 140, minWidth: 90 },
    { key: 'p2', label: 'P2', defaultWidth: 140, minWidth: 90 },
    { key: 'p3', label: 'P3', defaultWidth: 180, minWidth: 100 },
    { key: 'p4', label: 'P4', defaultWidth: 140, minWidth: 90 },
    { key: 'p5', label: 'P5', defaultWidth: 180, minWidth: 100 },
    { key: 'kts', label: 'KTS', defaultWidth: 190, minWidth: 130 },
    { key: 'weight', label: 'Ağırlık %', defaultWidth: 110, minWidth: 80 },
    { key: 'impactArea', label: 'Etki Alanı', defaultWidth: 170, minWidth: 110 },
    { key: 'actions', label: '', defaultWidth: 70, minWidth: 60 },
];

/** Sütun genişlikleri tarayıcıda (localStorage) hatırlanır — yalnızca bu
 * görüntüleyenin kişisel tercihi, sunucuya veya diğer kullanıcılara yansımaz. */
function useResizableColumns(storageKey: string, columns: { key: string; defaultWidth: number; minWidth: number }[]) {
    const [widths, setWidths] = useState<Record<string, number>>(() => {
        const defaults = Object.fromEntries(columns.map(c => [c.key, c.defaultWidth]));
        if (typeof window === 'undefined') return defaults;
        try {
            const saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
            return { ...defaults, ...saved };
        } catch {
            return defaults;
        }
    });

    const startResize = useCallback((key: string, minWidth: number) => (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = widths[key] ?? minWidth;
        const onMove = (ev: MouseEvent) => {
            setWidths(prev => ({ ...prev, [key]: Math.max(minWidth, startWidth + (ev.clientX - startX)) }));
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            setWidths(current => {
                try { window.localStorage.setItem(storageKey, JSON.stringify(current)); } catch { /* per-viewer convenience only */ }
                return current;
            });
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [widths, storageKey]);

    return { widths, startResize };
}

function ResizableTh({ label, colKey, width, minWidth, onResizeStart, className = '' }: { label: React.ReactNode; colKey: string; width: number; minWidth: number; onResizeStart: (key: string, minWidth: number) => (e: React.MouseEvent) => void; className?: string }) {
    return (
        <th className={`relative py-1 pr-2 select-none ${className}`} style={{ width }}>
            {label}
            <span
                onMouseDown={onResizeStart(colKey, minWidth)}
                className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-blue-200/60 active:bg-blue-300"
                title="Sürükleyerek genişliği ayarlayın"
            />
        </th>
    );
}

function levelVariant(label?: string | null): 'critical' | 'high' | 'medium' | 'low' | 'success' | 'neutral' {
    switch (label) {
        case 'Çok Yüksek': return 'critical';
        case 'Yüksek': return 'high';
        case 'Orta': return 'medium';
        case 'Düşük': return 'low';
        case 'Çok Düşük': return 'success';
        default: return 'neutral';
    }
}
function fmt(n: number | null | undefined, digits = 1) {
    return n === null || n === undefined ? '—' : n.toFixed(digits);
}

// SIM_METHODOLOGY_V1'in BKP seviye tablosuyla birebir (calculation-engine.ts::METHODOLOGY_V1.bkpLevels) —
// olasılığa/etkiye özel kontrol gücünü aynı 5 kademeye etiketlemek için burada tekrarlanıyor.
function bkpLevelLabel(strength: number | null | undefined): string {
    if (strength === null || strength === undefined) return 'KTS bilinmiyor';
    if (strength <= 20) return 'Çok Zayıf';
    if (strength <= 40) return 'Zayıf';
    if (strength <= 60) return 'Orta';
    if (strength <= 80) return 'Güçlü';
    return 'Çok Güçlü';
}

function ControlRow({ scenarioId, control, onChanged, onRemoved, canEdit, missingKts }: { scenarioId: string; control: any; onChanged: () => void; onRemoved: () => void; canEdit: boolean; missingKts: boolean }) {
    const { error: showError } = useToast();
    const [saving, setSaving] = useState(false);
    const patch = async (data: any) => {
        setSaving(true);
        try {
            await api.updateSimControl(scenarioId, control.id, data);
            onChanged();
        } catch (e) {
            showError('Hata', e instanceof ApiError ? e.message : 'Kontrol güncellenemedi.');
        } finally { setSaving(false); }
    };
    return (
        <tr className={`border-b border-slate-100 ${saving ? 'opacity-60' : ''} ${missingKts ? 'bg-amber-50/60' : ''}`}>
            <td className="py-2 pr-3 align-top">
                <div className="font-medium text-slate-800 text-sm">{control.name}</div>
                {control.sourceControlId ? <span className="text-[11px] text-emerald-600">Gerçek envanterden</span> : <span className="text-[11px] text-amber-600">Yalnızca simülasyon</span>}
                {missingKts && <div className="text-[11px] font-medium text-amber-700 mt-0.5">⚠ KTS eksik — bu kontrol BKP&apos;yi &quot;bilinmiyor&quot; yapıyor</div>}
            </td>
            <td className="py-2 pr-2 align-top"><Select value={control.p1} disabled={!canEdit} onChange={e => patch({ p1: e.target.value })} options={P1_OPTIONS} /></td>
            <td className="py-2 pr-2 align-top"><Select value={control.p2} disabled={!canEdit} onChange={e => patch({ p2: e.target.value })} options={P2_OPTIONS} /></td>
            <td className="py-2 pr-2 align-top"><Select value={control.p3} disabled={!canEdit} onChange={e => patch({ p3: e.target.value })} options={P3_OPTIONS} /></td>
            <td className="py-2 pr-2 align-top"><Select value={control.p4} disabled={!canEdit} onChange={e => patch({ p4: e.target.value })} options={P4_OPTIONS} /></td>
            <td className="py-2 pr-2 align-top"><Select value={control.p5} disabled={!canEdit} onChange={e => patch({ p5: e.target.value })} options={P5_OPTIONS} /></td>
            <td className="py-2 pr-2 align-top">
                <Select value={control.ktsMode} disabled={!canEdit} onChange={e => patch({ ktsMode: e.target.value })}
                    options={[{ value: 'MANUAL', label: 'Hipotetik (elle)' }, { value: 'FROM_TEST', label: 'Gerçek testten' }]} />
                {control.ktsMode === 'MANUAL' && (
                    <>
                        <Input type="number" min={0} max={100} className={`mt-1 ${missingKts ? 'border-amber-400' : ''}`} value={control.ktsManualValue ?? ''} disabled={!canEdit}
                            onChange={e => patch({ ktsManualValue: e.target.value === '' ? null : Number(e.target.value) })} placeholder="0-100 (zorunlu)" />
                        {(control.ktsManualValue === null || control.ktsManualValue === undefined) && (
                            <div className="text-[11px] text-amber-600 mt-1">KTS değeri girilmedi</div>
                        )}
                    </>
                )}
                {control.ktsMode === 'FROM_TEST' && <div className="text-[11px] text-slate-400 mt-1">KTS bilinmiyor (onaylı sayısal test sonucu yok — bu kontrol için &quot;Hipotetik (elle)&quot; seçip değer girmeniz gerekir)</div>}
            </td>
            <td className="py-2 pr-2 align-top">
                <Input type="number" min={0} max={100} disabled={!canEdit} value={Math.round(control.weight * 100)}
                    className={control.weight === 0 ? 'border-amber-400' : ''}
                    onChange={e => patch({ weight: Math.max(0, Math.min(100, Number(e.target.value))) / 100 })} />
                {control.weight === 0 && <div className="text-[11px] text-amber-600 mt-1">Ağırlık 0 — katkısı yok</div>}
            </td>
            <td className="py-2 pr-2 align-top"><Select value={control.impactArea} disabled={!canEdit} onChange={e => patch({ impactArea: e.target.value })} options={IMPACT_AREA_OPTIONS} /></td>
            <td className="py-2 align-top">
                {canEdit && <Button variant="ghost" size="xs" onClick={onRemoved}>Kaldır</Button>}
            </td>
        </tr>
    );
}

function AddControlModal({ scenarioId, open, onClose, onAdded }: { scenarioId: string; open: boolean; onClose: () => void; onAdded: () => void }) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const { success, error: showError } = useToast();
    const submit = async () => {
        if (!name.trim()) { showError('Eksik bilgi', 'Kontrol adı zorunludur.'); return; }
        setSaving(true);
        try {
            await api.addSimControl(scenarioId, {
                name: name.trim(), p1: 'MANUEL', p2: 'TESPIT_EDICI', p3: 'IZ_KAYDI_YOK', p4: 'YOK', p5: 'YOK',
                ktsMode: 'MANUAL', weight: 0, impactArea: 'BOTH',
            });
            success('Eklendi', 'Hipotetik kontrol eklendi.');
            setName('');
            onAdded();
        } catch (e) {
            showError('Hata', e instanceof ApiError ? e.message : 'Kontrol eklenemedi.');
        } finally { setSaving(false); }
    };
    return (
        <Modal open={open} onClose={onClose} title="Hipotetik Kontrol Ekle" size="sm"
            footer={<><Button variant="secondary" onClick={onClose}>Vazgeç</Button><Button variant="primary" loading={saving} onClick={submit}>Ekle</Button></>}>
            <Input label="Kontrol Adı" value={name} onChange={e => setName(e.target.value)} placeholder="örn. Otomatik anomali izleme" />
            <p className="text-xs text-slate-500 mt-2">Yalnızca bu senaryoda var olacak, gerçek envantere bağlı olmayan bir kontrol.</p>
        </Modal>
    );
}

function AddActionModal({ scenarioId, controls, open, onClose, onAdded }: { scenarioId: string; controls: any[]; open: boolean; onClose: () => void; onAdded: () => void }) {
    const [name, setName] = useState('');
    const [targetControlSimId, setTargetControlSimId] = useState('');
    const [effectMode, setEffectMode] = useState<'TARGET_KEP' | 'P1P5_KTS'>('TARGET_KEP');
    const [targetKep, setTargetKep] = useState(70);
    const [targetKepReason, setTargetKepReason] = useState('');
    const [saving, setSaving] = useState(false);
    const { success, error: showError } = useToast();

    const submit = async () => {
        if (!name.trim() || !targetControlSimId) { showError('Eksik bilgi', 'Ad ve hedef kontrol zorunludur.'); return; }
        if (effectMode === 'TARGET_KEP' && !targetKepReason.trim()) { showError('Eksik bilgi', 'Hedef KEP girişleri için gerekçe zorunludur.'); return; }
        setSaving(true);
        try {
            await api.addSimAction(scenarioId, {
                name: name.trim(), targetControlSimId, effectMode,
                ...(effectMode === 'TARGET_KEP' ? { targetKep, targetKepReason: targetKepReason.trim() } : {}),
                isApplied: false, priority: 0,
            });
            success('Eklendi', 'Aksiyon eklendi (henüz uygulanmadı).');
            setName(''); setTargetKepReason('');
            onAdded();
        } catch (e) {
            showError('Hata', e instanceof ApiError ? e.message : 'Aksiyon eklenemedi.');
        } finally { setSaving(false); }
    };

    return (
        <Modal open={open} onClose={onClose} title="Aksiyon Ekle" size="md"
            footer={<><Button variant="secondary" onClick={onClose}>Vazgeç</Button><Button variant="primary" loading={saving} onClick={submit}>Ekle</Button></>}>
            <div className="space-y-4">
                <Input label="Aksiyon Adı" value={name} onChange={e => setName(e.target.value)} placeholder="örn. Kontrolü otomatikleştir" />
                <Select label="Hedef Kontrol" value={targetControlSimId} onChange={e => setTargetControlSimId(e.target.value)}
                    placeholder="Kontrol seçin..." options={controls.map(c => ({ value: c.id, label: c.name }))} />
                <Select label="Etki Modeli" value={effectMode} onChange={e => setEffectMode(e.target.value as any)}
                    options={[{ value: 'TARGET_KEP', label: 'Doğrudan hedef KEP gir' }, { value: 'P1P5_KTS', label: 'P1-P5 / KTS değişikliği (senaryoda düzenlenir)' }]} />
                {effectMode === 'TARGET_KEP' && (
                    <>
                        <Input type="number" min={0} max={100} label="Hedef KEP (0-100)" value={targetKep} onChange={e => setTargetKep(Number(e.target.value))} />
                        <Textarea label="Gerekçe (zorunlu)" value={targetKepReason} onChange={e => setTargetKepReason(e.target.value)} rows={2}
                            hint="Bu hipotetik hedef, gerçek bir P1-P5 ölçümünden türetilmiş gibi sunulmaz." />
                    </>
                )}
                {effectMode === 'P1P5_KTS' && <p className="text-xs text-slate-500">Aksiyon eklendikten sonra hangi P1-P5/KTS alanlarını değiştireceğini düzenleyebilirsiniz.</p>}
            </div>
        </Modal>
    );
}

export default function ScenarioWorkspacePage() {
    const params = useParams<{ sid: string }>();
    const router = useRouter();
    const { success, error: showError } = useToast();
    const { hasPermission } = useAuth();

    const [scenario, setScenario] = useState<any>(null);
    const [calc, setCalc] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('inputs');
    const [addControlOpen, setAddControlOpen] = useState(false);
    const [addActionOpen, setAddActionOpen] = useState(false);
    const [transferOpen, setTransferOpen] = useState(false);

    const [form, setForm] = useState<any>(null);
    const userEditedRef = useRef(false);
    const versionRef = useRef(0);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');

    const canEdit = hasPermission('risk:sim:edit');
    const canTransfer = hasPermission('risk:sim:transfer');
    const { widths: colWidths, startResize } = useResizableColumns('risk-sim-controls-table-colwidths', CONTROL_TABLE_COLS);

    // Kontrol/aksiyon satırları birbirinden bağımsız, paralel PATCH+refetch tetikler
    // (her satırın kendi onChange'i). Ağdan yanıtlar İSTEK SIRASINDAN FARKLI sırayla
    // dönebilir — sıralama koruması olmadan, ESKİ bir isteğin yanıtı DAHA YENİ bir
    // düzenlemenin sonucunun üzerine yazıp ekranda "değişiklik hiç olmamış" izlenimi
    // verebilir (veri kaybı değil, yalnızca görüntü — DB her zaman doğru kalır, ama
    // kullanıcı "değişmiyor" sanır). Tek, paylaşılan bir sıra sayacıyla yalnızca EN
    // SON tetiklenen istek state'i güncelleyebilir.
    const requestSeqRef = useRef(0);

    const recalculate = useCallback(async (sid: string, seq: number) => {
        try {
            const c = await api.calculateSimScenario(sid);
            if (seq === requestSeqRef.current) setCalc(c);
        } catch {
            if (seq === requestSeqRef.current) showError('Hata', 'Hesaplama alınamadı.');
        }
    }, [showError]);

    const load = useCallback(async () => {
        setLoading(true);
        userEditedRef.current = false;
        const seq = ++requestSeqRef.current;
        try {
            const s = await api.getSimScenario(params.sid) as any;
            if (seq !== requestSeqRef.current) return;
            setScenario(s);
            versionRef.current = s.contentVersion;
            setForm({
                naturalProbability: s.naturalProbability, finansalEtki: s.finansalEtki, itibarEtkisi: s.itibarEtkisi,
                regulasyonEtkisi: s.regulasyonEtkisi, musteriEtkisi: s.musteriEtkisi, gizlilikEtkisi: s.gizlilikEtkisi,
                butunlukEtkisi: s.butunlukEtkisi, erisilebilirlikEtkisi: s.erisilebilirlikEtkisi, finalImpactChoice: s.finalImpactChoice,
            });
            await recalculate(params.sid, seq);
        } catch (e) {
            if (seq === requestSeqRef.current) showError('Hata', e instanceof ApiError ? e.message : 'Senaryo yüklenemedi.');
        } finally {
            if (seq === requestSeqRef.current) setLoading(false);
        }
    }, [params.sid, recalculate, showError]);

    useEffect(() => { load(); }, [load]);

    const refreshAfterMutation = useCallback(async () => {
        const seq = ++requestSeqRef.current;
        const s = await api.getSimScenario(params.sid) as any;
        if (seq !== requestSeqRef.current) return;
        setScenario(s);
        versionRef.current = s.contentVersion;
        await recalculate(params.sid, seq);
    }, [params.sid, recalculate]);

    const doSaveInputs = useCallback(async () => {
        if (!form) return;
        setSaveStatus('saving');
        const seq = ++requestSeqRef.current;
        try {
            const updated = await api.updateSimScenario(params.sid, { ...form, expectedContentVersion: versionRef.current }) as any;
            versionRef.current = updated.contentVersion;
            setSaveStatus('saved');
            await recalculate(params.sid, seq);
        } catch (e) {
            if (e instanceof ApiError && e.status === 409) setSaveStatus('conflict');
            else setSaveStatus('error');
        }
    }, [form, params.sid, recalculate]);

    useEffect(() => {
        if (!userEditedRef.current || !form) return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => { doSaveInputs(); }, 500);
        return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form]);

    const setField = (key: string, value: any) => {
        userEditedRef.current = true;
        setForm((f: any) => ({ ...f, [key]: value }));
    };

    if (loading || !scenario || !form) return <PageShell><div className="py-24 text-center text-slate-400">Yükleniyor…</div></PageShell>;

    const target = calc?.target;
    const baseline = calc?.baseline;
    const residual = calc?.residual;
    const hasConflicts = (target?.conflicts?.length ?? 0) > 0;
    const overAllocated = calc?.weightCheck?.isOverAllocated;
    // BKP/artık risk "KTS bilinmiyor" olduğunda HANGİ kontrol(ler) sorumlu —
    // genel bir "bilinmiyor" yerine somut, düzeltilebilir bir işaret.
    const missingKtsIds = new Set<string>(
        (target?.bkp?.contributions ?? []).filter((c: any) => c.kep === null && c.weight > 0).map((c: any) => c.controlId),
    );
    const missingKtsNames = scenario.controls.filter((c: any) => missingKtsIds.has(c.id)).map((c: any) => c.name);

    return (
        <PageShell>
            <PageHeader
                title={scenario.name}
                description={`${scenario.simulation?.simulationId ?? ''} · Metodoloji v${scenario.methodology.version} · ${scenario.sourceType === 'EXISTING_RISK' ? 'Gerçek riskten başlatıldı' : 'Hipotetik'}`}
                breadcrumbs={[{ label: 'Risk Yönetimi' }, { label: 'Risk Simülasyonu', href: '/risks/simulation' }, { label: scenario.simulation?.name ?? '', href: `/risks/simulation/${scenario.simulationId}` }, { label: scenario.name }]}
                actions={
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">
                            {saveStatus === 'saving' && 'Kaydediliyor…'}
                            {saveStatus === 'saved' && 'Kaydedildi'}
                            {saveStatus === 'conflict' && 'Çakışma — sayfayı yenileyin'}
                            {saveStatus === 'error' && 'Kayıt hatası'}
                        </span>
                        {canEdit && <Button variant="outline" size="sm" onClick={async () => {
                            if (!confirm('Senaryo, oluşturulduğu andaki başlangıç durumuna döndürülecek. Emin misiniz?')) return;
                            await api.resetSimScenario(params.sid); await refreshAfterMutation(); success('Sıfırlandı', 'Senaryo başlangıç durumuna döndürüldü.');
                        }}>Sıfırla</Button>}
                        {canTransfer && <Button variant="primary" size="sm" onClick={() => setTransferOpen(true)} disabled={hasConflicts || overAllocated}>Envantere Aktar</Button>}
                    </div>
                }
            />

            {hasConflicts && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {target.conflicts.length} çözülmemiş aksiyon çakışması var — aynı kontrolün aynı alanını farklı değerlere hedefleyen aksiyonlar. Aktarım engellenir.
                </div>
            )}
            {overAllocated && (
                <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                    Kontrol ağırlıkları toplamı %100&apos;ü aşıyor (%{(calc.weightCheck.totalWeight * 100).toFixed(1)}). Aktarım engellenir.
                </div>
            )}

            <KpiGrid columns={5}>
                <KpiCard title="Doğal Risk" value={calc?.naturalRisk ? `${calc.naturalRisk.puan} (${calc.naturalRisk.seviye})` : '—'} variant="default" />
                <KpiCard title="Hesaplanan Etki"
                    value={calc?.finalImpactTier ?? '—'}
                    subtitle={calc ? (() => {
                        const text = scenario.finalImpactChoice === 'BUSINESS'
                            ? `İş Etkisi, ham ${fmt(calc.businessImpact?.raw)}`
                            : `BT Etkisi, ham ${fmt(calc.infosecImpact?.raw)}`;
                        return <span title={text}>{text}</span>;
                    })() : undefined}
                    variant="default" />
                <KpiCard title="Bütünleşik Kontrol Puanı (BKP)"
                    value={target?.bkp?.bkp !== null && target?.bkp?.bkp !== undefined ? `%${fmt(target.bkp.bkp)}` : 'KTS bilinmiyor'}
                    subtitle={(() => {
                        const text = missingKtsNames.length > 0
                            ? `Eksik KTS: ${missingKtsNames.join(', ')}`
                            : target?.residualSuggestion && !target.residualSuggestion.hasUnknownKts
                                ? `Olasılık ${calc.naturalProbability}→${target.residualSuggestion.residualProbability} (-${target.residualSuggestion.probabilityReduction}) · Etki ${calc.finalImpactTier}→${target.residualSuggestion.residualImpact} (-${target.residualSuggestion.impactReduction})`
                                : undefined;
                        return text ? <span title={text}>{text}</span> : undefined;
                    })()}
                    variant="info" />
                <KpiCard title="Aksiyon Öncesi Artık Risk (öneri)" value={baseline?.residualSuggestion?.residualRisk ?? '—'}
                    subtitle={baseline?.residualSuggestion?.hasUnknownKts && missingKtsNames.length > 0 ? `Eksik KTS: ${missingKtsNames.join(', ')}` : undefined}
                    variant="warning" />
                <KpiCard title="Hedef (Aksiyon Sonrası) Artık Risk" value={residual?.risk ?? '—'} subtitle={residual?.level?.label} variant={residual?.level ? levelVariant(residual.level.label) as any : 'default'} />
            </KpiGrid>

            {target?.residualSuggestion && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5">
                        <div className="text-[11px] text-slate-400">Olasılığa Özel Kontrol Gücü (yalnızca &quot;Olasılığı azaltır&quot;/&quot;Her ikisi&quot; kontrolleri)</div>
                        <div className="text-sm font-semibold text-slate-700 mt-0.5">
                            {target.residualSuggestion.probabilityStrength !== null ? `%${fmt(target.residualSuggestion.probabilityStrength)}` : 'KTS bilinmiyor'}
                            <span className="font-normal text-slate-400"> · {bkpLevelLabel(target.residualSuggestion.probabilityStrength)}</span>
                            {target.residualSuggestion.probabilityReduction !== null && <span className="font-normal text-slate-400"> · -{target.residualSuggestion.probabilityReduction} kademe</span>}
                        </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5">
                        <div className="text-[11px] text-slate-400">Etkiye Özel Kontrol Gücü (yalnızca &quot;Etkiyi azaltır&quot;/&quot;Her ikisi&quot; kontrolleri)</div>
                        <div className="text-sm font-semibold text-slate-700 mt-0.5">
                            {target.residualSuggestion.impactStrength !== null ? `%${fmt(target.residualSuggestion.impactStrength)}` : 'KTS bilinmiyor'}
                            <span className="font-normal text-slate-400"> · {bkpLevelLabel(target.residualSuggestion.impactStrength)}</span>
                            {target.residualSuggestion.impactReduction !== null && <span className="font-normal text-slate-400"> · -{target.residualSuggestion.impactReduction} kademe</span>}
                        </div>
                    </div>
                    <p className="sm:col-span-2 text-[11px] text-slate-400">
                        Bu ikisi, yukarıdaki genel BKP&apos;den bağımsız ayrı hesaplamalardır — toplamları veya ortalamaları genel BKP&apos;yi vermez; her biri yalnızca kendi kontrol grubuna göre hesaplanır ve artık risk önerisindeki olasılık/etki azaltımını belirler.
                    </p>
                </div>
            )}

            <div className="mt-6">
                <Tabs
                    tabs={[
                        { key: 'inputs', label: 'Risk Girdileri' },
                        { key: 'controls', label: 'Kontroller', count: scenario.controls.length },
                        { key: 'actions', label: 'Aksiyonlar', count: scenario.actions.length },
                        { key: 'matrix', label: 'Matris ve Açıklama' },
                    ]}
                    activeTab={activeTab}
                    onChange={setActiveTab}
                />

                <div className="mt-4 bg-white border border-slate-200 rounded-xl p-5">
                    {activeTab === 'inputs' && (
                        <div className="space-y-6 max-w-3xl">
                            <div className="grid grid-cols-2 gap-4">
                                <Input type="number" min={1} max={5} label="Doğal Olasılık (1-5)" value={form.naturalProbability} disabled={!canEdit}
                                    onChange={e => setField('naturalProbability', Number(e.target.value))} />
                                <Select label="Nihai Etki Grubu" value={form.finalImpactChoice} disabled={!canEdit}
                                    onChange={e => setField('finalImpactChoice', e.target.value)}
                                    options={[{ value: 'BUSINESS', label: `İş Etkisi (tier ${calc?.businessImpact?.tier ?? '—'})` }, { value: 'INFOSEC', label: `BT Etkisi (tier ${calc?.infosecImpact?.tier ?? '—'})` }]} />
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-slate-500 mb-2">İş Etkisi (Finansal %30 / İtibar %30 / Regülasyon %20 / Müşteri %20)</div>
                                <div className="grid grid-cols-4 gap-3">
                                    {(['finansalEtki', 'itibarEtkisi', 'regulasyonEtkisi', 'musteriEtkisi'] as const).map(k => (
                                        <Input key={k} type="number" min={1} max={5} disabled={!canEdit} label={{ finansalEtki: 'Finansal', itibarEtkisi: 'İtibar', regulasyonEtkisi: 'Regülasyon', musteriEtkisi: 'Müşteri' }[k]}
                                            value={form[k] ?? ''} onChange={e => setField(k, e.target.value === '' ? null : Number(e.target.value))} />
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-slate-500 mb-2">BT/InfoSec Etkisi (Gizlilik %35 / Bütünlük %30 / Erişilebilirlik %35)</div>
                                <div className="grid grid-cols-3 gap-3">
                                    {(['gizlilikEtkisi', 'butunlukEtkisi', 'erisilebilirlikEtkisi'] as const).map(k => (
                                        <Input key={k} type="number" min={1} max={5} disabled={!canEdit} label={{ gizlilikEtkisi: 'Gizlilik', butunlukEtkisi: 'Bütünlük', erisilebilirlikEtkisi: 'Erişilebilirlik' }[k]}
                                            value={form[k] ?? ''} onChange={e => setField(k, e.target.value === '' ? null : Number(e.target.value))} />
                                    ))}
                                </div>
                            </div>
                            <ResidualOverridePanel scenarioId={params.sid} contentVersion={scenario.contentVersion} residual={residual} canEdit={canEdit} onSaved={refreshAfterMutation} />
                        </div>
                    )}

                    {activeTab === 'controls' && (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-xs text-slate-500">
                                    Ağırlık toplamı: %{((calc?.weightCheck?.totalWeight ?? 0) * 100).toFixed(1)}
                                    {calc?.weightCheck?.unallocatedWeight > 0 && <span className="ml-2 text-amber-600">· Kontrolsüz pay: %{(calc.weightCheck.unallocatedWeight * 100).toFixed(1)}</span>}
                                </div>
                                {canEdit && <Button variant="secondary" size="sm" onClick={() => setAddControlOpen(true)}>Hipotetik Kontrol Ekle</Button>}
                            </div>
                            {scenario.controls.length === 0 ? <EmptyState title="Kontrol yok" description="Bu senaryoda henüz kontrol tanımlı değil." /> : (
                                <>
                                <div className="overflow-x-auto">
                                    <table className="text-sm" style={{ tableLayout: 'fixed', width: CONTROL_TABLE_COLS.reduce((s, c) => s + (colWidths[c.key] ?? c.defaultWidth), 0) }}>
                                        <colgroup>
                                            {CONTROL_TABLE_COLS.map(c => <col key={c.key} style={{ width: colWidths[c.key] ?? c.defaultWidth }} />)}
                                        </colgroup>
                                        <thead>
                                            <tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-200">
                                                {CONTROL_TABLE_COLS.map(c => (
                                                    <ResizableTh key={c.key} colKey={c.key} label={c.label} width={colWidths[c.key] ?? c.defaultWidth} minWidth={c.minWidth} onResizeStart={startResize} />
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {scenario.controls.map((c: any) => (
                                                <ControlRow key={c.id} scenarioId={params.sid} control={c} canEdit={canEdit} missingKts={missingKtsIds.has(c.id)}
                                                    onChanged={refreshAfterMutation}
                                                    onRemoved={async () => { if (confirm(`"${c.name}" senaryodan kaldırılsın mı?`)) { await api.removeSimControl(params.sid, c.id); await refreshAfterMutation(); } }} />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">Sütun kenarlarını sürükleyerek genişliği ayarlayabilirsiniz.</p>
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'actions' && (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-xs text-slate-500">Yalnızca &quot;Uygulandı&quot; işaretlenen aksiyonlar hesaplamaya dahil edilir.</div>
                                {canEdit && <Button variant="secondary" size="sm" onClick={() => setAddActionOpen(true)} disabled={scenario.controls.length === 0}>Aksiyon Ekle</Button>}
                            </div>
                            {scenario.actions.length === 0 ? <EmptyState title="Aksiyon yok" /> : (
                                <div className="space-y-3">
                                    {scenario.actions.map((a: any) => {
                                        const contrib = calc?.actionContributions?.find((x: any) => x.actionId === a.id);
                                        const control = scenario.controls.find((c: any) => c.id === a.targetControlSimId);
                                        return (
                                            <div key={a.id} className="border border-slate-200 rounded-lg p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="font-medium text-slate-800 text-sm">{a.name}</div>
                                                        <div className="text-xs text-slate-500">Hedef: {control?.name ?? '—'} · {a.effectMode === 'TARGET_KEP' ? `Hedef KEP: ${a.targetKep}` : 'P1-P5/KTS değişikliği'}</div>
                                                        {contrib && (
                                                            <div className="text-xs text-slate-400 mt-1">
                                                                KEP: {fmt(contrib.kepBefore)} → {fmt(contrib.kepAfter)}
                                                                {contrib.marginal.bkp !== null && <span className="ml-2">· Marjinal BKP: {contrib.marginal.bkp >= 0 ? '+' : ''}{fmt(contrib.marginal.bkp)}</span>}
                                                                {contrib.marginal.residualRisk !== null && <span className="ml-2">· Marjinal Artık Risk: {contrib.marginal.residualRisk >= 0 ? '+' : ''}{contrib.marginal.residualRisk}</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <label className="flex items-center gap-1.5 text-xs text-slate-600">
                                                            <input type="checkbox" checked={a.isApplied} disabled={!canEdit}
                                                                onChange={async e => { await api.toggleSimAction(params.sid, a.id, e.target.checked); await refreshAfterMutation(); }} />
                                                            Uygulandı
                                                        </label>
                                                        {canEdit && <Button variant="ghost" size="xs" onClick={async () => { if (confirm('Aksiyon silinsin mi?')) { await api.removeSimAction(params.sid, a.id); await refreshAfterMutation(); } }}>Sil</Button>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'matrix' && <MatrixAndExplanation calc={calc} />}
                </div>
            </div>

            <AddControlModal scenarioId={params.sid} open={addControlOpen} onClose={() => setAddControlOpen(false)} onAdded={() => { setAddControlOpen(false); refreshAfterMutation(); }} />
            <AddActionModal scenarioId={params.sid} controls={scenario.controls} open={addActionOpen} onClose={() => setAddActionOpen(false)} onAdded={() => { setAddActionOpen(false); refreshAfterMutation(); }} />
            <TransferModal scenarioId={params.sid} contentVersion={scenario.contentVersion} open={transferOpen} onClose={() => setTransferOpen(false)}
                onDone={() => { setTransferOpen(false); success('Aktarıldı', 'Senaryo gerçek envantere aktarıldı.'); refreshAfterMutation(); }} />
        </PageShell>
    );
}

function ResidualOverridePanel({ scenarioId, contentVersion, residual, canEdit, onSaved }: { scenarioId: string; contentVersion: number; residual: any; canEdit: boolean; onSaved: () => void }) {
    const [open, setOpen] = useState(false);
    const [probability, setProbability] = useState(residual?.probability ?? 3);
    const [impact, setImpact] = useState(residual?.impact ?? 3);
    const [reason, setReason] = useState('');
    const { success, error: showError } = useToast();
    if (!residual) return null;
    return (
        <div className="border-t border-slate-100 pt-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">Artık Risk — Motor Önerisi ve Manuel Override</div>
            <div className="text-sm text-slate-700 mb-2">
                Öneri: Olasılık {fmt(residual.suggestion?.residualProbability, 0)} · Etki {fmt(residual.suggestion?.residualImpact, 0)} · Risk {residual.suggestion?.residualRisk ?? '—'}
                {residual.isOverridden && <span className="ml-2 text-amber-600">(Kullanıcı override&apos;ı aktif: {residual.probability}×{residual.impact}={residual.risk})</span>}
            </div>
            {canEdit && !open && <Button variant="outline" size="sm" onClick={() => setOpen(true)}>{residual.isOverridden ? 'Override\'ı Düzenle' : 'Manuel Override Ekle'}</Button>}
            {canEdit && residual.isOverridden && !open && (
                <Button variant="ghost" size="sm" className="ml-2" onClick={async () => {
                    try {
                        await api.updateSimScenario(scenarioId, { expectedContentVersion: contentVersion, clearResidualOverride: true });
                        onSaved();
                    } catch (e) { showError('Hata', e instanceof ApiError ? e.message : 'Kaydedilemedi.'); }
                }}>Öneriye Dön</Button>
            )}
            {open && (
                <div className="mt-2 grid grid-cols-2 gap-3 max-w-md">
                    <Input type="number" min={1} max={5} label="Olasılık (override)" value={probability} onChange={e => setProbability(Number(e.target.value))} />
                    <Input type="number" min={1} max={5} label="Etki (override)" value={impact} onChange={e => setImpact(Number(e.target.value))} />
                    <div className="col-span-2">
                        <Textarea label="Gerekçe (zorunlu)" value={reason} onChange={e => setReason(e.target.value)} rows={2} />
                    </div>
                    <div className="col-span-2 flex gap-2">
                        <Button variant="primary" size="sm" onClick={async () => {
                            if (!reason.trim()) { showError('Eksik bilgi', 'Gerekçe zorunludur.'); return; }
                            try {
                                await api.updateSimScenario(scenarioId, { expectedContentVersion: contentVersion, residualOverrideProbability: probability, residualOverrideImpact: impact, residualOverrideReason: reason.trim() });
                                success('Kaydedildi', 'Manuel artık risk override edildi.');
                                setOpen(false); onSaved();
                            } catch (e) { showError('Hata', e instanceof ApiError ? e.message : 'Kaydedilemedi.'); }
                        }}>Kaydet</Button>
                        <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Vazgeç</Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function MatrixAndExplanation({ calc }: { calc: any }) {
    if (!calc) return null;
    const cellSize = 48;
    const points: { label: string; p: number; i: number; color: string }[] = [];
    if (calc.naturalRisk) points.push({ label: 'Doğal', p: calc.naturalProbability, i: calc.finalImpactTier, color: '#64748b' });
    if (calc.baseline?.residualSuggestion?.residualProbability) points.push({ label: 'Aksiyon-öncesi', p: calc.baseline.residualSuggestion.residualProbability, i: calc.baseline.residualSuggestion.residualImpact, color: '#d97706' });
    if (calc.residual?.probability) points.push({ label: 'Hedef', p: calc.residual.probability, i: calc.residual.impact, color: '#2563eb' });

    return (
        <div className="space-y-6">
            <div>
                <div className="text-xs font-semibold text-slate-500 mb-3">Risk Matrisi (Olasılık × Etki)</div>
                <svg viewBox={`0 0 ${cellSize * 5 + 40} ${cellSize * 5 + 40}`} className="max-w-md">
                    {Array.from({ length: 5 }).map((_, row) => Array.from({ length: 5 }).map((_, col) => {
                        const impact = col + 1; const prob = 5 - row;
                        const puan = prob * impact;
                        const band = puan <= 1 ? '#dcfce7' : puan <= 4 ? '#fef9c3' : puan <= 10 ? '#fed7aa' : puan <= 16 ? '#fecaca' : '#fca5a5';
                        return <rect key={`${row}-${col}`} x={30 + col * cellSize} y={10 + row * cellSize} width={cellSize - 2} height={cellSize - 2} fill={band} />;
                    }))}
                    {points.map((pt, idx) => {
                        const col = pt.i - 1; const row = 5 - pt.p;
                        const cx = 30 + col * cellSize + cellSize / 2 + (idx - 1) * 8;
                        const cy = 10 + row * cellSize + cellSize / 2 + (idx - 1) * 8;
                        return (
                            <g key={pt.label}>
                                <circle cx={cx} cy={cy} r={9} fill={pt.color} stroke="white" strokeWidth={2} />
                                <text x={cx} y={cy - 12} fontSize={9} textAnchor="middle" fill={pt.color} fontWeight={600}>{pt.label}</text>
                            </g>
                        );
                    })}
                </svg>
                <div className="text-[11px] text-slate-400 mt-2">Yatay: Etki (1-5) · Dikey: Olasılık (5-1, üstte yüksek)</div>
            </div>
            <div>
                <div className="text-xs font-semibold text-slate-500 mb-2">Hesaplama Açıklaması</div>
                <div className="text-sm text-slate-700 space-y-1 font-mono bg-slate-50 rounded-lg p-3">
                    <div>Doğal Risk = {calc.naturalProbability} × {calc.finalImpactTier} = {calc.naturalRisk?.puan} ({calc.naturalRisk?.seviye})</div>
                    <div>BKP (Σ KEP×ağırlık) = {fmt(calc.target?.bkp?.bkp)}{calc.target?.bkp?.bkp === null ? ' — KTS bilinmiyor' : ''}</div>
                    <div>Olasılık Kontrol Gücü = {fmt(calc.target?.residualSuggestion?.probabilityStrength)} → {calc.target?.residualSuggestion?.probabilityReduction ?? '—'} kademe azaltım</div>
                    <div>Etki Kontrol Gücü = {fmt(calc.target?.residualSuggestion?.impactStrength)} → {calc.target?.residualSuggestion?.impactReduction ?? '—'} kademe azaltım</div>
                    <div>
                        Artık Risk (öneri) = {calc.target?.residualSuggestion?.residualProbability ?? '—'} × {calc.target?.residualSuggestion?.residualImpact ?? '—'} = {calc.target?.residualSuggestion?.residualRisk ?? '—'}
                        {calc.target?.residualSuggestion?.hasUnknownKts && <span className="text-slate-400"> (KTS bilinmiyor — en az bir kontrole ağırlık ve KTS değeri girin)</span>}
                    </div>
                    {calc.residual?.isOverridden && <div className="text-amber-700">Manuel override uygulandı: {calc.residual.probability} × {calc.residual.impact} = {calc.residual.risk}</div>}
                </div>
            </div>
        </div>
    );
}

const NEW_CONTROL_TYPE_OPTIONS = [{ value: 'BT', label: 'BT' }, { value: 'BT_DISI', label: 'BT Dışı' }];
const NEW_CONTROL_NATURE_OPTIONS = [{ value: 'PREVENTIVE', label: 'Önleyici' }, { value: 'DETECTIVE', label: 'Tespit Edici' }];
const NEW_CONTROL_AUTOMATION_OPTIONS = [{ value: 'MANUAL', label: 'Manuel' }, { value: 'SEMI_AUTOMATED', label: 'Yarı Otomatik' }, { value: 'AUTOMATED', label: 'Otomatik' }];
const NEW_CONTROL_FREQUENCY_OPTIONS = [
    { value: 'DAILY', label: 'Günlük' }, { value: 'WEEKLY', label: 'Haftalık' }, { value: 'MONTHLY', label: 'Aylık' },
    { value: 'QUARTERLY', label: '3 Aylık' }, { value: 'SEMI_ANNUAL', label: '6 Aylık' }, { value: 'ANNUAL', label: 'Yıllık' }, { value: 'AD_HOC', label: 'Arızi' },
];

interface NewControlSelection { included: boolean; type: string; nature: string; automation: string; frequency: string; ownerId: string; directorateId: string }

function TransferModal({ scenarioId, contentVersion, open, onClose, onDone }: { scenarioId: string; contentVersion: number; open: boolean; onClose: () => void; onDone: () => void }) {
    const [preview, setPreview] = useState<any>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [confirmResidual, setConfirmResidual] = useState(false);
    const [applying, setApplying] = useState(false);
    const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
    const [directorates, setDirectorates] = useState<{ id: string; name: string }[]>([]);
    const [assignments, setAssignments] = useState<Record<string, { ownerId: string; dueDate: string }>>({});
    const [newControlSelections, setNewControlSelections] = useState<Record<string, NewControlSelection>>({});
    const { error: showError } = useToast();

    useEffect(() => {
        if (!open) { setPreview(null); setConfirmResidual(false); setAssignments({}); setNewControlSelections({}); return; }
        setLoadingPreview(true);
        Promise.all([api.previewSimTransfer(scenarioId), api.getUsers().catch(() => []), api.getDirectorates().catch(() => [])]).then(([p, u, d]: any) => {
            setPreview(p);
            setUsers(Array.isArray(u) ? u : (u?.data ?? []));
            setDirectorates(Array.isArray(d) ? d : (d?.data ?? []));
            const initialSelections: Record<string, NewControlSelection> = {};
            for (const r of p.rows) {
                if (r.kind === 'CONTROL' && r.classification === 'SKIP' && r.optInAvailable) {
                    initialSelections[r.refId] = {
                        included: false,
                        type: 'BT_DISI',
                        nature: r.suggestedMapping?.nature ?? 'DETECTIVE',
                        automation: r.suggestedMapping?.automation ?? 'MANUAL',
                        frequency: 'QUARTERLY',
                        ownerId: '', directorateId: '',
                    };
                }
            }
            setNewControlSelections(initialSelections);
        }).catch(() => showError('Hata', 'Önizleme alınamadı.')).finally(() => setLoadingPreview(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, scenarioId]);

    const actionCreateRows = (preview?.rows ?? []).filter((r: any) => r.kind === 'ACTION' && r.classification === 'CREATE');
    const assignmentsComplete = actionCreateRows.every((r: any) => assignments[r.refId]?.ownerId && assignments[r.refId]?.dueDate);
    const controlOptInRows = (preview?.rows ?? []).filter((r: any) => r.kind === 'CONTROL' && r.classification === 'SKIP' && r.optInAvailable);
    const includedControlSelections = Object.entries(newControlSelections).filter(([, v]) => v.included);
    const newControlSelectionsComplete = includedControlSelections.every(([, v]) => v.type && v.nature && v.automation && v.frequency && v.ownerId);

    const apply = async () => {
        setApplying(true);
        try {
            await api.applySimTransfer(scenarioId, {
                expectedContentVersion: contentVersion,
                confirmResidualOverwrite: confirmResidual,
                actionAssignments: actionCreateRows.map((r: any) => ({ scenarioActionId: r.refId, ...assignments[r.refId] })),
                newControlAssignments: includedControlSelections.map(([scenarioControlId, v]) => ({
                    scenarioControlId, type: v.type, nature: v.nature, automation: v.automation, frequency: v.frequency,
                    ownerId: v.ownerId, directorateId: v.directorateId || undefined,
                })),
            });
            onDone();
        } catch (e) {
            showError('Aktarım başarısız', e instanceof ApiError ? e.message : 'Bilinmeyen hata.');
        } finally { setApplying(false); }
    };

    return (
        <Modal open={open} onClose={onClose} title="Envantere Aktarım Önizleme" size="lg"
            footer={<>
                <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
                <Button variant="primary" loading={applying}
                    disabled={loadingPreview || !preview || preview.blocked || (preview.needsResidualConfirmation && !confirmResidual) || !assignmentsComplete || !newControlSelectionsComplete}
                    onClick={apply}>Aktarımı Onayla ve Uygula</Button>
            </>}>
            {loadingPreview && <div className="py-8 text-center text-slate-400">Önizleme hazırlanıyor…</div>}
            {preview && (
                <div className="space-y-3">
                    {preview.blocked && (
                        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {preview.blockReasons.map((r: string, i: number) => <div key={i}>• {r}</div>)}
                        </div>
                    )}
                    {preview.needsResidualConfirmation && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            <label className="flex items-start gap-2">
                                <input type="checkbox" checked={confirmResidual} onChange={e => setConfirmResidual(e.target.checked)} className="mt-0.5" />
                                <span>Hedef riskin zaten onaylı bir artık risk değeri var. Bu aktarım onu değiştirecek — devam etmek istediğimi onaylıyorum.</span>
                            </label>
                        </div>
                    )}
                    {actionCreateRows.length > 0 && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
                            <div className="text-xs font-semibold text-slate-600">Yeni oluşturulacak aksiyonlar için sorumlu ve termin (simülasyonda tutulmaz, burada belirlenir):</div>
                            {actionCreateRows.map((r: any) => (
                                <div key={r.refId} className="grid grid-cols-2 gap-2 items-end">
                                    <Select label={r.label} value={assignments[r.refId]?.ownerId ?? ''} placeholder="Sorumlu seçin..."
                                        onChange={e => setAssignments(a => ({ ...a, [r.refId]: { ownerId: e.target.value, dueDate: a[r.refId]?.dueDate ?? '' } }))}
                                        options={users.map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))} />
                                    <Input type="date" label="Termin" value={assignments[r.refId]?.dueDate ?? ''}
                                        onChange={e => setAssignments(a => ({ ...a, [r.refId]: { ownerId: a[r.refId]?.ownerId ?? '', dueDate: e.target.value } }))} />
                                </div>
                            ))}
                        </div>
                    )}
                    {controlOptInRows.length > 0 && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 space-y-3">
                            <div className="text-xs font-semibold text-slate-600">
                                Hipotetik kontroller — varsayılan olarak aktarılmaz, isterseniz her birini ayrı ayrı gerçek envantere de ekleyebilirsiniz:
                            </div>
                            {controlOptInRows.map((r: any) => {
                                const sel = newControlSelections[r.refId];
                                if (!sel) return null;
                                return (
                                    <div key={r.refId} className="border border-slate-200 rounded-md p-2.5 bg-white">
                                        <label className="flex items-start gap-2 text-sm">
                                            <input type="checkbox" checked={sel.included} className="mt-0.5"
                                                onChange={e => setNewControlSelections(s => ({ ...s, [r.refId]: { ...s[r.refId], included: e.target.checked } }))} />
                                            <span className="font-medium text-slate-700">{r.label.replace(' (isterseniz ekleyebilirsiniz)', '')}</span>
                                        </label>
                                        {r.reason && <div className="text-[11px] text-slate-400 mt-1 ml-6">{r.reason}</div>}
                                        {sel.included && (
                                            <div className="grid grid-cols-2 gap-2 mt-2 ml-6">
                                                <Select label="Kontrol Türü" value={sel.type} options={NEW_CONTROL_TYPE_OPTIONS}
                                                    onChange={e => setNewControlSelections(s => ({ ...s, [r.refId]: { ...s[r.refId], type: e.target.value } }))} />
                                                <Select label="İşlev" value={sel.nature} options={NEW_CONTROL_NATURE_OPTIONS}
                                                    hint={r.suggestedMapping?.natureIsApproximate ? 'Otomatik önerilen — "Düzeltici" için tam karşılık yok, kontrol edin' : undefined}
                                                    onChange={e => setNewControlSelections(s => ({ ...s, [r.refId]: { ...s[r.refId], nature: e.target.value } }))} />
                                                <Select label="Otomasyon" value={sel.automation} options={NEW_CONTROL_AUTOMATION_OPTIONS}
                                                    onChange={e => setNewControlSelections(s => ({ ...s, [r.refId]: { ...s[r.refId], automation: e.target.value } }))} />
                                                <Select label="Sıklık" value={sel.frequency} options={NEW_CONTROL_FREQUENCY_OPTIONS}
                                                    onChange={e => setNewControlSelections(s => ({ ...s, [r.refId]: { ...s[r.refId], frequency: e.target.value } }))} />
                                                <Select label="Sorumlu" value={sel.ownerId} placeholder="Sorumlu seçin..."
                                                    options={users.map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
                                                    onChange={e => setNewControlSelections(s => ({ ...s, [r.refId]: { ...s[r.refId], ownerId: e.target.value } }))} />
                                                <Select label="Direktörlük (opsiyonel)" value={sel.directorateId} placeholder="Seçiniz..."
                                                    options={directorates.map(d => ({ value: d.id, label: d.name }))}
                                                    onChange={e => setNewControlSelections(s => ({ ...s, [r.refId]: { ...s[r.refId], directorateId: e.target.value } }))} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <table className="w-full text-sm">
                        <thead><tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-200"><th className="py-1">Tür</th><th className="py-1">Sınıflandırma</th><th className="py-1">Açıklama</th></tr></thead>
                        <tbody>
                            {preview.rows.map((r: any, i: number) => (
                                <tr key={i} className="border-b border-slate-100">
                                    <td className="py-1.5 pr-2 text-xs text-slate-500">{r.kind}</td>
                                    <td className="py-1.5 pr-2"><StatusBadge size="sm" variant={r.classification === 'CREATE' ? 'success' : r.classification === 'UPDATE' ? 'info' : r.classification === 'REMOVE' ? 'warning' : r.classification === 'SKIP' ? 'neutral' : 'primary'}>{r.classification}</StatusBadge></td>
                                    <td className="py-1.5 text-slate-700">
                                        {r.label}
                                        {r.reason && <div className="text-xs text-slate-400">{r.reason}</div>}
                                        {r.fields && (
                                            <div className="text-xs text-slate-400 mt-0.5">
                                                {r.fields.filter((f: any) => f.oldValue !== f.newValue).map((f: any) => `${f.field}: ${f.oldValue ?? '—'} → ${f.newValue ?? '—'}`).join(' · ')}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Modal>
    );
}
