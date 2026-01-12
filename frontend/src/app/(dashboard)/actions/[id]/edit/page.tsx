'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const DEMO_ACTION = {
    actionId: 'A-2024-0001',
    description: 'Güvenlik duvarı kurallarının kapsamlı revizyonu ve güncel olmayan IP adreslerinin temizlenmesi.',
    detailedDescription: 'Tüm güvenlik duvarı kurallarının gözden geçirilerek güncel olmayan veya artık kullanılmayan IP adreslerinin temizlenmesi, kural dokümantasyonunun güncellenmesi ve onay sürecinin tamamlanması gerekmektedir.',
    source: 'FINDING',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    owner: 'Ahmet Yılmaz',
    department: 'Bilgi Güvenliği',
    riskId: 'R-2024-0001',
    findingId: 'F-2024-001',
    createdDate: '2024-12-05',
    dueDate: '2025-01-15',
    slaInDays: 30,
};

const sourceOptions = [
    { value: 'RISK', label: 'Risk Tedavisi' },
    { value: 'FINDING', label: 'Denetim Bulgusu' },
    { value: 'CONTROL', label: 'Kontrol İyileştirme' },
    { value: 'INCIDENT', label: 'Olay' },
    { value: 'PROACTIVE', label: 'Proaktif' },
];

const priorityOptions = [
    { value: 'CRITICAL', label: 'Kritik', color: 'bg-red-500' },
    { value: 'HIGH', label: 'Yüksek', color: 'bg-orange-500' },
    { value: 'MEDIUM', label: 'Orta', color: 'bg-yellow-500' },
    { value: 'LOW', label: 'Düşük', color: 'bg-green-500' },
];

const statusOptions = [
    { value: 'OPEN', label: 'Açık' },
    { value: 'IN_PROGRESS', label: 'Devam Ediyor' },
    { value: 'COMPLETED', label: 'Tamamlandı' },
    { value: 'CLOSED', label: 'Kapatıldı' },
];

export default function ActionEditPage() {
    const params = useParams();
    const router = useRouter();

    const [formData, setFormData] = useState({
        description: DEMO_ACTION.description,
        detailedDescription: DEMO_ACTION.detailedDescription,
        source: DEMO_ACTION.source,
        priority: DEMO_ACTION.priority,
        status: DEMO_ACTION.status,
        owner: DEMO_ACTION.owner,
        department: DEMO_ACTION.department,
        riskId: DEMO_ACTION.riskId,
        findingId: DEMO_ACTION.findingId,
        dueDate: DEMO_ACTION.dueDate,
        slaInDays: DEMO_ACTION.slaInDays,
    });

    const handleSave = () => {
        router.push(`/actions/${params.id}`);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1000px] mx-auto px-6 py-6">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/actions" className="hover:text-orange-600">Aksiyonlar</Link>
                    <span>/</span>
                    <Link href={`/actions/${params.id}`} className="hover:text-orange-600">{DEMO_ACTION.actionId}</Link>
                    <span>/</span>
                    <span className="text-gray-900">Düzenle</span>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Aksiyonu Düzenle</h1>
                        <p className="text-gray-500 mt-1">{DEMO_ACTION.actionId}</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="space-y-6">
                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Aksiyon Açıklaması *</label>
                            <input
                                type="text"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Detaylı Açıklama</label>
                            <textarea
                                value={formData.detailedDescription}
                                onChange={(e) => setFormData({ ...formData, detailedDescription: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                                rows={4}
                            />
                        </div>

                        {/* Source and Priority */}
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Kaynak</label>
                                <select
                                    value={formData.source}
                                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                                >
                                    {sourceOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Öncelik *</label>
                                <div className="flex gap-2">
                                    {priorityOptions.map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, priority: opt.value })}
                                            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${formData.priority === opt.value
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

                        {/* Status */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Durum</label>
                            <div className="flex gap-2">
                                {statusOptions.map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, status: opt.value })}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${formData.status === opt.value
                                                ? 'bg-orange-600 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Owner */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4">Aksiyon Sahibi</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Sorumlu Kişi *</label>
                                    <input
                                        type="text"
                                        value={formData.owner}
                                        onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Departman</label>
                                    <input
                                        type="text"
                                        value={formData.department}
                                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Linked Records */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4">İlişkili Kayıtlar</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">İlişkili Risk</label>
                                    <input
                                        type="text"
                                        value={formData.riskId}
                                        onChange={(e) => setFormData({ ...formData, riskId: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                                        placeholder="R-2024-XXXX"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">İlişkili Bulgu</label>
                                    <input
                                        type="text"
                                        value={formData.findingId}
                                        onChange={(e) => setFormData({ ...formData, findingId: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                                        placeholder="F-2024-XXX"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Due Date and SLA */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4">Zamanlama</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Hedef Tarih *</label>
                                    <input
                                        type="date"
                                        value={formData.dueDate}
                                        onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">SLA (Gün)</label>
                                    <input
                                        type="number"
                                        value={formData.slaInDays}
                                        onChange={(e) => setFormData({ ...formData, slaInDays: parseInt(e.target.value) || 0 })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                                        min="1"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-100">
                            <Link href={`/actions/${params.id}`} className="px-6 py-2.5 text-gray-600 hover:text-gray-800">
                                İptal
                            </Link>
                            <button
                                onClick={handleSave}
                                className="px-8 py-2.5 bg-orange-600 text-white font-medium rounded-xl hover:bg-orange-700 transition-all"
                            >
                                Değişiklikleri Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
