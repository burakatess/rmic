'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface RiskCategory { id: string; name: string; }
interface UserOption { id: string; firstName: string; lastName: string; }

export default function RiskEditPage() {
    const params = useParams();
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [riskCode, setRiskCode] = useState('');
    const [categories, setCategories] = useState<RiskCategory[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        categoryId: '',
        ownerId: '',
        inherentProbability: 1,
        inherentImpact: 1,
        riskAppetite: 10,
    });

    useEffect(() => {
        const id = params.id as string;
        Promise.all([
            api.getRisk(id),
            api.getRiskCategories(),
            api.getUsers(),
        ]).then(([risk, cats, userList]: any[]) => {
            setRiskCode(risk.riskId);
            setFormData({
                name: risk.name || '',
                description: risk.description || '',
                categoryId: risk.category?.id || '',
                ownerId: risk.owner?.id || '',
                inherentProbability: risk.inherentProbability || 1,
                inherentImpact: risk.inherentImpact || 1,
                riskAppetite: risk.riskAppetite || 10,
            });
            setCategories(Array.isArray(cats) ? cats : (cats as any)?.data || []);
            setUsers(Array.isArray(userList) ? userList : (userList as any)?.data || []);
        }).catch((err: any) => {
            showError('Hata', err.message || 'Risk yüklenemedi.');
        }).finally(() => setLoading(false));
    }, [params.id, showError]);

    const inherentScore = formData.inherentProbability * formData.inherentImpact;
    const getScoreColor = (score: number) => {
        if (score >= 20) return 'bg-red-500';
        if (score >= 15) return 'bg-orange-500';
        if (score >= 10) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    const handleSave = async () => {
        if (!formData.name.trim()) {
            showError('Hata', 'Risk adı zorunludur.');
            return;
        }
        setSaving(true);
        try {
            await api.updateRisk(params.id as string, {
                name: formData.name,
                description: formData.description || undefined,
                categoryId: formData.categoryId || undefined,
                ownerId: formData.ownerId || undefined,
                inherentProbability: formData.inherentProbability,
                inherentImpact: formData.inherentImpact,
                riskAppetite: formData.riskAppetite,
            });
            success('Başarılı', 'Risk güncellendi.');
            router.push(`/risks/${params.id}`);
        } catch (err: any) {
            showError('Hata', err.message || 'Risk güncellenemedi.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1000px] mx-auto px-6 py-6">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/risks" className="hover:text-blue-600">Risk Envanteri</Link>
                    <span>/</span>
                    <Link href={`/risks/${params.id}`} className="hover:text-blue-600">{riskCode}</Link>
                    <span>/</span>
                    <span className="text-gray-900">Düzenle</span>
                </div>

                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Riski Düzenle</h1>
                        <p className="text-gray-500 mt-1">{riskCode}</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Risk Adı *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Açıklama</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                rows={4}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Kategori</label>
                                <select
                                    value={formData.categoryId}
                                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                    <option value="">Seçiniz...</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Risk İştahı</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="25"
                                    value={formData.riskAppetite}
                                    onChange={(e) => setFormData({ ...formData, riskAppetite: parseInt(e.target.value) || 1 })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Risk Sahibi</label>
                            <select
                                value={formData.ownerId}
                                onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                                <option value="">Seçiniz...</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                                ))}
                            </select>
                        </div>

                        {/* Doğal Risk Değerlendirmesi — rezidüel skor ayrı bir "değerlendirme" akışıyla (POST /risks/:id/assess) yönetiliyor, bu form yalnızca doğal riski günceller. */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4">Doğal Risk Değerlendirmesi</h3>
                            <div className="bg-gray-50 rounded-xl p-4 max-w-xs">
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="text-xs text-gray-500">Olasılık (1-5)</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="5"
                                            value={formData.inherentProbability}
                                            onChange={(e) => setFormData({ ...formData, inherentProbability: parseInt(e.target.value) || 1 })}
                                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Etki (1-5)</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="5"
                                            value={formData.inherentImpact}
                                            onChange={(e) => setFormData({ ...formData, inherentImpact: parseInt(e.target.value) || 1 })}
                                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
                                        />
                                    </div>
                                </div>
                                <div className={`w-16 h-16 rounded-xl ${getScoreColor(inherentScore)} flex items-center justify-center text-white text-2xl font-bold`}>
                                    {inherentScore}
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 mt-3">
                                Rezidüel risk değerlendirmesi ve regülasyon eşleştirmesi ayrı ekranlardan yönetilir
                                (Risk Değerlendirme akışı / Uyum &gt; Eşleştirme).
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-100">
                            <Link href={`/risks/${params.id}`} className="px-6 py-2.5 text-gray-600 hover:text-gray-800">
                                İptal
                            </Link>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-8 py-2.5 bg-[#1e3a5f] text-white font-medium rounded-xl hover:bg-[#152a45] transition-all disabled:opacity-60"
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
