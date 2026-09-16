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

interface Directorate {
    id: string;
    name: string;
    isActive: boolean;
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

export default function NewControlPage() {
    const router = useRouter();
    const { success: toastSuccess, error: toastError } = useToast();
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
    const [directorates, setDirectorates] = useState<Directorate[]>([]);

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
        directorateId: '',
        contactPersonId: '',
        frequency: 'MONTHLY',
        dueDate: '',
        status: 'ACTIVE',
        notes: '',
        attachment: null as File | null,
    });

    const [summaryError, setSummaryError] = useState('');

    useEffect(() => {
        loadUsers();
        api.getDirectorates({ isActive: 'true' }).then(setDirectorates).catch(() => { });
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

    // Gerçek kontrol kodu formatı backend'in generateControlId()'sinin ürettiği
    // "K-YYYY-NNNN" — frekanstan bağımsız (controls.service.ts'e bakınız).
    const validateNaming = (summary: string) => {
        if (!summary) return 'Kontrol Kodu zorunludur.';
        const regex = /^K-20\d{2}-\d+$/;
        if (!regex.test(summary)) {
            return 'Kontrol kodu "K-YYYY-NNNN" formatında olmalıdır. Örn: K-2026-0001';
        }
        return '';
    };

    const handleSummaryChange = (val: string) => {
        setFormData(prev => ({ ...prev, summary: val }));
        setSummaryError(validateNaming(val));
    };

    const handleFrequencyChange = (val: string) => {
        setFormData(prev => ({ ...prev, frequency: val }));
    };

    const handleSave = async (isDraft: boolean) => {
        const err = validateNaming(formData.summary);
        if (err) {
            setSummaryError(err);
            toastError('Hata', 'Lütfen kontrol kodu formatını düzeltin.');
            return;
        }

        if (!formData.directorateId) {
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
                directorateId: formData.directorateId,
                frequency: formData.frequency,
                // Not: "dueDate" (pasife alınacağı tarih) alanının backend karşılığı yok — göndermiyoruz.
                // Uygulama ayı/yıllık kapsam artık burada seçilmiyor — Kontrol
                // Yönetimi → Yıllık Plan'dan yönetiliyor (Madde 10).
                notes: formData.notes,
                isActive: formData.status === 'ACTIVE',
                // ownerId artık kaydı oluşturan kişiyle backend'de sabitlenir, buradan
                // gönderilmez. Atanan Kontrolcü/İkinci Kontrolcü Yıllık Plan'da seçilir.
                contactPersonId: formData.contactPersonId || null,
                status: isDraft ? 'DRAFT' : 'ACTIVE'
            });

            toastSuccess('Başarılı', isDraft ? 'Taslak başarıyla kaydedildi.' : 'Kontrol başarıyla oluşturuldu. Yıllık kapsama almak için Yıllık Plan sayfasını kullanın.');
            router.push('/controls');
        } catch (error) {
            console.error('Failed to create control:', error);
            toastError('Hata', error instanceof Error ? error.message : 'Kontrol kaydedilirken bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

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
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Kontrol Kodu <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.summary}
                                        onChange={(e) => handleSummaryChange(e.target.value)}
                                        className={`w-full px-4 py-2.5 border rounded-xl outline-none focus:ring-2 transition-all text-sm font-semibold ${summaryError ? 'border-rose-300 focus:ring-rose-500/10 focus:border-rose-500' : 'border-slate-200 focus:ring-blue-500/10 focus:border-blue-500'}`}
                                        placeholder="K-2026-0001"
                                    />
                                    {summaryError && <p className="text-xs font-semibold text-rose-600 mt-1.5 flex items-center gap-1">❌ {summaryError}</p>}
                                    <p className="text-[10px] text-slate-400 mt-1">Format: K-YYYY-NNNN</p>
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

                                <div className="col-span-2">
                                    <p className="text-[11px] text-slate-400 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5">
                                        Uygulama ayı/takvimi ve yıllık kapsam artık burada seçilmiyor — kontrolü oluşturduktan sonra{' '}
                                        <span className="font-semibold text-slate-500">Kontrol Yönetimi → Yıllık Plan</span> sayfasından planlayın.
                                    </p>
                                </div>

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
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">İlgili Direktörlük <span className="text-red-500">*</span></label>
                                    <select
                                        required
                                        value={formData.directorateId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, directorateId: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-semibold"
                                    >
                                        <option value="">Direktörlük Seçin</option>
                                        {directorates.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
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
                            </div>
                            <p className="text-xs text-slate-400 mt-3">
                                Atanan Kontrolcü ve İkinci Kontrolcü artık burada seçilmez — bu atamalar yıldan
                                yıla değişebildiği için Kontrol Yönetimi → Yıllık Plan → Kontrolcü Atamaları
                                sekmesinden, yıl bazında yapılır.
                            </p>
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
                                    <p className="text-[11px] text-slate-400 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5">
                                        Kapsam yılı seçimi kaldırıldı — kontrolü oluşturduktan sonra <Link href="/controls/annual-plan" className="text-emerald-600 hover:underline font-semibold">Yıllık Plan</Link> sayfasından yıllık kapsama alın.
                                    </p>
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
