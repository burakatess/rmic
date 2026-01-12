'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface RiskCategory {
    id: string;
    name: string;
}

interface User {
    id: string;
    firstName: string;
    lastName: string;
}

export default function NewRiskPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState<RiskCategory[]>([]);
    const [users, setUsers] = useState<User[]>([]);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        categoryId: '',
        ownerId: '',
        inherentProbability: 3,
        inherentImpact: 3,
        riskAppetite: 10,
    });

    useEffect(() => {
        // Load categories and users for dropdowns
        loadFormData();
    }, []);

    const loadFormData = async () => {
        try {
            // These would be separate API endpoints
            // For now, we'll use placeholder data
            setCategories([
                { id: '1', name: 'Operasyonel Risk' },
                { id: '2', name: 'Finansal Risk' },
                { id: '3', name: 'Uyum Riski' },
                { id: '4', name: 'BT Riski' },
                { id: '5', name: 'Stratejik Risk' },
            ]);
            setUsers([
                { id: '1', firstName: 'Ahmet', lastName: 'Yılmaz' },
                { id: '2', firstName: 'Ayşe', lastName: 'Kaya' },
            ]);
        } catch (error) {
            console.error('Failed to load form data:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await api.createRisk(formData);
            router.push('/risks');
        } catch (error) {
            console.error('Failed to create risk:', error);
            alert('Risk oluşturulurken bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const inherentScore = formData.inherentProbability * formData.inherentImpact;

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
                <h1 className="text-2xl font-bold text-gray-900">Yeni Risk Oluştur</h1>
                <p className="text-gray-500 mt-1">Risk envanterine yeni bir risk ekleyin</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Temel Bilgiler</h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Risk Adı <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Örn: Siber Saldırı Riski"
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
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                placeholder="Riskin detaylı açıklaması..."
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Kategori <span className="text-red-500">*</span>
                                </label>
                                <select
                                    required
                                    value={formData.categoryId}
                                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                >
                                    <option value="">Kategori seçin</option>
                                    {categories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Risk Sahibi <span className="text-red-500">*</span>
                                </label>
                                <select
                                    required
                                    value={formData.ownerId}
                                    onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                >
                                    <option value="">Sahip seçin</option>
                                    {users.map((user) => (
                                        <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Risk Assessment */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Doğal Risk Değerlendirmesi</h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                                Olasılık (1-5)
                            </label>
                            <div className="flex items-center gap-2">
                                {[1, 2, 3, 4, 5].map((val) => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, inherentProbability: val })}
                                        className={`w-12 h-12 rounded-xl font-semibold transition-all ${formData.inherentProbability === val
                                                ? 'bg-blue-600 text-white shadow-lg'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        {val}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                {formData.inherentProbability === 1 && 'Çok Düşük'}
                                {formData.inherentProbability === 2 && 'Düşük'}
                                {formData.inherentProbability === 3 && 'Orta'}
                                {formData.inherentProbability === 4 && 'Yüksek'}
                                {formData.inherentProbability === 5 && 'Çok Yüksek'}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                                Etki (1-5)
                            </label>
                            <div className="flex items-center gap-2">
                                {[1, 2, 3, 4, 5].map((val) => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, inherentImpact: val })}
                                        className={`w-12 h-12 rounded-xl font-semibold transition-all ${formData.inherentImpact === val
                                                ? 'bg-blue-600 text-white shadow-lg'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        {val}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                {formData.inherentImpact === 1 && 'Önemsiz'}
                                {formData.inherentImpact === 2 && 'Düşük'}
                                {formData.inherentImpact === 3 && 'Orta'}
                                {formData.inherentImpact === 4 && 'Yüksek'}
                                {formData.inherentImpact === 5 && 'Kritik'}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                                Risk Skoru
                            </label>
                            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-white ${inherentScore >= 15 ? 'bg-gradient-to-br from-red-500 to-red-600' :
                                    inherentScore >= 8 ? 'bg-gradient-to-br from-yellow-500 to-yellow-600' :
                                        'bg-gradient-to-br from-green-500 to-green-600'
                                }`}>
                                {inherentScore}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                {inherentScore >= 15 ? 'Yüksek Risk' :
                                    inherentScore >= 8 ? 'Orta Risk' : 'Düşük Risk'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Risk Appetite */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Risk İştahı</h2>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Kabul Edilebilir Maksimum Skor (1-25)
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="25"
                            value={formData.riskAppetite}
                            onChange={(e) => setFormData({ ...formData, riskAppetite: parseInt(e.target.value) })}
                            className="w-full"
                        />
                        <div className="flex justify-between text-sm text-gray-500 mt-1">
                            <span>1 (Çok Düşük)</span>
                            <span className="font-semibold text-gray-900">{formData.riskAppetite}</span>
                            <span>25 (Çok Yüksek)</span>
                        </div>
                        {inherentScore > formData.riskAppetite && (
                            <p className="text-sm text-red-600 mt-2">
                                ⚠️ Mevcut risk skoru ({inherentScore}) iştahın ({formData.riskAppetite}) üzerinde
                            </p>
                        )}
                    </div>
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
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Oluşturuluyor...' : 'Risk Oluştur'}
                    </button>
                </div>
            </form>
        </div>
    );
}
