'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
    DetailShell, DetailHeader, DetailSection, StatusBadge, Button,
    LoadingState, EmptyState,
} from '@/components/ui';
import { PermissionGate } from '@/components/auth/AuthProvider';
import ActionEditModal from '@/components/actions/ActionEditModal';

type BadgeVariant = 'neutral' | 'warning' | 'info' | 'success' | 'critical' | 'primary';

const statusLabels: Record<string, { label: string; variant: BadgeVariant }> = {
    BEKLIYOR: { label: 'Bekliyor', variant: 'info' },
    DEVAM_EDIYOR: { label: 'Devam Ediyor', variant: 'warning' },
    TAMAMLANDI: { label: 'Tamamlandı', variant: 'success' },
    YETERSIZ: { label: 'Yetersiz', variant: 'critical' },
    KAPATILDI: { label: 'Kapatıldı', variant: 'neutral' },
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
    const [action, setAction] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [editOpen, setEditOpen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getAction(id);
            setAction(data);
        } catch {
            setAction(null);
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
        return (
            <DetailShell>
                <EmptyState
                    title="Aksiyon bulunamadı"
                    description="Aradığınız aksiyon kaydı mevcut değil veya erişim yetkiniz yok."
                    actionLabel="Aksiyon Listesine Dön"
                    onAction={() => router.push('/actions')}
                />
            </DetailShell>
        );
    }

    const statusCfg = statusLabels[action.status] ?? { label: action.status, variant: 'neutral' as const };
    const overdue = action.dueDate && new Date(action.dueDate) < new Date()
        && !['TAMAMLANDI', 'KAPATILDI', 'COMPLETED', 'CLOSED'].includes(action.status);

    return (
        <DetailShell>
            <DetailHeader
                breadcrumbs={[
                    { label: 'Aksiyon Yönetimi' },
                    { label: 'Aksiyon Listesi', href: '/actions' },
                    { label: action.actionId },
                ]}
                entityId={action.actionId}
                title="Aksiyon Detayı"
                badges={
                    <>
                        <StatusBadge variant={statusCfg.variant}>{statusCfg.label}</StatusBadge>
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
                    <PermissionGate permission="action:update">
                        <Button variant="primary" size="sm" onClick={() => setEditOpen(true)}
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
                        >
                            Düzenle
                        </Button>
                    </PermissionGate>
                }
            />

            <div className="space-y-6">
                {/* Ana bilgiler */}
                <DetailSection title="Aksiyon Bilgileri">
                    <div className="space-y-5">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Açıklama</p>
                            <p className="text-sm text-slate-800 leading-relaxed">{action.description}</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Sorumlu</p>
                                <p className="text-sm text-slate-800">{action.owner ? `${action.owner.firstName} ${action.owner.lastName}` : '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Sorumlu Birim</p>
                                <p className="text-sm text-slate-800">{action.responsibleDepartment ?? '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Hedef Tarih</p>
                                <p className={`text-sm ${overdue ? 'text-red-600 font-bold' : 'text-slate-800'}`}>{fmt(action.dueDate)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Tamamlanma</p>
                                <p className="text-sm text-slate-800">{fmt(action.completedAt)}</p>
                            </div>
                        </div>
                        {action.notes && (
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Notlar</p>
                                <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{action.notes}</p>
                            </div>
                        )}
                    </div>
                </DetailSection>

                {/* Bağlı bulgu */}
                {action.finding && (
                    <DetailSection title="Bağlı Bulgu">
                        <Link href="/findings" className="block -m-5 p-5 rounded-b-xl hover:bg-slate-50 transition-colors">
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
        </DetailShell>
    );
}
