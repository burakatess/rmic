'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
    EmptyState, LoadingState, DetailShell, DetailHeader, DetailSection,
    Tabs, StatusBadge, Button,
} from '@/components/ui';

// Types
interface Risk {
    id: string;
    riskId: string;
    name: string;
    description: string;
    category: { name: string; color: string };
    owner: { name: string; department: string; email: string };
    inherentProbability: number;
    inherentImpact: number;
    inherentScore: number;
    residualProbability: number;
    residualImpact: number;
    residualScore: number;
    riskAppetite: number;
    riskLevel: string;
    appetiteStatus: string;
    status: string;
    treatmentDecision: string;
    mutabakatTarihi?: string;
    olusturmaTarihi: string;
    guncellemeTarihi: string;
}

interface Control {
    id: string;
    controlId: string;
    name: string;
    type: string;
    effectiveness: string;
    findingsCount: number;
}

interface Finding {
    id: string;
    findingId: string;
    description: string;
    severity: string;
    status: string;
    controlId?: string;
    controlName?: string;
    actionsCount: number;
}

interface Action {
    id: string;
    actionId: string;
    description: string;
    status: string;
    dueDate: string;
    owner: string;
    findingId?: string;
    findingDescription?: string;
}

interface RYKControl {
    id: string;
    controlCode: string;
    name: string;
    description: string;
    effectiveness: number;
    frequency: number;
    automationLevel: number;
    controlScore: number;
    applicabilityScore?: number;
}

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const statusConfig: Record<string, { label: string; variant: BV }> = {
    IDENTIFIED: { label: 'Tanımlandı', variant: 'neutral' },
    ASSESSED: { label: 'Değerlendirildi', variant: 'info' },
    TREATED: { label: 'Tedavi Edildi', variant: 'success' },
    MONITORED: { label: 'İzleniyor', variant: 'primary' },
    CLOSED: { label: 'Kapatıldı', variant: 'neutral' },
};

const treatmentLabels: Record<string, string> = {
    MITIGATE: 'Azalt',
    TRANSFER: 'Transfer Et',
    AVOID: 'Kaçın',
    ACCEPT: 'Kabul Et',
};

const effectivenessConfig: Record<string, { label: string; variant: BV }> = {
    EFFECTIVE: { label: 'Etkin', variant: 'success' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen Etkin', variant: 'warning' },
    INEFFECTIVE: { label: 'Etkin Değil', variant: 'critical' },
};

const actionStatusConfig: Record<string, { label: string; variant: BV }> = {
    OPEN: { label: 'Açık', variant: 'info' },
    IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
    COMPLETED: { label: 'Tamamlandı', variant: 'success' },
    CLOSED: { label: 'Kapatıldı', variant: 'neutral' },
    ACIK: { label: 'Açık', variant: 'info' },
    DEVAM_EDIYOR: { label: 'Devam Ediyor', variant: 'warning' },
    TAMAMLANDI: { label: 'Tamamlandı', variant: 'success' },
    GECIKTI: { label: 'Gecikmiş', variant: 'critical' },
    IPTAL: { label: 'İptal Edildi', variant: 'neutral' },
};

const getScoreTileColor = (score: number) => {
    if (score >= 20) return 'bg-red-500';
    if (score >= 15) return 'bg-orange-500';
    if (score >= 10) return 'bg-amber-500';
    return 'bg-emerald-500';
};

export default function RiskDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<string>('summary');
    const [risk, setRisk] = useState<Risk | null>(null);
    const [controls, setControls] = useState<Control[]>([]);
    const [rykControls, setRykControls] = useState<RYKControl[]>([]);
    const [findings, setFindings] = useState<Finding[]>([]);
    const [actions, setActions] = useState<Action[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRiskData = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = await api.getRisk(params.id as string) as any;
                if (data) {
                    setRisk({
                        id: String(data.id),
                        riskId: String(data.riskId || ''),
                        name: String(data.name || ''),
                        description: String(data.description || ''),
                        category: {
                            name: data.category?.name || 'Bilinmiyor',
                            color: data.category?.color || '#3b82f6'
                        },
                        owner: {
                            name: `${data.owner?.firstName || ''} ${data.owner?.lastName || ''}`.trim() || 'Bilinmiyor',
                            department: String(data.owner?.department || ''),
                            email: String(data.owner?.email || '')
                        },
                        inherentProbability: Number(data.inherentProbability || 0),
                        inherentImpact: Number(data.inherentImpact || 0),
                        inherentScore: Number(data.inherentRiskScore || 0),
                        residualProbability: Number(data.residualProbability || 0),
                        residualImpact: Number(data.residualImpact || 0),
                        residualScore: Number(data.residualRiskScore || 0),
                        riskAppetite: Number(data.riskAppetite || 10),
                        riskLevel: String(data.residualRiskScore >= 20 ? 'CRITICAL' : data.residualRiskScore >= 15 ? 'HIGH' : data.residualRiskScore >= 8 ? 'MEDIUM' : 'LOW'),
                        appetiteStatus: data.isAboveAppetite ? 'EXCEEDED' : 'WITHIN',
                        status: String(data.status || 'IDENTIFIED'),
                        treatmentDecision: String(data.treatmentDecision || ''),
                        mutabakatTarihi: data.riskEntries?.[0]?.mutabakatTarihi || null,
                        olusturmaTarihi: data.riskEntries?.[0]?.olusturmaTarihi || data.createdAt || new Date().toISOString(),
                        guncellemeTarihi: data.riskEntries?.[0]?.guncellemeTarihi || data.updatedAt || new Date().toISOString()
                    });
                    // Transform controls and extract findings/actions from chain
                    if (data.controls?.length) {
                        const allFindings: Finding[] = [];
                        const allActions: Action[] = [];

                        const transformedControls = data.controls.map((cm: any) => {
                            const control = cm.control;
                            const controlFindings = control?.findings || [];

                            // Extract findings from this control
                            controlFindings.forEach((f: any) => {
                                allFindings.push({
                                    id: String(f.id || ''),
                                    findingId: String(f.findingId || ''),
                                    description: String(f.description || ''),
                                    severity: String(f.severity || 'MEDIUM'),
                                    status: String(f.status || 'OPEN'),
                                    controlId: String(control?.controlId || ''),
                                    controlName: String(control?.name || ''),
                                    actionsCount: f.actions?.length || 0,
                                });

                                // Extract actions from this finding
                                (f.actions || []).forEach((a: any) => {
                                    allActions.push({
                                        id: String(a.id || ''),
                                        actionId: String(a.actionId || ''),
                                        description: String(a.description || ''),
                                        status: String(a.status || 'OPEN'),
                                        dueDate: a.dueDate || new Date().toISOString(),
                                        owner: `${a.owner?.firstName || ''} ${a.owner?.lastName || ''}`.trim(),
                                        findingId: String(f.findingId || ''),
                                        findingDescription: String(f.description || '').substring(0, 50) + '...',
                                    });
                                });
                            });

                            return {
                                id: String(control?.id || ''),
                                controlId: String(control?.controlId || ''),
                                name: String(control?.name || ''),
                                type: 'Önleyici',
                                effectiveness: String(control?.effectivenessStatus || 'NOT_TESTED'),
                                findingsCount: controlFindings.length,
                            };
                        });

                        setControls(transformedControls);
                        setFindings(allFindings);
                        setActions(allActions);
                    }

                    // Fallback: also check direct findings/actions for backward compatibility
                    if (data.findings?.length && findings.length === 0) {
                        setFindings(data.findings.map((f: any) => ({
                            id: String(f.id || ''),
                            findingId: String(f.findingId || ''),
                            description: String(f.description || ''),
                            severity: String(f.severity || 'MEDIUM'),
                            status: String(f.status || 'OPEN'),
                            controlId: String(f.control?.controlId || ''),
                            controlName: String(f.control?.name || ''),
                            actionsCount: f.actions?.length || 0,
                        })));
                    }

                    if (data.riskActions?.length) {
                        setActions(data.riskActions.map((ram: any) => {
                            const ra = ram.riskAction;
                            return {
                                id: String(ra.id || ''),
                                actionId: String(ra.aksiyonId || ''),
                                description: String(ra.aksiyonTanimi || ra.ozet || ''),
                                status: String(ra.status || 'ACIK'),
                                dueDate: ra.hedeflenenTamamlanmaTarihi || ra.createdAt || new Date().toISOString(),
                                owner: ra.aksiyonSahibi || 'Belirlenmemiş',
                            };
                        }));
                    } else if (data.actions?.length && actions.length === 0) {
                        setActions(data.actions.map((a: any) => ({
                            id: String(a.id || ''),
                            actionId: String(a.actionId || ''),
                            description: String(a.description || ''),
                            status: String(a.status || 'OPEN'),
                            dueDate: a.dueDate || new Date().toISOString(),
                            owner: `${a.owner?.firstName || ''} ${a.owner?.lastName || ''}`.trim(),
                            findingId: String(a.finding?.findingId || ''),
                            findingDescription: String(a.finding?.description || '').substring(0, 50),
                        })));
                    }

                    // Extract RYK controls from riskControls or fallback to riskEntries
                    if (data.riskControls?.length) {
                        setRykControls(data.riskControls.map((rcm: any) => {
                            const rc = rcm.riskControl;
                            return {
                                id: String(rc.id || ''),
                                controlCode: String(rc.kontrolId || ''),
                                name: String(rc.kontrolTanimi || rc.ozet || ''),
                                description: String(rc.kontrolTanimi || ''),
                                effectiveness: rc.kontrolTuru || 'Önleyici',
                                frequency: rc.birSeviyeKontrolSikligi || 'Aylık',
                                automationLevel: rc.kontrolIslevi || 'Manuel',
                                controlScore: rc.kontrolPuani || 3,
                                applicabilityScore: 3,
                            };
                        }));
                    } else if (data.riskEntries?.length) {
                        const allRykControls: RYKControl[] = [];
                        data.riskEntries.forEach((entry: any) => {
                            if (entry.riskManagementControls?.length) {
                                entry.riskManagementControls.forEach((mapping: any) => {
                                    const ctrl = mapping.control;
                                    if (ctrl) {
                                        allRykControls.push({
                                            id: String(ctrl.id || ''),
                                            controlCode: String(ctrl.controlCode || ''),
                                            name: String(ctrl.name || ''),
                                            description: String(ctrl.description || ''),
                                            effectiveness: Number(ctrl.effectiveness || 1),
                                            frequency: Number(ctrl.frequency || 1),
                                            automationLevel: Number(ctrl.automationLevel || 1),
                                            controlScore: Number(ctrl.controlScore || 0),
                                            applicabilityScore: mapping.applicabilityScore,
                                        });
                                    }
                                });
                            }
                        });
                        setRykControls(allRykControls);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch risk:', err);
            } finally {
                setLoading(false);
            }
        };
        if (params.id) {
            fetchRiskData();
        }
    }, [params.id]);

    const tabs = [
        { key: 'summary', label: 'Özet' },
        { key: 'rykControls', label: 'Risk Yönetimi Kontrolleri', count: rykControls.length },
        { key: 'controls', label: 'İç Kontrol Çalışmaları', count: controls.length },
        { key: 'actions', label: 'Aksiyonlar', count: actions.filter(a => a.status !== 'COMPLETED').length },
        { key: 'findings', label: 'Bulgular', count: findings.length },
        { key: 'history', label: 'Geçmiş' },
    ];

    if (loading) {
        return (
            <DetailShell>
                <LoadingState message="Risk detayı yükleniyor..." />
            </DetailShell>
        );
    }

    if (!risk) {
        return (
            <DetailShell>
                <EmptyState
                    title="Risk bulunamadı"
                    description="Aradığınız risk kaydı mevcut değil veya erişim yetkiniz yok."
                    actionLabel="Risk Envanterine Dön"
                    onAction={() => router.push('/risks')}
                />
            </DetailShell>
        );
    }

    const statusCfg = statusConfig[risk.status];

    return (
        <DetailShell>
            <DetailHeader
                breadcrumbs={[
                    { label: 'Risk Yönetimi' },
                    { label: 'Risk Envanteri', href: '/risks' },
                    { label: risk.riskId },
                ]}
                entityId={risk.riskId}
                title={risk.name}
                badges={
                    <>
                        {statusCfg && <StatusBadge variant={statusCfg.variant}>{statusCfg.label}</StatusBadge>}
                        {risk.appetiteStatus === 'EXCEEDED' && (
                            <StatusBadge variant="critical" dot>İştah Aşımı</StatusBadge>
                        )}
                    </>
                }
                meta={
                    <>
                        <span style={{ color: risk.category.color }}>● {risk.category.name}</span>
                        <span>Sahip: {risk.owner.name}</span>
                        <span>Güncelleme: {new Date(risk.guncellemeTarihi).toLocaleDateString('tr-TR')}</span>
                    </>
                }
                actions={
                    <>
                        <Button variant="outline" size="sm" onClick={() => router.push(`/risks/${params.id}/edit`)}
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
                        >
                            Düzenle
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => router.push('/risks/assessment')}>Değerlendir</Button>
                        <Button variant="primary" size="sm" onClick={() => router.push('/risks/treatment')}>Tedavi</Button>
                    </>
                }
            />

            {/* Skor özet şeridi */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-2">Doğal Risk Skoru</p>
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-lg ${getScoreTileColor(risk.inherentScore)} flex items-center justify-center text-white text-lg font-bold tabular-nums`}>
                            {risk.inherentScore}
                        </div>
                        <div className="text-xs text-slate-600">
                            <p>Olasılık: {risk.inherentProbability}</p>
                            <p>Etki: {risk.inherentImpact}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-2">Rezidüel Risk Skoru</p>
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-lg ${getScoreTileColor(risk.residualScore)} flex items-center justify-center text-white text-lg font-bold tabular-nums`}>
                            {risk.residualScore}
                        </div>
                        <div className="text-xs text-slate-600">
                            <p>Olasılık: {risk.residualProbability}</p>
                            <p>Etki: {risk.residualImpact}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-2">Risk İştahı</p>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-slate-500 flex items-center justify-center text-white text-lg font-bold tabular-nums">
                            {risk.riskAppetite}
                        </div>
                        <div className="text-xs">
                            {risk.residualScore > risk.riskAppetite ? (
                                <span className="text-red-600 font-medium">Aşıldı (+{risk.residualScore - risk.riskAppetite})</span>
                            ) : (
                                <span className="text-emerald-600 font-medium">İçinde (-{risk.riskAppetite - risk.residualScore})</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-medium text-slate-500 mb-2">Tedavi Kararı</p>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-blue-500 flex items-center justify-center text-white">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                            </svg>
                        </div>
                        <div className="text-sm text-slate-800 font-medium">
                            {treatmentLabels[risk.treatmentDecision] || 'Belirlenmedi'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-4 pt-1">
                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
                </div>

                {/* Tab Content */}
                <div className="p-6">
                    {activeTab === 'summary' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-700 mb-3">Risk Açıklaması</h3>
                                <p className="text-slate-600 text-sm leading-relaxed">{risk.description}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-slate-700 mb-3">Risk Sahibi</h3>
                                <div className="bg-slate-50 rounded-xl p-4">
                                    <p className="font-medium text-slate-800">{risk.owner.name}</p>
                                    <p className="text-sm text-slate-500">{risk.owner.department}</p>
                                    <p className="text-sm text-blue-600">{risk.owner.email}</p>
                                </div>

                                <h3 className="text-sm font-semibold text-slate-700 mt-6 mb-3">Önemli Tarihler</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Mutabakat Tarihi:</span>
                                        <span className="text-slate-800">{risk.mutabakatTarihi ? new Date(risk.mutabakatTarihi).toLocaleDateString('tr-TR') : '-'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Oluşturma Tarihi:</span>
                                        <span className="text-slate-800">{new Date(risk.olusturmaTarihi).toLocaleDateString('tr-TR')}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Güncelleme Tarihi:</span>
                                        <span className="text-slate-800">{new Date(risk.guncellemeTarihi).toLocaleDateString('tr-TR')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'rykControls' && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <p className="text-sm text-slate-500">
                                        {rykControls.length} Risk Yönetimi Kontrolu bu riskle ilişkilendirilmiş
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">
                                        Bu kontroller risk skorunun hesaplanmasına etki eder
                                    </p>
                                </div>
                                <Link href="/risks/controls" className="text-sm text-blue-600 hover:underline">
                                    RYK Kontrolleri Yönet →
                                </Link>
                            </div>

                            {rykControls.length === 0 ? (
                                <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                                    <EmptyState
                                        title="Henüz Risk Yönetimi Kontrolü eklenmemiş"
                                        description="RYK kontrolleri ekleyerek risk skorunu etkileyebilirsiniz"
                                        icon={<svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                                        actionLabel="Kontrol Ekle"
                                        onAction={() => router.push('/risks/controls')}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {rykControls.map(control => (
                                        <div key={control.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center text-violet-600">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="font-mono text-sm text-violet-600">{control.controlCode}</p>
                                                    <p className="font-medium text-slate-800">{control.name}</p>
                                                    <p className="text-xs text-slate-500 mt-1 max-w-md truncate">{control.description}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-6">
                                                <div className="text-center">
                                                    <p className="text-xs text-slate-400">Kontrol Skoru</p>
                                                    <p className="text-lg font-bold tabular-nums text-violet-600">{control.controlScore?.toFixed(2) || '-'}</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-xs text-slate-400">Uygulanabilirlik</p>
                                                    <p className="text-lg font-bold tabular-nums text-indigo-600">{control.applicabilityScore || 3}</p>
                                                </div>
                                                <div className="grid grid-cols-3 gap-2 text-xs">
                                                    <div className="text-center px-2 py-1 bg-white rounded border border-slate-100">
                                                        <p className="text-slate-400">Etkinlik</p>
                                                        <p className="font-medium">{control.effectiveness}</p>
                                                    </div>
                                                    <div className="text-center px-2 py-1 bg-white rounded border border-slate-100">
                                                        <p className="text-slate-400">Sıklık</p>
                                                        <p className="font-medium">{control.frequency}</p>
                                                    </div>
                                                    <div className="text-center px-2 py-1 bg-white rounded border border-slate-100">
                                                        <p className="text-slate-400">Otomasyon</p>
                                                        <p className="font-medium">{control.automationLevel}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'controls' && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm text-slate-500">{controls.length} kontrol bu riskle ilişkilendirilmiş</p>
                                <Link href={`/risks/${params.id}/controls`} className="text-sm text-blue-600 hover:underline">
                                    Kontrol Ekle →
                                </Link>
                            </div>
                            <div className="space-y-3">
                                {controls.map(control => (
                                    <Link key={control.id} href={`/controls/${control.id}`} className="block">
                                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="font-mono text-sm text-emerald-600 group-hover:underline">{control.controlId}</p>
                                                    <p className="font-medium text-slate-800">{control.name}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-sm text-slate-500">{control.type}</span>
                                                {effectivenessConfig[control.effectiveness] && (
                                                    <StatusBadge variant={effectivenessConfig[control.effectiveness].variant}>
                                                        {effectivenessConfig[control.effectiveness].label}
                                                    </StatusBadge>
                                                )}
                                                <div className="text-slate-400 group-hover:text-blue-600">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'actions' && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm text-slate-500">{actions.length} aksiyon bu riskle ilişkilendirilmiş</p>
                                <Link href="/risks/actions" className="text-sm text-blue-600 hover:underline">
                                    Yeni Aksiyon →
                                </Link>
                            </div>
                            <div className="space-y-3">
                                {actions.map(action => (
                                    <Link key={action.id} href="/risks/actions" className="block">
                                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="font-mono text-sm text-orange-600 group-hover:underline">{action.actionId}</p>
                                                    <p className="text-slate-800">{action.description}</p>
                                                    <p className="text-xs text-slate-500">Sorumlu: {action.owner}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm">
                                                {actionStatusConfig[action.status] && (
                                                    <StatusBadge variant={actionStatusConfig[action.status].variant}>
                                                        {actionStatusConfig[action.status].label}
                                                    </StatusBadge>
                                                )}
                                                <span className="text-slate-500">
                                                    {new Date(action.dueDate).toLocaleDateString('tr-TR')}
                                                </span>
                                                <svg className="w-5 h-5 text-slate-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'findings' && (
                        <div>
                            <p className="text-sm text-slate-500 mb-4">Bu riske bağlı kontrollerin bulguları (Kontrol → Bulgu zinciri)</p>
                            {findings.length === 0 ? (
                                <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                                    <EmptyState
                                        title="Bulgu Bulunmamaktadır"
                                        description="Bu riskle ilişkili bulgu bulunmamaktadır. Bulgular, kontroller üzerinden bu riske bağlanır."
                                        icon={<svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {findings.map((finding) => {
                                        const severityMap: Record<string, { label: string; variant: BV }> = {
                                            CRITICAL: { label: 'Kritik', variant: 'critical' },
                                            HIGH: { label: 'Yüksek', variant: 'high' },
                                            MEDIUM: { label: 'Orta', variant: 'medium' },
                                            LOW: { label: 'Düşük', variant: 'low' },
                                        };
                                        const findingStatusMap: Record<string, { label: string; variant: BV }> = {
                                            OPEN: { label: 'Açık', variant: 'info' },
                                            IN_PROGRESS: { label: 'İşlemde', variant: 'warning' },
                                            RESOLVED: { label: 'Çözüldü', variant: 'success' },
                                            CLOSED: { label: 'Kapatıldı', variant: 'neutral' },
                                        };
                                        const severity = severityMap[finding.severity] || severityMap.MEDIUM;
                                        const status = findingStatusMap[finding.status] || findingStatusMap.OPEN;

                                        return (
                                            <Link key={finding.id} href={`/findings/${finding.id}`} className="block">
                                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 hover:bg-slate-100 transition-colors cursor-pointer group">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span className="text-sm font-mono text-slate-500 group-hover:text-blue-600">{finding.findingId}</span>
                                                                <StatusBadge variant={severity.variant}>{severity.label}</StatusBadge>
                                                                <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                                                            </div>
                                                            <p className="text-sm text-slate-800 mb-2">{finding.description}</p>
                                                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                                                <span>{finding.controlId} - {finding.controlName}</span>
                                                                <span>{finding.actionsCount} aksiyon</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-blue-600 group-hover:text-blue-700 text-sm">
                                                            Detay →
                                                        </div>
                                                    </div>
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <EmptyState
                            title="Tarihçe verisi henüz mevcut değil"
                            description="Risk değişiklik geçmişi backend audit-log entegrasyonu tamamlandığında burada görünecek."
                            icon={<svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        />
                    )}
                </div>
            </div>
        </DetailShell>
    );
}
