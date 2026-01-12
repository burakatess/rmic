'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

const DEMO_FINDING = {
    findingId: 'F-2024-001',
    title: 'Güvenlik Duvarı Kurallarının Güncelliği',
    description: 'Yapılan kontrol testinde, güvenlik duvarı kurallarının bir kısmının 6 aydan fazla süredir güncellenmediği ve bazı kuralların artık kullanılmayan IP adresleri içerdiği tespit edilmiştir.',
    source: 'CONTROL_TEST',
    severity: 'HIGH',
    status: 'IN_PROGRESS',
    riskId: 'R-2024-0001',
    controlId: 'C-2024-0001',
    owner: 'Mehmet Demir',
    department: 'Bilgi Güvenliği',
    identifiedDate: '2024-12-05',
    targetDate: '2025-01-31',
    recommendation: '1. Tüm güvenlik duvarı kurallarının envanteri çıkarılmalı. 2. Kullanılmayan kurallar devre dışı bırakılmalı. 3. Düzenli gözden geçirme prosedürü oluşturulmalı.',
    managementResponse: 'Öneri kabul edilmiştir. IT Güvenlik ekibi kural revizyonu çalışmasını başlatmıştır.',
    isRecurrent: false,
};

const sourceOptions = [
    { value: 'CONTROL_TEST', label: 'Kontrol Testi' },
    { value: 'INTERNAL_AUDIT', label: 'İç Denetim' },
    { value: 'EXTERNAL_AUDIT', label: 'Dış Denetim' },
    { value: 'INCIDENT', label: 'Olay' },
    { value: 'SELF_ASSESSMENT', label: 'Öz Değerlendirme' },
    { value: 'REGULATORY', label: 'Regülatör İncelemesi' },
];

const severityOptions = [
    { value: 'CRITICAL', label: 'Kritik', color: 'bg-red-500' },
    { value: 'HIGH', label: 'Yüksek', color: 'bg-orange-500' },
    { value: 'MEDIUM', label: 'Orta', color: 'bg-yellow-500' },
    { value: 'LOW', label: 'Düşük', color: 'bg-green-500' },
];

const statusOptions = [
    { value: 'OPEN', label: 'Açık' },
    { value: 'IN_PROGRESS', label: 'Devam Ediyor' },
    { value: 'PENDING_REVIEW', label: 'İnceleme Bekliyor' },
    { value: 'CLOSED', label: 'Kapatıldı' },
];

const departmentOptions = [
    { value: 'IT', label: 'Bilgi Teknolojileri' },
    { value: 'HR', label: 'İnsan Kaynakları' },
    { value: 'FINANCE', label: 'Finans' },
    { value: 'OPERATIONS', label: 'Operasyon' },
    { value: 'LEGAL', label: 'Hukuk' },
    { value: 'COMPLIANCE', label: 'Uyum' },
];

const personOptions = [
    { value: 'Ahmet Yılmaz', label: 'Ahmet Yılmaz' },
    { value: 'Mehmet Demir', label: 'Mehmet Demir' },
    { value: 'Ayşe Kaya', label: 'Ayşe Kaya' },
    { value: 'Fatma Çelik', label: 'Fatma Çelik' },
    { value: 'Ali Öztürk', label: 'Ali Öztürk' },
];

export default function FindingEditPage() {
    const params = useParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        description: '',
        title: '', // Title is derived from description usually, but sticking to form structure
        source: 'INTERNAL_AUDIT',
        severity: 'MEDIUM',
        status: 'OPEN',
        riskId: '',
        controlId: '',
        owner: '',
        department: '',
        identifiedDate: '',
        targetDate: '',
        recommendation: '',
        managementResponse: '',
        isRecurrent: false,
        affectedSystem: '',
        impact: '',
        relatedDepartment: '',
        responsiblePerson: '',
    });

    useEffect(() => {
        const fetchFinding = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = await api.getFinding(params.id as string) as any;
                if (data) {
                    setFormData({
                        title: data.description ? data.description.substring(0, 50) + '...' : '',
                        description: data.description || '',
                        source: data.source || 'INTERNAL_AUDIT',
                        severity: data.severity || 'MEDIUM',
                        status: data.status || 'OPEN',
                        riskId: data.risk?.id || data.riskId || '',
                        controlId: data.control?.id || data.controlId || '',
                        owner: '', // Owner info logic complexity
                        department: '',
                        identifiedDate: data.createdAt ? new Date(data.createdAt).toISOString().split('T')[0] : '',
                        targetDate: data.targetResolutionDate ? new Date(data.targetResolutionDate).toISOString().split('T')[0] : '',
                        recommendation: data.recommendation || '',
                        managementResponse: data.managementResponse || '',
                        isRecurrent: data.isRecurrent || false,
                        affectedSystem: data.affectedSystem || '',
                        impact: data.impact || '',
                        relatedDepartment: data.relatedDepartment || '',
                        responsiblePerson: data.responsiblePerson || '',
                    });
                }
            } catch (error) {
                console.error('Failed to load finding:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchFinding();
    }, [params.id]);


    const handleSave = async () => {
        setSaving(true);
        try {
            await api.updateFinding(params.id as string, {
                description: formData.description,
                source: formData.source,
                severity: formData.severity,
                status: formData.status,
                riskId: formData.riskId, // Assuming ID is entered directly for now or we need a picker
                controlId: formData.controlId,
                targetResolutionDate: formData.targetDate ? new Date(formData.targetDate).toISOString() : null,
                recommendation: formData.recommendation,
                managementResponse: formData.managementResponse,
                isRecurrent: formData.isRecurrent,
                affectedSystem: formData.affectedSystem,
                impact: formData.impact,
                relatedDepartment: formData.relatedDepartment,
                responsiblePerson: formData.responsiblePerson,
            });
            router.push(`/findings/${params.id}`);
        } catch (error) {
            console.error('Failed to update finding:', error);
            alert('Güncelleme sırasında bir hata oluştu.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">Yükleniyor...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1000px] mx-auto px-6 py-6">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/findings" className="hover:text-purple-600">Bulgular</Link>
                    <span>/</span>
                    <Link href={`/findings/${params.id}`} className="hover:text-purple-600 font-mono">{params.id}</Link>
                    <span>/</span>
                    <span className="text-gray-900">Düzenle</span>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Bulguyu Düzenle</h1>
                        <p className="text-gray-500 mt-1 font-mono">{params.id}</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="space-y-6">

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Açıklama *</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                                rows={4}
                            />
                        </div>

                        {/* Impact */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Potansiyel Etki *</label>
                            <textarea
                                value={formData.impact}
                                onChange={(e) => setFormData({ ...formData, impact: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                                rows={2}
                            />
                        </div>

                        {/* Source and Severity */}
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Kaynak</label>
                                <select
                                    value={formData.source}
                                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                                >
                                    {sourceOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Ciddiyet *</label>
                                <div className="flex gap-2">
                                    {severityOptions.map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, severity: opt.value })}
                                            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${formData.severity === opt.value
                                                ? `${opt.color} text-white`
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Status and Recurrent */}
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Durum</label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                                >
                                    {statusOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center">
                                <label className="flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.isRecurrent}
                                        onChange={(e) => setFormData({ ...formData, isRecurrent: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Tekrarlayan Bulgu</span>
                                </label>
                            </div>
                        </div>

                        {/* Affected System */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Etkilenen Sistem</label>
                            <input
                                type="text"
                                value={formData.affectedSystem}
                                onChange={(e) => setFormData({ ...formData, affectedSystem: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="Örn: SAP, CRM..."
                            />
                        </div>


                        {/* Linked Risk and Control - Moved below for flow */}
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">İlişkili Risk ID</label>
                                <input
                                    type="text"
                                    value={formData.riskId}
                                    onChange={(e) => setFormData({ ...formData, riskId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="Risk ID giriniz"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">İlişkili Kontrol ID</label>
                                <input
                                    type="text"
                                    value={formData.controlId}
                                    onChange={(e) => setFormData({ ...formData, controlId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="Kontrol ID giriniz"
                                />
                            </div>
                        </div>

                        {/* Owner - Updated with Dropdowns */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4">Bulgu Sahibi</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Sorumlu Kişi</label>
                                    <select
                                        value={formData.responsiblePerson}
                                        onChange={(e) => setFormData({ ...formData, responsiblePerson: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                                    >
                                        <option value="">Seçiniz</option>
                                        {personOptions.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">İlgili Direktörlük</label>
                                    <select
                                        value={formData.relatedDepartment}
                                        onChange={(e) => setFormData({ ...formData, relatedDepartment: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                                    >
                                        <option value="">Seçiniz</option>
                                        {departmentOptions.map(opt => (
                                            <option key={opt.value} value={opt.label}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Dates */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4">Tarihler</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Tespit Tarihi</label>
                                    <input
                                        disabled
                                        type="date"
                                        value={formData.identifiedDate}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Hedef Kapanış Tarihi</label>
                                    <input
                                        type="date"
                                        value={formData.targetDate}
                                        onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Recommendation and Response */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4">Öneri ve Yanıt</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Denetçi Önerisi</label>
                                    <textarea
                                        value={formData.recommendation}
                                        onChange={(e) => setFormData({ ...formData, recommendation: e.target.value })}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                                        rows={3}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Yönetim Yanıtı</label>
                                    <textarea
                                        value={formData.managementResponse}
                                        onChange={(e) => setFormData({ ...formData, managementResponse: e.target.value })}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-100">
                            <Link href={`/findings/${params.id}`} className="px-6 py-2.5 text-gray-600 hover:text-gray-800">
                                İptal
                            </Link>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-8 py-2.5 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 transition-all disabled:opacity-50"
                            >
                                {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
