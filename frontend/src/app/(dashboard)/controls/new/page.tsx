'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface User {
    id: string;
    firstName: string;
    lastName: string;
}

export default function NewControlPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState<User[]>([]);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        type: '',
        nature: '',
        automation: '',
        frequency: '',
        ownerId: '',
        controlDate: '',
    });

    useEffect(() => {
        loadFormData();
    }, []);

    const loadFormData = async () => {
        try {
            setUsers([
                { id: '1', firstName: 'Ayşe', lastName: 'Kaya' },
                { id: '2', firstName: 'Ahmet', lastName: 'Yılmaz' },
            ]);
        } catch (error) {
            console.error('Failed to load form data:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await api.createControl(formData);
            router.push('/controls');
        } catch (error) {
            console.error('Failed to create control:', error);
            alert('Kontrol oluşturulurken bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            {/* Page Header */}
            <div className="mb-8">
                <button
                    onClick={() => router.back()}
                    className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Geri
                </button>
                <h1 className="text-2xl font-bold text-gray-900">Yeni Kontrol Oluştur</h1>
                <p className="text-gray-500 mt-1">Kontrol envanterine yeni bir kontrol ekleyin</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Temel Bilgiler</h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Kontrol Adı <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                placeholder="Örn: Güvenlik Duvarı Yönetimi"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Açıklama <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                required
                                rows={4}
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                                placeholder="Kontrolün detaylı açıklaması..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Kontrol Sahibi <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                value={formData.ownerId}
                                onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                            >
                                <option value="">Sahip seçin</option>
                                {users.map((user) => (
                                    <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Control Classification */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Kontrol Sınıflandırması</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Kontrol Tipi <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                            >
                                <option value="">Tip seçin</option>
                                <option value="IT_GENERAL">IT Genel Kontrol</option>
                                <option value="IT_APPLICATION">IT Uygulama Kontrolü</option>
                                <option value="OPERATIONAL">Operasyonel Kontrol</option>
                                <option value="FINANCIAL">Finansal Kontrol</option>
                                <option value="COMPLIANCE">Uyum Kontrolü</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Kontrol Niteliği <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                value={formData.nature}
                                onChange={(e) => setFormData({ ...formData, nature: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                            >
                                <option value="">Nitelik seçin</option>
                                <option value="PREVENTIVE">Önleyici</option>
                                <option value="DETECTIVE">Tespit Edici</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Otomasyon Seviyesi <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                value={formData.automation}
                                onChange={(e) => setFormData({ ...formData, automation: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                            >
                                <option value="">Seviye seçin</option>
                                <option value="MANUAL">Manuel</option>
                                <option value="SEMI_AUTOMATED">Yarı Otomatik</option>
                                <option value="AUTOMATED">Tam Otomatik</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Uygulama Sıklığı <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                value={formData.frequency}
                                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                            >
                                <option value="">Sıklık seçin</option>
                                <option value="DAILY">Günlük</option>
                                <option value="WEEKLY">Haftalık</option>
                                <option value="MONTHLY">Aylık</option>
                                <option value="QUARTERLY">3 Aylık</option>
                                <option value="ANNUAL">Yıllık</option>
                                <option value="AD_HOC">Arızi</option>
                            </select>
                        </div>
                    </div>

                    {/* Conditional Control Date for AD_HOC */}
                    {formData.frequency === 'AD_HOC' && (
                        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <label className="block text-sm font-medium text-amber-700 mb-2">
                                Kontrol Tarihi <span className="text-red-500">*</span>
                            </label>
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
                </div>

                {/* Submit */}
                <div className="flex items-center justify-end gap-4">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="px-6 py-2.5 text-gray-600 hover:text-gray-800 font-medium"
                    >
                        İptal
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white font-medium rounded-xl hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Oluşturuluyor...' : 'Kontrol Oluştur'}
                    </button>
                </div>
            </form>
        </div>
    );
}
