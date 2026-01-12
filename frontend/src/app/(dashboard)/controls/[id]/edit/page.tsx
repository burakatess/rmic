'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const DEMO_CONTROL = {
    controlId: 'C-2024-0001',
    name: 'Güvenlik Duvarı Yönetimi',
    description: 'Kurumsal ağ güvenliğini sağlamak için güvenlik duvarı kurallarının yönetimi, izlenmesi ve düzenli olarak gözden geçirilmesi. Bu kontrol, yetkisiz erişim girişimlerini engellemek ve ağ trafiğini filtrelemek için kritik öneme sahiptir.',
    type: 'IT_GENERAL',
    nature: 'PREVENTIVE',
    automation: 'AUTOMATED',
    frequency: 'MONTHLY',
    controlDate: '',
    owner: 'Mehmet Demir',
    department: 'Bilgi Güvenliği',
    linkedRegulations: ['ISO 27001', 'BDDK'],
    testFrequency: 'QUARTERLY',
    status: 'ACTIVE',
};

const typeOptions = [
    { value: 'IT_GENERAL', label: 'IT Genel' },
    { value: 'IT_APPLICATION', label: 'IT Uygulama' },
    { value: 'OPERATIONAL', label: 'Operasyonel' },
    { value: 'FINANCIAL', label: 'Finansal' },
    { value: 'COMPLIANCE', label: 'Uyum' },
];

const natureOptions = [
    { value: 'PREVENTIVE', label: 'Önleyici' },
    { value: 'DETECTIVE', label: 'Tespit Edici' },
    { value: 'CORRECTIVE', label: 'Düzeltici' },
];

const automationOptions = [
    { value: 'AUTOMATED', label: 'Otomatik' },
    { value: 'SEMI_AUTOMATED', label: 'Yarı Otomatik' },
    { value: 'MANUAL', label: 'Manuel' },
];

const frequencyOptions = [
    { value: 'DAILY', label: 'Günlük' },
    { value: 'WEEKLY', label: 'Haftalık' },
    { value: 'MONTHLY', label: 'Aylık' },
    { value: 'QUARTERLY', label: '3 Aylık' },
    { value: 'ANNUAL', label: 'Yıllık' },
    { value: 'AD_HOC', label: 'Arızi' },
];

const testFrequencyOptions = [
    { value: 'MONTHLY', label: 'Aylık' },
    { value: 'QUARTERLY', label: 'Üç Aylık' },
    { value: 'SEMI_ANNUAL', label: 'Altı Aylık' },
    { value: 'ANNUAL', label: 'Yıllık' },
];

const regulations = ['ISO 27001', 'BDDK', 'KVKK', 'COBIT', 'PCI-DSS', 'DORA', 'ISO 22301', 'MASAK'];

export default function ControlEditPage() {
    const params = useParams();
    const router = useRouter();

    const [formData, setFormData] = useState({
        name: DEMO_CONTROL.name,
        description: DEMO_CONTROL.description,
        type: DEMO_CONTROL.type,
        nature: DEMO_CONTROL.nature,
        automation: DEMO_CONTROL.automation,
        frequency: DEMO_CONTROL.frequency,
        owner: DEMO_CONTROL.owner,
        department: DEMO_CONTROL.department,
        testFrequency: DEMO_CONTROL.testFrequency,
        linkedRegulations: DEMO_CONTROL.linkedRegulations,
        status: DEMO_CONTROL.status,
        controlDate: '',
    });

    const handleSave = () => {
        // API call would go here
        router.push(`/controls/${params.id}`);
    };

    const toggleRegulation = (reg: string) => {
        setFormData(prev => ({
            ...prev,
            linkedRegulations: prev.linkedRegulations.includes(reg)
                ? prev.linkedRegulations.filter(r => r !== reg)
                : [...prev.linkedRegulations, reg]
        }));
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1000px] mx-auto px-6 py-6">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/controls" className="hover:text-green-600">Kontrol Envanteri</Link>
                    <span>/</span>
                    <Link href={`/controls/${params.id}`} className="hover:text-green-600">{DEMO_CONTROL.controlId}</Link>
                    <span>/</span>
                    <span className="text-gray-900">Düzenle</span>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Kontrolü Düzenle</h1>
                        <p className="text-gray-500 mt-1">{DEMO_CONTROL.controlId}</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="space-y-6">
                        {/* Basic Info */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Kontrol Adı *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Açıklama</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                                rows={4}
                            />
                        </div>

                        {/* Control Properties */}
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Kontrol Tipi</label>
                                <select
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                >
                                    {typeOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Kontrol Niteliği</label>
                                <select
                                    value={formData.nature}
                                    onChange={(e) => setFormData({ ...formData, nature: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                >
                                    {natureOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Otomasyon Seviyesi</label>
                                <select
                                    value={formData.automation}
                                    onChange={(e) => setFormData({ ...formData, automation: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                >
                                    {automationOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Uygulama Sıklığı</label>
                                <select
                                    value={formData.frequency}
                                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                >
                                    {frequencyOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Conditional Control Date for AD_HOC */}
                        {formData.frequency === 'AD_HOC' && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <label className="block text-sm font-medium text-amber-700 mb-2">Kontrol Tarihi *</label>
                                <input
                                    type="date"
                                    value={formData.controlDate}
                                    onChange={(e) => setFormData({ ...formData, controlDate: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                                    required
                                />
                                <p className="text-xs text-amber-600 mt-2">Bu tarih ajandaya eklenecektir</p>
                            </div>
                        )}

                        {/* Owner Info */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4">Kontrol Sahibi</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Sorumlu Kişi</label>
                                    <input
                                        type="text"
                                        value={formData.owner}
                                        onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Departman</label>
                                    <input
                                        type="text"
                                        value={formData.department}
                                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Test Frequency */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4">Test Planı</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Test Sıklığı</label>
                                    <select
                                        value={formData.testFrequency}
                                        onChange={(e) => setFormData({ ...formData, testFrequency: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                    >
                                        {testFrequencyOptions.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Kontrol Durumu</label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                    >
                                        <option value="ACTIVE">Aktif</option>
                                        <option value="PASSIVE">Pasif</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Regulations */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-3">İlişkili Regülasyonlar</h3>
                            <div className="flex flex-wrap gap-2">
                                {regulations.map(reg => (
                                    <button
                                        key={reg}
                                        type="button"
                                        onClick={() => toggleRegulation(reg)}
                                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${formData.linkedRegulations.includes(reg)
                                            ? 'bg-green-600 text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        {reg}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-100">
                            <Link href={`/controls/${params.id}`} className="px-6 py-2.5 text-gray-600 hover:text-gray-800">
                                İptal
                            </Link>
                            <button
                                onClick={handleSave}
                                className="px-8 py-2.5 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition-all"
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
