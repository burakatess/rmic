'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { classifyLoadError, type LoadError } from '@/lib/load-error';
import {
    EmptyState, LoadingState, DetailShell, DetailHeader,
    Tabs, StatusBadge, Button, Modal,
} from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';
import { CreateFindingModal } from '@/components/modals/CreateFindingModal';
import { FREQUENCY_LABELS } from '@/lib/control-labels';
import ControlScopePanel from '@/components/controls/ControlScopePanel';
import ControlHistoryPanel from '@/components/controls/ControlHistoryPanel';

interface User {
    id?: string;
    name: string;
    firstName?: string;
    lastName?: string;
    department?: string;
    email?: string;
}

interface Action {
    id: string;
    actionId: string;
    description: string;
    status: string;
    approvalState?: string;
    dueDate: string;
    completedAt?: string | null;
    owner?: {
        firstName: string;
        lastName: string;
    } | null;
}

interface Finding {
    id: string;
    findingId: string;
    summary?: string | null;
    description: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    workflowStatus: string;
    resolutionStatus: string;
    targetResolutionDate: string;
    actions: Action[];
}

/** Bu kontrolün testlerine "mevcut bulgu" olarak bağlanmış, başka kontrole ait bulgu. */
interface LinkedOtherFinding {
    id: string;
    findingId: string;
    summary: string | null;
    severity: string;
    workflowStatus: string;
    resolutionStatus: string;
    control: { id: string; controlId: string; name: string } | null;
    viaTests: Array<{ id: string; testNo: string }>;
}

interface Person { id: string; firstName: string; lastName: string; department?: string | null }

interface ControlTest {
    id: string;
    testDate: string;
    tester: string;
    result: 'EFFECTIVE' | 'PARTIALLY_EFFECTIVE' | 'INEFFECTIVE';
    findings?: string;
    notes?: string;
}

interface TestRecord {
    id: string;
    testNo: string;
    dueDate: string;
    /** Sıradaki test hesabı için kaba durum. */
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
    /** Gerçek iş akışı durumu (ControlTestStatus). */
    rawStatus: string;
    overdue: boolean;
    year: number | null;
    periodLabel: string | null;
    assignee: string | null;
    secondController: string | null;
    deletionRequested: boolean;
    findingLinkCount: number;
    testResult?: string;
    notes?: string;
    hasFinding?: boolean;
}

interface Control {
    id: string;
    controlId: string;
    name: string;
    description: string;
    mehaz: string;
    testSteps: string;
    gmy: string;
    directorate: string;
    frequency: string;
    notes: string;
    effectivenessStatus: string;
    lastTestDate: string;
    nextTestDate: string;
    owner: User | null;
    inventoryStatus: 'ACTIVE' | 'PASSIVE';
    linkedRisks: { id: string; riskId: string; name: string; inherent: number | null; residual: number | null; category: string | null }[];
    regulations: Array<{ id: string; articleCode: string; title: string; regulationCode: string; regulationName: string }>;
    linkedFindings: Finding[];
    linkedOtherFindings: LinkedOtherFinding[];
    linkedTests: ControlTest[];
    linkedTestRecords: TestRecord[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yearScopes: any[];
    displayStatus?: string;
    statusReason?: string;
}

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const effectivenessConfig: Record<string, { label: string; variant: BV }> = {
    EFFECTIVE: { label: 'Etkin', variant: 'success' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen Etkin', variant: 'warning' },
    INEFFECTIVE: { label: 'Etkin Değil', variant: 'critical' },
    NOT_TESTED: { label: 'Test Edilmedi', variant: 'neutral' },
};

const severityConfig: Record<string, { label: string; variant: BV }> = {
    CRITICAL: { label: 'Kritik', variant: 'critical' },
    HIGH: { label: 'Yüksek', variant: 'high' },
    MEDIUM: { label: 'Orta', variant: 'medium' },
    LOW: { label: 'Düşük', variant: 'low' },
};

const frequencyLabel = FREQUENCY_LABELS;

const personName = (u: Person | null | undefined): string | null => (u ? `${u.firstName} ${u.lastName}` : null);

/** Testin iş akışı durumu — ortak aşama adlarıyla (İşlem Durumları ile aynı dil). */
const testStageConfig: Record<string, { label: string; variant: BV }> = {
    BEKLIYOR: { label: 'Bekliyor', variant: 'neutral' },
    DEVAM_EDIYOR: { label: 'Devam ediyor', variant: 'warning' },
    GERI_GONDERILDI: { label: 'İade edildi', variant: 'high' },
    TAMAMLANDI: { label: 'Tamamlandı · onayda', variant: 'info' },
    ONAYLANDI: { label: 'Onaylandı', variant: 'success' },
    IPTAL: { label: 'İptal', variant: 'neutral' },
    KAPSAM_DISI: { label: 'Kapsam dışı', variant: 'neutral' },
};

const findingWorkflowLabel: Record<string, string> = {
    TASLAK: 'Taslak', MUTABAKATA_GONDERILDI: 'Mutabakatta', IC_KONTROL_ONAYINA_GONDERILDI: 'İç kontrol onayında',
    MUTABAKAT_YAPILDI: 'Mutabakat yapıldı', IPTAL: 'İptal',
};
const findingResolutionConfig: Record<string, { label: string; variant: BV }> = {
    DEVAM_EDIYOR: { label: 'Açık', variant: 'warning' },
    KISMEN_KAPATILDI: { label: 'Kısmen kapatıldı', variant: 'info' },
    KAPATILDI: { label: 'Kapatıldı', variant: 'success' },
    ERTELENDI: { label: 'Ertelendi', variant: 'neutral' },
    YENI_AKSIYON_GEREKLI: { label: 'Yeni aksiyon gerekli', variant: 'high' },
};
/** Açık bulgu: iptal edilmemiş ve tamamen kapatılmamış. */
const isFindingOpen = (f: { workflowStatus: string; resolutionStatus: string }) => f.workflowStatus !== 'IPTAL' && f.resolutionStatus !== 'KAPATILDI';

const actionStatusConfig: Record<string, { label: string; variant: BV }> = {
    BEKLIYOR: { label: 'Bekliyor', variant: 'neutral' },
    DEVAM_EDIYOR: { label: 'Devam ediyor', variant: 'warning' },
    TAMAMLANDI: { label: 'Tamamlandı', variant: 'info' },
    YETERSIZ: { label: 'Yetersiz', variant: 'high' },
    KAPATILDI: { label: 'Kapatıldı', variant: 'success' },
    IPTAL: { label: 'İptal', variant: 'neutral' },
};

const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
};

export default function ControlDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { success, error: showError } = useToast();
    const { user } = useAuth();
    // Backend @Roles('SYSTEM_ADMIN','RISK_CONTROL_MANAGER') ile aynı küme — düğme yalnız izinli kullanıcıya görünür.
    const canToggleStatus = user?.role?.name === 'SYSTEM_ADMIN' || user?.role?.name === 'RISK_CONTROL_MANAGER';
    const [statusConfirm, setStatusConfirm] = useState(false);
    const [statusBusy, setStatusBusy] = useState(false);

    const [activeTab, setActiveTab] = useState<string>('summary');
    const [control, setControl] = useState<Control | null>(null);
    const [loading, setLoading] = useState(true);
    const [isCreateFindingOpen, setIsCreateFindingOpen] = useState(false);
    const [isEditFindingOpen, setIsEditFindingOpen] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [editFindingContext, setEditFindingContext] = useState<any | null>(null);

    const [loadError, setLoadError] = useState<LoadError | null>(null);
    // Her başarılı yeniden yüklemede artar; geçmiş sekmesi buna göre tazelenir (pasifleştirme, kapsam değişikliği…).
    const [dataVersion, setDataVersion] = useState(0);
    const fetchControlData = useCallback(async (silent = false) => {
        if (!params.id) return;
        if (!silent) setLoading(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = await api.getControl(params.id as string) as any;
            if (data) {
                setControl({
                    id: String(data.id),
                    controlId: String(data.controlId || ''),
                    name: String(data.name || ''),
                    description: String(data.description || ''),
                    mehaz: String(data.mehaz || ''),
                    testSteps: String(data.testSteps || ''),
                    gmy: String(data.gmy || ''),
                    directorate: String(data.directorate || ''),
                    frequency: String(data.frequency || 'MONTHLY'),
                    notes: String(data.notes || ''),
                    owner: data.owner ? {
                        id: data.owner.id,
                        firstName: data.owner.firstName,
                        lastName: data.owner.lastName,
                        name: `${data.owner.firstName} ${data.owner.lastName}`,
                        email: data.owner.email,
                        department: data.owner.department
                    } : null,
                    inventoryStatus: data.status === 'PASSIVE' ? 'PASSIVE' : 'ACTIVE',
                    effectivenessStatus: String(data.effectivenessStatus || 'NOT_TESTED'),
                    lastTestDate: data.lastTestDate || '',
                    nextTestDate: data.nextTestDate || '',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    linkedRisks: (data.risks || data.riskMappings || []).map((rm: any) => {
                        const risk = rm.risk || rm;
                        return {
                            id: String(risk.id),
                            riskId: String(risk.riskId),
                            name: String(risk.name),
                            // Puan yoksa uydurma değer gösterilmez.
                            inherent: typeof risk.inherentRiskScore === 'number' ? risk.inherentRiskScore : null,
                            residual: typeof risk.residualRiskScore === 'number' ? risk.residualRiskScore : null,
                            category: risk.category?.name ?? (typeof risk.category === 'string' ? risk.category : null),
                        };
                    }),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    regulations: (data.regulations || []).filter((r: any) => r.article).map((r: any) => ({
                        id: String(r.article.id),
                        articleCode: String(r.article.articleCode),
                        title: String(r.article.title),
                        regulationCode: String(r.article.regulation?.code ?? ''),
                        regulationName: String(r.article.regulation?.name ?? ''),
                    })),
                    linkedFindings: data.findings || [],
                    linkedOtherFindings: data.linkedFindings || [],
                    linkedTests: (data.tests || [])
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .filter((t: any) => t.status === 'ONAYLANDI' || t.status === 'TAMAMLANDI')
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .map((t: any) => ({
                            id: t.id,
                            testDate: t.completedAt || t.plannedDate,
                            tester: personName(t.assignee) ?? 'Belirlenmemiş',
                            result: t.findingStatus === 'BULGUSU_YOK' ? 'EFFECTIVE' : t.findingStatus === 'BULGUSU_VAR' ? 'INEFFECTIVE' : 'NOT_TESTED',
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            findings: t.findings?.map((f: any) => f.findingId).join(', ') || undefined,
                            notes: t.resultText || undefined
                        })),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    linkedTestRecords: (data.tests || []).map((t: any) => {
                        const isOverdue = t.timingStatus === 'GECIKMIS'; // sunucu kararı (tek kaynak)

                        let status = 'PENDING';
                        if (isOverdue) {
                            status = 'OVERDUE';
                        } else if (t.status === 'DEVAM_EDIYOR') {
                            status = 'IN_PROGRESS';
                        } else if (t.status === 'TAMAMLANDI' || t.status === 'ONAYLANDI') {
                            status = 'COMPLETED';
                        }

                        return {
                            id: t.id,
                            testNo: t.testNo,
                            dueDate: t.plannedDate,
                            status: status,
                            rawStatus: String(t.status),
                            overdue: isOverdue,
                            year: typeof t.year === 'number' ? t.year : null,
                            periodLabel: t.periodLabel ?? null,
                            assignee: personName(t.assignee),
                            secondController: personName(t.secondController),
                            deletionRequested: !!t.deletionRequestedAt,
                            findingLinkCount: t._count?.findingLinks ?? 0,
                            testResult: t.findingStatus === 'BULGUSU_YOK' ? 'EFFECTIVE' : t.findingStatus === 'BULGUSU_VAR' ? 'INEFFECTIVE' : undefined,
                            notes: t.resultText,
                            hasFinding: t.findingStatus === 'BULGUSU_VAR'
                        };
                    }),
                    yearScopes: data.yearScopes || [],
                    displayStatus: data.displayStatus,
                    statusReason: data.statusReason,
                });
                setDataVersion(v => v + 1);
            }
        } catch (err) {
            // Sessiz yeniden yüklemede mevcut kontrol korunur; yalnız bildirilir.
            const le = classifyLoadError(err, 'Kontrol');
            setLoadError(le);
            showError(le.title, le.description);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [params.id, showError]);

    useEffect(() => {
        fetchControlData();
    }, [fetchControlData]);

    const latestTest = useMemo(() => {
        if (!control || control.linkedTests.length === 0) return null;
        return [...control.linkedTests].sort((a, b) => new Date(b.testDate).getTime() - new Date(a.testDate).getTime())[0];
    }, [control]);

    const recentTests = useMemo(() => (control ? [...control.linkedTests].sort((a, b) => new Date(b.testDate).getTime() - new Date(a.testDate).getTime()).slice(0, 6) : []), [control]);

    // Sıradaki açık test: gecikmiş testler de dâhildir (önceden atlanıyor, "—" görünüyordu).
    const nextTest = useMemo(() => {
        if (!control) return null;
        const open = control.linkedTestRecords.filter(tr => tr.status === 'PENDING' || tr.status === 'IN_PROGRESS' || tr.status === 'OVERDUE');
        if (open.length === 0) return null;
        const first = [...open].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const due = new Date(first.dueDate); due.setHours(0, 0, 0, 0);
        const days = Math.round((due.getTime() - today.getTime()) / 86400000);
        return { id: first.id, date: formatDate(first.dueDate), days, overdue: first.status === 'OVERDUE' || days < 0 };
    }, [control]);
    const nextPlannedDate = nextTest?.date ?? '—';
    const relDays = (d: number) => (d < 0 ? `${Math.abs(d)} gün gecikmiş` : d === 0 ? 'bugün' : `${d} gün sonra`);

    if (loading) {
        return (
            <DetailShell>
                <LoadingState message="Kontrol detayı yükleniyor..." />
            </DetailShell>
        );
    }

    if (!control) {
        return (
            <DetailShell>
                <EmptyState
                    title={(loadError ?? classifyLoadError(null, 'Kontrol')).title}
                    description={(loadError ?? classifyLoadError(null, 'Kontrol')).description}
                    actionLabel={loadError?.retryable ? 'Tekrar Dene' : 'Kontrol Envanterine Dön'}
                    onAction={() => (loadError?.retryable ? fetchControlData() : router.push('/controls'))}
                />
            </DetailShell>
        );
    }

    const openFindings = control.linkedFindings.filter(isFindingOpen);
    const hasFinding = openFindings.length > 0;
    const openActionCount = openFindings.reduce((n, f) => n + (f.actions ?? []).filter(a => a.status !== 'KAPATILDI' && a.status !== 'IPTAL').length, 0);
    const currentYear = new Date().getFullYear();
    // Süreç sorumluları yıl bazlıdır (Dönem Kontrolü). Bu yılın aktif kapsamı, yoksa en son aktif kapsam.
    const activeScopes = control.yearScopes.filter((sc) => sc.status === 'ACTIVE').sort((a, b) => b.year - a.year);
    const ownerScope = activeScopes.find((sc) => sc.year === currentYear) ?? activeScopes[0] ?? null;
    const activeScopeYears = control.yearScopes.filter((sc) => sc.status === 'ACTIVE').map((sc) => sc.year as number).sort((a, b) => a - b);
    const effCfg = effectivenessConfig[control.effectivenessStatus];

    const tabs = [
        { key: 'summary', label: 'Özet ve Kapsam' },
        { key: 'yearScope', label: 'Yıllık Kapsam', count: control.yearScopes.filter((s) => s.status === 'ACTIVE').length },
        { key: 'risks', label: 'Eşleşen Riskler', count: control.linkedRisks.length },
        { key: 'findings', label: 'Bulgular & Aksiyonlar', count: control.linkedFindings.length + control.linkedOtherFindings.length },
        { key: 'tests', label: 'Test Planı', count: control.linkedTestRecords.length },
        { key: 'history', label: 'Değişiklik Geçmişi' },
    ];

    const toggleStatus = async () => {
        setStatusBusy(true);
        try {
            if (control.inventoryStatus === 'ACTIVE') await api.passivateControl(control.id);
            else await api.activateControl(control.id);
            success('Kaydedildi', control.inventoryStatus === 'ACTIVE' ? 'Kontrol envanterde pasifleştirildi.' : 'Kontrol envanterde aktifleştirildi.');
            setStatusConfirm(false);
            await fetchControlData(true);
        } catch (e) {
            showError('İşlem yapılamadı', (e as Error).message);
        } finally { setStatusBusy(false); }
    };

    return (
        <DetailShell>
            <DetailHeader
                breadcrumbs={[
                    { label: 'Kontrol Yönetimi' },
                    { label: 'Kontrol Envanteri', href: '/controls' },
                    { label: control.controlId },
                ]}
                entityId={control.controlId}
                title={control.name}
                badges={
                    <>
                        {effCfg && <StatusBadge variant={effCfg.variant}>{effCfg.label}</StatusBadge>}
                        {control.inventoryStatus === 'PASSIVE' && <StatusBadge variant="neutral">Envanterde pasif</StatusBadge>}
                        {hasFinding && <StatusBadge variant="critical" dot>{openFindings.length} Açık Bulgu</StatusBadge>}
                    </>
                }
                meta={
                    <>
                        <span>Sahip: {control.owner?.name || 'Atanmamış'}</span>
                        <span>Sıklık: {frequencyLabel[control.frequency] || control.frequency}</span>
                        {control.directorate && <span>Direktörlük: {control.directorate}</span>}
                    </>
                }
                actions={
                    <>
                        <Button variant="outline" size="sm" onClick={() => router.push(`/controls/${params.id}/edit`)}
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
                        >
                            Düzenle
                        </Button>
                        {canToggleStatus && (
                            <Button variant={control.inventoryStatus === 'ACTIVE' ? 'outline' : 'success'} size="sm" onClick={() => setStatusConfirm(true)}>
                                {control.inventoryStatus === 'ACTIVE' ? 'Pasifleştir' : 'Aktifleştir'}
                            </Button>
                        )}
                        <Button variant="primary" size="sm" onClick={() => router.push(`/controls/testing?search=${encodeURIComponent(control.controlId)}`)}>
                            Bu Kontrolün Testleri
                        </Button>
                    </>
                }
            />

            {/* Hızlı durum kartları */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
                    <div className="flex items-center gap-2 text-[11.5px] font-medium text-slate-500"><span className="w-2 h-2 rounded-sm bg-blue-600" />Kontrol kodu &amp; sıklığı</div>
                    <p className="text-lg font-bold text-slate-900 mt-1.5 leading-tight break-words">{control.controlId}</p>
                    <p className="text-[11.5px] text-slate-500 mt-0.5">{frequencyLabel[control.frequency] || control.frequency} · Ana kontrol · {activeScopeYears.length > 0 ? `${activeScopeYears.join(', ')} kapsamında` : 'hiçbir yılda kapsamda değil'}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
                    <div className="flex items-center gap-2 text-[11.5px] font-medium text-slate-500"><span className={`w-2 h-2 rounded-sm ${hasFinding ? 'bg-rose-600' : 'bg-emerald-600'}`} />Mevcut bulgu durumu</div>
                    <p className={`text-xl font-bold mt-1.5 truncate ${hasFinding ? 'text-rose-700' : 'text-emerald-700'}`}>{hasFinding ? `${openFindings.length} açık bulgu` : 'Açık bulgu yok'}</p>
                    <p className="text-[11.5px] text-slate-500 mt-0.5">{control.linkedFindings.length} bulgu toplam · {openActionCount} açık aksiyon{control.linkedOtherFindings.length > 0 ? ` · ${control.linkedOtherFindings.length} bağlı bulgu` : ''}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
                    <div className="flex items-center gap-2 text-[11.5px] font-medium text-slate-500"><span className="w-2 h-2 rounded-sm bg-slate-500" />Son test</div>
                    <p className="text-xl font-bold text-slate-900 mt-1.5">{formatDate(control.lastTestDate)}</p>
                    <p className="text-[11.5px] text-slate-500 mt-0.5">Sonuç: {effCfg?.label ?? 'Test edilmedi'}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
                    <div className="flex items-center gap-2 text-[11.5px] font-medium text-slate-500"><span className={`w-2 h-2 rounded-sm ${nextTest?.overdue ? 'bg-red-600' : 'bg-blue-600'}`} />Sonraki test</div>
                    <p className={`text-xl font-bold mt-1.5 ${nextTest?.overdue ? 'text-red-600' : 'text-blue-600'}`}>{nextPlannedDate}</p>
                    <p className={`text-[11.5px] mt-0.5 ${nextTest?.overdue ? 'text-red-500' : 'text-slate-500'}`}>{nextTest ? relDays(nextTest.days) : 'Planlı açık test yok'}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-4 pt-1">
                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
                </div>

                <div className="p-6">
                    {/* Tab 1: Özet ve Kapsam */}
                    {activeTab === 'summary' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="border border-slate-200 rounded-xl p-4">
                                        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Kontrol tanımı (kapsam)</h3>
                                        <p className="text-sm text-slate-800 leading-relaxed">{control.description || <span className="text-slate-400">Tanım girilmemiş.</span>}</p>
                                    </div>
                                    <div className="border border-slate-200 rounded-xl p-4">
                                        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Mehaz (yasal / düzenleyici dayanak)</h3>
                                        <p className="text-sm text-slate-800 leading-relaxed">{control.mehaz || <span className="text-slate-400">Mehaz referansı tanımlanmamış.</span>}</p>
                                    </div>
                                </div>

                                <div className={`rounded-xl border p-4 ${latestTest?.result === 'EFFECTIVE' ? 'bg-emerald-50 border-emerald-200' : latestTest?.result === 'INEFFECTIVE' ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Son kontrol sonucu</h3>
                                        {latestTest && effectivenessConfig[latestTest.result] && <StatusBadge variant={effectivenessConfig[latestTest.result].variant}>{effectivenessConfig[latestTest.result].label}</StatusBadge>}
                                        {latestTest && <span className="text-xs text-slate-500">{formatDate(latestTest.testDate)}</span>}
                                    </div>
                                    {latestTest ? (
                                        <>
                                            <p className="text-sm text-slate-800">{latestTest.notes || 'Detaylı kanıt açıklaması eklenmemiş.'}</p>
                                            {latestTest.findings && <p className="text-xs font-semibold text-rose-700 mt-2">Hata/Bulgu: {latestTest.findings}</p>}
                                        </>
                                    ) : <p className="text-sm text-slate-500">Bu kontrol için henüz tamamlanmış bir test kaydı yok.</p>}
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Son test geçmişi</h3>
                                        <button type="button" onClick={() => setActiveTab('tests')} className="text-xs text-blue-600 hover:underline">Tümü ({control.linkedTestRecords.length})</button>
                                    </div>
                                    {recentTests.length === 0 ? (
                                        <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl p-4">Tamamlanmış test yok.</p>
                                    ) : (
                                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead><tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                                                    <th className="px-3 py-2 font-semibold">Tarih</th><th className="px-3 py-2 font-semibold">Test eden</th><th className="px-3 py-2 font-semibold">Sonuç</th><th className="px-3 py-2 font-semibold">Bulgu</th>
                                                </tr></thead>
                                                <tbody>
                                                    {recentTests.map(t => (
                                                        <tr key={t.id} className="border-t border-slate-100">
                                                            <td className="px-3 py-2.5 font-medium text-slate-800">{formatDate(t.testDate)}</td>
                                                            <td className="px-3 py-2.5 text-slate-600">{t.tester}</td>
                                                            <td className="px-3 py-2.5">{effectivenessConfig[t.result] ? <StatusBadge variant={effectivenessConfig[t.result].variant}>{effectivenessConfig[t.result].label}</StatusBadge> : <span className="text-slate-400">—</span>}</td>
                                                            <td className="px-3 py-2.5 text-slate-600">{t.findings || 'Yok'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Sağ ray */}
                            <div className="space-y-4">
                                <div className="border border-slate-200 rounded-xl p-4">
                                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Süreç sorumluları</h3>
                                    {/* Test kontrolcüleri yıl bazlıdır (Dönem Kontrolü); ana kontroldeki eski alanlar artık yazılmıyor. */}
                                    <p className="text-[11px] text-slate-400 mb-2">
                                        {ownerScope ? <>{ownerScope.year} dönem kontrolü{ownerScope.year !== currentYear && ' (bu yıl kapsamda değil)'}</> : 'Hiçbir yılda kapsamda değil'}
                                    </p>
                                    {([
                                        ['Kayıt sahibi', control.owner?.name, control.owner?.department, false],
                                        ['Sorumlu (1. kontrolcü)', personName(ownerScope?.assignee), ownerScope?.assignee?.department ?? undefined, !!ownerScope],
                                        ['Onaycı (2. kontrolcü)', personName(ownerScope?.secondController), ownerScope?.secondController?.department ?? undefined, !!ownerScope],
                                    ] as Array<[string, string | null | undefined, string | undefined, boolean]>).map(([label, name, sub, assignable]) => (
                                        <div key={label} className="flex items-center justify-between gap-3 py-2 border-t first:border-t-0 border-slate-100">
                                            <div className="min-w-0">
                                                <p className="text-[11px] text-slate-500">{label}</p>
                                                <p className={`text-sm truncate ${name ? 'font-semibold text-slate-900' : 'text-amber-700'}`}>{name || 'Atanmamış'}</p>
                                                {name && sub && <p className="text-[11px] text-slate-400 truncate">{sub}</p>}
                                            </div>
                                            {!name && assignable && ownerScope && <Link href={`/controls/agenda/${ownerScope.id}`} className="text-xs font-semibold text-blue-600 hover:underline shrink-0">Ata</Link>}
                                        </div>
                                    ))}
                                </div>

                                <div className="border border-slate-200 rounded-xl p-4 text-sm">
                                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Test takvimi</h3>
                                    {([
                                        ['Son test', formatDate(control.lastTestDate), ''],
                                        ['Sonraki test', nextPlannedDate, nextTest?.overdue ? 'text-red-600' : 'text-blue-600'],
                                        ['Kalan süre', nextTest ? relDays(nextTest.days) : '—', nextTest?.overdue ? 'text-red-600' : ''],
                                        ['Sıklık (ana kontrol)', frequencyLabel[control.frequency] || control.frequency, ''],
                                        // Dönem kontrolünün sıklığı ana kontrolden farklı olabilir (yıl bazlı periyodiklik değişikliği).
                                        ...(ownerScope ? [[`${ownerScope.year} dönem sıklığı`, frequencyLabel[ownerScope.frequency] || ownerScope.frequency, ownerScope.frequency !== control.frequency ? 'text-amber-700' : '']] : []),
                                    ] as Array<[string, string, string]>).map(([k, v, cls]) => (
                                        <div key={k} className="flex justify-between py-1.5"><span className="text-slate-500">{k}</span><span className={`font-semibold text-slate-900 ${cls}`}>{v}</span></div>
                                    ))}
                                </div>

                                <div className="border border-slate-200 rounded-xl p-4 text-sm">
                                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Organizasyonel uyum</h3>
                                    <div className="flex justify-between py-1.5"><span className="text-slate-500">Genel Müdür Yardımcılığı</span><span className="font-semibold text-slate-900">{control.gmy || '—'}</span></div>
                                    <div className="flex justify-between py-1.5"><span className="text-slate-500">İlgili Direktörlük</span><span className="font-semibold text-slate-900">{control.directorate || '—'}</span></div>
                                    <div className="flex justify-between items-center py-1.5"><span className="text-slate-500">Envanter durumu</span>
                                        <StatusBadge variant={control.inventoryStatus === 'ACTIVE' ? 'success' : 'neutral'}>{control.inventoryStatus === 'ACTIVE' ? 'Aktif' : 'Pasif'}</StatusBadge>
                                    </div>
                                    <div className="flex justify-between items-center py-1.5"><span className="text-slate-500">{currentYear} kapsamı</span>
                                        <StatusBadge variant={control.displayStatus === 'AKTIF' ? 'success' : 'neutral'}>{control.displayStatus === 'AKTIF' ? 'Kapsamda' : 'Kapsam dışı'}</StatusBadge>
                                    </div>
                                </div>

                                <div className="border border-slate-200 rounded-xl p-4 text-sm">
                                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Mevzuat maddeleri ({control.regulations.length})</h3>
                                    {control.regulations.length === 0 ? (
                                        <p className="text-slate-400 text-[13px]">Eşlenmiş mevzuat maddesi yok.</p>
                                    ) : (
                                        <ul className="space-y-1.5">
                                            {control.regulations.map(r => (
                                                <li key={r.id} className="text-[13px] leading-snug">
                                                    <span className="font-mono text-[11px] font-bold text-slate-600">{r.regulationCode} m.{r.articleCode}</span>
                                                    <span className="text-slate-700"> {r.title}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'history' && <ControlHistoryPanel key={dataVersion} controlId={control.id} />}

                    {/* Tab: Yıllık Kapsam */}
                    {activeTab === 'yearScope' && (
                        <ControlScopePanel
                            controlId={control.id}
                            yearScopes={control.yearScopes}
                            onChanged={() => fetchControlData(true)}
                        />
                    )}

                    {/* Tab 2: Riskler */}
                    {activeTab === 'risks' && (
                        <div>
                            {control.linkedRisks.length === 0 ? (
                                <EmptyState
                                    title="Bağlı Risk Bulunmuyor"
                                    description="Bu kontrol faaliyetine eşlenmiş herhangi bir kurumsal risk tanımlanmamıştır."
                                    icon={<svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>}
                                />
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {control.linkedRisks.map(risk => (
                                        <Link
                                            key={risk.id}
                                            href={`/risks/${risk.id}`}
                                            className="block p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all relative group"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                        {risk.riskId}
                                                    </span>
                                                    <p className="text-sm font-bold text-slate-800 pt-1 group-hover:text-blue-600 transition-colors">{risk.name}</p>
                                                    {risk.category && <p className="text-[11px] text-slate-400">{risk.category}</p>}
                                                </div>
                                                <div className="flex gap-1.5 shrink-0">
                                                    {([['Doğal', risk.inherent], ['Artık', risk.residual]] as Array<[string, number | null]>).map(([label, v]) => (
                                                        <div key={label} className="text-center" title={`${label} risk puanı`}>
                                                            <span className={`w-9 h-8 flex items-center justify-center rounded-lg font-bold text-xs tabular-nums ${v === null ? 'bg-slate-100 text-slate-400' : `text-white ${v >= 15 ? 'bg-rose-500' : v >= 10 ? 'bg-amber-500' : 'bg-emerald-500'}`}`}>
                                                                {v ?? '—'}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400">{label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 3: Bulgular */}
                    {activeTab === 'findings' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Bulgular ve Aksiyon Planları</h3>
                                <Button
                                    variant="primary" size="sm"
                                    onClick={() => setIsCreateFindingOpen(true)}
                                    icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                                >
                                    Bulgu Oluştur
                                </Button>
                            </div>

                            {control.linkedFindings.length === 0 ? (
                                <EmptyState
                                    title="Bu kontrolde bulgu yok"
                                    description="Bu kontrolün testlerinden açılmış bir bulgu bulunmuyor."
                                    icon={<svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                />
                            ) : (
                                <div className="space-y-4" data-testid="control-findings">
                                    {control.linkedFindings.map(finding => {
                                        const res = findingResolutionConfig[finding.resolutionStatus];
                                        const open = isFindingOpen(finding);
                                        return (
                                            <div key={finding.id} className={`border rounded-xl p-5 bg-white shadow-sm ${open ? 'border-slate-200' : 'border-slate-100 opacity-80'}`}>
                                                <div className="flex items-start justify-between flex-wrap gap-2">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <Link href={`/findings/${finding.id}`} className="font-mono text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 hover:underline">
                                                                {finding.findingId}
                                                            </Link>
                                                            {severityConfig[finding.severity] && <StatusBadge variant={severityConfig[finding.severity].variant}>{severityConfig[finding.severity].label}</StatusBadge>}
                                                            {res && <StatusBadge variant={res.variant}>{res.label}</StatusBadge>}
                                                            <span className="text-[11px] text-slate-500">{findingWorkflowLabel[finding.workflowStatus] ?? finding.workflowStatus}</span>
                                                        </div>
                                                        <p className="text-sm font-bold text-slate-800 mt-2">{finding.summary || finding.description}</p>
                                                        {finding.summary && finding.description && <p className="text-[13px] text-slate-600 mt-1 line-clamp-2">{finding.description}</p>}
                                                        <p className="text-[11px] text-slate-400 mt-1">Hedef çözüm tarihi: {formatDate(finding.targetResolutionDate)}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Link href={`/findings/${finding.id}`} className="text-xs font-semibold text-blue-600 hover:underline">Detay</Link>
                                                        {open && (
                                                            <Button variant="outline" size="sm" onClick={() => { setEditFindingContext(finding); setIsEditFindingOpen(true); }}>Düzenle</Button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="mt-3 border-t border-slate-100 pt-3">
                                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Aksiyonlar ({finding.actions?.length ?? 0})</p>
                                                    {(finding.actions ?? []).length === 0 ? (
                                                        <p className="text-[13px] text-slate-400">Aksiyon planı yok.</p>
                                                    ) : (
                                                        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                                                            {finding.actions.map(a => {
                                                                const st = actionStatusConfig[a.status];
                                                                return (
                                                                    <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                                                                        <Link href={`/actions/${a.id}`} className="font-mono text-[11px] font-bold text-blue-700 hover:underline">{a.actionId}</Link>
                                                                        <span className="text-slate-700 truncate flex-1 min-w-[160px]">{a.description}</span>
                                                                        <span className="text-[11px] text-slate-500">{a.owner ? `${a.owner.firstName} ${a.owner.lastName}` : 'Sorumlu yok'}</span>
                                                                        <span className="text-[11px] text-slate-500">Termin: {formatDate(a.dueDate)}</span>
                                                                        {st ? <StatusBadge variant={st.variant}>{st.label}</StatusBadge> : <span className="text-[11px] text-slate-500">{a.status}</span>}
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {control.linkedOtherFindings.length > 0 && (
                                <div className="pt-2" data-testid="control-linked-other-findings">
                                    <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-1">Testlere bağlanan diğer bulgular ({control.linkedOtherFindings.length})</h4>
                                    <p className="text-[12px] text-slate-500 mb-2">Bu kontrolün testlerinde mükerrer bulgu açmak yerine ilişkilendirilen, başka kontrollere ait bulgular.</p>
                                    <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
                                        {control.linkedOtherFindings.map(f => (
                                            <li key={f.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                                                <Link href={`/findings/${f.id}`} className="font-mono text-xs font-bold text-violet-700 hover:underline">{f.findingId}</Link>
                                                <span className="text-slate-800 truncate flex-1 min-w-[160px]">{f.summary || '—'}</span>
                                                {f.control && <Link href={`/controls/${f.control.id}`} className="text-[11px] text-slate-500 hover:underline">Kontrol: {f.control.controlId}</Link>}
                                                <span className="text-[11px] text-slate-500">{findingResolutionConfig[f.resolutionStatus]?.label ?? f.resolutionStatus}</span>
                                                <span className="text-[11px] text-slate-500">Test: {f.viaTests.map((t, i) => (
                                                    <span key={t.id}>{i > 0 && ', '}<Link href={`/controls/testing/${t.id}`} className="font-mono hover:underline">{t.testNo}</Link></span>
                                                ))}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 4: Test Planı */}
                    {activeTab === 'tests' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Yıllık plandan üretilen dönem testleri</h3>
                                <Button variant="primary" size="sm" onClick={() => router.push(`/controls/testing?search=${encodeURIComponent(control.controlId)}`)}>
                                    Kontrol Testi listesinde aç
                                </Button>
                            </div>

                            {control.linkedTestRecords.length === 0 ? (
                                <EmptyState
                                    title="Planlanmış Test Bulunmuyor"
                                    description="Bu kontrol için dönem testi yok. Testler, kontrol bir yılın kapsamına alınıp Yıllık Plan uygulandığında üretilir."
                                    icon={<svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                                />
                            ) : (
                                <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm bg-white">
                                    <table className="w-full border-collapse text-left">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200">
                                                <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Test no</th>
                                                <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dönem</th>
                                                <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Planlanan</th>
                                                <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Sorumlu / 2. kontrolcü</th>
                                                <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Durum</th>
                                                <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Sonuç</th>
                                                <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">İşlem</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-sm">
                                            {control.linkedTestRecords.map(tr => {
                                                const stage = testStageConfig[tr.rawStatus];
                                                return (
                                                <tr key={tr.id} className="hover:bg-slate-50/50 transition-colors" data-testid="control-test-row">
                                                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-600">{tr.testNo}</td>
                                                    <td className="px-3 py-3 text-slate-700">
                                                        {tr.periodLabel ?? (
                                                            <>{frequencyLabel[control.frequency] || control.frequency}{tr.year !== null && <span className="text-[11px] text-slate-400"> · {tr.year}</span>}</>
                                                        )}
                                                    </td>
                                                    <td className={`px-3 py-3 ${tr.overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                                                        {formatDate(tr.dueDate)}
                                                        {tr.overdue && <span className="block text-[11px]">Gecikmiş</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-[13px]">
                                                        <span className={tr.assignee ? 'text-slate-800' : 'text-amber-700'}>{tr.assignee ?? 'Atanmamış'}</span>
                                                        <span className="block text-[11px] text-slate-500">2.: {tr.secondController ?? 'Atanmamış'}</span>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="flex flex-col items-start gap-1">
                                                            {stage ? <StatusBadge variant={stage.variant}>{stage.label}</StatusBadge> : <span className="text-xs text-slate-500">{tr.rawStatus}</span>}
                                                            {tr.deletionRequested && <StatusBadge variant="critical">Silme talebi onayda</StatusBadge>}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {tr.testResult ? (
                                                            <StatusBadge variant={tr.testResult === 'EFFECTIVE' ? 'success' : 'critical'}>
                                                                {tr.testResult === 'EFFECTIVE' ? 'Bulgu yok' : 'Bulgu var'}
                                                            </StatusBadge>
                                                        ) : (
                                                            <span className="text-slate-400 text-xs">—</span>
                                                        )}
                                                        {tr.findingLinkCount > 0 && <span className="block text-[11px] text-violet-700 mt-1">{tr.findingLinkCount} bağlı bulgu</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right">
                                                        <Button variant="outline" size="sm" onClick={() => router.push(`/controls/testing/${tr.id}`)}>
                                                            Teste git
                                                        </Button>
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Modal open={statusConfirm} onClose={() => !statusBusy && setStatusConfirm(false)} size="md"
                title={control.inventoryStatus === 'ACTIVE' ? 'Kontrolü pasifleştir' : 'Kontrolü aktifleştir'}
                description={control.inventoryStatus === 'ACTIVE'
                    ? 'Pasif kontrol envanterde kalır ve yeni yıl planlarına önerilmez. Geçmiş yıl kapsamları, testler ve bulgular etkilenmez.'
                    : 'Kontrol yeniden envanterde aktif olur ve yıllık plana alınabilir.'}
                footer={<div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setStatusConfirm(false)} disabled={statusBusy}>Vazgeç</Button>
                    <Button variant={control.inventoryStatus === 'ACTIVE' ? 'danger' : 'success'} size="sm" loading={statusBusy} onClick={toggleStatus}>
                        {control.inventoryStatus === 'ACTIVE' ? 'Pasifleştir' : 'Aktifleştir'}
                    </Button>
                </div>}>
                <p className="text-sm text-slate-700"><b className="font-mono">{control.controlId}</b> · {control.name}</p>
                {control.inventoryStatus === 'ACTIVE' && activeScopeYears.length > 0 && (
                    <p className="text-[13px] text-amber-700 mt-2">Kontrol şu yılların kapsamında: {activeScopeYears.join(', ')}. Pasifleştirmek bu kapsamları kaldırmaz; gerekiyorsa Yıllık Kapsam sekmesinden ayrıca çıkarma talebi oluşturun.</p>
                )}
            </Modal>

            <CreateFindingModal
                isOpen={isCreateFindingOpen}
                onClose={() => setIsCreateFindingOpen(false)}
                onSuccess={() => fetchControlData(true)}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                controlContext={control as any}
            />

            {isEditFindingOpen && editFindingContext && (
                <CreateFindingModal
                    isOpen={isEditFindingOpen}
                    onClose={() => {
                        setIsEditFindingOpen(false);
                        setEditFindingContext(null);
                    }}
                    onSuccess={() => fetchControlData(true)}
                    editContext={editFindingContext}
                />
            )}
        </DetailShell>
    );
}
