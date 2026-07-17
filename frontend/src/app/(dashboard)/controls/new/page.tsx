'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    department?: string;
}

const FREQUENCIES = [
    { value: 'DAILY', label: 'Günlük' },
    { value: 'WEEKLY', label: 'Haftalık' },
    { value: 'MONTHLY', label: 'Aylık' },
    { value: 'QUARTERLY', label: '3 Aylık' },
    { value: 'SEMI_ANNUAL', label: '6 Aylık' },
    { value: 'ANNUAL', label: 'Yıllık' },
    { value: 'AD_HOC', label: 'Arızi' },
];

const GMY_LIST = ['GM', 'GMY1', 'GMY2', 'GMY3', 'GMY4', 'GMY5', 'GMY6', 'GMY7'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DIRECTORATES = ['BT Ağ Yönetimi', 'Bilgi Güvenliği', 'Altyapı', 'Uygulama Geliştirme', 'Operasyon', 'İç Kontrol', 'Risk Yönetimi'];

export default function NewControlPage() {
    const router = useRouter();
    const { success: toastSuccess, error: toastError } = useToast();
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState<User[]>([]);

    // Collapsible cards state
    const [collapsed, setCollapsed] = useState({
        info: false,
        org: false,
        planning: false,
        attachment: false
    });

    const [formData, setFormData] = useState({
        summary: '',
        description: '',
        mehaz: '',
        testSteps: '',
        gmy: '',
        directorate: '',
        contactPersonId: '',
        assigneeId: '',
        secondControllerId: '',
        frequency: 'MONTHLY',
        months: [] as string[],
        dueDate: '',
        status: 'ACTIVE',
        notes: '',
        attachment: null as File | null,
    });

    const [summaryError, setSummaryError] = useState('');

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const data = await api.getUsers();
            if (Array.isArray(data)) {
                setUsers(data);
            }
        } catch {
            // Yetki yoksa boş liste — mock data kullanılmaz
        }
    };

    const validateNaming = (summary: string, frequency: string) => {
        if (!summary) return 'Kontrol Summary / Kodu zorunludur.';

        if (frequency === 'AD_HOC') {
            const parts = summary.split('-');
            if (parts.length !== 3 || !MONTHS.includes(parts[0]) || parts[1] !== 'Arızi' || isNaN(Number(parts[2]))) {
                return 'Arızi kontrol ismi "AyAdı-Arızi-N" formatında olmalıdır. Örn: Şubat-Arızi-1';
            }
        } else {
            const regex = /^20\d{2}\.(KBT|KİB)-\d+$/;
            if (!regex.test(summary)) {
                return 'Periyodik kontrol kodu "YYYY.KBT-XX" veya "YYYY.KİB-XX" formatında olmalıdır. Örn: 2026.KBT-01';
            }
        }
        return '';
    };

    const handleSummaryChange = (val: string) => {
        setFormData(prev => ({ ...prev, summary: val }));
        setSummaryError(validateNaming(val, formData.frequency));
    };

    const handleFrequencyChange = (val: string) => {
        setFormData(prev => {
            const newMonths = ['DAILY', 'WEEKLY', 'MONTHLY'].includes(val) ? [] : prev.months;
            return { ...prev, frequency: val, months: newMonths };
        });
        if (formData.summary) {
            setSummaryError(validateNaming(formData.summary, val));
        }
    };

    const toggleMonth = (month: string) => {
        const currentMonths = formData.months || [];
        const hasMonth = currentMonths.includes(month);

        if (!hasMonth) {
            if (formData.frequency === 'ANNUAL' && currentMonths.length >= 1) {
                toastError('Limit Aşımı', 'Yıllık kontrol için en fazla 1 ay seçilebilir.');
                return;
            }
            if (formData.frequency === 'SEMI_ANNUAL' && currentMonths.length >= 2) {
                toastError('Limit Aşımı', '6 Aylık kontrol için en fazla 2 ay seçilebilir.');
                return;
            }
            if (formData.frequency === 'QUARTERLY' && currentMonths.length >= 4) {
                toastError('Limit Aşımı', '3 Aylık kontrol için en fazla 4 ay seçilebilir.');
                return;
            }
            if (formData.frequency === 'AD_HOC') {
                setFormData(prev => ({ ...prev, months: [month] }));
                return;
            }
        }

        setFormData(prev => {
            const m = new Set(prev.months);
            if (m.has(month)) {
                m.delete(month);
            } else {
                m.add(month);
            }
            return { ...prev, months: Array.from(m) };
        });
    };

    const handleSave = async (isDraft: boolean) => {
        const err = validateNaming(formData.summary, formData.frequency);
        if (err) {
            setSummaryError(err);
            toastError('Hata', 'Lütfen kontrol kodu formatını düzeltin.');
            return;
        }

        if (!formData.directorate) {
            toastError('Eksik Alan', 'Lütfen ilgili direktörlüğü seçin.');
            return;
        }

        setLoading(true);

        try {
            await api.createControl({
                controlId: formData.summary,
                name: formData.summary,
                description: formData.description,
                mehaz: formData.mehaz,
                testSteps: formData.testSteps,
                gmy: formData.gmy,
                directorate: formData.directorate,
                frequency: formData.frequency,
                months: formData.months,
                // Not: "dueDate" (pasife alınacağı tarih) alanının backend karşılığı yok — göndermiyoruz.
                notes: formData.notes,
                isActive: formData.status === 'ACTIVE',
                ownerId: formData.assigneeId || null,
                testPerformerId: formData.contactPersonId || null,
                reviewerId: formData.secondControllerId || null,
                status: isDraft ? 'DRAFT' : 'ACTIVE'
            });

            toastSuccess('Başarılı', isDraft ? 'Taslak başarıyla kaydedildi.' : 'Kontrol başarıyla oluşturuldu.');
            router.push('/controls');
        } catch (error) {
            console.error('Failed to create control:', error);
            toastError('Hata', error instanceof Error ? error.message : 'Kontrol kaydedilirken bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const showMonths = ['QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'AD_HOC'].includes(formData.frequency);
    const isArizi = formData.frequency === 'AD_HOC';

    return (
        <div className="min-h-screen bg-slate-50/50 max-w-5xl mx-auto py-8 px-4 pb-24 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                <Link href="/controls" className="hover:text-blue-600 transition-colors">Kontrol Envanteri</Link>
                <span>/</span>
                <span className="text-slate-900 font-medium">Yeni Kontrol</span>
            </div>

            <div className="flex justify-between items-start border-b border-slate-200 pb-5">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Yeni Kontrol Faaliyeti Tanımla</h1>
                    <p className="text-sm text-slate-500 mt-1">İç kontrol standartlarına ve mevzuata uygun olarak yeni bir master kontrol kaydı oluşturun.</p>
                </div>
            </div>

            {/* Form Fields wrapped in Premium Collapsible Cards */}
            <div className="space-y-6">
                
                {/* SECTION 1: TEMEL KONTROL BİLGİLERİ */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <button
                        onClick={() => setCollapsed(prev => ({ ...prev, info: !prev.info }))}
                        className="w-full flex items-center justify-between p-5 bg-slate-50/60 border-b border-slate-100 text-left"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-xl">📋</span>
                            <div>
                                <h3 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider">BÖLÜM 1: TEMEL KONTROL BİLGİLERİ</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Kontrol kodu, tanımı, mehaz mevzuat ve test adımları</p>
                            </div>
                        </div>
                        <span className="text-slate-400 font-bold">{collapsed.info ? '➕' : '➖'}</span>
                    </button>

                    {!collapsed.info && (
                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Summary (Kontrol No / Başlık) <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.summary}
                                        onChange={(e) => handleSummaryChange(e.target.value)}
                                        className={`w-full px-4 py-2.5 border rounded-xl outline-none focus:ring-2 transition-all text-sm font-semibold ${summaryError ? 'border-rose-300 focus:ring-rose-500/10 focus:border-rose-500' : 'border-slate-200 focus:ring-blue-500/10 focus:border-blue-500'}`}
                                        placeholder={isArizi ? "Şubat-Arızi-1" : "2026.KBT-01"}
                                    />
                                    {summaryError && <p className="text-xs font-semibold text-rose-600 mt-1.5 flex items-center gap-1">❌ {summaryError}</p>}
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        Format: {isArizi ? 'AyAdı-Arızi-N' : 'YYYY.KBT-XX veya YYYY.KİB-XX'}
                                    </p>
                                </div>

                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Periyodik Sıklık <span className="text-red-500">*</span></label>
                                    <select
                                        value={formData.frequency}
                                        onChange={(e) => handleFrequencyChange(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm transition-all font-semibold"
                                    >
                                        {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                    </select>
                                </div>

                                {/* Dynamic Months MultiSelect */}
                                {showMonths && (
                                    <div className="col-span-2">
                                        <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50">
                                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                                                Kontrol Gerçekleştirilecek Ay{isArizi ? ' (Arızi - Sadece Tek Seçim)' : 'lar'} <span className="text-red-500">*</span>
                                            </label>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                                {MONTHS.map(m => {
                                                    const isSelected = formData.months.includes(m);
                                                    return (
                                                        <button
                                                            type="button"
                                                            key={m}
                                                            onClick={() => toggleMonth(m)}
                                                            className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${isSelected
                                                                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10'
                                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                                }`}
                                                        >
                                                            {m}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-3.5">
                                                Seçilen aylar, GRC operasyon çalışma alanında otomatik periyodik test kayıtları (TestRecord) oluşturacaktır.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Description (Kontrol Tanımı)</label>
                                    <textarea
                                        rows={3}
                                        value={formData.description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-sm resize-y"
                                        placeholder="Kontrolün kapsamı ve amacını detaylandırın..."
                                    />
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Mehaz (Mevzuat / Prosedür / Yönetmelik Referansı)</label>
                                    <textarea
                                        rows={2}
                                        value={formData.mehaz}
                                        onChange={(e) => setFormData(prev => ({ ...prev, mehaz: e.target.value }))}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-sm resize-y"
                                        placeholder="Kontrolün dayandığı mevzuat maddesi, madde numarası ve yönetmelik adları..."
                                    />
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Test Adımları ve Kanıt Şartları (Zengin Metin / Markdown Destekli)</label>
                                    <div className="border border-slate-200 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500">
                                        <div className="bg-slate-50 border-b border-slate-150 px-4 py-2 flex items-center gap-3 text-xs text-slate-500 font-semibold select-none">
                                            <span>B</span>
                                            <span className="italic">I</span>
                                            <span className="underline">U</span>
                                            <span>|</span>
                                            <span>List</span>
                                            <span>|</span>
                                            <span>Markdown Editör Modu Aktif</span>
                                        </div>
                                        <textarea
                                            rows={5}
                                            value={formData.testSteps}
                                            onChange={(e) => setFormData(prev => ({ ...prev, testSteps: e.target.value }))}
                                            className="w-full p-4 outline-none text-sm font-mono border-0 bg-slate-50/30 leading-relaxed"
                                            placeholder="1. Test kanıtını ilgili klasörden çekin.&#10;2. LDAP yetkilendirme listesini doğrulayın.&#10;3. Altyapı log kaydını ek olarak yükleyin..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* SECTION 2: ORGANİZASYON VE SORUMLULUK */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <button
                        onClick={() => setCollapsed(prev => ({ ...prev, org: !prev.info }))}
                        className="w-full flex items-center justify-between p-5 bg-slate-50/60 border-b border-slate-100 text-left"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-xl">🏢</span>
                            <div>
                                <h3 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider">BÖLÜM 2: ORGANİZASYON VE SORUMLULUK</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Süreç sahipleri, GMY, direktörlük ve test sorumluları</p>
                            </div>
                        </div>
                        <span className="text-slate-400 font-bold">{collapsed.org ? '➕' : '➖'}</span>
                    </button>

                    {!collapsed.org && (
                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">İlgili Genel Müdür Yardımcılığı</label>
                                    <select
                                        value={formData.gmy}
                                        onChange={(e) => setFormData(prev => ({ ...prev, gmy: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-semibold"
                                    >
                                        <option value="">Genel Müdür Yardımcılığı Seçin</option>
                                        {GMY_LIST.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>

                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">İlgili Direktörlük (LDAP) <span className="text-red-500">*</span></label>
                                    <select
                                        required
                                        value={formData.directorate}
                                        onChange={(e) => setFormData(prev => ({ ...prev, directorate: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-semibold"
                                    >
                                        <option value="">Direktörlük Seçin</option>
                                        {DIRECTORATES.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>

                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">İletişim Kişisi (LDAP Bildirim Alacak Kişi)</label>
                                    <select
                                        value={formData.contactPersonId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, contactPersonId: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-semibold"
                                    >
                                        <option value="">İletişim Kişisi Seçin</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}
                                    </select>
                                </div>

                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Assignee (Kontrolü Gerçekleştirecek Kişi)</label>
                                    <select
                                        value={formData.assigneeId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, assigneeId: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-semibold"
                                    >
                                        <option value="">Kontrol Sahibi Seçin</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.department || 'Genel'})</option>)}
                                    </select>
                                </div>

                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">2. Kontrolcü (İkinci Sorumlu Onaycı)</label>
                                    <select
                                        value={formData.secondControllerId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, secondControllerId: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-semibold"
                                    >
                                        <option value="">2. Kontrolcü Seçin</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* SECTION 3: KONTROL PLANLAMA */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <button
                        onClick={() => setCollapsed(prev => ({ ...prev, planning: !prev.planning }))}
                        className="w-full flex items-center justify-between p-5 bg-slate-50/60 border-b border-slate-100 text-left"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-xl">📅</span>
                            <div>
                                <h3 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider">BÖLÜM 3: KONTROL PLANLAMA</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Sıklık takvimi, aktif/pasif durumu ve bitiş vade tarihi</p>
                            </div>
                        </div>
                        <span className="text-slate-400 font-bold">{collapsed.planning ? '➕' : '➖'}</span>
                    </button>

                    {!collapsed.planning && (
                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Durum <span className="text-red-500">*</span></label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-semibold"
                                    >
                                        <option value="ACTIVE">Aktif (Test Görevi Üretir)</option>
                                        <option value="INACTIVE">Pasif (Test Görevi Durdurulur)</option>
                                    </select>
                                </div>

                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Due Date (Pasife Alınacağı Tarih)</label>
                                    <input
                                        type="date"
                                        value={formData.dueDate}
                                        onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-semibold"
                                    />
                                </div>



                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Kontrolör Ek Notu</label>
                                    <textarea
                                        rows={2}
                                        value={formData.notes}
                                        onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-sm resize-y"
                                        placeholder="Planlama veya icraya yönelik ek notlar..."
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* SECTION 4: İLİŞKİLER VE DOSYALAR */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <button
                        onClick={() => setCollapsed(prev => ({ ...prev, attachment: !prev.attachment }))}
                        className="w-full flex items-center justify-between p-5 bg-slate-50/60 border-b border-slate-100 text-left"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-xl">📎</span>
                            <div>
                                <h3 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider">BÖLÜM 4: İLİŞKİLER VE DOSYALAR</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Kanıt belgeleri, kontrol metodolojisi dosyaları</p>
                            </div>
                        </div>
                        <span className="text-slate-400 font-bold">{collapsed.attachment ? '➕' : '➖'}</span>
                    </button>

                    {!collapsed.attachment && (
                        <div className="p-6">
                            <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-8 flex flex-col items-center justify-center bg-slate-50/30 transition-colors group cursor-pointer relative">
                                <input
                                    type="file"
                                    onChange={(e) => setFormData(prev => ({ ...prev, attachment: e.target.files?.[0] || null }))}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <span className="text-3xl block mb-2 group-hover:scale-110 transition-transform">📁</span>
                                <p className="text-sm font-bold text-slate-700 group-hover:text-blue-600 transition-colors">
                                    {formData.attachment ? formData.attachment.name : 'Dosya seçin veya sürükleyin'}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">Audit kanıtları, destek dokümanları veya kontrol dosyaları (.pdf, .xlsx, .docx)</p>
                            </div>
                        </div>
                    )}
                </div>

            </div>

            {/* STICKY FOOTER BUTTONS */}
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-md border-t border-slate-200/80 px-6 py-4 shadow-lg flex items-center justify-end gap-3.5 max-w-5xl mx-auto rounded-t-3xl">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-6 py-2.5 text-xs font-extrabold text-slate-600 hover:text-slate-800 uppercase tracking-wider transition-colors"
                >
                    İptal
                </button>
                <button
                    type="button"
                    disabled={loading || !!summaryError}
                    onClick={() => handleSave(true)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                    Taslak Kaydet
                </button>
                <button
                    type="button"
                    disabled={loading || !!summaryError}
                    onClick={() => handleSave(false)}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
            </div>
        </div>
    );
}
