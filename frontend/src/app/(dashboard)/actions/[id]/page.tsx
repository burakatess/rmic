'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
    DetailShell, DetailHeader, DetailSection, StatusBadge, Button, Field, FieldGrid,
    LoadingState, EmptyState, ConfirmDialog,
} from '@/components/ui';
import { classifyLoadError, type LoadError } from '@/lib/load-error';
import { useToast } from '@/components/ui/Toast';
import ActionEditModal from '@/components/actions/ActionEditModal';
import { ActionWorkflowPanel } from '@/components/actions/ActionWorkflowPanel';
import { WorkflowBar } from '@/components/workflow/WorkflowBar';

type BadgeVariant = 'neutral' | 'warning' | 'info' | 'success' | 'critical' | 'primary';

const statusLabels: Record<string, { label: string; variant: BadgeVariant }> = {
    BEKLIYOR: { label: 'Bekliyor', variant: 'info' },
    DEVAM_EDIYOR: { label: 'Devam Ediyor', variant: 'warning' },
    TAMAMLANDI: { label: 'Tamamlandı', variant: 'success' },
    YETERSIZ: { label: 'Yetersiz', variant: 'critical' },
    KAPATILDI: { label: 'Kapatıldı', variant: 'neutral' },
    IPTAL: { label: 'İptal', variant: 'neutral' },
    OPEN: { label: 'Açık', variant: 'info' },
    IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
    COMPLETED: { label: 'Tamamlandı', variant: 'success' },
    CLOSED: { label: 'Kapatıldı', variant: 'neutral' },
};

const SEVERITY_LABELS: Record<string, string> = { CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük' };

function fmt(d?: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('tr-TR');
}

export default function ActionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [action, setAction] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<LoadError | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [completeOpen, setCompleteOpen] = useState(false);
    const [completing, setCompleting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getAction(id);
            setAction(data);
            setLoadError(null);
        } catch (e) {
            // İşlem sonrası yeniden yüklemede hata: mevcut kayıt korunur, yalnız bildirilir.
            const le = classifyLoadError(e, 'Aksiyon');
            setLoadError(le);
            showError(le.title, le.description);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <DetailShell>
                <LoadingState message="Aksiyon detayı yükleniyor..." />
            </DetailShell>
        );
    }

    if (!action) {
        const le = loadError ?? classifyLoadError(null, 'Aksiyon');
        return (
            <DetailShell>
                <EmptyState
                    title={le.title}
                    description={le.description}
                    actionLabel={le.retryable ? 'Tekrar Dene' : 'Aksiyon Listesine Dön'}
                    onAction={() => (le.retryable ? load() : router.push('/actions'))}
                />
            </DetailShell>
        );
    }

    const statusCfg = statusLabels[action.status] ?? { label: action.status, variant: 'neutral' as const };
    const overdue = action.isOverdue === true; // sunucu kararı (tek kaynak)
    // Yetenekler backend'den (finding-capabilities.ts): rol + kapsam + sahiplik + durum.
    const caps: { canEdit?: boolean; canComplete?: boolean } = action.capabilities ?? {};
    const canComplete = !!caps.canComplete;

    const handleComplete = async () => {
        setCompleting(true);
        try {
            await api.completeAction(action.id);
            success('Tamamlandı', 'Aksiyon tamamlandı; takip doğrulaması ve ikinci kontrolcü onayı bekleniyor.');
            setCompleteOpen(false);
            await load();
        } catch (err) {
            showError('Tamamlanamadı', err instanceof Error ? err.message : 'Aksiyon tamamlanamadı.');
        } finally {
            setCompleting(false);
        }
    };

    return (
        <DetailShell>
            <DetailHeader
                breadcrumbs={[
                    { label: 'Aksiyon Yönetimi' },
                    { label: 'Aksiyon Listesi', href: '/actions' },
                    { label: action.actionId },
                ]}
                entityId={action.actionId}
                title={action.title || 'Aksiyon Detayı'}
                badges={
                    <>
                        {!action.finding && <StatusBadge variant="warning">Manuel aksiyon planı</StatusBadge>}
                        <StatusBadge variant={statusCfg.variant}>{statusCfg.label}</StatusBadge>
                        {action.deletedAt ? <StatusBadge variant="neutral">Silindi</StatusBadge>
                            : action.approvalState && action.approvalState !== 'ONAYLANDI' && (
                                <StatusBadge variant={action.approvalState === 'REDDEDILDI' ? 'critical' : action.approvalState === 'ONAY_BEKLIYOR' ? 'warning' : 'neutral'}>
                                    {action.approvalState === 'REDDEDILDI' ? 'Reddedildi' : action.approvalState === 'ONAY_BEKLIYOR' ? 'Onay bekliyor' : 'Taslak'}
                                </StatusBadge>
                            )}
                        {overdue && <StatusBadge variant="critical">Gecikmiş</StatusBadge>}
                    </>
                }
                meta={
                    <>
                        {action.owner && <span>Sorumlu: {action.owner.firstName} {action.owner.lastName}</span>}
                        <span>Hedef Tarih: {fmt(action.dueDate)}</span>
                    </>
                }
                actions={
                    <div className="flex items-center gap-2">
                        {canComplete && <Button variant="success" size="sm" onClick={() => setCompleteOpen(true)}>Aksiyonu Tamamla</Button>}
                        {caps.canEdit && (
                            <Button variant="primary" size="sm" onClick={() => setEditOpen(true)}
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
                            >
                                Düzenle
                            </Button>
                        )}
                    </div>
                }
            />

            {/* İş akışı (onay hattı): Taslak → 2. Kontrolcü Onayında → Onaylandı — bulgunun yaşam döngüsünden bağımsız. */}
            <div className="mb-5"><WorkflowBar type="ACTION" id={action.id} onChanged={load} refreshKey={`${action.approvalState}:${action.deletionRequestedAt ?? ''}:${action.status}`} /></div>

            <div className="space-y-6">
                {/* Ana bilgiler */}
                <DetailSection title="Aksiyon Bilgileri">
                    <div className="space-y-5">
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Açıklama</p>
                            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{action.description}</p>
                        </div>
                        <FieldGrid>
                            <Field label="Sorumlu">{action.owner ? `${action.owner.firstName} ${action.owner.lastName}` : '—'}</Field>
                            <Field label="Sorumlu birim">{action.responsibleDepartment ?? '—'}</Field>
                            <Field label="Hedef tarih"><span className={overdue ? 'text-red-600' : ''}>{fmt(action.dueDate)}</span></Field>
                            <Field label="Tamamlanma">{fmt(action.completedAt)}</Field>
                        </FieldGrid>
                        {action.notes && (
                            <div>
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Notlar</p>
                                <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{action.notes}</p>
                            </div>
                        )}
                    </div>
                </DetailSection>

                <ActionWorkflowPanel action={action} onChanged={load} />

                {/* Kaynak: manuel aksiyon planında bulgu yoktur. */}
                {!action.finding && (
                    <DetailSection title="Kaynak">
                        <p className="text-sm text-slate-700">Manuel aksiyon planı — herhangi bir bulgudan bağımsız oluşturuldu. Onay ve takip süreci bulgu kaynaklı aksiyonlarla aynıdır.</p>
                    </DetailSection>
                )}

                {/* Bağlı bulgu */}
                {action.finding && (
                    <DetailSection title="Bağlı Bulgu">
                        <Link href={`/findings/${action.finding.id}`} className="block -m-5 p-5 rounded-b-xl hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-3 mb-1">
                                <span className="font-mono text-xs text-blue-600 hover:underline">{action.finding.findingId}</span>
                                {action.finding.severity && (
                                    <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-[10px] font-bold">
                                        {SEVERITY_LABELS[action.finding.severity] ?? action.finding.severity}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-slate-700">{action.finding.summary ?? action.finding.description?.slice(0, 200) ?? ''}</p>
                            {action.finding.control && (
                                <p className="text-xs text-slate-400 mt-2">
                                    İlişkili Kontrol: <span className="font-mono">{action.finding.control.controlId}</span> — {action.finding.control.name}
                                </p>
                            )}
                        </Link>
                    </DetailSection>
                )}

                {/* Bağlı risk */}
                {action.risk && (
                    <DetailSection title="Bağlı Risk">
                        <Link href={`/risks/${action.risk.id}`} className="block -m-5 p-5 rounded-b-xl hover:bg-slate-50 transition-colors">
                            <span className="font-mono text-xs text-blue-600 hover:underline">{action.risk.riskId}</span>
                            <p className="text-sm text-slate-700 mt-1">{action.risk.name}</p>
                        </Link>
                    </DetailSection>
                )}
            </div>

            <ActionEditModal
                isOpen={editOpen}
                onClose={() => setEditOpen(false)}
                onSuccess={load}
                action={action}
            />
            <ConfirmDialog
                open={completeOpen}
                onClose={() => setCompleteOpen(false)}
                onConfirm={handleComplete}
                title="Aksiyonu Tamamla"
                message="Aksiyon tamamlandı olarak işaretlenecek. Nihai kapanış, takip değerlendirmesi ve ikinci kontrolcü onayından sonra yapılır."
                confirmLabel="Tamamlandı Olarak İşaretle"
                loading={completing}
                variant="warning"
            />
        </DetailShell>
    );
}
