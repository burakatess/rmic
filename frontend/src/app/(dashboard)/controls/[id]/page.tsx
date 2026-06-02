'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { EmptyState, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { CreateFindingModal } from '@/components/modals/CreateFindingModal';

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
    status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
    dueDate: string;
    owner?: {
        firstName: string;
        lastName: string;
    };
}

interface Finding {
    id: string;
    findingId: string;
    description: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'VERIFIED';
    targetResolutionDate: string;
    actions: Action[];
}

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
    dueDate: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
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
    dueDate: string;
    effectivenessStatus: string;
    lastTestDate: string;
    nextTestDate: string;
    owner: User | null;
    testPerformer: User | null;
    reviewer: User | null;
    linkedRisks: { id: string; riskId: string; name: string; score: number; category: string }[];
    linkedFindings: Finding[];
    linkedTests: ControlTest[];
    linkedTestRecords: TestRecord[];
}

const effectivenessConfig: Record<string, { label: string; color: string; bg: string }> = {
    EFFECTIVE: { label: 'Etkin', color: 'text-emerald-700', bg: 'bg-emerald-50 border border-emerald-200' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen Etkin', color: 'text-amber-700', bg: 'bg-amber-50 border border-amber-200' },
    INEFFECTIVE: { label: 'Etkin Değil', color: 'text-rose-700', bg: 'bg-rose-50 border border-rose-200' },
    NOT_TESTED: { label: 'Test Edilmedi', color: 'text-slate-600', bg: 'bg-slate-50 border border-slate-200' },
};

const frequencyLabel: Record<string, string> = {
    DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık',
    QUARTERLY: '3 Aylık', SEMI_ANNUAL: '6 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi',
};

const statusTranslation: Record<string, string> = {
    PENDING: 'Bekliyor',
    IN_PROGRESS: 'Devam Ediyor',
    COMPLETED: 'Tamamlandı',
    OVERDUE: 'Gecikmiş',
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

    const [activeTab, setActiveTab] = useState<'summary' | 'risks' | 'findings' | 'tests'>('summary');
    const [control, setControl] = useState<Control | null>(null);
    const [loading, setLoading] = useState(true);
    const [isCreateFindingOpen, setIsCreateFindingOpen] = useState(false);
    const [isEditFindingOpen, setIsEditFindingOpen] = useState(false);
    const [editFindingContext, setEditFindingContext] = useState<any | null>(null);

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
                    dueDate: String(data.dueDate || ''),
                    owner: data.owner ? { 
                        id: data.owner.id,
                        firstName: data.owner.firstName,
                        lastName: data.owner.lastName,
                        name: `${data.owner.firstName} ${data.owner.lastName}`, 
                        email: data.owner.email, 
                        department: data.owner.department 
                    } : null,
                    testPerformer: data.testPerformer ? { name: `${data.testPerformer.firstName} ${data.testPerformer.lastName}`, email: data.testPerformer.email } : null,
                    reviewer: data.reviewer ? { name: `${data.reviewer.firstName} ${data.reviewer.lastName}`, email: data.reviewer.email } : null,
                    effectivenessStatus: String(data.effectivenessStatus || 'NOT_TESTED'),
                    lastTestDate: data.lastTestDate || '',
                    nextTestDate: data.nextTestDate || '',
                    linkedRisks: (data.risks || data.riskMappings || []).map((rm: any) => {
                        const risk = rm.risk || rm;
                        return {
                            id: String(risk.id),
                            riskId: String(risk.riskId),
                            name: String(risk.name),
                            score: Number(risk.inherentRiskScore || 10),
                            category: risk.category?.name || 'Genel Risk'
                        };
                    }),
                    linkedFindings: data.findings || [],
                    linkedTests: data.tests || [],
                    linkedTestRecords: data.testRecords || []
                });
            }
        } catch (err) {
            console.error('Failed to fetch control:', err);
            showError('Hata', 'Kontrol detayları yüklenemedi.');
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

    const nextPlannedDate = useMemo(() => {
        if (!control || control.linkedTestRecords.length === 0) return '—';
        const pending = control.linkedTestRecords.filter(tr => tr.status === 'PENDING' || tr.status === 'IN_PROGRESS');
        if (pending.length === 0) return '—';
        const sorted = [...pending].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        return formatDate(sorted[0].dueDate);
    }, [control]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!control) {
        return <div className="p-8 text-center text-slate-500">Kontrol bulunamadı.</div>;
    }

    const hasFinding = control.linkedFindings.length > 0;

    const tabs = [
        { id: 'summary', label: 'Özet ve Kapsam', icon: '📋' },
        { id: 'risks', label: 'Eşleşen Riskler', icon: '⚠️', count: control.linkedRisks.length },
        { id: 'findings', label: 'Bulgular & Aksiyonlar', icon: '🔍', count: control.linkedFindings.length },
        { id: 'tests', label: 'Test Planı', icon: '🧪', count: control.linkedTestRecords.length },
    ];

    return (
        <div className="min-h-screen bg-slate-50/50 max-w-7xl mx-auto py-8 px-4 space-y-6">
            {/* Header / Breadcrumb */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-5">
                <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                        <Link href="/controls" className="hover:text-slate-600">Kontrol Envanteri</Link>
                        <span>/</span>
                        <span className="text-slate-600">{control.controlId}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">{control.name}</h1>
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${effectivenessConfig[control.effectivenessStatus]?.bg} ${effectivenessConfig[control.effectivenessStatus]?.color}`}>
                            {effectivenessConfig[control.effectivenessStatus]?.label}
                        </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{control.controlId} master kontrolü detay analizi ve operasyonel akışı.</p>
                </div>
                <div className="flex gap-2.5">
                    <Link href={`/controls/${params.id}/edit`} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors uppercase tracking-wider">
                        Düzenle
                    </Link>
                    <Link href="/controls/testing" className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl text-xs hover:bg-blue-700 transition-all shadow-sm uppercase tracking-wider">
                        Test Çalışma Alanı
                    </Link>
                </div>
            </div>

            {/* Quick Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 flex items-center gap-4">
                    <span className="text-2xl p-2 bg-slate-50 rounded-xl">🛡️</span>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kontrol Kodu & Sıklığı</p>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">{control.controlId} — {frequencyLabel[control.frequency] || control.frequency}</p>
                    </div>
                </div>
                <div className={`rounded-2xl p-4 shadow-sm flex items-center gap-4 border ${hasFinding ? 'bg-rose-50/50 border-rose-100' : 'bg-emerald-50/50 border-emerald-100'}`}>
                    <span className="text-2xl">{hasFinding ? '🚨' : '🟢'}</span>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mevcut Bulgu Durumu</p>
                        <p className={`text-sm font-bold mt-0.5 ${hasFinding ? 'text-rose-700' : 'text-emerald-700'}`}>
                            {hasFinding ? `${control.linkedFindings.length} Açık Bulgu` : 'Bulgu Bulunmuyor'}
                        </p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 flex items-center gap-4">
                    <span className="text-2xl p-2 bg-slate-50 rounded-xl">📅</span>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Son / Sonraki Test Tarihi</p>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">
                            {formatDate(control.lastTestDate)} / <span className="text-blue-600 font-bold">{nextPlannedDate}</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex border-b border-slate-100 overflow-x-auto bg-slate-50/50">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as typeof activeTab)}
                            className={`px-6 py-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                        >
                            <span>{tab.icon}</span>
                            {tab.label}
                            {tab.count !== undefined && (
                                <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="p-6">
                    {/* Tab 1: Özet ve Kapsam */}
                    {activeTab === 'summary' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="md:col-span-2 space-y-6">
                                
                                {/* 1. Kontrol Tanımı */}
                                <div>
                                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">📝 Kontrol Tanımı (Kapsam)</h3>
                                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5">
                                        <p className="text-sm font-semibold text-slate-700 leading-relaxed">{control.description || 'Tanım girilmemiş.'}</p>
                                    </div>
                                </div>

                                {/* 2. Mehaz (Açıklama) */}
                                <div>
                                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">⚖️ Mehaz (Yasal / Düzenleyici Dayanak)</h3>
                                    <div className="bg-blue-50/20 border border-blue-100 rounded-2xl p-5">
                                        <p className="text-sm font-semibold text-slate-700 leading-relaxed">{control.mehaz || 'Mehaz referansı tanımlanmamış.'}</p>
                                    </div>
                                </div>

                                {/* 3. Son Kontrol Sonucu */}
                                <div>
                                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">🔬 Son Kontrol Sonucu (Değerlendirme)</h3>
                                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5">
                                        {latestTest ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${effectivenessConfig[latestTest.result]?.bg} ${effectivenessConfig[latestTest.result]?.color}`}>
                                                        {effectivenessConfig[latestTest.result]?.label}
                                                    </span>
                                                    <span className="text-xs text-slate-400">Tarih: {formatDate(latestTest.testDate)}</span>
                                                </div>
                                                <p className="text-sm font-semibold text-slate-700 italic mt-2">
                                                    "{latestTest.notes || 'Detaylı kanıt açıklaması eklenmemiş.'}"
                                                </p>
                                                {latestTest.findings && (
                                                    <p className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded mt-2.5">
                                                        ⚠️ Hata/Bulgu: {latestTest.findings}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-slate-400 italic">Bu kontrol için henüz tamamlanmış bir operasyonel test kaydı bulunmuyor.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Sağ Blok: Sorumluluk ve Uyum */}
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">👤 Süreç Sorumluları</h3>
                                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-4">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kontrol Sahibi (Assignee)</p>
                                            <p className="font-bold text-sm text-slate-800 mt-0.5">{control.owner?.name || 'Atanmamış'}</p>
                                            {control.owner?.department && <p className="text-xs text-slate-400 mt-0.5">{control.owner.department}</p>}
                                        </div>
                                        <div className="border-t border-slate-200/60 pt-3">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Test Eden (İcra Sorumlusu)</p>
                                            <p className="font-bold text-sm text-slate-800 mt-0.5">{control.testPerformer?.name || 'Belirlenmemiş'}</p>
                                        </div>
                                        <div className="border-t border-slate-200/60 pt-3">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Onaycı / 2. Kontrolcü</p>
                                            <p className="font-bold text-sm text-slate-800 mt-0.5">{control.reviewer?.name || 'Atanmamış'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">🏢 Organizasyonel Uyum</h3>
                                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3.5 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Genel Müdür Yardımcılığı:</span>
                                            <span className="font-bold text-slate-700 text-xs">{control.gmy || 'Genel'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">İlgili Direktörlük:</span>
                                            <span className="font-bold text-slate-700 text-xs">{control.directorate || 'BT Ağ Yönetimi'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Durum:</span>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${control.effectivenessStatus === 'ACTIVE' || control.dueDate === '' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-600'}`}>
                                                {control.effectivenessStatus === 'ACTIVE' || control.dueDate === '' ? 'Aktif Kontrol' : 'Pasif Kontrol'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab 2: Riskler */}
                    {activeTab === 'risks' && (
                        <div>
                            {control.linkedRisks.length === 0 ? (
                                <EmptyState
                                    title="Bağlı Risk Bulunmuyor"
                                    description="Bu kontrol faaliyetine eşlenmiş herhangi bir kurumsal risk tanımlanmamıştır."
                                    icon={<span className="text-4xl block mb-2">⚠️</span>}
                                />
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {control.linkedRisks.map(risk => (
                                        <Link
                                            key={risk.id}
                                            href={`/risks/${risk.id}`}
                                            className="block p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all relative group"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                        {risk.riskId}
                                                    </span>
                                                    <p className="text-sm font-bold text-slate-800 pt-1 group-hover:text-blue-600 transition-colors">{risk.name}</p>
                                                    <p className="text-[11px] text-slate-400">{risk.category}</p>
                                                </div>
                                                <span className={`w-8 h-8 flex items-center justify-center rounded-xl font-bold text-white text-xs ${risk.score >= 15 ? 'bg-rose-500' : risk.score >= 10 ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                                                    {risk.score}
                                                </span>
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
                                <button
                                    onClick={() => setIsCreateFindingOpen(true)}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm uppercase tracking-wider"
                                >
                                    + Bulgu Oluştur
                                </button>
                            </div>
                            
                            {control.linkedFindings.length === 0 ? (
                                <EmptyState
                                    title="Açık Bulgu Bulunmuyor"
                                    description="Harika! Bu kontrol faaliyeti için son testlerde herhangi bir bulgu tespit edilmemiştir."
                                    icon={<span className="text-4xl block mb-2">🎉</span>}
                                />
                            ) : (
                                <div className="space-y-6">
                                    {control.linkedFindings.map(finding => (
                                        <div key={finding.id} className="border border-slate-200/80 rounded-2xl p-5 bg-white shadow-sm space-y-4">
                                            <div className="flex items-start justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                                                            {finding.findingId}
                                                        </span>
                                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${finding.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                                                            {finding.severity}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm font-bold text-slate-800 mt-2">{finding.description}</p>
                                                    <p className="text-[11px] text-slate-400 mt-0.5">SLA Çözüm Tarihi: {formatDate(finding.targetResolutionDate)}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <StatusBadge variant="neutral">{finding.status}</StatusBadge>
                                                    <button
                                                        onClick={() => {
                                                            setEditFindingContext(finding);
                                                            setIsEditFindingOpen(true);
                                                        }}
                                                        className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 font-bold border border-slate-200 rounded-lg text-xs transition-colors uppercase tracking-wider flex items-center gap-1.5 shadow-sm"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                        Düzenle
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 4: Zaman Tüneli & Test Planı (Timeline + DataTable Hybrid) */}
                    {activeTab === 'tests' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Otomatik Üretilen Yıllık Planlı Test Kayıtları (Test Records)</h3>
                                <Link
                                    href="/controls/testing"
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                                >
                                    Test Workspace'e Git
                                </Link>
                            </div>

                            {control.linkedTestRecords.length === 0 ? (
                                <EmptyState
                                    title="Planlanmış Test Bulunmuyor"
                                    description="Bu periyodik kontrol için henüz otomatik planlı test kaydı üretilmemiştir. Sıklık durumunu aktif yapın."
                                    icon={<span className="text-4xl block mb-2">📅</span>}
                                />
                            ) : (
                                <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm bg-white">
                                    <table className="w-full border-collapse text-left">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200">
                                                <th className="px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Test ID</th>
                                                <th className="px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Sıklık/Dönem</th>
                                                <th className="px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Planlanan Tarih</th>
                                                <th className="px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Atanan Kullanıcı</th>
                                                <th className="px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Durum</th>
                                                <th className="px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Bulgu Durumu</th>
                                                <th className="px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Sonuç</th>
                                                <th className="px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">İşlem</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-sm">
                                            {control.linkedTestRecords.map(tr => (
                                                <tr key={tr.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-5 py-3.5 font-mono text-xs font-bold text-slate-600">
                                                        T-{tr.id.substring(tr.id.length - 8).toUpperCase()}
                                                    </td>
                                                    <td className="px-5 py-3.5 font-bold text-slate-700">
                                                        {frequencyLabel[control.frequency] || control.frequency}
                                                    </td>
                                                    <td className="px-5 py-3.5 text-slate-500 font-semibold">
                                                        {formatDate(tr.dueDate)}
                                                    </td>
                                                    <td className="px-5 py-3.5 text-slate-700 font-semibold">
                                                        {control.owner?.name || 'Atanmamış'}
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                                            tr.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                                            tr.status === 'IN_PROGRESS' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                                            tr.status === 'OVERDUE' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                                            'bg-slate-100 text-slate-600 border border-slate-200'
                                                        }`}>
                                                            {statusTranslation[tr.status] || tr.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        {tr.hasFinding ? (
                                                            <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-lg text-[10px] font-bold">Bulgu Var</span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded-lg text-[10px] font-bold">Bulgu Yok</span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        {tr.testResult ? (
                                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                                                tr.testResult === 'EFFECTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                                            }`}>
                                                                {tr.testResult === 'EFFECTIVE' ? 'Etkin' : 'Etkin Değil'}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-400 italic text-xs">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3.5 text-right">
                                                        <button
                                                            onClick={() => router.push(`/controls/testing?recordId=${tr.id}`)}
                                                            className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-extrabold rounded-xl text-xs transition-colors"
                                                        >
                                                            Teste Git
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            
            <CreateFindingModal
                isOpen={isCreateFindingOpen}
                onClose={() => setIsCreateFindingOpen(false)}
                onSuccess={() => fetchControlData(true)}
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
        </div>
    );
}
