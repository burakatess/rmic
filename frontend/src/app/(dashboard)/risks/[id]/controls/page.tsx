'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Control {
    id: string;
    controlId: string;
    name: string;
    type: string;
    nature: string;
    effectiveness: string;
    isLinked: boolean;
}

const ALL_CONTROLS: Control[] = [
    { id: '1', controlId: 'C-2024-0001', name: 'Güvenlik Duvarı Yönetimi', type: 'IT_GENERAL', nature: 'Önleyici', effectiveness: 'EFFECTIVE', isLinked: true },
    { id: '2', controlId: 'C-2024-0002', name: 'Saldırı Tespit Sistemi (IDS/IPS)', type: 'IT_GENERAL', nature: 'Tespit Edici', effectiveness: 'EFFECTIVE', isLinked: true },
    { id: '3', controlId: 'C-2024-0003', name: 'Yedekleme Doğrulama', type: 'IT_GENERAL', nature: 'Düzeltici', effectiveness: 'PARTIALLY_EFFECTIVE', isLinked: false },
    { id: '4', controlId: 'C-2024-0004', name: 'Erişim Yetkilendirme Kontrolü', type: 'IT_APPLICATION', nature: 'Önleyici', effectiveness: 'EFFECTIVE', isLinked: false },
    { id: '5', controlId: 'C-2024-0005', name: 'Log Yönetimi ve İzleme', type: 'IT_GENERAL', nature: 'Tespit Edici', effectiveness: 'EFFECTIVE', isLinked: false },
    { id: '6', controlId: 'C-2024-0006', name: 'DDoS Koruma Sistemi', type: 'IT_GENERAL', nature: 'Önleyici', effectiveness: 'PARTIALLY_EFFECTIVE', isLinked: true },
];

const effectivenessConfig: Record<string, { label: string; color: string }> = {
    EFFECTIVE: { label: 'Etkin', color: 'bg-green-100 text-green-700' },
    PARTIALLY_EFFECTIVE: { label: 'Kısmen Etkin', color: 'bg-yellow-100 text-yellow-700' },
    INEFFECTIVE: { label: 'Etkin Değil', color: 'bg-red-100 text-red-700' },
    NOT_TESTED: { label: 'Test Edilmedi', color: 'bg-gray-100 text-gray-600' },
};

export default function RiskControlsPage() {
    const params = useParams();
    const [controls, setControls] = useState<Control[]>(ALL_CONTROLS);
    const [search, setSearch] = useState('');

    const linkedControls = controls.filter(c => c.isLinked);
    const availableControls = controls.filter(c => !c.isLinked);

    const filteredAvailable = availableControls.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.controlId.toLowerCase().includes(search.toLowerCase())
    );

    const handleLink = (controlId: string) => {
        setControls(controls.map(c =>
            c.id === controlId ? { ...c, isLinked: true } : c
        ));
    };

    const handleUnlink = (controlId: string) => {
        setControls(controls.map(c =>
            c.id === controlId ? { ...c, isLinked: false } : c
        ));
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1200px] mx-auto px-6 py-6">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/risks" className="hover:text-blue-600">Risk Envanteri</Link>
                    <span>/</span>
                    <Link href={`/risks/${params.id}`} className="hover:text-blue-600">R-2024-0001</Link>
                    <span>/</span>
                    <span className="text-gray-900">Kontroller</span>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Risk Kontrolleri</h1>
                        <p className="text-gray-500 mt-1">Siber Saldırı ve Veri İhlali Riski</p>
                    </div>
                    <Link
                        href={`/risks/${params.id}`}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                    >
                        ← Riske Dön
                    </Link>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    {/* Linked Controls */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold text-gray-900">Bağlı Kontroller</h2>
                            <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                {linkedControls.length} kontrol
                            </span>
                        </div>

                        {linkedControls.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <span className="text-4xl block mb-2">🛡️</span>
                                <p>Henüz bağlı kontrol yok</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {linkedControls.map(control => (
                                    <div key={control.id} className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-mono text-sm text-green-600">{control.controlId}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded ${effectivenessConfig[control.effectiveness]?.color}`}>
                                                    {effectivenessConfig[control.effectiveness]?.label}
                                                </span>
                                            </div>
                                            <p className="text-sm font-medium text-gray-900">{control.name}</p>
                                            <p className="text-xs text-gray-500">{control.nature}</p>
                                        </div>
                                        <button
                                            onClick={() => handleUnlink(control.id)}
                                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Bağlantıyı Kaldır"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Available Controls */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold text-gray-900">Mevcut Kontroller</h2>
                            <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                                {availableControls.length} kontrol
                            </span>
                        </div>

                        {/* Search */}
                        <div className="relative mb-4">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Kontrol ara..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                        </div>

                        {filteredAvailable.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <p>Uygun kontrol bulunamadı</p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[400px] overflow-y-auto">
                                {filteredAvailable.map(control => (
                                    <div key={control.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-mono text-sm text-gray-500">{control.controlId}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded ${effectivenessConfig[control.effectiveness]?.color}`}>
                                                    {effectivenessConfig[control.effectiveness]?.label}
                                                </span>
                                            </div>
                                            <p className="text-sm font-medium text-gray-900">{control.name}</p>
                                            <p className="text-xs text-gray-500">{control.nature}</p>
                                        </div>
                                        <button
                                            onClick={() => handleLink(control.id)}
                                            className="p-2 text-green-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                            title="Riske Bağla"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
