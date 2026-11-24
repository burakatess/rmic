'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button, Modal } from '@/components/ui';

type Status = 'OPEN' | 'PENDING_APPROVAL' | 'CHANGES_REQUESTED' | 'APPROVED' | 'APPLIED';

export interface PlanHistoryEvent {
    id: string; action: string; at: string; revision: number | null; note: string | null; by: { id: string; name: string } | null;
}

const STEPS: Array<{ key: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'APPLIED'; label: string }> = [
    { key: 'DRAFT', label: 'Taslak' },
    { key: 'PENDING_APPROVAL', label: 'Onay Bekliyor' },
    { key: 'APPROVED', label: 'Onaylandı' },
    { key: 'APPLIED', label: 'Uygulandı' },
];

/** Durumun adım göstergesindeki yeri; "Değişiklik İstendi" taslak adımına döner ve ayrıca işaretlenir. */
export function stepIndexOf(status: Status): number {
    switch (status) {
        case 'OPEN': case 'CHANGES_REQUESTED': return 0;
        case 'PENDING_APPROVAL': return 1;
        case 'APPROVED': return 2;
        case 'APPLIED': return 3;
    }
}

export const PLAN_ACTION_LABELS: Record<string, string> = {
    ANNUAL_PLAN_SUBMIT: 'Onaya gönderildi',
    ANNUAL_PLAN_APPROVE: 'Onaylandı',
    ANNUAL_PLAN_REQUEST_CHANGES: 'Değişiklik istendi',
    ANNUAL_PLAN_APPLY: 'Uygulandı',
};

export function AnnualPlanStepper({ status }: { status: Status }) {
    const current = stepIndexOf(status);
    return (
        <ol className="flex items-center gap-2 text-xs" aria-label="Plan onay adımları" data-testid="plan-stepper">
            {STEPS.map((s, i) => {
                const done = i < current || (status === 'APPLIED' && i === current);
                const active = i === current && status !== 'APPLIED';
                return (
                    <li key={s.key} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                            done ? 'bg-emerald-600 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            {done ? '✓' : i + 1}
                        </span>
                        <span className={active ? 'font-semibold text-slate-900' : done ? 'text-slate-700' : 'text-slate-400'}>{s.label}</span>
                        {i < STEPS.length - 1 && <span className="h-px w-6 bg-slate-300" aria-hidden />}
                    </li>
                );
            })}
            {status === 'CHANGES_REQUESTED' && (
                <li className="ml-2 rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Değişiklik istendi — düzenleyip yeniden gönderin</li>
            )}
        </ol>
    );
}

/** Karar notu penceresi: `window.prompt` yerine. Ret/geri açma için gerekçe zorunlu, onay için isteğe bağlı. */
export function PlanDecisionDialog({ mode, busy, onCancel, onSubmit }: {
    mode: 'approve' | 'request-changes' | 'reopen' | null;
    busy: boolean;
    onCancel: () => void;
    onSubmit: (note: string) => void;
}) {
    const [note, setNote] = useState('');
    useEffect(() => { if (mode) setNote(''); }, [mode]);
    const required = mode !== 'approve';
    const trimmed = note.trim();
    const title = mode === 'approve' ? 'Planı Onayla' : mode === 'reopen' ? 'Onayı Geri Aç' : 'Değişiklik İste';
    const hint = mode === 'approve'
        ? 'İsteğe bağlı karar notu — karar geçmişinde görünür.'
        : 'Gerekçe zorunludur; planı hazırlayan kişiye ve karar geçmişine yansır.';
    return (
        <Modal
            open={mode !== null}
            onClose={() => { if (!busy) onCancel(); }}
            title={title}
            description={hint}
            size="md"
            footer={(
                <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Vazgeç</Button>
                    <Button
                        variant={mode === 'approve' ? 'primary' : 'danger'} size="sm" loading={busy}
                        disabled={busy || (required && trimmed.length === 0)}
                        onClick={() => onSubmit(trimmed)}
                    >
                        {mode === 'approve' ? 'Onayla' : 'Gönder'}
                    </Button>
                </div>
            )}
        >
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="plan-decision-note">
                Karar notu{required ? ' *' : ''}
            </label>
            <textarea
                id="plan-decision-note" value={note} maxLength={2000} rows={4} autoFocus
                onChange={e => setNote(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder={required ? 'Neden değişiklik isteniyor?' : 'Örn. kapsam ve takvim uygun bulundu.'}
            />
            <div className="mt-1 text-right text-[11px] text-slate-400">{note.length}/2000</div>
        </Modal>
    );
}

/** Karar geçmişi: gönderme / onay / değişiklik talebi / uygulama, notlarıyla. */
export function PlanDecisionHistory({ year, refreshKey }: { year: number; refreshKey: string | number }) {
    const [events, setEvents] = useState<PlanHistoryEvent[] | null>(null);
    const [open, setOpen] = useState(false);
    useEffect(() => {
        let alive = true;
        api.getAnnualPlanHistory(year).then(r => { if (alive) setEvents(r); }).catch(() => { if (alive) setEvents([]); });
        return () => { alive = false; };
    }, [year, refreshKey]);

    if (!events || events.length === 0) return null;
    return (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white" data-testid="plan-history">
            <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold text-slate-700" aria-expanded={open}>
                <span>Karar geçmişi ({events.length})</span>
                <span className="text-slate-400">{open ? '▴' : '▾'}</span>
            </button>
            {open && (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {events.map(e => (
                        <li key={e.id} className="px-4 py-2.5 text-sm">
                            <div className="flex flex-wrap items-center gap-x-2 text-slate-700">
                                <span className="font-semibold">{PLAN_ACTION_LABELS[e.action] ?? e.action}</span>
                                <span className="text-slate-500">· {e.by?.name ?? '—'}</span>
                                {e.revision !== null && <span className="text-xs text-slate-400">rev. {e.revision}</span>}
                                <span className="ml-auto text-xs text-slate-400">{new Date(e.at).toLocaleString('tr-TR')}</span>
                            </div>
                            {e.note && <p className="mt-1 whitespace-pre-wrap rounded bg-slate-50 px-2 py-1 text-slate-600">{e.note}</p>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
