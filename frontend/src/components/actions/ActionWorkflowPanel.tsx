'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PendingApprovalNotice } from '@/components/approvals/PendingApprovalNotice';
import api from '@/lib/api';
import { Button, DetailSection, Modal, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

/**
 * Aksiyonun maker-checker akışı: Taslak → 2. kontrolcü onayı → takip çalışması →
 * takip değerlendirmesi ve onayı → kapanış. Düğmeler backend yeteneklerine
 * (finding-capabilities.ts) göre gösterilir; yetki arka uçta yeniden denetlenir.
 */

type BV = 'neutral' | 'warning' | 'info' | 'success' | 'critical';
type Op = 'submit' | 'approve' | 'reject' | 'revert' | 'delete-request' | 'delete-approve' | 'delete-reject';

const APPROVAL: Record<string, { label: string; variant: BV }> = {
    TASLAK: { label: 'Taslak', variant: 'neutral' },
    ONAY_BEKLIYOR: { label: '2. kontrolcü onayı bekliyor', variant: 'warning' },
    ONAYLANDI: { label: 'Onaylandı', variant: 'success' },
    REDDEDILDI: { label: 'Reddedildi', variant: 'critical' },
};

const FU_STATUS: Record<string, { label: string; variant: BV }> = {
    BEKLIYOR: { label: 'Bekliyor', variant: 'info' },
    DEVAM_EDIYOR: { label: 'Devam ediyor', variant: 'warning' },
    TAMAMLANDI: { label: 'Onay bekliyor', variant: 'warning' },
    ONAYLANDI: { label: 'Onaylandı', variant: 'success' },
    IPTAL: { label: 'İptal', variant: 'neutral' },
};

const RESULT: Record<string, string> = { YETERLI: 'Yeterli', YETERSIZ: 'Yetersiz', YENI_AKSIYON_GEREKLI: 'Yeni aksiyon gerekli' };

const OP_TEXT: Record<Op, { title: string; confirm: string; needsReason: boolean; hint: string; danger?: boolean }> = {
    submit: { title: '2. kontrolcü onayına gönder', confirm: 'Onaya gönder', needsReason: false, hint: 'Gönderdikten sonra aksiyon, karar verilene kadar düzenlenemez.' },
    approve: { title: 'Aksiyonu onayla', confirm: 'Onayla', needsReason: false, hint: 'Onayla birlikte aksiyonun takip çalışması hedef tarihte oluşturulur.' },
    reject: { title: 'Aksiyonu reddet', confirm: 'Reddet', needsReason: true, hint: 'Aksiyon gerekçeyle birinci kontrolcüye düzeltmeye döner.', danger: true },
    revert: { title: 'Onayı geri al', confirm: 'Onayı geri al', needsReason: true, hint: 'Takip çalışmasında işlem yapılmadıysa takip iptal edilir, aksiyon taslağa döner.', danger: true },
    'delete-request': { title: 'Silme talebi', confirm: 'Talep gönder', needsReason: true, hint: 'Talep 2. kontrolcü onayına gider; onaylanınca kayıt "Silindi" olarak işaretlenir.', danger: true },
    'delete-approve': { title: 'Silmeyi onayla', confirm: 'Silmeyi onayla', needsReason: false, hint: 'Aksiyon ve bağlı takip çalışmaları "Silindi" olarak işaretlenir (kayıt korunur).', danger: true },
    'delete-reject': { title: 'Silme talebini reddet', confirm: 'Reddet', needsReason: true, hint: 'Gerekçe birinci kontrolcüye iletilir.' },
};

export interface ActionWorkflowData {
    id: string;
    status: string;
    approvalState?: string | null;
    rejectionReason?: string | null;
    revertReason?: string | null;
    deletionReason?: string | null;
    deletionRejectionReason?: string | null;
    deletionRequestedAt?: string | null;
    deletedAt?: string | null;
    approvedAt?: string | null;
    submittedAt?: string | null;
    firstController?: { firstName: string; lastName: string } | null;
    secondController?: { firstName: string; lastName: string } | null;
    finding?: { id: string; findingId: string } | null;
    followUps?: Array<{
        id: string; followUpId: string; status: string; approvalStatus?: string | null; result?: string | null;
        plannedDate?: string | null; testDate?: string | null; deletedAt?: string | null; deletionRequestedAt?: string | null;
    }>;
    capabilities?: Record<string, boolean | undefined>;
}

const name = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}` : '—');
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('tr-TR') : '—');

function currentStep(a: ActionWorkflowData): number {
    const live = (a.followUps ?? []).filter(f => !f.deletedAt && f.status !== 'IPTAL');
    if (a.status === 'KAPATILDI' || a.status === 'CLOSED') return 4;
    if (live.some(f => f.status !== 'BEKLIYOR')) return 3;
    if ((a.approvalState ?? 'ONAYLANDI') === 'ONAYLANDI') return 2;
    if (a.approvalState === 'ONAY_BEKLIYOR') return 1;
    return 0;
}

const STEPS = ['Taslak', '2. kontrolcü onayı', 'Takip çalışması açıldı', 'Takip değerlendirmesi', 'Kapandı'];

export function ActionWorkflowPanel({ action, onChanged }: { action: ActionWorkflowData; onChanged: () => void }) {
    const { success, error: showError } = useToast();
    const [op, setOp] = useState<Op | null>(null);
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const caps = action.capabilities ?? {};
    const state = action.approvalState ?? 'ONAYLANDI';
    const step = currentStep(action);
    const deleted = !!action.deletedAt;
    const followUps = action.followUps ?? [];
    const findingLink = action.finding ? `/findings/${action.finding.id}` : null;

    const run = async () => {
        if (!op || !action.finding) return;
        const t = OP_TEXT[op];
        if (t.needsReason && !reason.trim()) { showError('Gerekçe gerekli', 'Lütfen gerekçe yazın.'); return; }
        setSaving(true);
        try {
            const res = await api.findingActionOp(action.finding.id, action.id, op, t.needsReason ? reason.trim() : undefined);
            const created = op === 'approve' ? res?.createdFollowUp?.followUpId : null;
            success('Kaydedildi', created ? `Aksiyon onaylandı; takip çalışması ${created} oluşturuldu.` : `${t.title}: tamamlandı.`);
            setOp(null); setReason('');
            onChanged();
        } catch (err) {
            showError('İşlem yapılamadı', (err as Error).message);
        } finally { setSaving(false); }
    };

    const open = (o: Op) => { setReason(''); setOp(o); };
    const buttons: Array<[Op, string, 'primary' | 'outline' | 'danger']> = [];
    // Gönder / onayla / iade / geri al / silme talebi üstteki iş akışı çubuğundadır (tek yer).
    // Burada yalnız yöneticinin silme kararı kalır (Onaylarım > Silme Talepleri ile aynı işlem).
    if (caps.canDecideDelete) buttons.push(['delete-approve', 'Silmeyi onayla', 'danger'], ['delete-reject', 'Silme talebini reddet', 'outline']);

    const nextHint = deleted ? 'Bu aksiyon silindi; kayıt tarihçe için korunuyor.'
        : action.deletionRequestedAt ? 'Silme talebi yöneticinin (talep eden hariç) kararını bekliyor.'
            : state === 'TASLAK' ? 'Aksiyon taslak. Birinci kontrolcü onaya gönderince 2. kontrolcünün kutusuna düşer; takip çalışması onaydan sonra oluşur.'
                : state === 'REDDEDILDI' ? 'Aksiyon reddedildi. Gerekçeye göre düzenleyip yeniden onaya gönderin.'
                    : state === 'ONAY_BEKLIYOR' ? '2. kontrolcünün onayı bekleniyor. Onaylanınca takip çalışması hedef tarihte oluşur.'
                        : step === 2 ? 'Takip çalışması açıldı. Hedef tarihte birinci kontrolcü değerlendirir.'
                            : step === 3 ? 'Takip değerlendirmesi sürüyor; ikinci kontrolcü onayıyla aksiyon kapanır.'
                                : 'Aksiyon kapandı.';

    return (
        <>
            <DetailSection title="Onay ve yürütme durumu">
                <div className="space-y-4">
                    <ol className="grid grid-cols-5 gap-2" aria-label="Aksiyon akış adımları">
                        {STEPS.map((label, i) => {
                            const done = !deleted && i < step;
                            const now = !deleted && i === step;
                            return (
                                <li key={label} aria-current={now ? 'step' : undefined} className="flex flex-col gap-1.5">
                                    <span className={`h-1.5 rounded-full ${done ? 'bg-emerald-500' : now ? 'bg-blue-600' : 'bg-slate-200'}`} />
                                    <span className={`text-[11px] leading-tight ${now ? 'font-bold text-blue-700' : done ? 'text-slate-600' : 'text-slate-400'}`}>{label}</span>
                                </li>
                            );
                        })}
                    </ol>

                    <div className="flex flex-wrap items-center gap-2">
                        {deleted ? <StatusBadge variant="neutral">Silindi</StatusBadge>
                            : <StatusBadge variant={APPROVAL[state]?.variant ?? 'neutral'}>{APPROVAL[state]?.label ?? state}</StatusBadge>}
                        {action.deletionRequestedAt && !deleted && <StatusBadge variant="critical">Silme onayı bekliyor</StatusBadge>}
                        <span className="text-xs text-slate-500">1. kontrolcü: <b className="text-slate-700">{name(action.firstController)}</b></span>
                        <span className="text-xs text-slate-500">2. kontrolcü: <b className="text-slate-700">{name(action.secondController)}</b></span>
                    </div>

                    {!deleted && action.secondController && state === 'ONAY_BEKLIYOR' && (
                        <PendingApprovalNotice
                            title="Aksiyon onay bekliyor"
                            waitingFor={[{ name: name(action.secondController), role: '2. kontrolcü' }]}
                            sentBy={name(action.firstController)} sentAt={action.submittedAt}
                        />
                    )}
                    {!deleted && action.deletionRequestedAt && (
                        <PendingApprovalNotice
                            testId="pending-deletion"
                            title="Silme talebi onay bekliyor"
                            waitingFor={[{ name: 'Yönetici (Risk ve Kontrol Yöneticisi / Sistem Yöneticisi)', role: 'talep eden hariç' }]}
                            sentAt={action.deletionRequestedAt}
                        />
                    )}
                    <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{nextHint}</p>

                    {state === 'REDDEDILDI' && action.rejectionReason && (
                        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2"><b>Ret gerekçesi:</b> {action.rejectionReason}</p>
                    )}
                    {action.revertReason && state !== 'ONAYLANDI' && (
                        <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2"><b>Onay geri alındı:</b> {action.revertReason}</p>
                    )}
                    {action.deletionRequestedAt && action.deletionReason && !deleted && (
                        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2"><b>Silme gerekçesi:</b> {action.deletionReason}</p>
                    )}
                    {!action.deletionRequestedAt && action.deletionRejectionReason && !deleted && (
                        <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2"><b>Silme talebi reddedildi:</b> {action.deletionRejectionReason}</p>
                    )}
                    {!action.secondController && !deleted && state !== 'ONAYLANDI' && (
                        <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                            Bu aksiyonun 2. kontrolcüsü yok; onaya gönderilemez. Düzenle penceresinden 2. kontrolcü seçin.
                        </p>
                    )}

                    {buttons.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                            {buttons.map(([o, label, variant]) => (
                                <Button key={o} size="sm" variant={variant} onClick={() => open(o)}>{label}</Button>
                            ))}
                        </div>
                    )}
                </div>
            </DetailSection>

            <DetailSection title={`Takip Çalışmaları (${followUps.filter(f => !f.deletedAt).length})`}>
                {followUps.length === 0 ? (
                    <p className="text-sm text-slate-500">
                        Henüz takip çalışması yok. {state === 'ONAYLANDI' ? '' : 'Takip çalışması, aksiyon 2. kontrolcü tarafından onaylanınca hedef tarihte otomatik oluşur.'}
                    </p>
                ) : (
                    <ul className="divide-y divide-slate-100 -my-2">
                        {followUps.map(f => {
                            const st = f.deletedAt ? { label: 'Silindi', variant: 'neutral' as BV } : FU_STATUS[f.status] ?? { label: f.status, variant: 'neutral' as BV };
                            return (
                                <li key={f.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${f.deletedAt || f.status === 'IPTAL' ? 'opacity-60' : ''}`}>
                                    <span className="font-mono text-xs font-bold text-slate-700">{f.followUpId}</span>
                                    <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
                                    {f.result && <span className="text-xs text-slate-600">Sonuç: {RESULT[f.result] ?? f.result}</span>}
                                    {f.deletionRequestedAt && !f.deletedAt && <span className="text-xs text-red-600">Silme onayı bekliyor</span>}
                                    <span className="text-xs text-slate-500">Planlanan: {fmt(f.plannedDate)}</span>
                                    {findingLink && (
                                        <Link href={`${findingLink}#followup-${f.id}`} className="ml-auto text-xs font-semibold text-blue-600 hover:underline">
                                            Takibi aç →
                                        </Link>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </DetailSection>

            <Modal open={!!op} onClose={() => { if (!saving) setOp(null); }} size="sm">
                {op && (
                    <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-slate-800">{OP_TEXT[op].title}</h3>
                        <p className="text-sm text-slate-500">{OP_TEXT[op].hint}</p>
                        {OP_TEXT[op].needsReason && (
                            <>
                                <label htmlFor="action-op-reason" className="block text-sm font-medium text-slate-700">Gerekçe *</label>
                                <textarea id="action-op-reason" value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={2000}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                            </>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={() => setOp(null)} disabled={saving}>Vazgeç</Button>
                            <Button variant={OP_TEXT[op].danger ? 'danger' : 'primary'} onClick={run} loading={saving}
                                disabled={OP_TEXT[op].needsReason && !reason.trim()}>
                                {OP_TEXT[op].confirm}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}

export default ActionWorkflowPanel;
