'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api, { ApiError } from '@/lib/api';
import { classifyLoadError, type LoadError } from '@/lib/load-error';
import { LoadingState, ErrorState, Button, Modal, Textarea, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';

/*
 * Envantere aktar (iki aşamalı). Önizleme: seçilen risklerde Risk Envanteri ve Kontrol Alanı'nda
 * neyin değişeceği (envanter → simülasyon). Talep herkes tarafından oluşturulur; Risk ve Kontrol
 * Yöneticisi / Sistem Yöneticisi onaylayınca yazılır. Talep eden kendi talebini onaylayamaz.
 */

type FieldDiff = { field: string; label: string; before: unknown; after: unknown };
type ControlPlan =
    | { action: 'UPDATE'; kontrolId: string; fields: FieldDiff[]; warning?: string }
    | { action: 'CREATE'; name: string; data: Record<string, unknown> }
    | { action: 'UNLINK'; kontrolId: string };
export interface TransferRow { scenarioId: string; riskId: string; riskName: string; fields: FieldDiff[]; controls: ControlPlan[]; warnings: string[]; hasChanges: boolean }
interface Preview { rows: TransferRow[]; skipped: { scenarioId: string; riskId: string; reason: string }[] }
interface RequestRow {
    id: string; requestNo: string; simulationId: string | null; simulationLabel: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    scenarioIds: string[]; note: string | null; requestedAt: string; decidedAt: string | null; decisionNote: string | null;
    requestedBy: { id: string; firstName: string; lastName: string }; decidedBy: { firstName: string; lastName: string } | null;
}

export const REQUEST_STATUS: Record<RequestRow['status'], [string, 'warning' | 'success' | 'neutral' | 'critical']> = {
    PENDING: ['Onay bekliyor', 'warning'], APPROVED: ['Onaylandı · envantere yazıldı', 'success'], REJECTED: ['Reddedildi', 'critical'], CANCELLED: ['İptal edildi', 'neutral'],
};
const val = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Evet' : 'Hayır') : typeof v === 'number' ? v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : String(v));
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export function TransferRowView({ r }: { r: TransferRow }) {
    return (
        <div className="space-y-2 text-[12.5px]">
            {r.fields.length > 0 && (
                <table className="w-full">
                    <thead><tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500"><th className="py-1 pr-2">Risk alanı</th><th className="py-1 pr-2">Envanterde</th><th className="py-1">Yazılacak</th></tr></thead>
                    <tbody>{r.fields.map(f => <tr key={f.field} className="border-t border-slate-100"><td className="py-1 pr-2 text-slate-600">{f.label}</td><td className="py-1 pr-2 font-mono text-slate-500">{val(f.before)}</td><td className="py-1 font-mono font-semibold text-slate-900">{val(f.after)}</td></tr>)}</tbody>
                </table>
            )}
            {r.controls.length > 0 && (
                <ul className="space-y-1">
                    {r.controls.map((c, i) => (
                        <li key={i} className="rounded-md bg-slate-50 px-2 py-1.5">
                            {c.action === 'UPDATE' && <><b className="font-mono">{c.kontrolId}</b> güncellenecek: {c.fields.map(f => <span key={f.field} className="mr-2"><span className="text-slate-500">{f.label}:</span> {val(f.before)} → <b>{val(f.after)}</b></span>)}{c.warning && <div className="text-amber-700">{c.warning}</div>}</>}
                            {c.action === 'CREATE' && <><b>{c.name}</b> Kontrol Alanı&apos;nda <span className="text-blue-700">oluşturulup</span> riske bağlanacak ({val(c.data.kontrolIslevi)} · {val(c.data.kontrolTuru)} · {val(c.data.status)})</>}
                            {c.action === 'UNLINK' && <><b className="font-mono">{c.kontrolId}</b> ile risk arasındaki bağlantı <span className="text-red-700">kaldırılacak</span> (simülasyonda silindi)</>}
                        </li>
                    ))}
                </ul>
            )}
            {r.warnings.map((w, i) => <p key={i} className="text-amber-700">⚠ {w}</p>)}
        </div>
    );
}

export function TransferPanel({ simulationId, isDraft, onChanged }: { simulationId: string; isDraft: boolean; onChanged: () => void }) {
    const { user, hasPermission } = useAuth();
    const canApprove = ['SYSTEM_ADMIN', 'ADMIN', 'RISK_CONTROL_MANAGER', 'RISK_MANAGER'].includes(user?.role?.name ?? '') && hasPermission('risk:sim:transfer');
    const [preview, setPreview] = useState<Preview | null>(null);
    const [requests, setRequests] = useState<RequestRow[] | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [open, setOpen] = useState<Set<string>>(new Set());
    const [note, setNote] = useState('');
    const [error, setError] = useState<LoadError | null>(null);
    const [busy, setBusy] = useState(false);
    const [decision, setDecision] = useState<{ req: RequestRow; kind: 'approve' | 'reject'; note: string; detail: TransferRow[] | null } | null>(null);
    const { success, error: showError } = useToast();
    const seq = useRef(0);

    const load = useCallback(async () => {
        const my = ++seq.current;
        try {
            const reqs = (await api.listTransferRequests()) as RequestRow[];
            const pv = isDraft ? null : ((await api.previewWorkspaceTransfer(simulationId)) as Preview);
            if (my !== seq.current) return;
            setRequests(reqs.filter(r => r.simulationId === simulationId));
            setPreview(pv);
            setSelected(new Set((pv?.rows ?? []).filter(r => r.hasChanges).map(r => r.scenarioId)));
            setError(null);
        } catch (e) { if (my === seq.current) setError(classifyLoadError(e, 'Aktarım önizlemesi')); }
    }, [simulationId, isDraft]);
    useEffect(() => { load(); }, [load]);

    const createRequest = async () => {
        setBusy(true);
        try {
            const r = await api.createTransferRequest(simulationId, [...selected], note.trim() || undefined);
            success('Aktarım talebi oluşturuldu', `${r.requestNo}: Risk ve Kontrol Yöneticisi veya Sistem Yöneticisi onaylayınca envantere yazılacak.`);
            setNote(''); await load();
        } catch (e) { showError('Talep oluşturulamadı', e instanceof ApiError ? e.message : 'Aktarım talebi oluşturulamadı.'); }
        finally { setBusy(false); }
    };
    const openDecision = async (req: RequestRow, kind: 'approve' | 'reject') => {
        setDecision({ req, kind, note: '', detail: null });
        try { const full = await api.getTransferRequest(req.id); setDecision(d => (d ? { ...d, detail: full.preview?.rows ?? [] } : d)); } catch { /* ayrıntı yüklenemezse karar yine verilebilir */ }
    };
    const decide = async () => {
        if (!decision) return;
        setBusy(true);
        try {
            const r = await api.decideTransferRequest(decision.req.id, decision.kind, decision.note.trim() || undefined);
            if (decision.kind === 'approve') success('Envantere aktarıldı', `${r.risksUpdated} risk güncellendi · ${r.controlsUpdated} kontrol güncellendi · ${r.controlsCreated} kontrol oluşturuldu · ${r.linksRemoved} bağlantı kaldırıldı.`);
            else success('Talep reddedildi');
            setDecision(null); await load(); onChanged();
        } catch (e) { showError('İşlem yapılamadı', e instanceof ApiError ? e.message : 'Karar kaydedilemedi.'); }
        finally { setBusy(false); }
    };
    const cancel = async (req: RequestRow) => {
        setBusy(true);
        try { await api.decideTransferRequest(req.id, 'cancel'); success('Talep iptal edildi'); await load(); }
        catch (e) { showError('İptal edilemedi', e instanceof ApiError ? e.message : 'Talep iptal edilemedi.'); }
        finally { setBusy(false); }
    };

    if (error) return <ErrorState title={error.title} description={error.description} onRetry={error.retryable ? load : undefined} />;
    if (!requests) return <LoadingState message="Aktarım önizlemesi hazırlanıyor..." />;
    const changed = (preview?.rows ?? []).filter(r => r.hasChanges);
    const pending = requests.some(r => r.status === 'PENDING');
    const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-600">
                Simülasyondaki değerler onaylanırsa <b>Risk Envanteri</b> ve <b>Kontrol Alanı</b>&apos;na yazılır. Riske etki boyutları, olasılık ve Flag for IT yazılır;
                doğal risk envanterin kendi formülüyle yeniden hesaplanır. Bütünleşik kontrol ve kalıntı risk simülasyonun sonucudur (envanter seviyesine çevrilir: Çok Yüksek → Kritik, Çok Düşük → Düşük).
                Kontrollerin P1–P5 metinleri, tanımı ve statüsü güncellenir; simülasyonda eklenen kontroller oluşturulur. KTS ve ağırlık Kontrol Alanı&apos;nda olmadığından yazılmaz.
                Talebi Risk ve Kontrol Yöneticisi veya Sistem Yöneticisi onaylar; talep eden kendi talebini onaylayamaz.
            </div>

            {isDraft ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">Envantere aktarmadan önce simülasyonu kaydedin (sağ üstteki &quot;Kaydet&quot;).</div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                        <div className="text-[15px] text-slate-900"><b>Aktarım önizlemesi</b> <span className="text-slate-500">{changed.length} riskte değişiklik</span></div>
                        <Button size="sm" variant="secondary" className="ml-auto" onClick={load} disabled={busy}>Önizlemeyi yenile</Button>
                    </div>
                    {changed.length === 0 ? (
                        <p className="border-t border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Simülasyon ile envanter arasında aktarılacak fark yok.</p>
                    ) : (
                        <div className="border-t border-slate-200">
                            {changed.map(r => (
                                <div key={r.scenarioId} className="border-b border-slate-100 px-4 py-2.5">
                                    <div className="flex items-center gap-3">
                                        <input type="checkbox" checked={selected.has(r.scenarioId)} onChange={() => setSelected(s => toggle(s, r.scenarioId))} aria-label={`${r.riskId} seç`} />
                                        <button type="button" onClick={() => setOpen(s => toggle(s, r.scenarioId))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                            <span className="font-mono text-sm font-semibold text-slate-800">{r.riskId}</span>
                                            <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{r.riskName}</span>
                                            <span className="text-[11px] text-slate-500">{r.fields.length} alan · {r.controls.length} kontrol{r.warnings.length ? ' · ⚠' : ''}</span>
                                            <span className="text-slate-400">{open.has(r.scenarioId) ? '▾' : '▸'}</span>
                                        </button>
                                    </div>
                                    {open.has(r.scenarioId) && <div className="mt-2 pl-7"><TransferRowView r={r} /></div>}
                                </div>
                            ))}
                        </div>
                    )}
                    {(preview?.skipped.length ?? 0) > 0 && (
                        <p className="border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">Aktarılamayan: {preview!.skipped.map(s => `${s.riskId} (${s.reason})`).join(' · ')}</p>
                    )}
                    {changed.length > 0 && (
                        <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 px-4 py-3">
                            <div className="min-w-[280px] flex-1"><Textarea label="Talep notu (isteğe bağlı)" value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={2000} /></div>
                            <Button variant="primary" onClick={createRequest} loading={busy} disabled={selected.size === 0 || pending}>
                                {pending ? 'Bekleyen talep var' : `Aktarım talebi oluştur (${selected.size} risk)`}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="px-4 py-3 text-[15px] text-slate-900"><b>Aktarım talepleri</b> <span className="text-slate-500">{requests.length}</span></div>
                <table className="w-full border-t border-slate-200 text-[13px]">
                    <thead className="bg-slate-50 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                        <tr><th className="px-4 py-2">Talep</th><th className="px-2 py-2">Durum</th><th className="px-2 py-2">Risk</th><th className="px-2 py-2">Talep eden</th><th className="px-2 py-2">Karar</th><th className="px-4 py-2 text-right">İşlem</th></tr>
                    </thead>
                    <tbody>
                        {requests.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Bu simülasyon için aktarım talebi yok.</td></tr>}
                        {requests.map(r => (
                            <tr key={r.id} className="border-t border-slate-100 align-top">
                                <td className="px-4 py-2"><div className="font-mono font-semibold">{r.requestNo}</div><div className="text-[11px] text-slate-500">{dt(r.requestedAt)}</div>{r.note && <div className="text-[12px] text-slate-600">{r.note}</div>}</td>
                                <td className="px-2 py-2"><StatusBadge variant={REQUEST_STATUS[r.status][1]}>{REQUEST_STATUS[r.status][0]}</StatusBadge></td>
                                <td className="px-2 py-2">{r.scenarioIds.length}</td>
                                <td className="px-2 py-2">{r.requestedBy.firstName} {r.requestedBy.lastName}</td>
                                <td className="px-2 py-2 text-[12px]">{r.decidedBy ? `${r.decidedBy.firstName} ${r.decidedBy.lastName} · ${dt(r.decidedAt)}` : '—'}{r.decisionNote && <div className="text-slate-600">{r.decisionNote}</div>}</td>
                                <td className="px-4 py-2 text-right">
                                    {r.status === 'PENDING' && (
                                        <div className="flex justify-end gap-2">
                                            {canApprove && r.requestedBy.id !== user?.id && <>
                                                <Button size="sm" variant="secondary" onClick={() => openDecision(r, 'reject')} disabled={busy}>Reddet</Button>
                                                <Button size="sm" variant="primary" onClick={() => openDecision(r, 'approve')} disabled={busy}>İncele ve onayla</Button>
                                            </>}
                                            {r.requestedBy.id === user?.id && <Button size="sm" variant="secondary" onClick={() => cancel(r)} disabled={busy}>İptal et</Button>}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Modal open={decision !== null} onClose={() => !busy && setDecision(null)} size="xl"
                title={decision?.kind === 'approve' ? `${decision?.req.requestNo} · envantere aktar` : `${decision?.req.requestNo} · reddet`}
                footer={<>
                    <Button variant="secondary" onClick={() => setDecision(null)} disabled={busy}>Vazgeç</Button>
                    <Button variant={decision?.kind === 'approve' ? 'primary' : 'danger'} onClick={decide} loading={busy}>{decision?.kind === 'approve' ? 'Onayla ve envantere yaz' : 'Reddet'}</Button>
                </>}>
                {decision && (
                    <div className="space-y-3">
                        {decision.kind === 'approve' && <p className="text-sm text-slate-600">Aşağıdaki değerler talep anındaki önizlemedir. Onaylayınca Risk Envanteri ve Kontrol Alanı&apos;na yazılır. Talepten sonra envanterde değişen bir kayıt varsa aktarım yapılmaz.</p>}
                        {decision.detail === null ? <LoadingState message="Talep ayrıntısı yükleniyor..." /> : (
                            <div className="max-h-[50vh] space-y-3 overflow-auto">
                                {decision.detail.map(r => (
                                    <div key={r.scenarioId} className="rounded-xl border border-slate-200 p-3">
                                        <div className="mb-1 text-sm"><b className="font-mono">{r.riskId}</b> <span className="text-slate-600">{r.riskName}</span></div>
                                        <TransferRowView r={r} />
                                    </div>
                                ))}
                            </div>
                        )}
                        <Textarea label={decision.kind === 'approve' ? 'Onay notu (isteğe bağlı)' : 'Ret gerekçesi (isteğe bağlı)'} value={decision.note} onChange={e => setDecision({ ...decision, note: e.target.value })} rows={2} maxLength={2000} />
                    </div>
                )}
            </Modal>
        </div>
    );
}
