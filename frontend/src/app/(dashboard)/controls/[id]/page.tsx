'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/lib/api';

interface Control {
    id: string;
    controlId: string;
    name: string;
    description: string;
    type: string;
    nature: string;
    automation: string;
    frequency: string;
    owner: { name: string; department: string; email: string };
    effectivenessStatus: string;
    lastTestDate: string;
    nextTestDate: string;
    linkedRisks: { id: string; riskId: string; name: string; score: number }[];
}

interface TestResult {
    id: string;
    testDate: string;
    tester: string;
    result: string;
    findings?: string;
}

const DEMO_CONTROL: Control = {
    id: '1',
    controlId: 'C-2024-0001',
    name: 'Güvenlik Duvarı Yönetimi',
    description: 'Kurumsal ağ güvenliğini sağlamak için güvenlik duvarı kurallarının yönetimi, izlenmesi ve düzenli olarak gözden geçirilmesi. Bu kontrol, yetkisiz erişim girişimlerini engellemek ve ağ trafiğini filtrelemek için kritik öneme sahiptir.',
    type: 'IT_GENERAL',
    nature: 'PREVENTIVE',
    automation: 'AUTOMATED',
    frequency: 'CONTINUOUS',
    owner: { name: 'Mehmet Demir', department: 'Bilgi Güvenliği', email: 'mehmet.demir@banka.com' },
    effectivenessStatus: 'EFFECTIVE',
    lastTestDate: '2024-12-15',
    nextTestDate: '2025-01-15',
    linkedRisks: [
        { id: '1', riskId: 'R-2024-0001', name: 'Siber Saldırı Riski', score: 12 },
        { id: '4', riskId: 'R-2024-0004', name: 'Veri Sızıntısı Riski', score: 15 },
    ],
};

const DEMO_TESTS: TestResult[] = [
    { id: '1', testDate: '2024-12-15', tester: 'Ahmet Yılmaz', result: 'EFFECTIVE' },
    { id: '2', testDate: '2024-09-10', tester: 'Ayşe Kaya', result: 'EFFECTIVE' },
    { id: '3', testDate: '2024-06-05', tester: 'Mehmet Demir', result: 'PARTIALLY_EFFECTIVE', findings: 'Bazı kurallar güncel değil' },
];

const typeLabels: Record<string, string> = { IT_GENERAL: 'IT Genel', IT_APPLICATION: 'IT Uygulama', OPERATIONAL: 'Operasyonel', FINANCIAL: 'Finansal', COMPLIANCE: 'Uyum' };
const natureLabels: Record<string, string> = { PREVENTIVE: 'Önleyici', DETECTIVE: 'Tespit Edici', CORRECTIVE: 'Düzeltici' };
const automationLabels: Record<string, string> = { AUTOMATED: 'Otomatik', SEMI_AUTOMATED: 'Yarı Otomatik', MANUAL: 'Manuel' };
const frequencyLabels: Record<string, string> = { DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık', QUARTERLY: '3 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi' };
const effectivenessConfig: Record<string, { label: string; color: string }> = {
    EFFECTIVE: { label: 'Etkin', color: 'bg-green-100 text-green-700' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen Etkin', color: 'bg-yellow-100 text-yellow-700' },
    INEFFECTIVE: { label: 'Etkin Değil', color: 'bg-red-100 text-red-700' },
    NOT_TESTED: { label: 'Test Edilmedi', color: 'bg-gray-100 text-gray-600' },
};

export default function ControlDetailPage() {
    const params = useParams();
    const [activeTab, setActiveTab] = useState<'summary' | 'risks' | 'tests' | 'history'>('summary');
    const [control, setControl] = useState<Control>(DEMO_CONTROL);
    const [tests] = useState<TestResult[]>(DEMO_TESTS);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchControlData = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = await api.getControl(params.id as string) as any;
                if (data) {
                    setControl({
                        id: String(data.id),
                        controlId: String(data.controlId || ''),
                        name: String(data.name || ''),
                        description: String(data.description || ''),
                        type: String(data.type || 'IT_GENERAL'),
                        nature: String(data.nature || 'PREVENTIVE'),
                        automation: String(data.automation || 'MANUAL'),
                        frequency: String(data.frequency || 'MONTHLY'),
                        owner: {
                            name: `${data.owner?.firstName || ''} ${data.owner?.lastName || ''}`.trim() || 'Bilinmiyor',
                            department: String(data.owner?.department || ''),
                            email: String(data.owner?.email || '')
                        },
                        effectivenessStatus: String(data.effectivenessStatus || 'NOT_TESTED'),
                        lastTestDate: data.lastTestDate || new Date().toISOString(),
                        nextTestDate: data.nextTestDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                        linkedRisks: (data.riskMappings || []).map((rm: { risk: { id: string; riskId: string; name: string; residualRiskScore: number } }) => ({
                            id: String(rm.risk?.id || ''),
                            riskId: String(rm.risk?.riskId || ''),
                            name: String(rm.risk?.name || ''),
                            score: Number(rm.risk?.residualRiskScore || 0)
                        }))
                    });
                }
            } catch (err) {
                console.error('Failed to fetch control:', err);
                // Keep demo data on error
            } finally {
                setLoading(false);
            }
        };
        if (params.id) {
            fetchControlData();
        }
    }, [params.id]);

    const tabs = [
        { id: 'summary', label: 'Özet', icon: '📋' },
        { id: 'risks', label: 'Bağlı Riskler', icon: '⚠️', count: control.linkedRisks.length },
        { id: 'tests', label: 'Test Geçmişi', icon: '🧪', count: tests.length },
        { id: 'history', label: 'Değişiklik Geçmişi', icon: '📜' },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1400px] mx-auto px-6 py-6">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/controls" className="hover:text-green-600">Kontrol Envanteri</Link>
                    <span>/</span>
                    <span className="text-gray-900">{control.controlId}</span>
                </div>

                {/* Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="font-mono text-lg text-green-600 bg-green-50 px-3 py-1 rounded-lg">{control.controlId}</span>
                                <span className={`px-3 py-1 rounded-lg text-sm font-medium ${effectivenessConfig[control.effectivenessStatus]?.color}`}>
                                    {effectivenessConfig[control.effectivenessStatus]?.label}
                                </span>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">{control.name}</h1>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                                <span>{typeLabels[control.type]}</span>
                                <span>•</span>
                                <span>{natureLabels[control.nature]}</span>
                                <span>•</span>
                                <span>Sahip: {control.owner.name}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Link href="/controls/testing" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                                Test Et
                            </Link>
                            <Link href={`/controls/${params.id}/edit`} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700">
                                Düzenle
                            </Link>
                        </div>
                    </div>

                    {/* Control Properties */}
                    <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Kontrol Tipi</p>
                            <p className="font-medium text-gray-900">{typeLabels[control.type]}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Kontrol Niteliği</p>
                            <p className="font-medium text-gray-900">{natureLabels[control.nature]}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Otomasyon</p>
                            <p className="font-medium text-gray-900">{automationLabels[control.automation]}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">Uygulama Sıklığı</p>
                            <p className="font-medium text-gray-900">{frequencyLabels[control.frequency]}</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="flex border-b border-gray-100">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                className={`px-6 py-4 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === tab.id
                                    ? 'border-green-600 text-green-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <span>{tab.icon}</span>
                                {tab.label}
                                {tab.count !== undefined && (
                                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="p-6">
                        {activeTab === 'summary' && (
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <h3 className="font-semibold text-gray-900 mb-3">Kontrol Açıklaması</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed">{control.description}</p>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 mb-3">Kontrol Sahibi</h3>
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <p className="font-medium text-gray-900">{control.owner.name}</p>
                                        <p className="text-sm text-gray-500">{control.owner.department}</p>
                                        <p className="text-sm text-green-600">{control.owner.email}</p>
                                    </div>

                                    <h3 className="font-semibold text-gray-900 mt-6 mb-3">Test Takvimi</h3>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Son Test:</span>
                                            <span className="text-gray-900">{new Date(control.lastTestDate).toLocaleDateString('tr-TR')}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Sonraki Test:</span>
                                            <span className="text-orange-600 font-medium">{new Date(control.nextTestDate).toLocaleDateString('tr-TR')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'risks' && (
                            <div>
                                <p className="text-sm text-gray-500 mb-4">{control.linkedRisks.length} risk bu kontrolle ilişkilendirilmiş</p>
                                <div className="space-y-3">
                                    {control.linkedRisks.map(risk => (
                                        <Link key={risk.id} href={`/risks/${risk.id}`} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">⚠️</div>
                                                <div>
                                                    <p className="font-mono text-sm text-blue-600">{risk.riskId}</p>
                                                    <p className="font-medium text-gray-900">{risk.name}</p>
                                                </div>
                                            </div>
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${risk.score >= 15 ? 'bg-red-500' : risk.score >= 10 ? 'bg-yellow-500' : 'bg-green-500'}`}>
                                                {risk.score}
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'tests' && (
                            <div>
                                <p className="text-sm text-gray-500 mb-4">{tests.length} test kaydı</p>
                                <div className="space-y-3">
                                    {tests.map(test => (
                                        <div key={test.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">{new Date(test.testDate).toLocaleDateString('tr-TR')}</p>
                                                <p className="text-xs text-gray-500">Test Eden: {test.tester}</p>
                                                {test.findings && <p className="text-xs text-orange-600 mt-1">{test.findings}</p>}
                                            </div>
                                            <span className={`px-3 py-1 rounded-lg text-xs font-medium ${effectivenessConfig[test.result]?.color}`}>
                                                {effectivenessConfig[test.result]?.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'history' && (
                            <div className="text-center py-12 text-gray-500">
                                <span className="text-4xl block mb-2">📜</span>
                                <p>Değişiklik geçmişi görüntülenecek</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
