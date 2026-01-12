'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface AuditExecution {
    id: string;
    executionId: string;
    planName: string;
    status: string;
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

const statusLabels: Record<string, { label: string; color: string }> = {
    NOT_STARTED: { label: 'Başlamadı', color: 'bg-gray-100 text-gray-600' },
    IN_PROGRESS: { label: 'Devam Ediyor', color: 'bg-yellow-100 text-yellow-700' },
    REVIEW: { label: 'İncelemede', color: 'bg-blue-100 text-blue-700' },
    COMPLETED: { label: 'Tamamlandı', color: 'bg-green-100 text-green-700' },
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Denetim Uygulama</h1>
                <p className="text-gray-500 mt-1">Aktif denetimleri yönetin ve takip edin</p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Toplam Denetim</p>
                    <p className="text-2xl font-bold text-gray-900">{executions.length}</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-4 shadow-sm border border-yellow-100">
                    <p className="text-sm text-yellow-600">Devam Eden</p>
                    <p className="text-2xl font-bold text-yellow-600">{executions.filter(e => e.status === 'IN_PROGRESS').length}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 shadow-sm border border-purple-100">
                    <p className="text-sm text-purple-600">Toplam Bulgu</p>
                    <p className="text-2xl font-bold text-purple-600">{executions.reduce((sum, e) => sum + e.findingsCount, 0)}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 shadow-sm border border-green-100">
                    <p className="text-sm text-green-600">Tamamlanan</p>
                    <p className="text-2xl font-bold text-green-600">{executions.filter(e => e.status === 'COMPLETED').length}</p>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {executions.map((execution) => (
                        <div
                            key={execution.id}
                            onClick={() => setSelectedExecution(execution)}
                            className={`bg-white rounded-2xl p-6 shadow-sm border cursor-pointer transition-all ${selectedExecution?.id === execution.id ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-gray-100 hover:border-gray-200'
                                }`}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <span className="font-mono text-sm text-indigo-600">{execution.executionId}</span>
                                    <h3 className="font-semibold text-gray-900 mt-1">{execution.planName}</h3>
                                </div>
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${statusLabels[execution.status]?.color}`}>
                                    {statusLabels[execution.status]?.label}
                                </span>
                            </div>

                            {/* Progress Bar */}
                            <div className="mb-4">
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-gray-500">İlerleme</span>
                                    <span className="font-medium text-gray-700">%{execution.progress}</span>
                                </div>
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${execution.progress === 100 ? 'bg-green-500' : 'bg-indigo-500'
                                            }`}
                                        style={{ width: `${execution.progress}%` }}
                                    ></div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">
                                    Başlangıç: {new Date(execution.startDate).toLocaleDateString('tr-TR')}
                                </span>
                                <div className="flex gap-4">
                                    <span className="text-purple-600">{execution.findingsCount} Bulgu</span>
                                    <span className="text-gray-400">{execution.workpapers} Çalışma Dosyası</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Selected Execution Details */}
            {selectedExecution && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-semibold text-gray-900">Denetim Detayları</h3>
                        <button
                            onClick={() => setSelectedExecution(null)}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            ×
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Quick Actions */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-gray-700">Hızlı İşlemler</h4>
                            <Link
                                href="/findings/new"
                                className="block w-full px-4 py-3 bg-purple-50 text-purple-700 rounded-xl hover:bg-purple-100 transition-all text-center font-medium"
                            >
                                + Yeni Bulgu Ekle
                            </Link>
                            <button className="w-full px-4 py-3 bg-gray-50 text-gray-700 rounded-xl hover:bg-gray-100 transition-all font-medium">
                                Çalışma Dosyası Yükle
                            </button>
                        </div>

                        {/* Stats */}
                        <div className="col-span-2 grid grid-cols-3 gap-4">
                            <div className="bg-gray-50 rounded-xl p-4 text-center">
                                <p className="text-3xl font-bold text-gray-900">{selectedExecution.findingsCount}</p>
                                <p className="text-sm text-gray-500">Bulgu</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 text-center">
                                <p className="text-3xl font-bold text-gray-900">{selectedExecution.workpapers}</p>
                                <p className="text-sm text-gray-500">Çalışma Dosyası</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 text-center">
                                <p className="text-3xl font-bold text-gray-900">%{selectedExecution.progress}</p>
                                <p className="text-sm text-gray-500">Tamamlanma</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
