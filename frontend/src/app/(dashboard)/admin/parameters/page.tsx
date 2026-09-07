'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { PageShell, PageHeader, Button, Modal, ConfirmDialog, EmptyState } from '@/components/ui';

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
    const [loadError, setLoadError] = useState(false);
    const [activeTab, setActiveTab] = useState<'parameters' | 'categories' | 'options'>('options');
    const [selectedCategory, setSelectedCategory] = useState<string>('');

    // Modals
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showOptionModal, setShowOptionModal] = useState(false);
    const [editingOption, setEditingOption] = useState<SystemOption | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<SystemOption | null>(null);

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
            setSystemOptions(optionsRes || []);
            setLoadError(false);
        } catch {
            setLoadError(true);
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

    const handleDeleteOption = async () => {
        if (!deleteTarget) return;
        try {
            await api.request(`/admin/options/${deleteTarget.id}`, { method: 'DELETE' });
            setDeleteTarget(null);
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

    const inputClass = "w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus-visible:ring-2 ring-blue-100 bg-white";

    return (
        <PageShell>
            <PageHeader
                title="Parametreler"
                description="Sistem parametrelerini, kategorileri ve dropdown seçeneklerini yönetin"
                breadcrumbs={[{ label: 'Sistem Yönetimi' }, { label: 'Parametreler' }]}
            />

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
                {([
                    { key: 'options', label: 'Dropdown Seçenekleri' },
                    { key: 'parameters', label: 'Sistem Parametreleri' },
                    { key: 'categories', label: 'Risk Kategorileri' },
                ] as const).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-200 border-t-blue-600"></div>
                </div>
            ) : loadError && systemOptions.length === 0 && parameters.length === 0 && riskCategories.length === 0 ? (
                <EmptyState
                    title="Parametre verisi yüklenemedi"
                    description="Sunucudan parametre/kategori/seçenek verisi alınamadı. Lütfen daha sonra tekrar deneyin."
                />
            ) : activeTab === 'options' ? (
                <div className="space-y-4">
                    {/* Category Filter & Actions */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className={inputClass}
                            >
                                <option value="">Tüm Kategoriler</option>
                                {optionCategories.map(cat => (
                                    <option key={cat} value={cat}>{categoryLabels[cat] || cat}</option>
                                ))}
                            </select>
                            <span className="text-sm text-slate-500">
                                {filteredOptions.length} seçenek
                            </span>
                        </div>
                        <Button
                            onClick={() => openCreateModal(selectedCategory)}
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                        >
                            Yeni Seçenek
                        </Button>
                    </div>

                    {/* Options by Category */}
                    {selectedCategory ? (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-slate-700">{categoryLabels[selectedCategory] || selectedCategory}</h3>
                                <span className="text-sm text-slate-400">{filteredOptions.length} seçenek</span>
                            </div>
                            {filteredOptions.length === 0 ? (
                                <EmptyState title="Seçenek yok" description="Bu kategoride henüz tanımlı seçenek bulunmuyor." />
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {filteredOptions.sort((a, b) => a.sortOrder - b.sortOrder).map((option) => (
                                        <div key={option.id} className={`px-6 py-4 flex items-center justify-between ${!option.isActive ? 'opacity-50 bg-slate-50' : ''}`}>
                                            <div className="flex items-center gap-4">
                                                <span className="text-sm text-slate-400 w-8">#{option.sortOrder}</span>
                                                {option.color ? (
                                                    <span className={`px-3 py-1 rounded text-sm font-medium ${option.color}`}>
                                                        {option.label}
                                                    </span>
                                                ) : (
                                                    <span className="font-medium text-slate-800">{option.label}</span>
                                                )}
                                                <span className="text-sm text-slate-400 font-mono">{option.value}</span>
                                                {option.labelEn && <span className="text-xs text-slate-400">({option.labelEn})</span>}
                                                {!option.isActive && <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">Pasif</span>}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleToggleActive(option)}
                                                    className={`p-2 rounded-lg cursor-pointer transition-colors ${option.isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
                                                    title={option.isActive ? 'Pasif Yap' : 'Aktif Yap'}
                                                >
                                                    {option.isActive ? '✓' : '○'}
                                                </button>
                                                <button
                                                    onClick={() => openEditModal(option)}
                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                                                    title="Düzenle"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget(option)}
                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
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
                            )}
                        </div>
                    ) : optionCategories.length === 0 ? (
                        <EmptyState title="Seçenek yok" description="Henüz tanımlı dropdown seçeneği bulunmuyor." />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {optionCategories.map(category => (
                                <div key={category} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                    <div
                                        className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                                        onClick={() => setSelectedCategory(category)}
                                    >
                                        <h3 className="text-sm font-semibold text-slate-700">{categoryLabels[category] || category}</h3>
                                        <span className="text-sm text-slate-400">{groupedOptions[category].length} seçenek →</span>
                                    </div>
                                    <div className="p-4 flex flex-wrap gap-2">
                                        {groupedOptions[category].slice(0, 6).map(option => (
                                            <span
                                                key={option.id}
                                                className={`px-2 py-1 rounded text-xs ${option.color || 'bg-slate-100 text-slate-600'} ${!option.isActive ? 'opacity-50' : ''}`}
                                            >
                                                {option.label}
                                            </span>
                                        ))}
                                        {groupedOptions[category].length > 6 && (
                                            <span className="text-xs text-slate-400">+{groupedOptions[category].length - 6} daha</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : activeTab === 'parameters' ? (
                Object.keys(groupedParams).length === 0 ? (
                    <EmptyState title="Parametre yok" description="Henüz tanımlı sistem parametresi bulunmuyor." />
                ) : (
                    <div className="space-y-6">
                        {Object.entries(groupedParams).map(([category, params]) => (
                            <div key={category} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
                                    <h3 className="text-sm font-semibold text-slate-700">{categoryLabels[category] || category}</h3>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {params.map((param) => (
                                        <div key={param.id} className="px-6 py-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="font-medium text-slate-800">{param.key}</p>
                                                    <p className="text-sm text-slate-500 mt-1">{param.description}</p>
                                                </div>
                                                <pre className="text-sm bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg overflow-x-auto max-w-md">
                                                    {JSON.stringify(param.value, null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <Button
                            onClick={() => setShowCategoryModal(true)}
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                        >
                            Yeni Kategori
                        </Button>
                    </div>

                    {riskCategories.length === 0 ? (
                        <EmptyState title="Risk kategorisi yok" description="Henüz tanımlı risk kategorisi bulunmuyor." />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {riskCategories.map((category) => (
                                <div key={category.id} className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div
                                            className="w-4 h-4 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: category.color || '#94a3b8' }}
                                        ></div>
                                        <h3 className="font-semibold text-slate-800">{category.name}</h3>
                                    </div>
                                    <p className="text-sm text-slate-500 mb-3">{category.description || '-'}</p>
                                    <p className="text-sm text-slate-400">{category._count?.risks || 0} risk</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Create Category Modal */}
            <Modal
                open={showCategoryModal}
                onClose={() => setShowCategoryModal(false)}
                title="Yeni Risk Kategorisi"
                size="sm"
            >
                <form onSubmit={handleCreateCategory} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Kategori Adı</label>
                        <input
                            type="text"
                            required
                            value={categoryForm.name}
                            onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Açıklama</label>
                        <textarea
                            value={categoryForm.description}
                            onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                            className={`${inputClass} resize-none`}
                            rows={3}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Renk</label>
                        <div className="flex gap-2">
                            {['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'].map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => setCategoryForm({ ...categoryForm, color })}
                                    className={`w-8 h-8 rounded-lg cursor-pointer ${categoryForm.color === color ? 'ring-2 ring-offset-2 ring-blue-400' : ''}`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="ghost" onClick={() => setShowCategoryModal(false)}>İptal</Button>
                        <Button type="submit">Oluştur</Button>
                    </div>
                </form>
            </Modal>

            {/* Create/Edit Option Modal */}
            <Modal
                open={showOptionModal}
                onClose={() => { setShowOptionModal(false); setEditingOption(null); resetOptionForm(); }}
                title={editingOption ? 'Seçeneği Düzenle' : 'Yeni Seçenek Ekle'}
                size="md"
            >
                <form onSubmit={handleSaveOption} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Kategori *</label>
                            <select
                                required
                                value={optionForm.category}
                                onChange={(e) => setOptionForm({ ...optionForm, category: e.target.value })}
                                disabled={!!editingOption}
                                className={`${inputClass} disabled:bg-slate-100`}
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
                            <label className="block text-sm font-medium text-slate-700 mb-1">Değer (Value) *</label>
                            <input
                                type="text"
                                required
                                value={optionForm.value}
                                onChange={(e) => setOptionForm({ ...optionForm, value: e.target.value.toUpperCase().replace(/\s/g, '_') })}
                                disabled={!!editingOption}
                                placeholder="WEEKLY"
                                className={`${inputClass} font-mono disabled:bg-slate-100`}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Türkçe Etiket *</label>
                            <input
                                type="text"
                                required
                                value={optionForm.label}
                                onChange={(e) => setOptionForm({ ...optionForm, label: e.target.value })}
                                placeholder="Haftalık"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">İngilizce Etiket</label>
                            <input
                                type="text"
                                value={optionForm.labelEn}
                                onChange={(e) => setOptionForm({ ...optionForm, labelEn: e.target.value })}
                                placeholder="Weekly"
                                className={inputClass}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Renk (CSS Class)</label>
                            <input
                                type="text"
                                value={optionForm.color}
                                onChange={(e) => setOptionForm({ ...optionForm, color: e.target.value })}
                                placeholder="bg-blue-100 text-blue-700"
                                className={`${inputClass} font-mono text-sm`}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Sıralama</label>
                            <input
                                type="number"
                                value={optionForm.sortOrder}
                                onChange={(e) => setOptionForm({ ...optionForm, sortOrder: parseInt(e.target.value) || 0 })}
                                min={0}
                                className={inputClass}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={optionForm.isActive}
                                onChange={(e) => setOptionForm({ ...optionForm, isActive: e.target.checked })}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-sm text-slate-700">Aktif</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={optionForm.isDefault}
                                onChange={(e) => setOptionForm({ ...optionForm, isDefault: e.target.checked })}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-sm text-slate-700">Varsayılan</span>
                        </label>
                    </div>
                    {optionForm.color && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Önizleme</label>
                            <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${optionForm.color}`}>
                                {optionForm.label || 'Örnek Etiket'}
                            </span>
                        </div>
                    )}
                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="ghost" onClick={() => { setShowOptionModal(false); setEditingOption(null); resetOptionForm(); }}>
                            İptal
                        </Button>
                        <Button type="submit">
                            {editingOption ? 'Güncelle' : 'Oluştur'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDeleteOption}
                title="Seçeneği Sil"
                message={`"${deleteTarget?.label ?? ''}" seçeneğini silmek istediğinizden emin misiniz?`}
                confirmLabel="Sil"
                variant="danger"
            />
        </PageShell>
    );
}
