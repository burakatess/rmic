'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api, { ApiError } from '@/lib/api';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { PendingApprovalNotice } from '@/components/approvals/PendingApprovalNotice';
import type { WorkflowActionKey, WorkflowEntityType, WorkflowState } from '@/types/workflow';

// Aşama listesi türe özeldir ve sunucudan gelir (ör. bulgu: Açık → Kapanış Değerlendirmesinde → Kapatıldı;
// aksiyon planı: Taslak → 2. Kontrolcü Onayında → Onaylandı).
const fmt = (d: string) => new Date(d).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Jira tarzı iş akışı bileşeni — Bulgu, Kontrol Testi, Takip Çalışması ve Dönem Kontrolü detaylarının
 * en üstünde. Mevcut/önceki/sonraki aşama, yetkiye göre geçişler (gönder/onayla/iade/geri al/iptal)
 * ve durum geçmişi. Kurallar backend'de de doğrulanır; buradaki düğmeler yalnız izinli eylemlerdir.
 */
export function WorkflowBar({ type, id, onChanged, compact = false, refreshKey }: {
    type: WorkflowEntityType; id: string; onChanged?: () => void; compact?: boolean; refreshKey?: unknown;
}) {
    const { success, error: showError } = useToast();
    const [state, setState] = useState<WorkflowState | null>(null);
    const [failed, setFailed] = useState(false);
    // confirmOnly: gerekçe istemeyen ama geri dönüşü önemli geçişler (bulgu kapanış onayı) için yalnız teyit.
    const [pending, setPending] = useState<{ action: WorkflowActionKey; label: string; confirmOnly?: boolean } | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    const load = useCallback(() => {
        api.getWorkflowState(type, id).then(s => { setState(s); setFailed(false); }).catch(() => setFailed(true));
    }, [type, id]);
    useEffect(() => { load(); }, [load, refreshKey]);

    const run = async (action: WorkflowActionKey, r?: string) => {
        setBusy(true);
        try {
            const res = await api.workflowTransition(type, id, action, r) as { deletionRequested?: boolean } | undefined;
            success('Kaydedildi', res?.deletionRequested ? 'Silme talebi yönetici onayına gönderildi.' : 'Durum güncellendi.');
            setPending(null); setReason('');
            load(); onChanged?.();
        } catch (e) {
            const body = e instanceof ApiError ? (e.body as { message?: unknown; href?: string } | undefined) : undefined;
            const msg = typeof body?.message === 'object' && body?.message ? (body.message as { message?: string }).message : (e as Error).message;
            showError('İşlem yapılamadı', msg || 'Geçiş reddedildi.');
        } finally { setBusy(false); }
    };

    if (failed) return null;
    if (!state) return <div className="h-16 rounded-xl bg-slate-100 animate-pulse" aria-hidden />;

    const cancelled = state.stage === 'IPTAL';
    const idx = state.stages.findIndex(st => st.key === state.stage);
    const awaitingLabel = type === 'FINDING' ? 'kapanış değerlendirmesi' : 'onay';
    const buttons = state.actions.filter(a => a.action !== 'COMPLETE' || !a.formHref);
    const formAction = state.actions.find(a => a.action === 'COMPLETE' && a.formHref);

    return (
        <section className="bg-white border border-slate-200 rounded-xl px-4 py-3" data-testid="workflow-bar" data-stage={state.stage} aria-label="İş akışı">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <ol className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Aşamalar">
                    {state.stages.map((st, i) => {
                        // Son aşamaya varıldıysa (Kapatıldı / Onaylandı) o aşama da tamamlanmış gösterilir.
                        const done = !cancelled && (i < idx || (i === idx && i === state.stages.length - 1));
                        const now = !cancelled && i === idx;
                        return (
                            <li key={st.key} className="flex items-center gap-1.5" aria-current={now ? 'step' : undefined} title={st.hint}>
                                <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold ${now ? 'bg-blue-600 text-white' : done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                    {done ? '✓' : `${i + 1}`} {st.label}
                                </span>
                                {i < state.stages.length - 1 && <span className="text-slate-300" aria-hidden>›</span>}
                            </li>
                        );
                    })}
                    {cancelled && <li className="ml-1 rounded-md bg-red-50 text-red-700 px-2.5 py-1 font-semibold">İptal edildi</li>}
                </ol>

                {!compact && (
                    <div className="text-[12px] text-slate-500 flex flex-wrap gap-x-3">
                        <span>{type === 'FINDING' || type === 'ACTION' ? '1. kontrolcü' : 'Sorumlu'}: <b className="text-slate-700">{state.assignee?.name ?? 'Atanmamış'}</b></span>
                        <span>2. kontrolcü: <b className="text-slate-700">{state.checker?.name ?? 'Atanmamış'}</b></span>
                    </div>
                )}

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {formAction && (
                        <span className="text-[12px] text-slate-500">Tamamlamak için aşağıdaki formu doldurun{type !== 'CONTROL_TEST' && <> · <Link href={formAction.formHref!} className="text-blue-600 hover:underline">kayda git</Link></>}</span>
                    )}
                    {buttons.map(a => (
                        <Button key={a.action} size="sm" disabled={busy}
                            variant={a.action === 'APPROVE' ? 'success' : a.action === 'CANCEL' ? 'danger' : a.action === 'START' ? 'primary' : 'outline'}
                            onClick={() => {
                                if (a.needsReason) { setReason(''); setPending({ action: a.action, label: a.label }); }
                                else if (type === 'FINDING' && a.action === 'APPROVE') setPending({ action: a.action, label: a.label, confirmOnly: true });
                                else run(a.action);
                            }}>
                            {a.label}
                        </Button>
                    ))}
                    <button type="button" onClick={() => setHistoryOpen(o => !o)} aria-expanded={historyOpen} className="text-[12px] font-medium text-slate-500 hover:text-slate-800">
                        Geçmiş ({state.history.length}) {historyOpen ? '▴' : '▾'}
                    </button>
                </div>
            </div>

            {state.stage === 'TAMAMLANDI' && (
                <div className="mt-3">
                    <PendingApprovalNotice
                        title={`${state.code} ${awaitingLabel} bekliyor`}
                        waitingFor={state.checker ? [{ name: state.checker.name, role: type === 'FINDING' ? '2. kontrolcü (veya yönetici)' : '2. kontrolcü' }] : []}
                        sentBy={state.submittedBy?.name ?? null}
                        sentAt={state.history.find(h => h.to === 'TAMAMLANDI')?.at ?? null}
                    />
                </div>
            )}
            {state.deletion && (
                <p className="mt-3 text-sm rounded-lg border border-red-200 bg-red-50 text-red-800 px-3 py-2" data-testid="deletion-pending">
                    Silme talebi yönetici onayı bekliyor{state.deletion.requestedBy ? ` · Talep eden: ${state.deletion.requestedBy.name}` : ''}{state.deletion.reason ? ` · Gerekçe: ${state.deletion.reason}` : ''}
                </p>
            )}

            {historyOpen && (
                <ul className="mt-3 border-t border-slate-100 divide-y divide-slate-100" data-testid="workflow-history">
                    {state.history.length === 0 && <li className="py-2 text-sm text-slate-400">Henüz durum geçişi yok.</li>}
                    {state.history.map(h => (
                        <li key={h.id} className="py-2 text-sm flex flex-wrap gap-x-2">
                            <b className="text-slate-800">{h.actionLabel}</b>
                            <span className="text-slate-500">{h.fromLabel} → {h.toLabel}</span>
                            <span className="text-slate-500">· {h.by?.name ?? 'Sistem'}</span>
                            <span className="ml-auto text-xs text-slate-400">{fmt(h.at)}</span>
                            {h.reason && <p className="w-full text-slate-600 text-[13px]">Gerekçe: {h.reason}</p>}
                        </li>
                    ))}
                </ul>
            )}

            <Modal open={!!pending} onClose={() => !busy && setPending(null)} title={pending?.label} description={pending?.confirmOnly
                ? 'Bulgu kapatılacak ve kapanış tarihi bugün olarak yazılacak. Gerekirse "Önceki aşamaya geri al" ile yeniden değerlendirmeye alınabilir.'
                : pending?.action === 'COMPLETE' && type === 'FINDING'
                ? 'Kapanış değerlendirmenizi yazın; 2. kontrolcü veya yönetici onaylayınca bulgu kapanır. Durum geçmişine yazılır.'
                : pending?.action === 'CANCEL' ? 'Kayıt silinmez; yönetici (talep eden hariç) onaylarsa silinir. Gerekçe zorunludur.'
                : 'Gerekçe zorunludur ve durum geçmişine yazılır.'} size="md"
                footer={<div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPending(null)} disabled={busy}>Vazgeç</Button>
                    <Button variant={pending?.action === 'CANCEL' ? 'danger' : pending?.confirmOnly ? 'success' : 'primary'} size="sm" loading={busy}
                        disabled={!pending?.confirmOnly && !reason.trim()}
                        onClick={() => pending && run(pending.action, pending.confirmOnly ? undefined : reason.trim())}>
                        {pending?.confirmOnly ? pending.label : pending?.action === 'COMPLETE' ? 'Gönder' : pending?.action === 'CANCEL' ? 'Silme talebi gönder' : 'Onayla'}
                    </Button>
                </div>}>
                {!pending?.confirmOnly && (
                    <>
                        <label htmlFor="wf-reason" className="block text-xs font-semibold text-slate-600 mb-1">{pending?.action === 'COMPLETE' && type === 'FINDING' ? 'Kapanış değerlendirmesi *' : 'Gerekçe *'}</label>
                        <textarea id="wf-reason" value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={2000} autoFocus
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </>
                )}
            </Modal>
        </section>
    );
}
