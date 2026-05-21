'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';



const typeOptions = [
    { value: 'BT', label: 'BT' },
    { value: 'BT_DISI', label: 'BT Dışı' },
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
    { value: 'SEMI_ANNUAL', label: '6 Aylık' },
    { value: 'ANNUAL', label: 'Yıllık' },
    { value: 'AD_HOC', label: 'Arızi' },
];

const getPeriodOptions = (freq: string) => {
    switch (freq) {
        case 'QUARTERLY':
            return [
                { value: 'JAN_APR_JUL_OCT', label: 'Ocak - Nisan - Temmuz - Ekim' },
                { value: 'FEB_MAY_AUG_NOV', label: 'Şubat - Mayıs - Ağustos - Kasım' },
                { value: 'MAR_JUN_SEP_DEC', label: 'Mart - Haziran - Eylül - Aralık' },
            ];
        case 'SEMI_ANNUAL':
            return [
                { value: 'JAN_JUL', label: 'Ocak - Temmuz' },
                { value: 'FEB_AUG', label: 'Şubat - Ağustos' },
                { value: 'MAR_SEP', label: 'Mart - Eylül' },
                { value: 'APR_OCT', label: 'Nisan - Ekim' },
                { value: 'MAY_NOV', label: 'Mayıs - Kasım' },
                { value: 'JUN_DEC', label: 'Haziran - Aralık' },
            ];
        case 'ANNUAL':
            return [
                { value: 'JANUARY', label: 'Ocak' },
                { value: 'FEBRUARY', label: 'Şubat' },
                { value: 'MARCH', label: 'Mart' },
                { value: 'APRIL', label: 'Nisan' },
                { value: 'MAY', label: 'Mayıs' },
                { value: 'JUNE', label: 'Haziran' },
                { value: 'JULY', label: 'Temmuz' },
                { value: 'AUGUST', label: 'Ağustos' },
                { value: 'SEPTEMBER', label: 'Eylül' },
                { value: 'OCTOBER', label: 'Ekim' },
                { value: 'NOVEMBER', label: 'Kasım' },
                { value: 'DECEMBER', label: 'Aralık' },
            ];
        default:
            return [];
    }
};

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

    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        controlId: '',
        name: '',
        description: '',
        type: 'BT',
        nature: 'PREVENTIVE',
        automation: 'MANUAL',
        frequency: 'MONTHLY',
        controlPeriod: '',
        testPerformer: '',
        reviewer: '',
        testFrequency: 'ANNUAL',
        linkedRegulations: [] as string[],
        status: 'ACTIVE',
        controlDate: '',
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = await api.getControl(params.id as string) as any;
                if (data) {
                    setFormData({
                        controlId: data.controlId || '',
                        name: data.name || '',
                        description: data.description || '',
                        type: data.type || 'BT',
                        nature: data.nature || 'PREVENTIVE',
                        automation: data.automation || 'MANUAL',
                        frequency: data.frequency || 'MONTHLY',
                        controlPeriod: data.controlPeriod || '',
                        testPerformer: data.testPerformerId || '',
                        reviewer: data.reviewerId || '',
                        testFrequency: data.testFrequency || 'ANNUAL',
                        linkedRegulations: [],
                        status: data.status || 'ACTIVE',
                        controlDate: '',
                    });
                }
            } catch (error) {
                console.error('Failed to fetch control:', error);
            } finally {
                setLoading(false);
            }
        };

        if (params.id) {
            fetchData();
        }
    }, [params.id]);

    const handleSave = async () => {
        try {
            await api.updateControl(params.id as string, {
                name: formData.name,
                description: formData.description,
                type: formData.type,
                nature: formData.nature,
                automation: formData.automation,
                frequency: formData.frequency,
                controlPeriod: formData.controlPeriod || null,
            });
            router.push(`/controls/${params.id}`);
            router.refresh();
        } catch (error) {
            console.error('Failed to update control:', error);
            alert('Güncelleme sırasında bir hata oluştu.');
        }
    };

    const toggleRegulation = (reg: string) => {
        setFormData(prev => ({
            ...prev,
            linkedRegulations: prev.linkedRegulations.includes(reg)
                ? prev.linkedRegulations.filter(r => r !== reg)
                : [...prev.linkedRegulations, reg]
        }));
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1000px] mx-auto px-6 py-6">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/controls" className="hover:text-green-600">Kontrol Envanteri</Link>
                    <span>/</span>
                    <Link href={`/controls/${params.id}`} className="hover:text-green-600">{formData.controlId}</Link>
                    <span>/</span>
                    <span className="text-gray-900">Düzenle</span>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Kontrolü Düzenle</h1>
                        <p className="text-gray-500 mt-1">{formData.controlId}</p>
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
                            <label className="block text-sm font-medium text-gray-700 mb-2">Kontrol Tanımı</label>
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

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Uygulama Sıklığı</label>
                            <select
                                value={formData.frequency}
                                onChange={(e) => setFormData({ ...formData, frequency: e.target.value, controlPeriod: '' })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                            >
                                {frequencyOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Conditional Control Period */}
                        {(formData.frequency === 'QUARTERLY' || formData.frequency === 'SEMI_ANNUAL' || formData.frequency === 'ANNUAL') && (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                                <label className="block text-sm font-medium text-blue-800 mb-2">Kontrol Periyodu *</label>
                                <select
                                    value={formData.controlPeriod}
                                    onChange={(e) => setFormData({ ...formData, controlPeriod: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                    required
                                >
                                    <option value="">Periyot Seçiniz</option>
                                    {getPeriodOptions(formData.frequency).map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-blue-600 mt-2">Bu kontrol seçilen aylarda otomatik olarak atanacaktır</p>
                            </div>
                        )}

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
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Testi Gerçekleştiren</label>
                                    <select
                                        value={formData.testPerformer || ''}
                                        onChange={(e) => setFormData({ ...formData, testPerformer: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                    >
                                        <option value="">Kişi seçin</option>
                                        <option value="user1">Ayşe Kaya</option>
                                        <option value="user2">Ahmet Yılmaz</option>
                                        <option value="user3">Mehmet Demir</option>
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">Test sonuçlarını girecek kişi</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Kontrol Eden</label>
                                    <select
                                        value={formData.reviewer || ''}
                                        onChange={(e) => setFormData({ ...formData, reviewer: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                    >
                                        <option value="">Kişi seçin</option>
                                        <option value="user1">Ayşe Kaya</option>
                                        <option value="user2">Ahmet Yılmaz</option>
                                        <option value="user3">Mehmet Demir</option>
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">Test sonuçlarını onaylayacak kişi</p>
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

                        {/* Mehaz */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-3">Mehaz</h3>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Yönetmelik Adı</label>
                                    <input
                                        type="text"
                                        placeholder="Örn: BDDK Bilgi Sistemleri Yönetmeliği"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Madde No</label>
                                    <input
                                        type="text"
                                        placeholder="Örn: Madde 5/1-a"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                                    />
                                </div>
                            </div>
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
