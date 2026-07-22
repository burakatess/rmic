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

interface Control {
    id: string;
    controlId: string;
    name: string;
    gmy?: string;
    directorate?: string;
    owner?: { id: string; firstName?: string; lastName?: string; department?: string };
}

interface Directorate {
    id: string;
    name: string;
}

const findingTypeOptions = [
    { value: 'CONTROL_DEFICIENCY', label: 'Kontrol Eksikliği' },
    { value: 'PROCESS_GAP', label: 'Süreç Açığı' },
    { value: 'COMPLIANCE_ISSUE', label: 'Uyum Sorunu' },
    { value: 'DOCUMENTATION', label: 'Dokümantasyon' },
    { value: 'IT_SECURITY', label: 'BT Güvenliği' },
    { value: 'OPERATIONAL', label: 'Operasyonel' },
];

// İş kuralı: bulgunun durumu yalnızca bu 3 seçenekten biri olabilir.
const statusOptions = [
    { value: 'IN_PROGRESS', label: 'Devam Ediyor' },
    { value: 'PARTIALLY_CLOSED', label: 'Kısmen Kapatıldı' },
    { value: 'CLOSED', label: 'Kapatıldı' },
];

// İş kuralı: önem derecesi yalnızca KZ (Kontrol Zayıflığı) / KD (Kayda Değer Kontrol Eksikliği).
const severityOptions = [
    { value: 'CRITICAL', label: 'KZ', sublabel: 'Kontrol Zayıflığı', color: 'border-rose-500 bg-rose-50 text-rose-700' },
    { value: 'HIGH', label: 'KD', sublabel: 'Kayda Değer Kontrol Eksikliği', color: 'border-orange-500 bg-orange-50 text-orange-700' },
];

export default function FindingEditPage() {
    const params = useParams();
    const router = useRouter();
    const { success: showToastSuccess, error: showToastError } = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [controls, setControls] = useState<Control[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [directorates, setDirectorates] = useState<Directorate[]>([]);

    const [formData, setFormData] = useState({
        findingType: 'CONTROL_DEFICIENCY',
        controlId: '',
        description: '',
        summary: '',
        gmy: '',
        relatedDepartment: '',
        directorateId: '',
        responsiblePerson: '',
        status: 'IN_PROGRESS',
        severity: 'HIGH',
        internalControlAssessment: '',
        currentStatusDetail: '',
        birimCevabi: '',
        // targetResolutionDate artık salt-okunur — bağlı aksiyonların hedef tarihlerinden
        // backend'de hesaplanır (Madde 4), burada yalnızca görüntülenir.
        targetResolutionDate: '',
        closedDate: '',
        testDate: '',
        attachment: '',
        assigneeId: '',
        sendEmail: true,
    });

    useEffect(() => {
        const loadData = async () => {
            try {
                // Fetch users
                let userList: User[] = [];
                try {
                    userList = await api.getUsers() as User[];
                } catch {
                    // Yetki yoksa boş liste — mock data kullanılmaz
                }
                setUsers(userList || []);

                // Fetch controls
                const resControls = await api.getControls() as any;
                const listControls = Array.isArray(resControls) ? resControls : (resControls?.data || []);
                setControls(listControls);

                // Fetch directorates
                try {
                    const dirs = await api.getDirectorates({ isActive: 'true' }) as any;
                    setDirectorates(Array.isArray(dirs) ? dirs : (dirs?.data || []));
                } catch { /* yetki yoksa boş liste */ }

                // Fetch finding
                const data = await api.getFinding(params.id as string) as any;
                if (data) {
                    setFormData({
                        findingType: data.findingType || 'CONTROL_DEFICIENCY',
                        controlId: data.controlId || (data.control?.id || ''),
                        description: data.description || '',
                        summary: data.summary || '',
                        gmy: data.gmy || '',
                        relatedDepartment: data.relatedDepartment || '',
                        directorateId: data.directorateId || (data.directorateRel?.id || ''),
                        responsiblePerson: data.responsiblePerson || '',
                        status: data.status || 'IN_PROGRESS',
                        severity: data.severity || 'HIGH',
                        internalControlAssessment: data.internalControlAssessment || '',
                        currentStatusDetail: data.currentStatusDetail || '',
                        birimCevabi: data.birimCevabi || '',
                        targetResolutionDate: data.targetResolutionDate ? new Date(data.targetResolutionDate).toISOString().split('T')[0] : '',
                        closedDate: data.closedDate ? new Date(data.closedDate).toISOString().split('T')[0] : '',
                        testDate: data.testDate ? new Date(data.testDate).toISOString().split('T')[0] : '',
                        attachment: data.attachment || '',
                        assigneeId: data.assigneeId || (data.assignee?.id || ''),
                        sendEmail: data.sendEmail ?? false,
                    });
                }
            } catch (error) {
                console.error('Failed to load edit data:', error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [params.id]);

    const handleControlChange = (selectedId: string) => {
        const selectedCtrl = controls.find(c => c.id === selectedId);
        setFormData(prev => ({
            ...prev,
            controlId: selectedId,
            gmy: selectedCtrl?.gmy || prev.gmy,
            relatedDepartment: selectedCtrl?.directorate || prev.relatedDepartment,
            responsiblePerson: selectedCtrl?.owner ? `${selectedCtrl.owner.firstName || ''} ${selectedCtrl.owner.lastName || ''}`.trim() : prev.responsiblePerson,
            assigneeId: selectedCtrl?.owner?.id || prev.assigneeId,
        }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.controlId) {
            showToastError('Hata', 'İlişkili Kontrol seçimi zorunludur.');
            return;
        }
        if (!formData.description) {
            showToastError('Hata', 'Bulgu Metni girmek zorunludur.');
            return;
        }

        setSaving(true);
        try {
            // targetResolutionDate gönderilmiyor — backend'de authoritative olarak
            // bağlı aksiyonlardan hesaplanıyor (Madde 4), buradan gelen değer zaten
            // yok sayılıyor ama kafa karışıklığını önlemek için hiç göndermiyoruz.
            const { targetResolutionDate, ...rest } = formData;
            const payload = { ...rest };

            await api.updateFinding(params.id as string, payload);
            showToastSuccess('Başarılı', 'Bulgu başarıyla güncellendi.');
            router.push(`/findings/${params.id}`);
        } catch (error: any) {
            console.error('Failed to update finding:', error);
            showToastError('Hata', error.message || 'Güncelleme sırasında bir hata oluştu.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50/50 max-w-5xl mx-auto py-8 px-4 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                <Link href="/findings" className="hover:text-slate-600">Bulgular</Link>
                <span>/</span>
                <Link href={`/findings/${params.id}`} className="hover:text-slate-600 font-mono">{params.id}</Link>
                <span>/</span>
                <span className="text-slate-600">Düzenle</span>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-5">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Bulguyu Düzenle</h1>
                    <p className="text-sm text-slate-500 mt-1 font-mono">{params.id} numaralı kurumsal bulgu kaydı düzenleme ekranı.</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <form onSubmit={handleSave} className="space-y-6 text-slate-800">
                    {/* Section 1: Bağlantı ve Kimlik */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-4">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">🔗 Kontrol Bağlantısı & Sorumluluk</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">İlişkili Kontrol *</label>
                                <select
                                    value={formData.controlId}
                                    onChange={e => handleControlChange(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-700 font-semibold"
                                >
                                    <option value="">Seçiniz...</option>
                                    {controls.map(c => (
                                        <option key={c.id} value={c.id}>{c.controlId} - {c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Atanan Sorumlu (Assignee)</label>
                                <select
                                    value={formData.assigneeId}
                                    onChange={e => setFormData({ ...formData, assigneeId: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-700 font-semibold"
                                >
                                    <option value="">Seçiniz...</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.department || 'Genel'})</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">İlgili GMY</label>
                                <input
                                    type="text"
                                    value={formData.gmy}
                                    onChange={e => setFormData({ ...formData, gmy: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none"
                                    placeholder="Örn: BT GMY..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">İlgili Direktörlük</label>
                                <select
                                    value={formData.directorateId}
                                    onChange={e => {
                                        const dir = directorates.find(d => d.id === e.target.value);
                                        setFormData({ ...formData, directorateId: e.target.value, relatedDepartment: dir?.name || formData.relatedDepartment });
                                    }}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/10 outline-none"
                                >
                                    <option value="">Seçiniz...</option>
                                    {directorates.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">İletişim Kişisi</label>
                                <input
                                    type="text"
                                    value={formData.responsiblePerson}
                                    onChange={e => setFormData({ ...formData, responsiblePerson: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none"
                                    placeholder="İsim Soyisim..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Bulgu Detayları */}
                    <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-4">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">📝 Bulgu Özellikleri</h4>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Bulgu Türü</label>
                                <select
                                    value={formData.findingType}
                                    onChange={e => setFormData({ ...formData, findingType: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none font-semibold"
                                >
                                    {findingTypeOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Bulgunun Durumu</label>
                                <select
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none font-semibold"
                                >
                                    {statusOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Önem Derecesi (Severity)</label>
                                <div className="flex gap-1.5">
                                    {severityOptions.map(sev => (
                                        <button
                                            key={sev.value}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, severity: sev.value })}
                                            className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                                                formData.severity === sev.value ? sev.color : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'
                                            }`}
                                        >
                                            {sev.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Bulgu Özeti *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.summary}
                                    onChange={e => setFormData({ ...formData, summary: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none"
                                    placeholder="Tek cümlelik bulgu özeti..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Bulgu Metni (Açıklama) *</label>
                                <textarea
                                    required
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    rows={3}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none resize-none"
                                    placeholder="Gözlemlenen eksikliği ve test adımlarını detaylandırın..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Değerlendirme ve İlerleme */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-4">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">🔬 Değerlendirme ve Tarihler</h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">İç Kontrol Değerlendirmesi</label>
                                <textarea
                                    value={formData.internalControlAssessment}
                                    onChange={e => setFormData({ ...formData, internalControlAssessment: e.target.value })}
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none resize-none bg-white"
                                    placeholder="İç kontrol biriminin risk ve etki değerlendirmesi..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Bulgunun Güncel Durumu</label>
                                <textarea
                                    value={formData.currentStatusDetail}
                                    onChange={e => setFormData({ ...formData, currentStatusDetail: e.target.value })}
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none resize-none bg-white"
                                    placeholder="Bulgunun güncel takip ve kapatılma süreci..."
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Bulgu Test Tarihi</label>
                                <input
                                    type="date"
                                    value={formData.testDate}
                                    onChange={e => setFormData({ ...formData, testDate: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none bg-white"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Öngörülen Kapatma Tarihi (Hedef)</label>
                                <input
                                    type="date"
                                    value={formData.targetResolutionDate}
                                    readOnly
                                    disabled
                                    title="Bu tarih bağlı aksiyonların hedef tamamlanma tarihlerinden otomatik hesaplanır."
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none bg-slate-50 text-slate-500 cursor-not-allowed"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">Aksiyonların hedef tarihinden otomatik hesaplanır.</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Bulgu Fiili Kapatma Tarihi</label>
                                <input
                                    type="date"
                                    value={formData.closedDate}
                                    onChange={e => setFormData({ ...formData, closedDate: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none bg-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 4: Birim Cevabı, Ekler ve Bildirimler */}
                    <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-4">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">💾 Birim Görüşü & İletişim</h4>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Birim Cevabı / Yönetim Görüşü</label>
                            <textarea
                                value={formData.birimCevabi}
                                onChange={e => setFormData({ ...formData, birimCevabi: e.target.value })}
                                rows={2}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none resize-none"
                                placeholder="Bulguya maruz kalan iş biriminin aksiyon planı ve görüşü..."
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Dosya Eki (Attachment)</label>
                                <input
                                    type="text"
                                    value={formData.attachment}
                                    onChange={e => setFormData({ ...formData, attachment: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none"
                                    placeholder="Örn: kanit_dosyasi.xlsx, bulgu_kanit.pdf..."
                                />
                            </div>

                            <div className="flex items-center mt-6">
                                <label className="flex items-center gap-3 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={formData.sendEmail}
                                        onChange={e => setFormData({ ...formData, sendEmail: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div>
                                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">📧 Otomatik Mail Gönderilsin</span>
                                        <p className="text-[10px] text-slate-400 font-medium">Bulgu güncellendiğinde sorumlu kişiye bildirim gönderir</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
                        <Link
                            href={`/findings/${params.id}`}
                            className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition-colors uppercase tracking-wider"
                        >
                            İptal
                        </Link>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors disabled:opacity-50 uppercase tracking-wider shadow-sm"
                        >
                            {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
