'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHeader, StatusBadge, Button } from '@/components/ui';

interface AuditExecution {
    id: string;
    executionId: string;
    planName: string;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED';
    startDate: string;
    auditor: string;
    progress: number;
    findingsCount: number;
    workpapers: number;
}

const DEMO_EXECUTIONS: AuditExecution[] = [
    { id: '1', executionId: 'AE-2024-001', planName: 'BT Güvenlik Denetimi', status: 'IN_PROGRESS', startDate: '2024-10-15', auditor: 'Dış Denetim A.Ş.', progress: 65, findingsCount: 4, workpapers: 12 },
    { id: '2', executionId: 'AE-2024-002', planName: 'Operasyonel Risk Denetimi', status: 'COMPLETED', startDate: '2024-06-01', auditor: 'Dış Denetim B.Ş.', progress: 100, findingsCount: 8, workpapers: 25 },
];

type BadgeVariant = 'neutral' | 'warning' | 'info' | 'success';

const statusLabels: Record<string, { label: string; variant: BadgeVariant }> = {
    NOT_STARTED: { label: 'Başlamadı', variant: 'neutral' },
    IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
    REVIEW: { label: 'İncelemede', variant: 'info' },
    COMPLETED: { label: 'Tamamlandı', variant: 'success' },
};

export default function AuditExecutionsPage() {
    const [executions, setExecutions] = useState<AuditExecution[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedExecution, setSelectedExecution] = useState<AuditExecution | null>(null);

    useEffect(() => {
        setTimeout(() => {
            setExecutions(DEMO_EXECUTIONS);
            setLoading(false);
        }, 500);
    }, []);

    const totalFindings = executions.reduce((sum, e) => sum + e.findingsCount, 0);

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            <div className="px-8 pt-8">
                <PageHeader
                    title="Denetim Uygulama"
                    description="Aktif denetimleri yönetin ve takip edin"
                    breadcrumbs={[{ label: 'Denetim & İnceleme' }, { label: 'Denetim Uygulama' }]}
                />

                {/* Summary */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Toplam Denetim</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">{executions.length}</p>
                    </div>
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-amber-200">
                        <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Devam Eden</p>
                        <p className="text-2xl font-bold text-amber-700 mt-1">{executions.filter(e => e.status === 'IN_PROGRESS').length}</p>
                    </div>
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-violet-200">
                        <p className="text-xs font-medium text-violet-600 uppercase tracking-wide">Toplam Bulgu</p>
                        <p className="text-2xl font-bold text-violet-700 mt-1">{totalFindings}</p>
                    </div>
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-emerald-200">
                        <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Tamamlanan</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-1">{executions.filter(e => e.status === 'COMPLETED').length}</p>
                    </div>
                </div>
            </div>

            <div className="px-8 pb-8 flex-1">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {executions.map((execution) => (
                            <div
                                key={execution.id}
                                onClick={() => setSelectedExecution(execution)}
                                className={`bg-white rounded-2xl p-6 shadow-sm border cursor-pointer transition-all ${selectedExecution?.id === execution.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
                                    }`}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <span className="font-mono text-sm font-semibold text-blue-600">{execution.executionId}</span>
                                        <h3 className="font-semibold text-slate-800 mt-1">{execution.planName}</h3>
                                    </div>
                                    {statusLabels[execution.status] && (
                                        <StatusBadge variant={statusLabels[execution.status].variant}>
                                            {statusLabels[execution.status].label}
                                        </StatusBadge>
                                    )}
                                </div>

                                {/* Progress Bar */}
                                <div className="mb-4">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-slate-500 font-medium">İlerleme</span>
                                        <span className="font-medium text-slate-700">%{execution.progress}</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${execution.progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'
                                                }`}
                                            style={{ width: `${execution.progress}%` }}
                                        ></div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500 font-medium">
                                        Başlangıç: {new Date(execution.startDate).toLocaleDateString('tr-TR')}
                                    </span>
                                    <div className="flex gap-4">
                                        <span className="text-violet-600 font-medium">{execution.findingsCount} Bulgu</span>
                                        <span className="text-slate-500">{execution.workpapers} Çalışma Dosyası</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Selected Execution Details */}
                {selectedExecution && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mt-6 animate-in slide-in-from-bottom-4">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-slate-800">Denetim Detayları: {selectedExecution.planName}</h3>
                            <button
                                onClick={() => setSelectedExecution(null)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Quick Actions */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Hızlı İşlemler</h4>
                                <Link
                                    href="/findings/new"
                                    className="block w-full"
                                >
                                    <Button variant="primary" className="w-full justify-center">
                                        + Yeni Bulgu Ekle
                                    </Button>
                                </Link>
                                <Button variant="outline" className="w-full justify-center">
                                    Çalışma Dosyası Yükle
                                </Button>
                            </div>

                            {/* Stats */}
                            <div className="col-span-2 grid grid-cols-3 gap-4">
                                <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100">
                                    <p className="text-3xl font-bold text-slate-800">{selectedExecution.findingsCount}</p>
                                    <p className="text-sm font-medium text-slate-500 mt-1">Bulgu</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100">
                                    <p className="text-3xl font-bold text-slate-800">{selectedExecution.workpapers}</p>
                                    <p className="text-sm font-medium text-slate-500 mt-1">Çalışma Dosyası</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100">
                                    <p className="text-3xl font-bold text-slate-800">%{selectedExecution.progress}</p>
                                    <p className="text-sm font-medium text-slate-500 mt-1">Tamamlanma</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
