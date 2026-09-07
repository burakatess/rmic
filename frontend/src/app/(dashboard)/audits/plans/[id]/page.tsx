'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DetailShell, DetailHeader, Tabs, StatusBadge, Button, LoadingState, ErrorState } from '@/components/ui';
import { api } from '@/lib/api';

type BadgeVariant = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
    DRAFT: { label: 'Taslak', variant: 'neutral' },
    APPROVED: { label: 'Onaylandı', variant: 'info' },
    PLANNED: { label: 'Planlandı', variant: 'info' },
    IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
    COMPLETED: { label: 'Tamamlandı', variant: 'success' },
    CANCELLED: { label: 'İptal', variant: 'neutral' },
};

const PHASE_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
    PLANNING: { label: 'Planlama', variant: 'neutral' },
    FIELDWORK: { label: 'Saha Çalışması', variant: 'primary' },
    REPORTING: { label: 'Raporlama', variant: 'medium' },
    CLOSED: { label: 'Kapatıldı', variant: 'low' },
};

const PRIORITY_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
    LOW: { label: 'Düşük', variant: 'low' },
    MEDIUM: { label: 'Orta', variant: 'warning' },
    HIGH: { label: 'Yüksek', variant: 'critical' },
};

const SEVERITY_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
    LOW: { label: 'Düşük', variant: 'low' },
    MEDIUM: { label: 'Orta', variant: 'warning' },
    HIGH: { label: 'Yüksek', variant: 'high' },
    CRITICAL: { label: 'Kritik', variant: 'critical' },
};

const FINDING_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
    OPEN: { label: 'Açık', variant: 'critical' },
    IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
    PARTIALLY_CLOSED: { label: 'Kısmen Kapalı', variant: 'medium' },
    CLOSED: { label: 'Kapatıldı', variant: 'success' },
};

const EXECUTION_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
    NOT_STARTED: { label: 'Başlamadı', variant: 'neutral' },
    IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
    REVIEW: { label: 'İncelemede', variant: 'info' },
    COMPLETED: { label: 'Tamamlandı', variant: 'success' },
    CANCELLED: { label: 'İptal', variant: 'neutral' },
};

const formatDate = (dateString: string | null): string => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
};

export default function AuditPlanDetailPage() {
    const params = useParams();
    const planId = params.id as string;
    const [activeTab, setActiveTab] = useState<string>('overview');
    const [audit, setAudit] = useState<any>(null);
    const [findings, setFindings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [findingsLoading, setFindingsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const plan = await api.getAuditPlan(planId);
            setAudit(plan);
        } catch {
            setError('Denetim planı yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, [planId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (activeTab !== 'findings') return;
        setFindingsLoading(true);
        api.getFindings({ auditPlanId: planId })
            .then((res: any) => setFindings(res.data || []))
            .catch(() => setFindings([]))
            .finally(() => setFindingsLoading(false));
    }, [activeTab, planId]);

    if (loading) return <LoadingState />;
    if (error || !audit) return <ErrorState description={error || 'Denetim planı bulunamadı.'} onRetry={load} />;

    const openFindings = audit.openFindings ?? 0;
    const scheduleVariance = audit.actualManDays ? audit.actualManDays - (audit.plannedManDays || 0) : 0;
    const executions: any[] = audit.executions || [];

    const statusCfg = STATUS_CONFIG[audit.status];
    const phaseCfg = PHASE_CONFIG[audit.phase];

    const tabs = [
        { key: 'overview', label: 'Genel Bakış' },
        { key: 'executions', label: 'Denetim Uygulamaları', count: executions.length },
        { key: 'findings', label: 'Bulgular', count: audit.totalFindings ?? 0 },
    ];

    return (
        <DetailShell>
            <DetailHeader
                breadcrumbs={[
                    { label: 'Denetim' },
                    { label: 'Denetim Planları', href: '/audits/plans' },
                    { label: audit.planId },
                ]}
                entityId={audit.planId}
                title={audit.name}
                badges={
                    <>
                        {statusCfg && <StatusBadge variant={statusCfg.variant}>{statusCfg.label}</StatusBadge>}
                        {phaseCfg && <StatusBadge variant={phaseCfg.variant}>{phaseCfg.label}</StatusBadge>}
                    </>
                }
                meta={
                    <>
                        <span>{audit.auditedUnit || '—'}</span>
                        <span>{audit.year} {audit.periodType}</span>
                        <span>Ekip Lideri: {audit.teamLeader || '—'}</span>
                    </>
                }
                actions={
                    <Link href={`/audits/plans/${planId}/edit`}>
                        <Button variant="outline" size="sm">Düzenle</Button>
                    </Link>
                }
            />

            {/* Hızlı istatistikler */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Öncelik</p>
                    {PRIORITY_CONFIG[audit.priority] && (
                        <StatusBadge variant={PRIORITY_CONFIG[audit.priority].variant}>{PRIORITY_CONFIG[audit.priority].label}</StatusBadge>
                    )}
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Planlanan Gün</p>
                    <p className="text-xl font-bold tabular-nums text-slate-800">{audit.plannedManDays ?? '—'}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Gerçekleşen Gün</p>
                    <p className="text-xl font-bold tabular-nums text-slate-800">{audit.actualManDays ?? '—'}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Sapma</p>
                    <p className={`text-xl font-bold tabular-nums ${scheduleVariance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {scheduleVariance > 0 ? '+' : ''}{scheduleVariance} gün
                    </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Toplam Bulgu</p>
                    <p className="text-xl font-bold tabular-nums text-slate-800">{audit.totalFindings ?? 0}</p>
                </div>
                <div className="bg-white rounded-xl border border-red-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-red-600 mb-1">Açık Bulgu</p>
                    <p className="text-xl font-bold tabular-nums text-red-700">{openFindings}</p>
                </div>
            </div>

            {/* Tabs */}
            <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-6" />

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h2 className="text-sm font-semibold text-slate-700 mb-3">Denetim Hedefleri</h2>
                            <p className="text-sm text-slate-600 leading-relaxed">{audit.objectives || '—'}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h2 className="text-sm font-semibold text-slate-700 mb-3">Denetim Kapsamı</h2>
                            <p className="text-sm text-slate-600 leading-relaxed">{audit.scope || '—'}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h2 className="text-sm font-semibold text-slate-700 mb-3">Takvim</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <p className="text-xs text-slate-500 mb-1">Planlanan Başlangıç</p>
                                    <p className="font-medium text-slate-800">{formatDate(audit.plannedStartDate)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <p className="text-xs text-slate-500 mb-1">Planlanan Bitiş</p>
                                    <p className="font-medium text-slate-800">{formatDate(audit.plannedEndDate)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <p className="text-xs text-slate-500 mb-1">Taslak Rapor</p>
                                    <p className="font-medium text-slate-800">{formatDate(audit.draftReportDate)}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <p className="text-xs text-slate-500 mb-1">Final Rapor</p>
                                    <p className="font-medium text-slate-800">{formatDate(audit.finalReportDate)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h2 className="text-sm font-semibold text-slate-700 mb-3">Denetim Ekibi</h2>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Ekip</span>
                                    <span className="font-medium text-slate-800">{audit.auditTeam || '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Lider</span>
                                    <span className="font-medium text-slate-800">{audit.teamLeader || '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Ekip Büyüklüğü</span>
                                    <span className="font-medium text-slate-800">{audit.teamSize ?? '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Executions Tab */}
            {activeTab === 'executions' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-slate-700">Denetim Uygulamaları</h2>
                        <Link href="/audits/executions">
                            <Button variant="outline" size="sm">Tümünü Gör</Button>
                        </Link>
                    </div>
                    {executions.length === 0 ? (
                        <p className="px-4 py-8 text-sm text-slate-400 text-center">Bu plana bağlı denetim uygulaması yok.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/80 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Uygulama ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Denetçi</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Başlangıç</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">İlerleme</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Bulgu</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Durum</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {executions.map(e => (
                                        <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700">{e.executionId || '—'}</td>
                                            <td className="px-4 py-3 text-slate-700">{e.auditor}</td>
                                            <td className="px-4 py-3 text-slate-600">{formatDate(e.startDate)}</td>
                                            <td className="px-4 py-3 text-center text-slate-700">%{e.progress ?? 0}</td>
                                            <td className="px-4 py-3 text-center text-slate-700">{e.findingsCount ?? 0}</td>
                                            <td className="px-4 py-3 text-center">
                                                {EXECUTION_STATUS_CONFIG[e.status] && (
                                                    <StatusBadge variant={EXECUTION_STATUS_CONFIG[e.status].variant}>{EXECUTION_STATUS_CONFIG[e.status].label}</StatusBadge>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Findings Tab */}
            {activeTab === 'findings' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-slate-700">Denetim Bulguları</h2>
                        <Link href="/findings/new">
                            <Button
                                variant="primary"
                                size="sm"
                                icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                            >
                                Bulgu Ekle
                            </Button>
                        </Link>
                    </div>
                    {findingsLoading ? (
                        <p className="px-4 py-8 text-sm text-slate-400 text-center">Yükleniyor...</p>
                    ) : findings.length === 0 ? (
                        <p className="px-4 py-8 text-sm text-slate-400 text-center">Bu plana bağlı bulgu yok.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/80 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Bulgu ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Açıklama</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Ciddiyet</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Durum</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {findings.map((f: any) => (
                                        <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3"><span className="font-mono text-xs font-semibold text-blue-700">{f.findingId}</span></td>
                                            <td className="px-4 py-3 text-slate-800 max-w-md truncate">{f.summary || f.description}</td>
                                            <td className="px-4 py-3 text-center">
                                                {SEVERITY_CONFIG[f.severity] && (
                                                    <StatusBadge variant={SEVERITY_CONFIG[f.severity].variant}>{SEVERITY_CONFIG[f.severity].label}</StatusBadge>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {FINDING_STATUS_CONFIG[f.status] ? (
                                                    <StatusBadge variant={FINDING_STATUS_CONFIG[f.status].variant}>{FINDING_STATUS_CONFIG[f.status].label}</StatusBadge>
                                                ) : (
                                                    <span className="text-xs text-slate-500">{f.status}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Link href={`/findings/${f.id}`} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors inline-block" title="Görüntüle" aria-label="Görüntüle">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </DetailShell>
    );
}
