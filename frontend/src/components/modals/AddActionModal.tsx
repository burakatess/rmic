'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    department: string;
}

interface AddActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<void>;
    findingId: string;
    findingData?: any;
    action?: any;
}

interface ActionFormData {
    description: string;
    ownerId: string;
    responsibleDepartment: string;
    dueDate: string;
    status: 'BEKLIYOR' | 'DEVAM_EDIYOR' | 'TAMAMLANDI' | 'YETERSIZ' | 'KAPATILDI';
    evidence: string;
    notes: string;
}

const STATUS_OPTIONS = [
    { value: 'BEKLIYOR', label: 'Bekliyor' },
    { value: 'DEVAM_EDIYOR', label: 'Devam Ediyor' },
    { value: 'TAMAMLANDI', label: 'Tamamlandı' },
    { value: 'YETERSIZ', label: 'Yetersiz' },
    { value: 'KAPATILDI', label: 'Kapatıldı' },
];

export default function AddActionModal({ isOpen, onClose, onSubmit, findingId, findingData, action }: AddActionModalProps) {
    const [formData, setFormData] = useState<ActionFormData>({
        description: '',
        ownerId: '',
        responsibleDepartment: '',
        dueDate: '',
        status: 'BEKLIYOR',
        evidence: '',
        notes: '',
    });
    const [users, setUsers] = useState<User[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [loadingUsers, setLoadingUsers] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        const fetchUsers = async () => {
            setLoadingUsers(true);
            try {
                const userList = await api.getUsers() as User[];
                setUsers(userList || []);
            } catch { /* yetki yoksa boş liste */ } finally {
                setLoadingUsers(false);
            }
        };

        fetchUsers();

        if (action) {
            const formatD = (d: any) => {
                if (!d) return '';
                try {
                    return new Date(d).toISOString().split('T')[0];
                } catch {
                    return '';
                }
            };
            setFormData({
                description: action.description || '',
                ownerId: action.owner?.id || action.ownerId || '',
                responsibleDepartment: action.responsibleDepartment || '',
                dueDate: formatD(action.dueDate),
                status: action.status || 'BEKLIYOR',
                evidence: action.evidence || '',
                notes: action.notes || '',
            });
        } else {
            setFormData({
                description: '',
                ownerId: '',
                responsibleDepartment: findingData?.relatedDepartment || '',
                dueDate: '',
                status: 'BEKLIYOR',
                evidence: '',
                notes: '',
            });
        }
        setErrors({});
    }, [isOpen, findingData, action]);

    const validateForm = useCallback(() => {
        const newErrors: Record<string, string> = {};

        if (!formData.description || formData.description.length < 30) {
            newErrors.description = 'Düzeltici aksiyon açıklaması en az 30 karakter olmalıdır.';
        }

        if (!formData.ownerId) {
            newErrors.ownerId = 'Aksiyon sorumlusu seçilmelidir.';
        }

        if (!formData.dueDate) {
            newErrors.dueDate = 'Hedeflenen tamamlanma tarihi girilmelidir.';
        } else if (!action) {
            const selectedDate = new Date(formData.dueDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (selectedDate < today) {
                newErrors.dueDate = 'Geçmiş bir hedef tarih seçilemez.';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [formData, action]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setSubmitting(true);
        try {
            await onSubmit(formData);
            // Reset form
            setFormData({
                description: '',
                ownerId: '',
                responsibleDepartment: '',
                dueDate: '',
                status: 'BEKLIYOR',
                evidence: '',
                notes: '',
            });
            onClose();
        } catch (err) {
            console.error('Failed to save corrective action:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const isFormValid =
        formData.description.length >= 30 &&
        formData.ownerId &&
        formData.dueDate;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-2xl transform transition-all overflow-hidden">
                    
                    {/* Header */}
                    <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">
                                {action ? 'Düzeltici Aksiyonu Düzenle' : 'Yeni Düzeltici Aksiyon Ekle'}
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">
                                {action ? 'Düzeltici aksiyon detaylarını güncelleyin.' : 'Bulguyu kapatmaya yönelik düzeltici aksiyon adımı tanımlayın.'}
                            </p>
                        </div>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-slate-100 text-slate-600">
                            Bulgu: {findingData?.findingId || findingId}
                        </span>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
                        
                        {/* 1. Aksiyon Açıklaması */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                                Aksiyon Açıklaması <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Gerçekleştirilecek aksiyon adımlarını detaylıca açıklayın..."
                                rows={4}
                                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-600 resize-none transition-all ${
                                    errors.description ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
                                }`}
                            />
                            <div className="flex items-center justify-between mt-1">
                                {errors.description && (
                                    <p className="text-xs text-rose-500 font-medium">{errors.description}</p>
                                )}
                                <span className={`text-xs ml-auto font-medium ${formData.description.length < 30 ? 'text-slate-400' : 'text-emerald-600'}`}>
                                    {formData.description.length}/30 karakter minimum
                                </span>
                            </div>
                        </div>

                        {/* 2 & 3. Aksiyon Sahibi & Sorumlu Birim */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                                    Aksiyon Sorumlusu <span className="text-rose-500">*</span>
                                </label>
                                <select
                                    value={formData.ownerId}
                                    onChange={(e) => {
                                        const selectedUser = users.find(u => u.id === e.target.value);
                                        setFormData(prev => ({
                                            ...prev,
                                            ownerId: e.target.value,
                                            responsibleDepartment: selectedUser?.department || prev.responsibleDepartment
                                        }));
                                    }}
                                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-600 bg-white cursor-pointer ${
                                        errors.ownerId ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
                                    }`}
                                >
                                    <option value="">Sorumlu seçin</option>
                                    {users.map(user => (
                                        <option key={user.id} value={user.id}>
                                            {user.firstName} {user.lastName} ({user.department})
                                        </option>
                                    ))}
                                </select>
                                {errors.ownerId && (
                                    <p className="text-xs text-rose-500 font-medium mt-1">{errors.ownerId}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                                    Sorumlu Direktörlük / Birim
                                </label>
                                <input
                                    type="text"
                                    value={formData.responsibleDepartment}
                                    onChange={(e) => setFormData(prev => ({ ...prev, responsibleDepartment: e.target.value }))}
                                    placeholder="örn. BT Güvenlik"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-600 bg-white"
                                />
                            </div>
                        </div>

                        {/* 4 & 5. Hedef Tarih & Durum */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                                    Hedef Tamamlanma Tarihi <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={formData.dueDate}
                                    onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                                    min={new Date().toISOString().split('T')[0]}
                                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-600 bg-white ${
                                        errors.dueDate ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
                                    }`}
                                />
                                {errors.dueDate && (
                                    <p className="text-xs text-rose-500 font-medium mt-1">{errors.dueDate}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                                    Aksiyon Durumu
                                </label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-600 bg-white cursor-pointer"
                                >
                                    {STATUS_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* 6. Evidence Link */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                                Kanıt / Dökümantasyon Bağlantısı
                            </label>
                            <input
                                type="text"
                                value={formData.evidence}
                                onChange={(e) => setFormData(prev => ({ ...prev, evidence: e.target.value }))}
                                placeholder="örn. JIRA linki veya Sharepoint belge URL'si..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-600 bg-white"
                            />
                        </div>

                        {/* 7. Notlar */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                                Aksiyon Notları / Açıklamalar
                            </label>
                            <textarea
                                value={formData.notes}
                                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                placeholder="Ekstra detaylar, kısıtlamalar veya notlar..."
                                rows={2}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-600 resize-none bg-white transition-all"
                            />
                        </div>

                    </form>

                    {/* Footer */}
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 rounded-b-xl">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                        >
                            İptal
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!isFormValid || submitting}
                            className="px-4 py-2 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {submitting && (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            )}
                            {submitting ? 'Kaydediliyor...' : (action ? 'Değişiklikleri Kaydet' : 'Aksiyonu Ekle')}
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}
