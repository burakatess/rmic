'use client';

import { useState, useCallback } from 'react';

interface AddActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: ActionFormData) => Promise<void>;
    findingId: string;
}

interface ActionFormData {
    description: string;
    ownerUnit: string;
    ownerId: string;
    dueDate: string;
    status: 'ACIK' | 'KAPALI' | 'ERTELEME';
    postponedDate: string;
    attachments: File[];
}

// Demo data - should come from API
const DEMO_UNITS = [
    { id: 'bt', name: 'Bilgi Teknolojileri' },
    { id: 'is', name: 'İç Sistemler' },
    { id: 'ik', name: 'İnsan Kaynakları' },
    { id: 'fin', name: 'Finans' },
    { id: 'uyum', name: 'Uyum Birimi' },
    { id: 'risk', name: 'Risk Yönetimi' },
    { id: 'operasyon', name: 'Operasyon' },
    { id: 'muhasebe', name: 'Muhasebe' },
];

const DEMO_USERS: Record<string, { id: string; name: string; email: string }[]> = {
    bt: [
        { id: 'usr1', name: 'Ahmet Yılmaz', email: 'ahmet.yilmaz@sirket.com' },
        { id: 'usr2', name: 'Mehmet Kaya', email: 'mehmet.kaya@sirket.com' },
    ],
    is: [
        { id: 'usr3', name: 'Ayşe Demir', email: 'ayse.demir@sirket.com' },
        { id: 'usr4', name: 'Fatma Çelik', email: 'fatma.celik@sirket.com' },
    ],
    ik: [
        { id: 'usr5', name: 'Ali Öztürk', email: 'ali.ozturk@sirket.com' },
    ],
    fin: [
        { id: 'usr6', name: 'Zeynep Arslan', email: 'zeynep.arslan@sirket.com' },
        { id: 'usr7', name: 'Burak Yıldız', email: 'burak.yildiz@sirket.com' },
    ],
    uyum: [
        { id: 'usr8', name: 'Emre Korkmaz', email: 'emre.korkmaz@sirket.com' },
    ],
    risk: [
        { id: 'usr9', name: 'Selin Aydın', email: 'selin.aydin@sirket.com' },
    ],
    operasyon: [
        { id: 'usr10', name: 'Can Şahin', email: 'can.sahin@sirket.com' },
    ],
    muhasebe: [
        { id: 'usr11', name: 'Deniz Güneş', email: 'deniz.gunes@sirket.com' },
    ],
};

const STATUS_OPTIONS = [
    { value: 'ACIK', label: 'Açık' },
    { value: 'KAPALI', label: 'Kapalı' },
    { value: 'ERTELEME', label: 'Erteleme' },
];

const ALLOWED_FILE_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function AddActionModal({ isOpen, onClose, onSubmit, findingId }: AddActionModalProps) {
    const [formData, setFormData] = useState<ActionFormData>({
        description: '',
        ownerUnit: '',
        ownerId: '',
        dueDate: '',
        status: 'ACIK',
        postponedDate: '',
        attachments: [],
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [dragActive, setDragActive] = useState(false);

    const availableUsers = formData.ownerUnit ? DEMO_USERS[formData.ownerUnit] || [] : [];

    const validateForm = useCallback(() => {
        const newErrors: Record<string, string> = {};

        if (!formData.description || formData.description.length < 30) {
            newErrors.description = 'Aksiyon açıklaması en az 30 karakter olmalıdır.';
        }

        if (!formData.ownerUnit) {
            newErrors.ownerUnit = 'Aksiyon sahibi birim seçilmelidir.';
        }

        if (!formData.ownerId) {
            newErrors.ownerId = 'Aksiyon sahibi seçilmelidir.';
        }

        if (!formData.dueDate) {
            newErrors.dueDate = 'Hedeflenen tamamlanma tarihi girilmelidir.';
        } else {
            const selectedDate = new Date(formData.dueDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (selectedDate < today) {
                newErrors.dueDate = 'Geçmiş bir tarih seçilemez.';
            }
        }

        // Validate postponed date if status is ERTELEME
        if (formData.status === 'ERTELEME') {
            if (!formData.postponedDate) {
                newErrors.postponedDate = 'Erteleme durumu için yeni hedef tarih girilmelidir.';
            } else {
                const postponedDate = new Date(formData.postponedDate);
                const dueDate = formData.dueDate ? new Date(formData.dueDate) : new Date();
                if (postponedDate <= dueDate) {
                    newErrors.postponedDate = 'Ertelenmiş tarih, hedef tarihten sonra olmalıdır.';
                }
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [formData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setSubmitting(true);
        try {
            await onSubmit(formData);
            // Reset form
            setFormData({
                description: '',
                ownerUnit: '',
                ownerId: '',
                dueDate: '',
                status: 'ACIK',
                postponedDate: '',
                attachments: [],
            });
            onClose();
        } catch (err) {
            console.error('Failed to create action:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleFileSelect = (files: FileList | null) => {
        if (!files) return;

        const validFiles: File[] = [];
        const newErrors: string[] = [];

        Array.from(files).forEach(file => {
            if (!ALLOWED_FILE_TYPES.includes(file.type)) {
                newErrors.push(`${file.name}: Desteklenmeyen dosya formatı.`);
            } else if (file.size > MAX_FILE_SIZE) {
                newErrors.push(`${file.name}: Maksimum dosya boyutu 10MB.`);
            } else {
                validFiles.push(file);
            }
        });

        if (newErrors.length > 0) {
            setErrors(prev => ({ ...prev, attachments: newErrors.join(' ') }));
        } else {
            setErrors(prev => {
                const { attachments, ...rest } = prev;
                void attachments;
                return rest;
            });
        }

        setFormData(prev => ({
            ...prev,
            attachments: [...prev.attachments, ...validFiles],
        }));
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        handleFileSelect(e.dataTransfer.files);
    };

    const removeFile = (index: number) => {
        setFormData(prev => ({
            ...prev,
            attachments: prev.attachments.filter((_, i) => i !== index),
        }));
    };

    const isFormValid =
        formData.description.length >= 30 &&
        formData.ownerUnit &&
        formData.ownerId &&
        formData.dueDate &&
        new Date(formData.dueDate) >= new Date(new Date().setHours(0, 0, 0, 0)) &&
        (formData.status !== 'ERTELEME' || (formData.postponedDate && new Date(formData.postponedDate) > new Date(formData.dueDate)));

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl transform transition-all">
                    {/* Header */}
                    <div className="px-6 py-5 border-b border-gray-100">
                        <h2 className="text-xl font-semibold text-gray-900">Yeni Aksiyon Ekle</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Bu bulguya ilişkin aksiyon bilgilerini giriniz.
                        </p>
                        <p className="text-xs text-gray-400 mt-2 font-mono">
                            Bulgu: {findingId}
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                        {/* 1. Aksiyon Açıklaması */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Aksiyon Açıklaması <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Yapılacak aksiyonu, kapsamını ve beklenen çıktıyı açıklayınız."
                                rows={4}
                                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none transition-colors ${errors.description ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
                                    }`}
                            />
                            <div className="flex items-center justify-between mt-1.5">
                                {errors.description && (
                                    <p className="text-xs text-red-500">{errors.description}</p>
                                )}
                                <span className={`text-xs ml-auto ${formData.description.length < 30 ? 'text-gray-400' : 'text-green-600'}`}>
                                    {formData.description.length}/30 karakter minimum
                                </span>
                            </div>
                        </div>

                        {/* 2 & 3. Aksiyon Sahibi Birim & Sahibi */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Aksiyon Sahibi Birim <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={formData.ownerUnit}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        ownerUnit: e.target.value,
                                        ownerId: '' // Reset owner when unit changes
                                    }))}
                                    className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 appearance-none bg-no-repeat bg-right pr-10 cursor-pointer transition-colors ${errors.ownerUnit ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
                                        }`}
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                                >
                                    <option value="">Birim seçiniz</option>
                                    {DEMO_UNITS.map(unit => (
                                        <option key={unit.id} value={unit.id}>{unit.name}</option>
                                    ))}
                                </select>
                                {errors.ownerUnit && (
                                    <p className="text-xs text-red-500 mt-1">{errors.ownerUnit}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Aksiyon Sahibi <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={formData.ownerId}
                                    onChange={(e) => setFormData(prev => ({ ...prev, ownerId: e.target.value }))}
                                    disabled={!formData.ownerUnit}
                                    className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 appearance-none bg-no-repeat bg-right pr-10 transition-colors ${!formData.ownerUnit ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'cursor-pointer'
                                        } ${errors.ownerId ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                                >
                                    <option value="">
                                        {formData.ownerUnit ? 'Kişi seçiniz' : 'Önce birim seçiniz'}
                                    </option>
                                    {availableUsers.map(user => (
                                        <option key={user.id} value={user.id}>{user.name}</option>
                                    ))}
                                </select>
                                {errors.ownerId && (
                                    <p className="text-xs text-red-500 mt-1">{errors.ownerId}</p>
                                )}
                            </div>
                        </div>

                        {/* 4 & 5. Hedef Tarih & Durum */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Hedeflenen Tamamlanma Tarihi <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={formData.dueDate}
                                    onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                                    min={new Date().toISOString().split('T')[0]}
                                    className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors ${errors.dueDate ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
                                        }`}
                                />
                                {errors.dueDate && (
                                    <p className="text-xs text-red-500 mt-1">{errors.dueDate}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Aksiyonun Durumu <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as ActionFormData['status'] }))}
                                    className="w-full px-4 py-2.5 border border-gray-200 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 appearance-none bg-no-repeat bg-right pr-10 cursor-pointer transition-colors"
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                                >
                                    {STATUS_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Conditional: Ertelenmiş Aksiyon Tarihi */}
                        {formData.status === 'ERTELEME' && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <label className="block text-sm font-medium text-amber-800 mb-1.5">
                                    Yeni Ertelenmiş Aksiyon Tarihi <span className="text-red-500">*</span>
                                </label>
                                <p className="text-xs text-amber-600 mb-2">
                                    Aksiyonun yeni hedef tamamlanma tarihini giriniz.
                                </p>
                                <input
                                    type="date"
                                    value={formData.postponedDate}
                                    onChange={(e) => setFormData(prev => ({ ...prev, postponedDate: e.target.value }))}
                                    min={formData.dueDate || new Date().toISOString().split('T')[0]}
                                    className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors bg-white ${errors.postponedDate ? 'border-red-300' : 'border-amber-300'
                                        }`}
                                />
                                {errors.postponedDate && (
                                    <p className="text-xs text-red-500 mt-1">{errors.postponedDate}</p>
                                )}
                            </div>
                        )}

                        {/* 6. Kanıt ve Ekler */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Kanıt ve Ekler
                            </label>
                            <div
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${dragActive
                                    ? 'border-amber-400 bg-amber-50'
                                    : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                                    }`}
                            >
                                <svg className="mx-auto h-10 w-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <p className="text-sm text-gray-600 mb-1">
                                    Dosyaları sürükleyip bırakın veya
                                </p>
                                <label className="text-sm text-amber-600 hover:text-amber-700 font-medium cursor-pointer">
                                    dosya seçin
                                    <input
                                        type="file"
                                        multiple
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                                        onChange={(e) => handleFileSelect(e.target.files)}
                                        className="hidden"
                                    />
                                </label>
                                <p className="text-xs text-gray-400 mt-2">
                                    PDF, DOC, DOCX, XLS, XLSX, PNG, JPG (Maks. 10MB)
                                </p>
                            </div>
                            {errors.attachments && (
                                <p className="text-xs text-red-500 mt-1">{errors.attachments}</p>
                            )}

                            {/* Uploaded files list */}
                            {formData.attachments.length > 0 && (
                                <ul className="mt-3 space-y-2">
                                    {formData.attachments.map((file, index) => (
                                        <li key={index} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                                <span className="text-sm text-gray-700 truncate">{file.name}</span>
                                                <span className="text-xs text-gray-400">
                                                    ({(file.size / 1024).toFixed(1)} KB)
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeFile(index)}
                                                className="text-gray-400 hover:text-red-500 p-1"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </form>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50 rounded-b-2xl">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            İptal
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!isFormValid || submitting}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {submitting && (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            )}
                            {submitting ? 'Ekleniyor...' : 'Aksiyon Ekle'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
