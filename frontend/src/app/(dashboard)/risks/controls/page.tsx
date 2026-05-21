'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface RiskManagementControl {
    id: string;
    controlCode: string;
    name: string;
    description: string;
    effectiveness: number;
    frequency: number;
    automationLevel: number;
    controlScore: number | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    _count?: {
        riskMappings: number;
        tests: number;
    };
    riskMappings?: Array<{
        id: string;
        applicabilityScore: number;
        riskEntry: {
            id: string;
            riskId: string;
            riskTanimi: string;
        };
    }>;
}

interface RiskEntry {
    id: string;
    riskId: string;
    riskTanimi: string;
    dogalRiskSeviyesi?: string;
}

const SCORE_LABELS: Record<number, string> = {
    1: 'Çok Düşük',
    2: 'Düşük',
    3: 'Orta',
    4: 'Yüksek',
    5: 'Çok Yüksek',
};

const SCORE_COLORS: Record<number, string> = {
    1: 'bg-red-100 text-red-700',
    2: 'bg-orange-100 text-orange-700',
    3: 'bg-yellow-100 text-yellow-700',
    4: 'bg-green-100 text-green-700',
    5: 'bg-emerald-100 text-emerald-700',
};

const CONTROL_LEVEL_COLORS: Record<string, string> = {
    ETKIN: 'bg-green-100 text-green-700',
    KISMEN_ETKIN: 'bg-yellow-100 text-yellow-700',
    ETKIN_DEGIL: 'bg-red-100 text-red-700',
};

export default function RiskManagementControlsPage() {
    const [controls, setControls] = useState<RiskManagementControl[]>([]);
    const [riskEntries, setRiskEntries] = useState<RiskEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showMappingModal, setShowMappingModal] = useState(false);
    const [selectedControl, setSelectedControl] = useState<RiskManagementControl | null>(null);
    const [editingControl, setEditingControl] = useState<Partial<RiskManagementControl> | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        effectiveness: 3,
        frequency: 3,
        automationLevel: 3,
    });

    const fetchControls = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.getRiskManagementControls() as { data: RiskManagementControl[] };
            setControls(response.data || []);
        } catch (error) {
            console.error('Failed to fetch controls:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchRiskEntries = useCallback(async () => {
        try {
            const response = await api.getRiskEntries() as { data: RiskEntry[] };
            setRiskEntries(response.data || []);
        } catch (error) {
            console.error('Failed to fetch risk entries:', error);
        }
    }, []);

    useEffect(() => {
        fetchControls();
        fetchRiskEntries();
    }, [fetchControls, fetchRiskEntries]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingControl?.id) {
                await api.updateRiskManagementControl(editingControl.id, formData);
            } else {
                await api.createRiskManagementControl(formData);
            }
            setShowAddModal(false);
            setEditingControl(null);
            setFormData({ name: '', description: '', effectiveness: 3, frequency: 3, automationLevel: 3 });
            fetchControls();
        } catch (error) {
            console.error('Failed to save control:', error);
            alert('Kontrol kaydedilemedi.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bu kontrolü silmek istediğinizden emin misiniz?')) return;
        try {
            await api.deleteRiskManagementControl(id);
            fetchControls();
        } catch (error) {
            console.error('Failed to delete control:', error);
            alert('Kontrol silinemedi.');
        }
    };

    const handleMapRisk = async (controlId: string, riskEntryId: string, applicabilityScore: number = 3) => {
        try {
            await api.mapRYKControlToRiskEntry(controlId, riskEntryId, applicabilityScore);
            fetchControls();
            setShowMappingModal(false);
        } catch (error) {
            console.error('Failed to map control to risk:', error);
            alert('Eşleştirme başarısız.');
        }
    };

    const handleUnmapRisk = async (controlId: string, riskEntryId: string) => {
        try {
            await api.unmapRYKControlFromRiskEntry(controlId, riskEntryId);
            fetchControls();
        } catch (error) {
            console.error('Failed to unmap control from risk:', error);
        }
    };

    const openEditModal = (control: RiskManagementControl) => {
        setEditingControl(control);
        setFormData({
            name: control.name,
            description: control.description,
            effectiveness: control.effectiveness,
            frequency: control.frequency,
            automationLevel: control.automationLevel,
        });
        setShowAddModal(true);
    };

    const openMappingModal = (control: RiskManagementControl) => {
        setSelectedControl(control);
        setShowMappingModal(true);
    };

    // Calculate aggregate stats
    const totalControls = controls.length;
    const avgScore = controls.length > 0
        ? (controls.reduce((sum, c) => sum + (c.controlScore || 0), 0) / controls.length).toFixed(2)
        : '0.00';
    const mappedRisks = controls.reduce((sum, c) => sum + (c._count?.riskMappings || 0), 0);

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Yükleniyor...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                            <Link href="/risks" className="hover:text-gray-700">Risk Yönetimi</Link>
                            <span>/</span>
                            <span className="text-gray-900">Risk Yönetimi Kontrolleri</span>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">Risk Yönetimi Kontrolleri (RYK)</h1>
                        <p className="text-sm text-gray-500 mt-1">Risk Yönetimi ekibinin kontrolleri</p>
                    </div>
                    <button
                        onClick={() => {
                            setEditingControl(null);
                            setFormData({ name: '', description: '', effectiveness: 3, frequency: 3, automationLevel: 3 });
                            setShowAddModal(true);
                        }}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Yeni RYK Ekle
                    </button>
                </div>

                {/* KPIs */}
                <div className="flex items-center gap-6 py-2 px-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Toplam Kontrol:</span>
                        <span className="text-sm font-semibold text-gray-900">{totalControls}</span>
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Ort. Skor:</span>
                        <span className="text-sm font-semibold text-indigo-600">{avgScore}</span>
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Eşleşen Risk:</span>
                        <span className="text-sm font-semibold text-green-600">{mappedRisks}</span>
                    </div>
                </div>
            </div>

            {/* Controls Table */}
            <div className="p-6">
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-800 text-white">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold">Kontrol Kodu</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold">Kontrol Adı</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold">Etkinlik</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold">Sıklık</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold">Otomasyon</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold">Kontrol Skoru</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold">Eşleşen Risk</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {controls.map((control, idx) => (
                                <tr key={control.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 border-b`}>
                                    <td className="px-4 py-3 text-sm font-medium text-indigo-600">{control.controlCode}</td>
                                    <td className="px-4 py-3 text-sm">{control.name}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${SCORE_COLORS[control.effectiveness]}`}>
                                            {control.effectiveness} - {SCORE_LABELS[control.effectiveness]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${SCORE_COLORS[control.frequency]}`}>
                                            {control.frequency} - {SCORE_LABELS[control.frequency]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${SCORE_COLORS[control.automationLevel]}`}>
                                            {control.automationLevel} - {SCORE_LABELS[control.automationLevel]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center font-mono text-sm font-semibold text-indigo-700">
                                        {control.controlScore?.toFixed(2) || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="text-sm font-medium">{control._count?.riskMappings || 0}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => openMappingModal(control)}
                                                className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                                                title="Risk Eşle"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => openEditModal(control)}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                                title="Düzenle"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleDelete(control.id)}
                                                className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                                title="Sil"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {controls.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="text-center py-12 text-gray-500">
                                        Henüz RYK kontrol bulunmuyor. "Yeni RYK Ekle" ile başlayın.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <h2 className="text-lg font-semibold">
                                {editingControl ? 'RYK Kontrol Düzenle' : 'Yeni RYK Kontrol'}
                            </h2>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Kontrol Adı *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    rows={3}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Etkinlik (1-5)</label>
                                    <select
                                        value={formData.effectiveness}
                                        onChange={(e) => setFormData({ ...formData, effectiveness: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {[1, 2, 3, 4, 5].map((v) => (
                                            <option key={v} value={v}>{v} - {SCORE_LABELS[v]}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Sıklık (1-5)</label>
                                    <select
                                        value={formData.frequency}
                                        onChange={(e) => setFormData({ ...formData, frequency: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {[1, 2, 3, 4, 5].map((v) => (
                                            <option key={v} value={v}>{v} - {SCORE_LABELS[v]}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Otomasyon (1-5)</label>
                                    <select
                                        value={formData.automationLevel}
                                        onChange={(e) => setFormData({ ...formData, automationLevel: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {[1, 2, 3, 4, 5].map((v) => (
                                            <option key={v} value={v}>{v} - {SCORE_LABELS[v]}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="bg-indigo-50 p-3 rounded-lg">
                                <p className="text-sm text-indigo-700">
                                    <strong>Hesaplanan Kontrol Skoru:</strong>{' '}
                                    {((formData.effectiveness * 0.5) + (formData.frequency * 0.3) + (formData.automationLevel * 0.2)).toFixed(2)}
                                </p>
                                <p className="text-xs text-indigo-600 mt-1">
                                    Formül: (Etkinlik × 0.5) + (Sıklık × 0.3) + (Otomasyon × 0.2)
                                </p>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                                >
                                    {editingControl ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Risk Mapping Modal */}
            {showMappingModal && selectedControl && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold">Risk Eşleştirme</h2>
                                <p className="text-sm text-gray-500">{selectedControl.controlCode} - {selectedControl.name}</p>
                            </div>
                            <button onClick={() => setShowMappingModal(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            <h3 className="text-sm font-medium text-gray-700 mb-3">Mevcut Eşleşmeler</h3>
                            {selectedControl.riskMappings && selectedControl.riskMappings.length > 0 ? (
                                <div className="space-y-2 mb-6">
                                    {selectedControl.riskMappings.map((mapping) => (
                                        <div key={mapping.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                                            <div>
                                                <span className="font-medium text-green-800">{mapping.riskEntry.riskId}</span>
                                                <span className="text-sm text-gray-600 ml-2">{mapping.riskEntry.riskTanimi.substring(0, 50)}...</span>
                                            </div>
                                            <button
                                                onClick={() => handleUnmapRisk(selectedControl.id, mapping.riskEntry.id)}
                                                className="text-red-600 hover:text-red-800 text-sm"
                                            >
                                                Kaldır
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 mb-6">Henüz eşleşme yok.</p>
                            )}

                            <h3 className="text-sm font-medium text-gray-700 mb-3">Risk Ekle</h3>
                            <div className="space-y-2">
                                {riskEntries
                                    .filter((risk) => !selectedControl.riskMappings?.some((m) => m.riskEntry.id === risk.id))
                                    .map((risk) => (
                                        <div key={risk.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                                            <div>
                                                <span className="font-medium text-gray-800">{risk.riskId}</span>
                                                <span className="text-sm text-gray-600 ml-2">{risk.riskTanimi.substring(0, 50)}...</span>
                                            </div>
                                            <button
                                                onClick={() => handleMapRisk(selectedControl.id, risk.id)}
                                                className="px-3 py-1 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
                                            >
                                                Eşle
                                            </button>
                                        </div>
                                    ))}
                                {riskEntries.filter((risk) => !selectedControl.riskMappings?.some((m) => m.riskEntry.id === risk.id)).length === 0 && (
                                    <p className="text-sm text-gray-500">Tüm riskler zaten eşlenmiş.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
