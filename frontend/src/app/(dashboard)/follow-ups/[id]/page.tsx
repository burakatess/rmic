'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api, { type FollowUpDetail } from '@/lib/api';
import { classifyLoadError, type LoadError } from '@/lib/load-error';
import { DetailShell, DetailHeader, DetailSection, StatusBadge, Button, LoadingState, EmptyState } from '@/components/ui';
import { WorkflowBar } from '@/components/workflow/WorkflowBar';
import { FindingFollowUpModal } from '@/components/modals/FindingFollowUpModal';

type BV = 'neutral' | 'warning' | 'info' | 'success' | 'critical' | 'primary' | 'high';

const FU_STATUS: Record<string, { label: string; variant: BV }> = {
    BEKLIYOR: { label: 'Bekliyor', variant: 'neutral' },
    DEVAM_EDIYOR: { label: 'Devam ediyor', variant: 'warning' },
    TAMAMLANDI: { label: 'Tamamlandı · onayda', variant: 'info' },
    ONAYLANDI: { label: 'Onaylandı', variant: 'success' },
    IPTAL: { label: 'İptal', variant: 'neutral' },
};
const RESULT: Record<string, string> = { YETERLI: 'Yeterli', YETERSIZ: 'Yetersiz', YENI_AKSIYON_GEREKLI: 'Yeni aksiyon gerekli' };
const OUTCOME: Record<string, string> = { DEVAM_EDIYOR: 'Devam ediyor', KISMEN_KAPATILDI: 'Kısmen kapatıldı', KAPATILDI: 'Kapatıldı', ERTELENDI: 'Ertelendi', YENI_AKSIYON_GEREKLI: 'Yeni aksiyon gerekli' };
const ACTION_STATUS: Record<string, { label: string; variant: BV }> = {
    BEKLIYOR: { label: 'Bekliyor', variant: 'neutral' }, DEVAM_EDIYOR: { label: 'Devam ediyor', variant: 'warning' },
    TAMAMLANDI: { label: 'Tamamlandı', variant: 'info' }, YETERSIZ: { label: 'Yetersiz', variant: 'high' },
    KAPATILDI: { label: 'Kapatıldı', variant: 'success' }, IPTAL: { label: 'İptal', variant: 'neutral' },
};
const APPROVAL: Record<string, string> = { TASLAK: 'Taslak', ONAY_BEKLIYOR: '2. kontrolcü onayında', ONAYLANDI: 'Onaylandı', REDDEDILDI: 'İade edildi' };
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('tr-TR') : '—');
const fmtDt = (d: string) => new Date(d).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const pname = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}` : '—');

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-900 break-words">{children}</dd>
        </div>
    );
}

/** Takip çalışması detayı: kaynak aksiyon planı bu ekranda okunur; aksiyon ↔ takip iki yönlü bağlantılı. */
export default function FollowUpDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [fu, setFu] = useState<FollowUpDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<LoadError | null>(null);
    const [editOpen, setEditOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            setFu(await api.getFollowUpDetail(id));
            setLoadError(null);
        } catch (e) {
            setLoadError(classifyLoadError(e, 'Takip çalışması'));
        } finally { setLoading(false); }
    }, [id]);
    useEffect(() => { load(); }, [load]);

    if (loading) return <DetailShell><LoadingState message="Takip çalışması yükleniyor..." /></DetailShell>;
    if (!fu) {
        const le = loadError ?? classifyLoadError(null, 'Takip çalışması');
        return <DetailShell><EmptyState title={le.title} description={le.description} actionLabel={le.retryable ? 'Tekrar Dene' : 'Takip Listesine Dön'} onAction={() => (le.retryable ? load() : router.push('/follow-ups'))} /></DetailShell>;
    }

    const st = fu.deletedAt ? { label: 'Silindi', variant: 'neutral' as BV } : FU_STATUS[fu.status] ?? { label: fu.status, variant: 'neutral' as BV };
    const a = fu.action;
    const aSt = a ? ACTION_STATUS[a.status] ?? { label: a.status, variant: 'neutral' as BV } : null;

    return (
        <DetailShell>
            <DetailHeader
                breadcrumbs={[{ label: 'Bulgu & Aksiyon Yönetimi' }, { label: 'Bulgu Takip Çalışmaları', href: '/follow-ups' }, { label: fu.followUpId }]}
                entityId={fu.followUpId}
                title={a?.title || fu.finding?.summary || 'Takip Çalışması'}
                badges={<>
                    <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
                    {fu.manual && <StatusBadge variant="warning">Manuel aksiyon takibi</StatusBadge>}
                    {fu.deletionRequestedAt && !fu.deletedAt && <StatusBadge variant="critical" dot>Silme talebi onayda</StatusBadge>}
                </>}
                meta={<>
                    <span>Planlanan: {fmt(fu.plannedDate)}</span>
                    <span>1. kontrolcü: {fu.assignee?.name ?? 'Atanmamış'}</span>
                    <span>2. kontrolcü: {fu.secondController?.name ?? 'Atanmamış'}</span>
                </>}
                actions={fu.capabilities.canEvaluate
                    ? <Button variant="primary" size="sm" onClick={() => setEditOpen(true)}>{fu.result ? 'Değerlendirmeyi düzenle' : 'Değerlendir'}</Button>
                    : undefined}
            />

            {/* İş akışı (Bekliyor → Devam Ediyor → Tamamlandı (2. kontrolcü onayında) → Onaylandı) */}
            <div className="mb-5"><WorkflowBar type="FOLLOW_UP" id={fu.id} onChanged={load} refreshKey={`${fu.status}:${fu.approvalStatus}:${fu.deletionRequestedAt ?? ''}`} /></div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="xl:col-span-2 space-y-5">
                    {/* Kaynak aksiyon planı — açıklama burada okunur; kod aksiyon detayına götürür. */}
                    <DetailSection title="İlişkili aksiyon planı">
                        {a ? (
                            <div className="space-y-4" data-testid="related-action">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Link href={`/actions/${a.id}`} className="font-mono text-sm font-semibold text-orange-600 hover:underline">{a.actionId}</Link>
                                    {aSt && <StatusBadge variant={aSt.variant}>{aSt.label}</StatusBadge>}
                                    <StatusBadge variant={a.approvalState === 'ONAYLANDI' ? 'success' : 'neutral'}>{APPROVAL[a.approvalState] ?? a.approvalState}</StatusBadge>
                                    {!a.findingId && <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">Manuel</span>}
                                </div>
                                {a.title && <h3 className="text-base font-semibold text-slate-900">{a.title}</h3>}
                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap" data-testid="related-action-description">{a.description}</p>
                                <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 pt-4 border-t border-slate-100">
                                    <Field label="Sorumlu">{pname(a.owner)}</Field>
                                    <Field label="Hedef tarih">{fmt(a.dueDate)}</Field>
                                    <Field label="Birim">{a.responsibleDepartment || '—'}</Field>
                                    <Field label="Kontrolcüler">{pname(a.firstController)} · {pname(a.secondController)}</Field>
                                </dl>
                            </div>
                        ) : <p className="text-sm text-slate-500">Bu takip bir aksiyon planına bağlı değil (eski kayıt).</p>}
                    </DetailSection>

                    <DetailSection title="Değerlendirme">
                        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
                            <Field label="Sonuç">{fu.result ? RESULT[fu.result] ?? fu.result : 'Değerlendirilmedi'}</Field>
                            <Field label="Bulgu çözüm durumu">{fu.resolutionOutcome ? OUTCOME[fu.resolutionOutcome] ?? fu.resolutionOutcome : '—'}</Field>
                            <Field label="Değerlendiren">{fu.evaluator?.name ?? '—'}{fu.evaluatedAt && <span className="block text-xs text-slate-500">{fmtDt(fu.evaluatedAt)}</span>}</Field>
                            <Field label="Onaylayan">{fu.approver?.name ?? '—'}{fu.approvedAt && <span className="block text-xs text-slate-500">{fmtDt(fu.approvedAt)}</span>}</Field>
                        </dl>
                        {[['Mevcut durum', fu.currentStatusDetail], ['Açıklama', fu.explanation], ['Birim cevabı', fu.birimCevabi], ['İç kontrol değerlendirmesi', fu.internalControlAssessment]]
                            .filter(([, v]) => !!v).map(([k, v]) => (
                                <div key={k as string} className="mt-4">
                                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{k}</p>
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{v}</p>
                                </div>
                            ))}
                        {fu.rejectionReason && fu.approvalStatus === 'REDDEDILDI' && <p className="mt-4 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2"><b>İade gerekçesi:</b> {fu.rejectionReason}</p>}
                        {fu.revertReason && <p className="mt-3 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2"><b>Onay geri alındı:</b> {fu.revertReason}</p>}
                        {fu.deletionReason && fu.deletionRequestedAt && <p className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2"><b>Silme gerekçesi:</b> {fu.deletionReason}</p>}
                    </DetailSection>

                    <DetailSection title={`İşlem geçmişi (${fu.history.length})`}>
                        {fu.history.length === 0 ? <p className="text-sm text-slate-400">Kayıtlı işlem yok.</p> : (
                            <ul className="divide-y divide-slate-100 -my-2">
                                {fu.history.map(h => (
                                    <li key={h.id} className="py-2 text-sm flex flex-wrap gap-x-2">
                                        <span className="text-slate-800">{h.explanation || h.operation || '—'}</span>
                                        <span className="ml-auto text-xs text-slate-400">{fmtDt(h.at)} · {h.by ?? 'Sistem'}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </DetailSection>
                </div>

                <div className="space-y-5">
                    <DetailSection title="Kaynak">
                        {fu.finding ? (
                            <div className="text-sm">
                                <Link href={`/findings/${fu.finding.id}`} className="font-mono font-semibold text-violet-700 hover:underline">{fu.finding.findingId}</Link>
                                <p className="text-slate-700 mt-1">{fu.finding.summary || fu.finding.description.slice(0, 200)}</p>
                            </div>
                        ) : <p className="text-sm text-slate-600">Manuel aksiyon planından türedi; bağlı bulgu yok.</p>}
                    </DetailSection>

                    <DetailSection title="Takip zinciri">
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between gap-3"><dt className="text-slate-500">Önceki takip</dt><dd>{fu.previousFollowUp ? <Link href={`/follow-ups/${fu.previousFollowUp.id}`} className="font-mono text-blue-700 hover:underline">{fu.previousFollowUp.followUpId}</Link> : '—'}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-slate-500">Sonraki takip</dt><dd>{fu.nextFollowUp ? <Link href={`/follow-ups/${fu.nextFollowUp.id}`} className="font-mono text-blue-700 hover:underline">{fu.nextFollowUp.followUpId}</Link> : '—'}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-slate-500">Yeni tarih</dt><dd>{fmt(fu.newFollowUpDate)}</dd></div>
                        </dl>
                    </DetailSection>

                    <DetailSection title={`Ekler (${fu.attachments.length})`}>
                        {fu.attachments.length === 0 ? <p className="text-sm text-slate-400">Ek yok.</p> : (
                            <ul className="space-y-1.5 text-sm">
                                {fu.attachments.map(f => <li key={f.id} className="truncate text-slate-700" title={f.originalName}>{f.displayName || f.originalName}</li>)}
                            </ul>
                        )}
                    </DetailSection>
                </div>
            </div>

            {editOpen && a && (
                <FindingFollowUpModal
                    isOpen={editOpen}
                    findingId={fu.findingId}
                    followUp={fu}
                    actions={[{ id: a.id, actionId: a.actionId, description: a.description, status: a.status, dueDate: a.dueDate, owner: a.owner ?? undefined, responsibleDepartment: a.responsibleDepartment }]}
                    onClose={() => setEditOpen(false)}
                    onSuccess={load}
                />
            )}
        </DetailShell>
    );
}
