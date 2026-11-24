'use client';

import { useEffect, useState } from 'react';
import api, { type ControlHistoryEntry } from '@/lib/api';
import { FREQUENCY_LABELS } from '@/lib/control-labels';

const ACTION_LABELS: Record<string, string> = {
    CREATE: 'Kontrol oluşturuldu',
    UPDATE: 'Kontrol güncellendi',
    ACTIVATE: 'Envanterde aktifleştirildi',
    PASSIVATE: 'Envanterde pasifleştirildi',
    MAP_RISK: 'Risk eşleştirildi',
    UPDATE_RISK_MAPPING: 'Risk eşleştirme türü değişti',
    UNMAP_RISK: 'Risk eşleştirmesi kaldırıldı',
    SCOPE_ADD: 'Yıllık kapsama alındı',
    SCOPE_COPY: 'Önceki yıldan kapsama kopyalandı',
    SCOPE_REACTIVATE: 'Kapsam yeniden açıldı',
    SCOPE_REMOVE: 'Kapsamdan çıkarıldı',
    SCOPE_REMOVAL: 'Kapsamdan çıkarıldı',
    SCOPE_ASSIGNMENT_CHANGE: 'Kontrolcü ataması değişti',
    SCOPE_PERIODICITY_CHANGE: 'Dönem sıklığı değişti',
    SCOPE_CONTROL_VERSION_APPLY: 'Yeni kontrol sürümü döneme uygulandı',
    SCOPE_MISSING_TASKS: 'Eksik dönem testleri üretildi',
    DELETE_REQUEST: 'Silme talebi oluşturuldu',
    DELETE_APPROVE: 'Silme talebi onaylandı',
    DELETE_REJECT: 'Silme talebi reddedildi',
    CANCEL: 'İptal edildi',
};

const ENUM_VALUE: Record<string, string> = {
    ...FREQUENCY_LABELS,
    ACTIVE: 'Aktif', PASSIVE: 'Pasif',
};
const shown = (v: string | null) => (v === null ? '—' : ENUM_VALUE[v] ?? v);
const fmt = (d: string) => new Date(d).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

/** Kontrolün denetim izinden derlenen değişiklik geçmişi (ana kayıt, yıllık kapsamlar, risk eşleştirmeleri). */
export default function ControlHistoryPanel({ controlId }: { controlId: string }) {
    const [rows, setRows] = useState<ControlHistoryEntry[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        api.getControlHistory(controlId)
            .then(r => { if (alive) setRows(r); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [controlId]);

    if (failed) return <p className="text-sm text-red-600">Değişiklik geçmişi yüklenemedi.</p>;
    if (!rows) return <div className="h-24 rounded-xl bg-slate-100 animate-pulse" aria-hidden />;
    if (rows.length === 0) return <p className="text-sm text-slate-400">Bu kontrol için kayıtlı değişiklik yok.</p>;

    return (
        <ol className="relative border-l border-slate-200 ml-2 space-y-5" data-testid="control-history">
            {rows.map(r => (
                <li key={r.id} className="ml-5">
                    <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white" aria-hidden />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                        <b className="text-sm text-slate-900">{ACTION_LABELS[r.action] ?? r.action}</b>
                        {r.year !== null && <span className="text-[11px] font-semibold rounded bg-slate-100 text-slate-600 px-1.5 py-0.5">{r.year} kapsamı</span>}
                        {r.detail && <span className="text-[13px] text-slate-600">{r.detail}</span>}
                        <span className="ml-auto text-xs text-slate-400">{fmt(r.at)} · {r.by ?? 'Sistem'}</span>
                    </div>
                    {r.changes.length > 0 && (
                        <dl className="mt-2 border border-slate-100 rounded-lg divide-y divide-slate-100 text-[13px]">
                            {r.changes.map(c => (
                                <div key={c.field} className="grid grid-cols-[140px_1fr] gap-3 px-3 py-1.5">
                                    <dt className="text-slate-500">{c.label}</dt>
                                    <dd className="text-slate-700 break-words">
                                        <span className="line-through text-slate-400">{shown(c.from)}</span>
                                        <span className="mx-1.5 text-slate-300" aria-hidden>→</span>
                                        <span className="font-medium">{shown(c.to)}</span>
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </li>
            ))}
        </ol>
    );
}
