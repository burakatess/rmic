'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface Parameter {
    id: string;
    category: string;
    key: string;
    value: unknown;
    description?: string;
}

interface RiskCategory {
    id: string;
    name: string;
    description?: string;
    color?: string;
    _count?: { risks: number };
}

interface SystemOption {
    id: string;
    category: string;
    value: string;
    label: string;
    labelEn?: string;
    color?: string;
    sortOrder: number;
    isActive: boolean;
    isDefault: boolean;
}

const DEMO_OPTIONS: SystemOption[] = [
    { id: '1', category: 'CONTROL_FREQUENCY', value: 'CONTINUOUS', label: 'Sürekli', labelEn: 'Continuous', sortOrder: 1, isActive: true, isDefault: false },
    { id: '2', category: 'CONTROL_FREQUENCY', value: 'DAILY', label: 'Günlük', labelEn: 'Daily', sortOrder: 2, isActive: true, isDefault: false },
    { id: '3', category: 'CONTROL_FREQUENCY', value: 'WEEKLY', label: 'Haftalık', labelEn: 'Weekly', sortOrder: 3, isActive: true, isDefault: false },
    { id: '4', category: 'CONTROL_FREQUENCY', value: 'MONTHLY', label: 'Aylık', labelEn: 'Monthly', sortOrder: 4, isActive: true, isDefault: false },
    { id: '5', category: 'CONTROL_TYPE', value: 'IT_GENERAL', label: 'IT Genel', color: 'bg-blue-100 text-blue-700', sortOrder: 1, isActive: true, isDefault: false },
    { id: '6', category: 'CONTROL_TYPE', value: 'OPERATIONAL', label: 'Operasyonel', color: 'bg-gray-100 text-gray-700', sortOrder: 2, isActive: true, isDefault: false },
    { id: '7', category: 'CONTROL_NATURE', value: 'PREVENTIVE', label: 'Önleyici', color: 'bg-sky-100 text-sky-700', sortOrder: 1, isActive: true, isDefault: false },
    { id: '8', category: 'CONTROL_NATURE', value: 'DETECTIVE', label: 'Tespit Edici', color: 'bg-violet-100 text-violet-700', sortOrder: 2, isActive: true, isDefault: false },
    { id: '9', category: 'AUTOMATION_LEVEL', value: 'AUTOMATED', label: 'Otomatik', color: 'bg-green-100 text-green-700', sortOrder: 1, isActive: true, isDefault: false },
    { id: '10', category: 'AUTOMATION_LEVEL', value: 'MANUAL', label: 'Manuel', color: 'bg-gray-100 text-gray-600', sortOrder: 2, isActive: true, isDefault: false },
    { id: '11', category: 'ACTION_PRIORITY', value: 'CRITICAL', label: 'Kritik', color: 'bg-red-100 text-red-700', sortOrder: 1, isActive: true, isDefault: false },
    { id: '12', category: 'ACTION_PRIORITY', value: 'HIGH', label: 'Yüksek', color: 'bg-orange-100 text-orange-700', sortOrder: 2, isActive: true, isDefault: false },
    { id: '13', category: 'ACTION_PRIORITY', value: 'MEDIUM', label: 'Orta', color: 'bg-yellow-100 text-yellow-700', sortOrder: 3, isActive: true, isDefault: false },
    { id: '14', category: 'ACTION_PRIORITY', value: 'LOW', label: 'Düşük', color: 'bg-green-100 text-green-700', sortOrder: 4, isActive: true, isDefault: false },
];

const categoryLabels: Record<string, string> = {
    CONTROL_FREQUENCY: 'Kontrol Sıklığı',
    CONTROL_TYPE: 'Kontrol Tipi',
    CONTROL_NATURE: 'Kontrol Niteliği',
    AUTOMATION_LEVEL: 'Otomasyon Seviyesi',
    ACTION_PRIORITY: 'Aksiyon Önceliği',
    FINDING_SEVERITY: 'Bulgu Ciddiyeti',
    CONTROL_EFFECTIVENESS: 'Kontrol Etkinliği',
    RISK_SCORING: 'Risk Puanlama',
    SLA: 'SLA Süreleri',
    SYSTEM: 'Sistem',
};

export default function ParametersPage() {
    const [parameters, setParameters] = useState<Parameter[]>([]);
    const [riskCategories, setRiskCategories] = useState<RiskCategory[]>([]);
    const [systemOptions, setSystemOptions] = useState<SystemOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'parameters' | 'categories' | 'options'>('options');
    const [selectedCategory, setSelectedCategory] = useState<string>('');

    // Modals
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showOptionModal, setShowOptionModal] = useState(false);
    const [editingOption, setEditingOption] = useState<SystemOption | null>(null);

    // Form states
    const [categoryForm, setCategoryForm] = useState({ name: '', description: '', color: '#3b82f6' });
    const [optionForm, setOptionForm] = useState({
        category: '',
        value: '',
        label: '',
        labelEn: '',
        color: '',
        sortOrder: 0,
        isActive: true,
        isDefault: false,
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [paramsRes, categoriesRes, optionsRes] = await Promise.all([
                api.request<Parameter[]>('/admin/parameters'),
                api.request<RiskCategory[]>('/admin/risk-categories'),
                api.request<SystemOption[]>('/admin/options'),
            ]);
            setParameters(paramsRes || []);
            setRiskCategories(categoriesRes || []);
            setSystemOptions(optionsRes || DEMO_OPTIONS);
        } catch {
            // Use demo data when API fails
            setSystemOptions(DEMO_OPTIONS);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.request('/admin/risk-categories', { method: 'POST', body: categoryForm });
            setShowCategoryModal(false);
            setCategoryForm({ name: '', description: '', color: '#3b82f6' });
            loadData();
        } catch (error) {
            console.error('Failed to create category:', error);
        }
    };

    const handleSaveOption = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingOption) {
                await api.request(`/admin/options/${editingOption.id}`, { method: 'PUT', body: optionForm });
            } else {
                await api.request('/admin/options', { method: 'POST', body: optionForm });
            }
            setShowOptionModal(false);
            setEditingOption(null);
            resetOptionForm();
            loadData();
        } catch (error) {
            console.error('Failed to save option:', error);
        }
    };

    const handleDeleteOption = async (id: string) => {
        if (!confirm('Bu seçeneği silmek istediğinizden emin misiniz?')) return;
        try {
            await api.request(`/admin/options/${id}`, { method: 'DELETE' });
            loadData();
        } catch (error) {
            console.error('Failed to delete option:', error);
        }
    };

    const handleToggleActive = async (option: SystemOption) => {
        try {
            await api.request(`/admin/options/${option.id}`, {
                method: 'PUT',
                body: { isActive: !option.isActive },
            });
            loadData();
        } catch (error) {
            console.error('Failed to toggle option:', error);
        }
    };

    const openEditModal = (option: SystemOption) => {
        setEditingOption(option);
        setOptionForm({
            category: option.category,
            value: option.value,
            label: option.label,
            labelEn: option.labelEn || '',
            color: option.color || '',
            sortOrder: option.sortOrder,
            isActive: option.isActive,
            isDefault: option.isDefault,
        });
        setShowOptionModal(true);
    };

    const openCreateModal = (category?: string) => {
        resetOptionForm();
        if (category) setOptionForm(prev => ({ ...prev, category }));
        setShowOptionModal(true);
    };

    const resetOptionForm = () => {
        setOptionForm({
            category: '',
            value: '',
            label: '',
            labelEn: '',
            color: '',
            sortOrder: 0,
            isActive: true,
            isDefault: false,
        });
    };

    const groupedParams = parameters.reduce((acc, param) => {
        if (!acc[param.category]) acc[param.category] = [];
        acc[param.category].push(param);
        return acc;
    }, {} as Record<string, Parameter[]>);

    const groupedOptions = systemOptions.reduce((acc, option) => {
        if (!acc[option.category]) acc[option.category] = [];
        acc[option.category].push(option);
        return acc;
    }, {} as Record<string, SystemOption[]>);

    const optionCategories = Object.keys(groupedOptions);
    const filteredOptions = selectedCategory
        ? groupedOptions[selectedCategory] || []
        : systemOptions;

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Parametreler</h1>
                <p className="text-gray-500 mt-1">Sistem parametrelerini, kategorileri ve dropdown seçeneklerini yönetin</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                <button
                    onClick={() => setActiveTab('options')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'options' ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                    Dropdown Seçenekleri
                </button>
                <button
                    onClick={() => setActiveTab('parameters')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'parameters' ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                    Sistem Parametreleri
                </button>
                <button
                    onClick={() => setActiveTab('categories')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'categories' ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                    Risk Kategorileri
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-600"></div>
                </div>
            ) : activeTab === 'options' ? (
                <div className="space-y-4">
                    {/* Category Filter & Actions */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                            >
                                <option value="">Tüm Kategoriler</option>
                                {optionCategories.map(cat => (
                                    <option key={cat} value={cat}>{categoryLabels[cat] || cat}</option>
                                ))}
                            </select>
                            <span className="text-sm text-gray-500">
                                {filteredOptions.length} seçenek
                            </span>
                        </div>
                        <button
                            onClick={() => openCreateModal(selectedCategory)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-xl hover:bg-slate-800"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Yeni Seçenek
                        </button>
                    </div>

                    {/* Options by Category */}
                    {selectedCategory ? (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="font-semibold text-gray-900">{categoryLabels[selectedCategory] || selectedCategory}</h3>
                                <span className="text-sm text-gray-400">{filteredOptions.length} seçenek</span>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {filteredOptions.sort((a, b) => a.sortOrder - b.sortOrder).map((option) => (
                                    <div key={option.id} className={`px-6 py-4 flex items-center justify-between ${!option.isActive ? 'opacity-50 bg-gray-50' : ''}`}>
                                        <div className="flex items-center gap-4">
                                            <span className="text-sm text-gray-400 w-8">#{option.sortOrder}</span>
                                            {option.color ? (
                                                <span className={`px-3 py-1 rounded text-sm font-medium ${option.color}`}>
                                                    {option.label}
                                                </span>
                                            ) : (
                                                <span className="font-medium text-gray-900">{option.label}</span>
                                            )}
                                            <span className="text-sm text-gray-400 font-mono">{option.value}</span>
                                            {option.labelEn && <span className="text-xs text-gray-400">({option.labelEn})</span>}
                                            {!option.isActive && <span className="text-xs text-red-500 bg-red-100 px-2 py-0.5 rounded">Pasif</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleToggleActive(option)}
                                                className={`p-2 rounded-lg ${option.isActive ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                                title={option.isActive ? 'Pasif Yap' : 'Aktif Yap'}
                                            >
                                                {option.isActive ? '✓' : '○'}
                                            </button>
                                            <button
                                                onClick={() => openEditModal(option)}
                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                                title="Düzenle"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteOption(option.id)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                title="Sil"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {optionCategories.map(category => (
                                <div key={category} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div
                                        className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-100"
                                        onClick={() => setSelectedCategory(category)}
                                    >
                                        <h3 className="font-semibold text-gray-900">{categoryLabels[category] || category}</h3>
                                        <span className="text-sm text-gray-400">{groupedOptions[category].length} seçenek →</span>
                                    </div>
                                    <div className="p-4 flex flex-wrap gap-2">
                                        {groupedOptions[category].slice(0, 6).map(option => (
                                            <span
                                                key={option.id}
                                                className={`px-2 py-1 rounded text-xs ${option.color || 'bg-gray-100 text-gray-600'} ${!option.isActive ? 'opacity-50' : ''}`}
                                            >
                                                {option.label}
                                            </span>
                                        ))}
                                        {groupedOptions[category].length > 6 && (
                                            <span className="text-xs text-gray-400">+{groupedOptions[category].length - 6} daha</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : activeTab === 'parameters' ? (
                <div className="space-y-6">
                    {Object.entries(groupedParams).map(([category, params]) => (
                        <div key={category} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                                <h3 className="font-semibold text-gray-900">{categoryLabels[category] || category}</h3>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {params.map((param) => (
                                    <div key={param.id} className="px-6 py-4">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="font-medium text-gray-900">{param.key}</p>
                                                <p className="text-sm text-gray-500 mt-1">{param.description}</p>
                                            </div>
                                            <div className="text-right">
                                                <pre className="text-sm bg-gray-100 px-3 py-2 rounded-lg overflow-x-auto max-w-md">
                                                    {JSON.stringify(param.value, null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            onClick={() => setShowCategoryModal(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-xl hover:bg-slate-800"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Yeni Kategori
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {riskCategories.map((category) => (
                            <div key={category.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                                <div className="flex items-center gap-3 mb-3">
                                    <div
                                        className="w-4 h-4 rounded-full"
                                        style={{ backgroundColor: category.color || '#94a3b8' }}
                                    ></div>
                                    <h3 className="font-semibold text-gray-900">{category.name}</h3>
                                </div>
                                <p className="text-sm text-gray-500 mb-3">{category.description || '-'}</p>
                                <p className="text-sm text-gray-400">{category._count?.risks || 0} risk</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Create Category Modal */}
            {showCategoryModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Yeni Risk Kategorisi</h2>
                        <form onSubmit={handleCreateCategory} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Adı</label>
                                <input
                                    type="text"
                                    required
                                    value={categoryForm.name}
                                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                                <textarea
                                    value={categoryForm.description}
                                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                                    rows={3}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Renk</label>
                                <div className="flex gap-2">
                                    {['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'].map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setCategoryForm({ ...categoryForm, color })}
                                            className={`w-8 h-8 rounded-lg ${categoryForm.color === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowCategoryModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800"
                                >
                                    Oluştur
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Create/Edit Option Modal */}
            {showOptionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">
                            {editingOption ? 'Seçeneği Düzenle' : 'Yeni Seçenek Ekle'}
                        </h2>
                        <form onSubmit={handleSaveOption} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Kategori *</label>
                                    <select
                                        required
                                        value={optionForm.category}
                                        onChange={(e) => setOptionForm({ ...optionForm, category: e.target.value })}
                                        disabled={!!editingOption}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white disabled:bg-gray-100"
                                    >
                                        <option value="">Seçin...</option>
                                        <option value="CONTROL_FREQUENCY">Kontrol Sıklığı</option>
                                        <option value="CONTROL_TYPE">Kontrol Tipi</option>
                                        <option value="CONTROL_NATURE">Kontrol Niteliği</option>
                                        <option value="AUTOMATION_LEVEL">Otomasyon Seviyesi</option>
                                        <option value="ACTION_PRIORITY">Aksiyon Önceliği</option>
                                        <option value="FINDING_SEVERITY">Bulgu Ciddiyeti</option>
                                        <option value="CONTROL_EFFECTIVENESS">Kontrol Etkinliği</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Değer (Value) *</label>
                                    <input
                                        type="text"
                                        required
                                        value={optionForm.value}
                                        onChange={(e) => setOptionForm({ ...optionForm, value: e.target.value.toUpperCase().replace(/\s/g, '_') })}
                                        disabled={!!editingOption}
                                        placeholder="WEEKLY"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 font-mono disabled:bg-gray-100"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Türkçe Etiket *</label>
                                    <input
                                        type="text"
                                        required
                                        value={optionForm.label}
                                        onChange={(e) => setOptionForm({ ...optionForm, label: e.target.value })}
                                        placeholder="Haftalık"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">İngilizce Etiket</label>
                                    <input
                                        type="text"
                                        value={optionForm.labelEn}
                                        onChange={(e) => setOptionForm({ ...optionForm, labelEn: e.target.value })}
                                        placeholder="Weekly"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Renk (CSS Class)</label>
                                    <input
                                        type="text"
                                        value={optionForm.color}
                                        onChange={(e) => setOptionForm({ ...optionForm, color: e.target.value })}
                                        placeholder="bg-blue-100 text-blue-700"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 font-mono text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Sıralama</label>
                                    <input
                                        type="number"
                                        value={optionForm.sortOrder}
                                        onChange={(e) => setOptionForm({ ...optionForm, sortOrder: parseInt(e.target.value) || 0 })}
                                        min={0}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                <label className="flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={optionForm.isActive}
                                        onChange={(e) => setOptionForm({ ...optionForm, isActive: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-300 text-slate-600 focus:ring-slate-500"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Aktif</span>
                                </label>
                                <label className="flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={optionForm.isDefault}
                                        onChange={(e) => setOptionForm({ ...optionForm, isDefault: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-300 text-slate-600 focus:ring-slate-500"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Varsayılan</span>
                                </label>
                            </div>
                            {optionForm.color && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Önizleme</label>
                                    <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${optionForm.color}`}>
                                        {optionForm.label || 'Örnek Etiket'}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => { setShowOptionModal(false); setEditingOption(null); resetOptionForm(); }}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800"
                                >
                                    {editingOption ? 'Güncelle' : 'Oluştur'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
