'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const DEMO_RISK = {
    riskId: 'R-2024-0001',
    name: 'Siber Saldırı ve Veri İhlali Riski',
    description: 'Dış kaynaklı siber saldırılar (DDoS, ransomware, phishing vb.) sonucunda kurumsal sistemlerin zarar görmesi, müşteri verilerinin çalınması veya ifşa edilmesi riski.',
    category: 'BT Riski',
    owner: 'Ahmet Yılmaz',
    department: 'Bilgi Teknolojileri',
    inherentProbability: 4,
    inherentImpact: 5,
    residualProbability: 3,
    residualImpact: 4,
    riskAppetite: 10,
    linkedRegulations: ['ISO 27001', 'BDDK', 'KVKK'],
};

const categories = ['BT Riski', 'Operasyonel Risk', 'Uyum Riski', 'Finansal Risk', 'Stratejik Risk'];
const regulations = ['ISO 27001', 'BDDK', 'KVKK', 'COBIT', 'PCI-DSS', 'DORA', 'ISO 22301'];

export default function RiskEditPage() {
    const params = useParams();
    const router = useRouter();

    const [formData, setFormData] = useState({
        name: DEMO_RISK.name,
        description: DEMO_RISK.description,
        category: DEMO_RISK.category,
        owner: DEMO_RISK.owner,
        department: DEMO_RISK.department,
        inherentProbability: DEMO_RISK.inherentProbability,
        inherentImpact: DEMO_RISK.inherentImpact,
        residualProbability: DEMO_RISK.residualProbability,
        residualImpact: DEMO_RISK.residualImpact,
        riskAppetite: DEMO_RISK.riskAppetite,
        linkedRegulations: DEMO_RISK.linkedRegulations,
    });

    const inherentScore = formData.inherentProbability * formData.inherentImpact;
    const residualScore = formData.residualProbability * formData.residualImpact;

    const getScoreColor = (score: number) => {
        if (score >= 20) return 'bg-red-500';
        if (score >= 15) return 'bg-orange-500';
        if (score >= 10) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    const handleSave = () => {
        // API call would go here
        router.push(`/risks/${params.id}`);
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
                    <Link href="/risks" className="hover:text-blue-600">Risk Envanteri</Link>
                    <span>/</span>
                    <Link href={`/risks/${params.id}`} className="hover:text-blue-600">{DEMO_RISK.riskId}</Link>
                    <span>/</span>
                    <span className="text-gray-900">Düzenle</span>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Riski Düzenle</h1>
                        <p className="text-gray-500 mt-1">{DEMO_RISK.riskId}</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="space-y-6">
                        {/* Basic Info */}
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
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
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
                                    onChange={(e) => setFormData({ ...formData, riskAppetite: parseInt(e.target.value) })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Risk Sahibi</label>
                                <input
                                    type="text"
                                    value={formData.owner}
                                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Departman</label>
                                <input
                                    type="text"
                                    value={formData.department}
                                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {/* Risk Scores */}
                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4">Risk Değerlendirmesi</h3>
                            <div className="grid grid-cols-2 gap-8">
                                {/* Inherent */}
                                <div className="bg-gray-50 rounded-xl p-4">
                                    <p className="text-sm font-medium text-gray-700 mb-3">Doğal Risk</p>
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

                                {/* Residual */}
                                <div className="bg-gray-50 rounded-xl p-4">
                                    <p className="text-sm font-medium text-gray-700 mb-3">Rezidüel Risk</p>
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="text-xs text-gray-500">Olasılık (1-5)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="5"
                                                value={formData.residualProbability}
                                                onChange={(e) => setFormData({ ...formData, residualProbability: parseInt(e.target.value) || 1 })}
                                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Etki (1-5)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="5"
                                                value={formData.residualImpact}
                                                onChange={(e) => setFormData({ ...formData, residualImpact: parseInt(e.target.value) || 1 })}
                                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg"
                                            />
                                        </div>
                                    </div>
                                    <div className={`w-16 h-16 rounded-xl ${getScoreColor(residualScore)} flex items-center justify-center text-white text-2xl font-bold`}>
                                        {residualScore}
                                    </div>
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
                                        onClick={() => toggleRegulation(reg)}
                                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${formData.linkedRegulations.includes(reg)
                                                ? 'bg-blue-600 text-white'
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
                            <Link
                                href={`/risks/${params.id}`}
                                className="px-6 py-2.5 text-gray-600 hover:text-gray-800"
                            >
                                İptal
                            </Link>
                            <button
                                onClick={handleSave}
                                className="px-8 py-2.5 bg-[#1e3a5f] text-white font-medium rounded-xl hover:bg-[#152a45] transition-all"
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
