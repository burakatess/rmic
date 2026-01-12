'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface Regulation {
    id: string;
    code: string;
    name: string;
    description?: string;
    _count?: {
        articles: number;
        risks: number;
        controls: number;
    };
}

interface ComplianceOverview {
    id: string;
    code: string;
    name: string;
    totalRisks: number;
    totalControls: number;
    riskCoverage: number;
    controlEffectiveness: number;
    overallCompliance: number;
}

export default function CompliancePage() {
    const [regulations, setRegulations] = useState<Regulation[]>([]);
    const [overview, setOverview] = useState<ComplianceOverview[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({ code: '', name: '', description: '' });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [regsRes, overviewRes] = await Promise.all([
                api.request<Regulation[]>('/regulations'),
                api.request<ComplianceOverview[]>('/compliance/overview'),
            ]);
            setRegulations(regsRes);
            setOverview(overviewRes);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.request('/regulations', { method: 'POST', body: formData });
            setShowModal(false);
            setFormData({ code: '', name: '', description: '' });
            loadData();
        } catch (error) {
            console.error('Failed to create regulation:', error);
        }
    };

    const getComplianceColor = (score: number) => {
        if (score >= 80) return 'text-green-600 bg-green-100';
        if (score >= 60) return 'text-yellow-600 bg-yellow-100';
        return 'text-red-600 bg-red-100';
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Uyum Yönetimi</h1>
                    <p className="text-gray-500 mt-1">Regülasyonları ve uyum durumunu yönetin</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-medium rounded-xl hover:from-indigo-600 hover:to-indigo-700 transition-all shadow-sm"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Yeni Regülasyon
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                </div>
            ) : (
                <>
                    {/* Compliance Overview */}
                    <div className="bg-gradient-to-br from-indigo-900 to-indigo-800 rounded-3xl p-8 text-white">
                        <h2 className="text-xl font-semibold mb-6">Uyum Genel Görünümü</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {overview.map((item) => (
                                <div key={item.id} className="bg-white/10 backdrop-blur rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="font-mono text-sm text-indigo-200">{item.code}</span>
                                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getComplianceColor(item.overallCompliance)}`}>
                                            %{item.overallCompliance.toFixed(0)}
                                        </span>
                                    </div>
                                    <h3 className="font-semibold text-white mb-4 text-sm">{item.name}</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-indigo-200">Risk Kapsamı</span>
                                            <span>%{item.riskCoverage.toFixed(0)}</span>
                                        </div>
                                        <div className="w-full bg-white/20 rounded-full h-1.5">
                                            <div
                                                className="bg-white h-1.5 rounded-full transition-all"
                                                style={{ width: `${Math.min(item.riskCoverage, 100)}%` }}
                                            ></div>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-indigo-200">Kontrol Etkinliği</span>
                                            <span>%{item.controlEffectiveness.toFixed(0)}</span>
                                        </div>
                                        <div className="w-full bg-white/20 rounded-full h-1.5">
                                            <div
                                                className="bg-white h-1.5 rounded-full transition-all"
                                                style={{ width: `${Math.min(item.controlEffectiveness, 100)}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Regulations List */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h3 className="font-semibold text-gray-900">Regülasyon Envanteri</h3>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {regulations.map((reg) => (
                                <Link key={reg.id} href={`/compliance/regulations/${reg.id}`}>
                                    <div className="px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className="font-mono text-sm text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{reg.code}</span>
                                                    <span className="font-medium text-gray-900">{reg.name}</span>
                                                </div>
                                                <p className="text-sm text-gray-500">{reg.description}</p>
                                            </div>
                                            <div className="flex items-center gap-6 text-sm text-gray-500">
                                                <span>{reg._count?.risks || 0} risk</span>
                                                <span>{reg._count?.controls || 0} kontrol</span>
                                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Create Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Yeni Regülasyon</h2>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Kod</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Örn: BDDK"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ad</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                    rows={3}
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                                    İptal
                                </button>
                                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                                    Oluştur
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
