'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { PageShell, PageHeader, Button, Modal, LoadingState } from '@/components/ui';

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
        if (score >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
        if (score >= 60) return 'text-amber-700 bg-amber-50 border-amber-200';
        return 'text-red-700 bg-red-50 border-red-200';
    };

    return (
        <PageShell>
            <PageHeader
                title="Uyum Yönetimi"
                description="Regülasyonları ve uyum durumunu yönetin"
                breadcrumbs={[{ label: 'Uyum' }, { label: 'Mevzuatlar' }]}
                actions={
                    <>
                        <Link
                            href="/compliance/regulations/library"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-all duration-150 ease-in-out"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            Kütüphane
                        </Link>
                        <Button
                            variant="primary"
                            onClick={() => setShowModal(true)}
                            icon={
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            }
                        >
                            Yeni Regülasyon
                        </Button>
                    </>
                }
            />

            {loading ? (
                <LoadingState message="Uyum verileri yükleniyor..." />
            ) : (
                <div className="space-y-6">
                    {/* Compliance Overview */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h2 className="text-sm font-semibold text-slate-800">Uyum Genel Görünümü</h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {overview.map((item) => (
                                <div key={item.id} className="rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="font-mono text-sm text-slate-500">{item.code}</span>
                                        <span className={`px-2 py-1 rounded-lg text-xs font-semibold border ${getComplianceColor(item.overallCompliance || 0)}`}>
                                            %{item.overallCompliance?.toFixed(0) || '0'}
                                        </span>
                                    </div>
                                    <h3 className="font-semibold text-slate-800 mb-4 text-sm">{item.name}</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Risk Kapsamı</span>
                                            <span className="text-slate-700 font-medium tabular-nums">%{item.riskCoverage?.toFixed(0) || '0'}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                                            <div
                                                className="bg-blue-600 h-1.5 rounded-full transition-all"
                                                style={{ width: `${Math.min(item.riskCoverage || 0, 100)}%` }}
                                            ></div>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Kontrol Etkinliği</span>
                                            <span className="text-slate-700 font-medium tabular-nums">%{item.controlEffectiveness?.toFixed(0) || '0'}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                                            <div
                                                className="bg-blue-600 h-1.5 rounded-full transition-all"
                                                style={{ width: `${Math.min(item.controlEffectiveness || 0, 100)}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Regulations List */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h3 className="text-sm font-semibold text-slate-800">Regülasyon Envanteri</h3>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {regulations.map((reg) => (
                                <Link key={reg.id} href={`/compliance/regulations/${reg.id}`}>
                                    <div className="px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className="font-mono text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{reg.code}</span>
                                                    <span className="font-medium text-slate-800">{reg.name}</span>
                                                </div>
                                                <p className="text-sm text-slate-500">{reg.description}</p>
                                            </div>
                                            <div className="flex items-center gap-6 text-sm text-slate-500">
                                                <span>{reg._count?.risks || 0} risk</span>
                                                <span>{reg._count?.controls || 0} kontrol</span>
                                                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            <Modal open={showModal} onClose={() => setShowModal(false)} title="Yeni Regülasyon" size="sm">
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Kod</label>
                        <input
                            type="text"
                            required
                            value={formData.code}
                            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Örn: BDDK"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Ad</label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Açıklama</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                            rows={3}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                            İptal
                        </Button>
                        <Button type="submit" variant="primary">
                            Oluştur
                        </Button>
                    </div>
                </form>
            </Modal>
        </PageShell>
    );
}
