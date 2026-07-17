'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { PageHeader, StatusBadge } from '@/components/ui';
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
            <div className="flex items-center justify-center h-96">
                <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!action) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-slate-400">
                <p className="font-medium mb-3">Aksiyon bulunamadı</p>
                <Link href="/actions" className="text-sm text-orange-600 hover:underline">← Aksiyon listesine dön</Link>
            </div>
        );
    }

    const statusCfg = statusLabels[action.status] ?? { label: action.status, variant: 'neutral' as const };
    const overdue = action.dueDate && new Date(action.dueDate) < new Date()
        && !['TAMAMLANDI', 'KAPATILDI', 'COMPLETED', 'CLOSED'].includes(action.status);

    return (
        <div className="space-y-6">
            <PageHeader
                title={`Aksiyon ${action.actionId}`}
                description="Aksiyon detayı ve ilişkili kayıtlar"
                breadcrumbs={[{ label: 'Aksiyon Yönetimi', href: '/actions' }, { label: action.actionId }]}
                actions={
                    <PermissionGate permission="action:update">
                        <button onClick={() => setEditOpen(true)}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors">
                            Düzenle
                        </button>
                    </PermissionGate>
                }
            />

            {/* Ana bilgi kartı */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                    <span className="font-mono font-bold text-orange-600">{action.actionId}</span>
                    <StatusBadge variant={statusCfg.variant}>{statusCfg.label}</StatusBadge>
                    {overdue && <StatusBadge variant="critical">Gecikmiş</StatusBadge>}
                </div>
                <div className="p-6 space-y-5">
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
            </div>

            {/* Bağlı bulgu */}
            {action.finding && (
                <div className="bg-white rounded-xl border border-violet-200 overflow-hidden">
                    <div className="px-6 py-3 border-b border-slate-100 bg-violet-50/50">
                        <h3 className="font-bold text-violet-800 text-sm">Bağlı Bulgu</h3>
                    </div>
                    <Link href="/findings" className="block p-5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3 mb-1">
                            <span className="font-mono font-bold text-violet-600">{action.finding.findingId}</span>
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
                </div>
            )}

            {/* Bağlı risk */}
            {action.risk && (
                <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
                    <div className="px-6 py-3 border-b border-slate-100 bg-blue-50/50">
                        <h3 className="font-bold text-blue-800 text-sm">Bağlı Risk</h3>
                    </div>
                    <Link href={`/risks/${action.risk.id}`} className="block p-5 hover:bg-slate-50 transition-colors">
                        <span className="font-mono font-bold text-blue-600">{action.risk.riskId}</span>
                        <p className="text-sm text-slate-700 mt-1">{action.risk.name}</p>
                    </Link>
                </div>
            )}

            <ActionEditModal
                isOpen={editOpen}
                onClose={() => setEditOpen(false)}
                onSuccess={load}
                action={action}
            />
        </div>
    );
}
