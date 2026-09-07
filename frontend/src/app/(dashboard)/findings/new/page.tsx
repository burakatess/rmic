'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface Risk {
    id: string;
    riskId: string;
    name: string;
}

interface Control {
    id: string;
    controlId: string;
    name: string;
    linkedRisks?: Risk[];
}

interface Directorate {
    id: string;
    name: string;
}

interface UserOption {
    id: string;
    firstName: string;
    lastName: string;
}

export default function NewFindingPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [risks, setRisks] = useState<Risk[]>([]);
    const [controls, setControls] = useState<Control[]>([]);
    const [directorates, setDirectorates] = useState<Directorate[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);

    const departmentOptions = [
        { value: 'IT', label: 'Bilgi Teknolojileri' },
        { value: 'HR', label: 'İnsan Kaynakları' },
        { value: 'FINANCE', label: 'Finans' },
        { value: 'OPERATIONS', label: 'Operasyon' },
        { value: 'LEGAL', label: 'Hukuk' },
        { value: 'COMPLIANCE', label: 'Uyum' },
    ];

    const personOptions = [
        { value: 'Ahmet Yılmaz', label: 'Ahmet Yılmaz' },
        { value: 'Mehmet Demir', label: 'Mehmet Demir' },
        { value: 'Ayşe Kaya', label: 'Ayşe Kaya' },
        { value: 'Fatma Çelik', label: 'Fatma Çelik' },
    ];

    const [formData, setFormData] = useState({
        description: '',
        impact: '',
        severity: '',
        riskId: '',
        controlId: '',
        isRecurrent: false,
        source: 'INTERNAL_AUDIT',
        affectedSystem: '',
        recommendation: '',
        targetResolutionDate: '',
        relatedDepartment: '',
        responsiblePerson: '',
        gmy: '',
        iletisimKisisi: '',
    });



    useEffect(() => {
        loadFormData();
    }, []);

    const loadFormData = async () => {
        try {
            // Fetch controls with their linked risks
            const controlsData = await api.getControls() as any;
            const controlList = Array.isArray(controlsData) ? controlsData : (controlsData?.data || []);

            // Transform controls with linked risks
            const transformedControls = controlList.map((c: any) => {
                const linkedRisks = (c.risks || []).map((rm: any) => ({
                    id: String(rm.risk?.id || rm.riskId || ''),
                    riskId: String(rm.risk?.riskId || ''),
                    name: String(rm.risk?.name || ''),
                }));

                return {
                    id: String(c.id),
                    controlId: String(c.controlId || ''),
                    name: String(c.name || ''),
                    linkedRisks,
                };
            });

            setControls(transformedControls);
        } catch (error) {
            console.error('Failed to load form data:', error);
            // Fallback to demo data
            setControls([
                { id: '1', controlId: 'C-2024-0001', name: 'Güvenlik Duvarı Yönetimi', linkedRisks: [] },
                { id: '2', controlId: 'C-2024-0002', name: 'Erişim Yetkilendirme Kontrolü', linkedRisks: [] },
            ]);
        }

        try {
            const directorateData = await api.getDirectorates({ isActive: 'true' }) as any;
            const directorateList = Array.isArray(directorateData) ? directorateData : (directorateData?.data || []);
            setDirectorates(directorateList.map((d: any) => ({ id: String(d.id), name: String(d.name || '') })));
        } catch (error) {
            console.error('Failed to load directorates:', error);
        }

        try {
            const userData = await api.getUsers() as any;
            const userList = Array.isArray(userData) ? userData : (userData?.data || []);
            setUsers(userList.map((u: any) => ({ id: String(u.id), firstName: String(u.firstName || ''), lastName: String(u.lastName || '') })));
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload = {
                ...formData,
                targetResolutionDate: formData.targetResolutionDate || undefined,
            };
            await api.createFinding(payload);
            router.push('/findings');
        } catch (error) {
            console.error('Failed to create finding:', error);
            alert('Bulgu oluşturulurken bir hata oluştu');
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
                <h1 className="text-2xl font-bold text-gray-900">Yeni Bulgu Oluştur</h1>
                <p className="text-gray-500 mt-1">Denetim veya kontrol testinden elde edilen bulguyu kaydedin</p>
            </div>

            {/* Info Alert */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
                <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                    <p className="font-medium text-blue-800">Bilgi</p>
                    <p className="text-sm text-blue-700 mt-1">
                        Bulgu, risk veya kontrol testlerinden bağımsız da olabilir.
                        Varsa ilgili Kayıtları seçiniz.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Control Selection - Required */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Kontrol Bağlantısı</h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                İlişkili Kontrol <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                value={formData.controlId}
                                onChange={(e) => setFormData({ ...formData, controlId: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                            >
                                <option value="">Kontrol seçin</option>
                                {controls.map((control) => (
                                    <option key={control.id} value={control.id}>
                                        {control.controlId} - {control.name}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1.5">
                                Bulgu, seçilen kontrol üzerinden ilgili risklerle otomatik eşleşir
                            </p>
                        </div>

                        {/* Show Linked Risks */}
                        {formData.controlId && (() => {
                            const selectedControl = controls.find(c => c.id === formData.controlId);
                            const linkedRisks = selectedControl?.linkedRisks || [];

                            return linkedRisks.length > 0 ? (
                                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                    <p className="text-sm font-medium text-green-800 mb-2">
                                        ✅ İlişkili Riskler ({linkedRisks.length})
                                    </p>
                                    <div className="space-y-2">
                                        {linkedRisks.map((risk) => (
                                            <div key={risk.id} className="flex items-center gap-2 text-sm text-green-700">
                                                <span className="font-mono bg-green-100 px-2 py-0.5 rounded">
                                                    {risk.riskId}
                                                </span>
                                                <span>{risk.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-green-600 mt-2">
                                        Bu bulgu, yukarıdaki risklerle otomatik olarak ilişkilendirilecektir
                                    </p>
                                </div>
                            ) : (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <p className="text-sm text-amber-700">
                                        ⚠️ Seçilen kontrole bağlı risk bulunmamaktadır.
                                        Kontrol-Risk eşleştirmesi yapılması önerilir.
                                    </p>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Finding Details */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Bulgu Detayları</h2>

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Bulgu Kaynağı
                                </label>
                                <select
                                    value={formData.source}
                                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                                >
                                    <option value="INTERNAL_AUDIT">İç Denetim</option>
                                    <option value="EXTERNAL_AUDIT">Dış Denetim</option>
                                    <option value="CONTROL_TEST">Kontrol Testi</option>
                                    <option value="INCIDENT">Olay</option>
                                    <option value="SELF_ASSESSMENT">Öz Değerlendirme</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Etkilenen Sistem / Süreç
                                </label>
                                <input
                                    type="text"
                                    value={formData.affectedSystem}
                                    onChange={(e) => setFormData({ ...formData, affectedSystem: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    placeholder="Örn: ERP Sistemi, İK Süreci..."
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">İlgili Direktörlük</label>
                                <select
                                    value={formData.relatedDepartment}
                                    onChange={(e) => setFormData({ ...formData, relatedDepartment: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                                >
                                    <option value="">Seçiniz</option>
                                    {departmentOptions.map(opt => (
                                        <option key={opt.value} value={opt.label}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sorumlu Kişi</label>
                                <select
                                    value={formData.responsiblePerson}
                                    onChange={(e) => setFormData({ ...formData, responsiblePerson: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                                >
                                    <option value="">Seçiniz</option>
                                    {personOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">İlgili GMY</label>
                                <select
                                    value={formData.gmy}
                                    onChange={(e) => setFormData({ ...formData, gmy: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                                >
                                    <option value="">Seçiniz</option>
                                    {directorates.map(d => (
                                        <option key={d.id} value={d.name}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">İletişim Kişisi</label>
                                <select
                                    value={formData.iletisimKisisi}
                                    onChange={(e) => setFormData({ ...formData, iletisimKisisi: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                                >
                                    <option value="">Seçiniz</option>
                                    {users.map(u => (
                                        <option key={u.id} value={`${u.firstName} ${u.lastName}`.trim()}>{`${u.firstName} ${u.lastName}`.trim()}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Bulgu Açıklaması <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                required
                                rows={3}
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                                placeholder="Tespit edilen eksiklik veya uygunsuzluğu açıklayın..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Potansiyel Etki <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                required
                                rows={2}
                                value={formData.impact}
                                onChange={(e) => setFormData({ ...formData, impact: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                                placeholder="Bu bulgunun düzeltilmemesi halinde oluşabilecek etkileri belirtin..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Öneri
                            </label>
                            <textarea
                                rows={2}
                                value={formData.recommendation}
                                onChange={(e) => setFormData({ ...formData, recommendation: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                                placeholder="Bulgunun giderilmesi için önerilen aksiyon..."
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Hedef Kapanış Tarihi
                                </label>
                                <input
                                    type="date"
                                    value={formData.targetResolutionDate}
                                    onChange={(e) => setFormData({ ...formData, targetResolutionDate: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                />
                            </div>

                            <div className="flex items-center mt-6">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.isRecurrent}
                                        onChange={(e) => setFormData({ ...formData, isRecurrent: e.target.checked })}
                                        className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                    />
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Tekrarlayan Bulgu</span>
                                        <p className="text-xs text-gray-500">Daha önce de tespit edilen bir bulgu</p>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Ciddiyet <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                                {[
                                    { value: 'LOW', label: 'Düşük', color: 'border-green-500 bg-green-50 text-green-700' },
                                    { value: 'MEDIUM', label: 'Orta', color: 'border-yellow-500 bg-yellow-50 text-yellow-700' },
                                    { value: 'HIGH', label: 'Yüksek', color: 'border-orange-500 bg-orange-50 text-orange-700' },
                                    { value: 'CRITICAL', label: 'Kritik', color: 'border-red-500 bg-red-50 text-red-700' },
                                ].map((severity) => (
                                    <button
                                        key={severity.value}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, severity: severity.value })}
                                        className={`flex-1 px-3 py-2.5 rounded-xl border-2 font-medium text-sm transition-all ${formData.severity === severity.value
                                            ? severity.color
                                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                            }`}
                                    >
                                        {severity.label}
                                    </button>
                                ))}
                            </div>
                        </div>
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
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Oluşturuluyor...' : 'Bulgu Oluştur'}
                    </button>
                </div>
            </form>
        </div>
    );
}
