'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
const FREQUENCY_LABELS: Record<string, string> = Object.fromEntries(FREQUENCIES.map(f => [f.value, f.label]));

const GMY_LIST = ['GM', 'GMY1', 'GMY2', 'GMY3', 'GMY4', 'GMY5', 'GMY6', 'GMY7'];

export default function ControlEditPage() {
    const params = useParams();
    const router = useRouter();
    const { success: toastSuccess, error: toastError } = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
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
        notes: '',
        attachment: null as File | null,
    });

    const [summaryError, setSummaryError] = useState('');
    // Salt-okunur özet — düzenleme burada yapılmıyor, yalnızca gösteriliyor (Madde 10).
    const [scopeYears, setScopeYears] = useState<number[]>([]);
    const [displayStatus, setDisplayStatus] = useState<'AKTIF' | 'PASIF'>('PASIF');
    const [versionImpact, setVersionImpact] = useState<any>(null);
    const [versionDecisions, setVersionDecisions] = useState<Record<number, string>>({});
    const [applyingVersion, setApplyingVersion] = useState(false);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                let loadedUsers: User[] = [];
                try {
                    const data = await api.getUsers();
                    if (Array.isArray(data)) {
                        loadedUsers = data;
                        setUsers(data);
                    }
                } catch {
                    loadedUsers = [];
                    setUsers(loadedUsers);
                }

                try {
                    const dirs = await api.getDirectorates({ isActive: 'true' });
                    if (Array.isArray(dirs)) setDirectorates(dirs);
                } catch {
                    // Boş liste — kullanıcı mevcut değeri değiştiremez ama kayıt bozulmaz.
                }

                const cData = await api.getControl(params.id as string) as Record<string, any>;
                if (cData) {
                    setFormData({
                        summary: cData.controlId || '',
                        description: cData.description || '',
                        mehaz: cData.mehaz || '',
                        testSteps: cData.testSteps || '',
                        gmy: cData.gmy || '',
                        directorateId: cData.directorateId || '',
                        frequency: cData.frequency || 'MONTHLY',
                        contactPersonId: cData.contactPersonId || '',
                        notes: cData.notes || '',
                        attachment: null
                    });
                    setScopeYears(Array.isArray(cData.scopeYears) ? cData.scopeYears : []);
                    setDisplayStatus(cData.displayStatus === 'AKTIF' ? 'AKTIF' : 'PASIF');
                }
            } catch (error) {
                console.error('Failed to load control edit data:', error);
                toastError('Hata', 'Kontrol bilgileri yüklenemedi.');
            } finally {
                setLoading(false);
            }
        };

        if (params.id) {
            loadInitialData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.id]);

    // Gerçek kontrol kodu formatı backend'in generateControlCode()'unun ürettiği
    // "BTK.XXXX" (nokta ayıracı, tire yok — control-code.util.ts). Eski
    // "K-YYYY-NNNN" kayıtları da hâlâ geçerli kabul edilir (geçiş tamamlanana
    // kadar iki format bir arada var olabilir — bkz. migrate-btk-codes.ts).
    const validateNaming = (summary: string) => {
        if (!summary) return 'Kontrol Kodu zorunludur.';
        const btkRegex = /^BTK\.\d{4,}$/;
        const legacyRegex = /^K-20\d{2}-\d+$/;
        if (!btkRegex.test(summary) && !legacyRegex.test(summary)) {
            return 'Kontrol kodu "BTK.XXXX" formatında olmalıdır. Örn: BTK.0001';
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

        setSaving(true);

        try {
            const payload: Record<string, unknown> = {
                controlId: formData.summary,
                description: formData.description,
                mehaz: formData.mehaz,
                testSteps: formData.testSteps,
                gmy: formData.gmy,
                directorateId: formData.directorateId,
                frequency: formData.frequency,
                notes: formData.notes,
            };
            // ownerId/testPerformerId/secondControllerId artık ana kontrolden yazılamaz
            // (bkz. backend dto/control.dto.ts) — Atanan Kontrolcü/İkinci Kontrolcü
            // Yıllık Plan'da, yıl bazında atanır.
            if (formData.contactPersonId) payload.contactPersonId = formData.contactPersonId;

            await api.updateControl(params.id as string, payload);

            toastSuccess('Başarılı', 'Kontrol başarıyla güncellendi.');
            try {
                const impact = await api.previewControlVersionImpact(params.id as string);
                if (impact.outdatedPeriodCount > 0) {
                    setVersionImpact(impact);
                    setVersionDecisions(Object.fromEntries(impact.periods.filter((p: any) => p.outdated).map((p: any) => [p.year, p.recommendedAction])));
                    return;
                }
            } catch {
                toastError('Etki analizi alınamadı', 'Kontrol kaydedildi; dönem sürümü kararını Dönem Kontrolü ekranından daha sonra verebilirsiniz.');
            }
            router.push(`/controls/${params.id}`);
            router.refresh();
        } catch (error) {
            console.error('Failed to update control:', error);
            toastError('Hata', error instanceof Error ? error.message : 'Güncelleme sırasında bir hata oluştu.');
        } finally {
            setSaving(false);
        }
    };

    const applyVersionImpact = async () => {
        if (!versionImpact) return;
        setApplyingVersion(true);
        try {
            const decisions = versionImpact.periods.filter((p: any) => p.outdated).map((p: any) => ({ year: p.year, action: versionDecisions[p.year] || 'KEEP_CURRENT' }));
            await api.applyControlVersionImpact(params.id as string, versionImpact.control.version, decisions);
            toastSuccess('Sürüm kararları uygulandı', 'Seçilen Dönem Kontrolleri güncellendi; final görevler korundu.');
            router.push(`/controls/${params.id}`);
            router.refresh();
        } catch (error) {
            toastError('Hata', error instanceof Error ? error.message : 'Sürüm kararları uygulanamadı.');
        } finally { setApplyingVersion(false); }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50/50 max-w-5xl mx-auto py-8 px-4 pb-24 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                <Link href="/controls" className="hover:text-blue-600 transition-colors">Kontrol Envanteri</Link>
                <span>/</span>
                <Link href={`/controls/${params.id}`} className="hover:text-blue-600 transition-colors">{formData.summary}</Link>
                <span>/</span>
                <span className="text-slate-900 font-medium">Düzenle</span>
            </div>

            <div className="flex justify-between items-start border-b border-slate-200 pb-5">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Kontrol Faaliyetini Düzenle</h1>
                    <p className="text-sm text-slate-500 mt-1">Kontrol bilgilerini ve LDAP sorumluluk atamalarını güncelleyin. Yıllık takvim/kapsam Yıllık Plan'da yönetilir.</p>
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
                                        placeholder="BTK.0001"
                                    />
                                    {summaryError && <p className="text-xs font-semibold text-rose-600 mt-1.5 flex items-center gap-1">❌ {summaryError}</p>}
                                    <p className="text-[10px] text-slate-400 mt-1">Format: BTK.XXXX (eski K-YYYY-NNNN kayıtları da geçerli)</p>
                                </div>

                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Varsayılan Sıklık <span className="text-red-500">*</span></label>
                                    <select
                                        value={formData.frequency}
                                        onChange={(e) => handleFrequencyChange(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm transition-all font-semibold"
                                    >
                                        {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                    </select>
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        Bu, kontrol yeni bir yıl kapsamına alınırken kullanılacak varsayımdır — mevcut yılların uygulanmış takvimini DEĞİŞTİRMEZ.
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
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Test Adımları ve Kanıt Şartları</label>
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

                {/* SECTION 3: KONTROL PLANLAMA (salt-okunur özet — düzenleme Yıllık Plan'da) */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <button
                        onClick={() => setCollapsed(prev => ({ ...prev, planning: !prev.planning }))}
                        className="w-full flex items-center justify-between p-5 bg-slate-50/60 border-b border-slate-100 text-left"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-xl">📅</span>
                            <div>
                                <h3 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider">BÖLÜM 3: KONTROL PLANLAMA</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Durum, kapsam yılları (salt okunur) ve ek not</p>
                            </div>
                        </div>
                        <span className="text-slate-400 font-bold">{collapsed.planning ? '➕' : '➖'}</span>
                    </button>

                    {!collapsed.planning && (
                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Durum</label>
                                    <div className={`w-full px-4 py-2.5 border rounded-xl text-sm font-semibold ${displayStatus === 'AKTIF' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`} aria-label="Kontrol durumu">
                                        {displayStatus === 'AKTIF' ? 'Aktif' : 'Pasif'}
                                    </div>
                                    <p className="mt-1.5 text-[11px] text-slate-400">Durum, mevcut yılın aktif Yıllık Plan kapsamından otomatik hesaplanır ve bu ekrandan değiştirilemez.</p>
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Yıllık Kapsam ve Takvim</label>
                                    <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50">
                                        {scopeYears.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                {scopeYears.map(y => (
                                                    <span key={y} className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">{y} — kapsamda</span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-500 mb-2">Bu kontrol henüz hiçbir yılın kapsamına alınmamış.</p>
                                        )}
                                        <p className="text-[10px] text-slate-400">
                                            Varsayılan sıklık: <span className="font-semibold text-slate-500">{FREQUENCY_LABELS[formData.frequency] || formData.frequency}</span>.
                                            Uygulama ayı/takvim ve yıllık kapsam artık bu ekrandan değil, {' '}
                                            <Link href={`/controls/annual-plan?controlId=${params.id}`} className="text-emerald-600 hover:underline font-semibold">Yıllık Plan</Link>{' '}
                                            sayfasından yönetiliyor.
                                        </p>
                                    </div>
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
                <Link
                    href={`/controls/${params.id}`}
                    className="px-6 py-2.5 text-xs font-extrabold text-slate-600 hover:text-slate-800 uppercase tracking-wider transition-colors"
                >
                    İptal
                </Link>
                <button
                    type="button"
                    disabled={saving || !!summaryError}
                    onClick={() => handleSave(true)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                    Taslak Kaydet
                </button>
                <button
                    type="button"
                    disabled={saving || !!summaryError}
                    onClick={() => handleSave(false)}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                </button>
            </div>

            {versionImpact && (
                <div className="fixed inset-0 z-[70] bg-slate-950/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6">
                        <h2 className="text-lg font-extrabold text-slate-900">Kontrol Sürümü Etki Analizi</h2>
                        <p className="text-sm text-slate-500 mt-1">Ana Kontrol sürüm {versionImpact.control.version} olarak kaydedildi. Geçmiş dönemler sessizce değiştirilmedi.</p>
                        <div className="mt-5 space-y-3">
                            {versionImpact.periods.filter((p: any) => p.outdated).map((period: any) => (
                                <div key={period.year} className="border border-slate-200 rounded-xl p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <p className="font-bold text-slate-800">{period.year} Dönem Kontrolü · v{period.fromVersion} → v{period.toVersion}</p>
                                            <p className="text-xs text-slate-500 mt-1">{period.notStartedTasks.length} başlamamış · {period.ongoingTasks.length} devam eden/onay bekleyen · {period.finalTasks.length} final görev</p>
                                        </div>
                                        <select value={versionDecisions[period.year] || 'KEEP_CURRENT'} onChange={e => setVersionDecisions(prev => ({ ...prev, [period.year]: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                                            <option value="KEEP_CURRENT">Mevcut sürümü koru</option>
                                            <option value="APPLY_TO_NOT_STARTED" disabled={period.ongoingTasks.length > 0}>Yeni sürümü uygula</option>
                                            {period.ongoingTasks.length > 0 && <option value="APPLY_WITH_CONFIRMATION">Devam edenleri bilerek uygula</option>}
                                        </select>
                                    </div>
                                    {period.finalTasks.length > 0 && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2 mt-3">Final görevlerin sonuç ve kanıt içerikleri her durumda korunur.</p>}
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                            <button onClick={() => router.push(`/controls/${params.id}`)} className="px-4 py-2 text-sm font-semibold text-slate-600">Şimdilik Koru</button>
                            <button onClick={applyVersionImpact} disabled={applyingVersion} className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">{applyingVersion ? 'Uygulanıyor...' : 'Kararları Uygula'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
