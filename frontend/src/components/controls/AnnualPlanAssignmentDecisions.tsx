'use client';

import type { AnnualPlanAssignmentDecision, AnnualPlanPreview } from '@/types/annual-plan';

export function hasUnresolvedPlanConflicts(preview: AnnualPlanPreview, decisions: AnnualPlanAssignmentDecision[]) {
    return preview.missingSchedule.length > 0 || preview.assignmentBlocked.length > 0 ||
        preview.conflicts.some(conflict => conflict.type !== 'ASSIGNMENT' ||
            conflict.ongoingTasks.some(task => !decisions.some(d => d.controlId === conflict.controlId && d.taskId === task.id && (d.action === 'KEEP' || d.action === 'REASSIGN'))));
}

const statuses: Record<string, string> = {
    DEVAM_EDIYOR: 'Devam ediyor', TAMAMLANDI: 'Tamamlandı / onay bekliyor', GERI_GONDERILDI: 'Geri gönderildi',
};

export function AnnualPlanAssignmentDecisions({ preview, decisions, onChange, disabled }: {
    preview: AnnualPlanPreview;
    decisions: AnnualPlanAssignmentDecision[];
    onChange: (decisions: AnnualPlanAssignmentDecision[]) => void;
    disabled: boolean;
}) {
    const conflicts = preview.conflicts.filter(c => c.type === 'ASSIGNMENT');
    if (!conflicts.length) return null;
    return <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3" aria-label="Görev atama kararları">
        <h3 className="text-sm font-semibold text-amber-900">Devam eden görevler için atama kararı</h3>
        <p className="text-xs text-slate-700">Her görev için seçim yapın. “Koru” mevcut görev atamasını korur; “Yeni kontrolcüleri ata” plandaki iki kontrolcüyü göreve atar. Yıllık kapsam ve bekleyen otomatik görevler yeni atamayı alır. Onaylanmış ve manuel görevler değişmez.</p>
        {conflicts.map(conflict => <div key={conflict.controlId} className="space-y-2 rounded border border-amber-200 bg-white p-3">
            <p className="text-sm font-semibold">{conflict.controlCode} — {conflict.name}</p>
            <p className="text-xs text-slate-600">Plandaki kontrolcü: {conflict.assigneeName ?? 'Atanmamış'} · İkinci kontrolcü: {conflict.secondControllerName ?? 'Atanmamış'}</p>
            {conflict.ongoingTasks.map(task => <label key={task.id} className="block border-t border-slate-100 pt-2 text-xs text-slate-700">
                <span className="block font-medium">{task.testNo} · {task.periodLabel} · {statuses[task.status] ?? task.status}</span>
                <span className="block my-1">Mevcut kontrolcü: {task.assigneeName ?? 'Atanmamış'} · İkinci kontrolcü: {task.secondControllerName ?? 'Atanmamış'}</span>
                <select aria-label={`${task.testNo} atama kararı`} disabled={disabled}
                    className="w-full rounded border border-slate-300 bg-white p-2"
                    value={decisions.find(d => d.controlId === conflict.controlId && d.taskId === task.id)?.action ?? ''}
                    onChange={event => {
                        const remaining = decisions.filter(d => d.taskId !== task.id);
                        const action = event.target.value;
                        onChange(action === 'KEEP' || action === 'REASSIGN' ? [...remaining, { controlId: conflict.controlId, taskId: task.id, action }] : remaining);
                    }}>
                    <option value="">Karar seçin…</option>
                    <option value="KEEP">Mevcut görev atamasını koru</option>
                    <option value="REASSIGN">Yeni kontrolcüleri ata</option>
                </select>
            </label>)}
        </div>)}
    </section>;
}
