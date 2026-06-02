'use client';

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Modal, Button, StatusBadge } from '../ui';
import { useToast } from '../ui/Toast';

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

interface CreateFindingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (finding: any) => void;
    controlContext?: Control | null;
    testContext?: {
        id: string;
        controlId: string;
        controlUID: string;
        name: string;
        directorate?: string;
        gmy?: string;
        assignee?: string;
        assigneeEmail?: string;
    } | null;
    editContext?: any;
}

// Bulgu Türü: BT = Bilgi Teknolojileri, IB = İş Birimleri
const findingTypeOptions = [
    { value: 'BT', label: 'Bilgi Teknolojileri Birimleri Bulgusu' },
    { value: 'IB', label: 'İş Birimleri Bulgusu' },
];

// Önem Derecesi: KZ=CRITICAL, KD=HIGH, ÖK=MEDIUM
const severityOptions = [
    { value: 'CRITICAL', label: 'KZ', sublabel: 'Kritik Zayıflık', color: 'border-rose-500 bg-rose-50 text-rose-700 ring-rose-500' },
    { value: 'HIGH',     label: 'KD', sublabel: 'Kritik Düzey',   color: 'border-orange-500 bg-orange-50 text-orange-700 ring-orange-500' },
    { value: 'MEDIUM',   label: 'ÖK', sublabel: 'Önemli Kontrol', color: 'border-amber-500 bg-amber-50 text-amber-700 ring-amber-500' },
    { value: 'LOW',      label: 'Düşük', sublabel: 'Düşük Risk',  color: 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-emerald-500' },
];

// Bulgunun Durumu
const statusOptions = [
    { value: 'IN_PROGRESS',       label: 'Devam Ediyor' },
    { value: 'PARTIALLY_CLOSED',  label: 'Kısmen Kapatıldı' },
    { value: 'CLOSED',            label: 'Kapatıldı' },
    // Legacy
    { value: 'OPEN',              label: 'Açık (Eski)' },
    { value: 'PENDING_REVIEW',    label: 'İnceleme Bekliyor (Eski)' },
];

export function CreateFindingModal({
    isOpen,
    onClose,
    onSuccess,
    controlContext,
    testContext,
    editContext,
}: CreateFindingModalProps) {
    const { success: showToastSuccess, error: showToastError } = useToast();
    const [loading, setLoading] = useState(false);
    const [controls, setControls] = useState<Control[]>([]);
    const [users, setUsers] = useState<User[]>([]);

    const [formData, setFormData] = useState({
        findingType: 'BT',
        controlId: '',
        description: '',
        summary: '',
        gmy: '',
        relatedDepartment: '',
        responsiblePerson: '',
        status: 'IN_PROGRESS',
        severity: 'HIGH',
        internalControlAssessment: '',
        currentStatusDetail: '',
        birimCevabi: '',
        targetResolutionDate: '',
        closedDate: '',
        testDate: '',
        attachment: '',
        assigneeId: '',
        sendEmail: true,
    });

    const [actions, setActions] = useState<any[]>([
        { description: '', ownerId: '', responsibleDepartment: '', dueDate: '', evidence: '', notes: '' }
    ]);

    const isTargetDateMandatory = formData.status === 'IN_PROGRESS' || formData.status === 'PARTIALLY_CLOSED';

    useEffect(() => {
        if (!isOpen) return;

        const formatDateForInput = (d: any) => {
            if (!d) return '';
            try { return new Date(d).toISOString().split('T')[0]; }
            catch { return ''; }
        };

        const loadInitData = async () => {
            try {
                let userList: User[] = [];
                try {
                    userList = await api.getUsers() as User[];
                } catch {
                    userList = [
                        { id: 'usr-1', firstName: 'Ahmet', lastName: 'Yılmaz', email: 'ahmet.yilmaz@grc.com', department: 'Uyum' },
                        { id: 'usr-2', firstName: 'Mehmet', lastName: 'Demir', email: 'mehmet.demir@grc.com', department: 'Risk Yönetimi' },
                        { id: 'usr-3', firstName: 'Ayşe', lastName: 'Kaya', email: 'ayse.kaya@grc.com', department: 'İç Kontrol' },
                        { id: 'usr-4', firstName: 'Fatma', lastName: 'Çelik', email: 'fatma.celik@grc.com', department: 'BT' },
                    ];
                }
                setUsers(userList || []);

                const res = await api.getControls() as any;
                setControls(Array.isArray(res) ? res : (res?.data || []));

                if (editContext) {
                    setFormData({
                        findingType: editContext.findingType || 'BT',
                        controlId: editContext.controlId || (editContext.control?.id || ''),
                        description: editContext.description || '',
                        summary: editContext.summary || '',
                        gmy: editContext.gmy || '',
                        relatedDepartment: editContext.relatedDepartment || '',
                        responsiblePerson: editContext.responsiblePerson || '',
                        status: editContext.status || 'IN_PROGRESS',
                        severity: editContext.severity || 'HIGH',
                        internalControlAssessment: editContext.internalControlAssessment || '',
                        currentStatusDetail: editContext.currentStatusDetail || '',
                        birimCevabi: editContext.birimCevabi || editContext.managementResponse || '',
                        targetResolutionDate: formatDateForInput(editContext.targetResolutionDate || editContext.targetClosureDate),
                        closedDate: formatDateForInput(editContext.closedDate),
                        testDate: formatDateForInput(editContext.testDate),
                        attachment: editContext.attachment || '',
                        assigneeId: editContext.assigneeId || (editContext.assignee?.id || ''),
                        sendEmail: editContext.sendEmail ?? false,
                    });
                    return;
                }

                // Auto-fill from context
                let initialControlId = '';
                let initialGMY = '';
                let initialDept = '';
                let initialResponsible = '';
                let initialAssigneeId = '';

                if (testContext) {
                    initialControlId = testContext.controlUID || '';
                    initialGMY = testContext.gmy || '';
                    initialDept = testContext.directorate || '';
                    initialResponsible = testContext.assignee || '';
                    const matchedUser = userList.find(u =>
                        `${u.firstName} ${u.lastName}`.trim() === testContext.assignee?.trim()
                    );
                    if (matchedUser) initialAssigneeId = matchedUser.id;
                } else if (controlContext) {
                    initialControlId = controlContext.id || '';
                    initialGMY = controlContext.gmy || '';
                    initialDept = controlContext.directorate || '';
                    if (controlContext.owner) {
                        initialResponsible = `${controlContext.owner.firstName || ''} ${controlContext.owner.lastName || ''}`.trim();
                        initialAssigneeId = controlContext.owner.id;
                    }
                }

                setFormData({
                    findingType: 'BT',
                    controlId: initialControlId,
                    description: '',
                    summary: '',
                    gmy: initialGMY,
                    relatedDepartment: initialDept,
                    responsiblePerson: initialResponsible,
                    status: 'IN_PROGRESS',
                    severity: 'HIGH',
                    internalControlAssessment: '',
                    currentStatusDetail: 'Bulgu açıldı. Aksiyon planı bekleniyor.',
                    birimCevabi: '',
                    targetResolutionDate: '',
                    closedDate: '',
                    testDate: new Date().toISOString().split('T')[0],
                    attachment: '',
                    assigneeId: initialAssigneeId,
                    sendEmail: true,
                });
            } catch (err) {
                console.error('Failed to load modal init data:', err);
            }
        };

        loadInitData();
    }, [isOpen, controlContext, testContext, editContext]);

    const handleControlChange = (selectedId: string) => {
        const sel = controls.find(c => c.id === selectedId);
        setFormData(prev => ({
            ...prev,
            controlId: selectedId,
            gmy: sel?.gmy || prev.gmy,
            relatedDepartment: sel?.directorate || prev.relatedDepartment,
            responsiblePerson: sel?.owner ? `${sel.owner.firstName || ''} ${sel.owner.lastName || ''}`.trim() : prev.responsiblePerson,
            assigneeId: sel?.owner?.id || prev.assigneeId,
        }));
    };

    const handleActionChange = (index: number, field: string, value: any) => {
        const copy = [...actions];
        copy[index] = { ...copy[index], [field]: value };
        setActions(copy);
    };

    const addAction = () => {
        setActions([...actions, { description: '', ownerId: '', responsibleDepartment: '', dueDate: '', evidence: '', notes: '' }]);
    };

    const removeAction = (index: number) => {
        if (actions.length === 1) {
            showToastError('Hata', 'En az 1 aksiyon tanımlanması zorunludur.');
            return;
        }
        setActions(actions.filter((_, i) => i !== index));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        // Mandatory field validation
        if (!formData.description.trim()) {
            showToastError('Hata', 'Bulgu Metni girmek zorunludur.');
            return;
        }
        if (!formData.summary.trim()) {
            showToastError('Hata', 'Bulgu Özeti girmek zorunludur.');
            return;
        }
        if (!formData.relatedDepartment.trim()) {
            showToastError('Hata', 'İlgili Direktörlük zorunludur.');
            return;
        }
        if (!formData.status) {
            showToastError('Hata', 'Bulgunun Durumu seçimi zorunludur.');
            return;
        }
        
        // Target Resolution Date check (only manual if no actions defined)
        if (editContext && isTargetDateMandatory && !formData.targetResolutionDate) {
            showToastError('Hata', '"Devam Ediyor" veya "Kısmen Kapatıldı" durumunda Öngörülen Tamamlanma Tarihi zorunludur.');
            return;
        }

        // Actions validation for new findings
        if (!editContext) {
            if (actions.length === 0) {
                showToastError('Hata', 'En az 1 Düzeltici Aksiyon tanımlanması zorunludur.');
                return;
            }
            for (let i = 0; i < actions.length; i++) {
                const act = actions[i];
                if (!act.description.trim() || act.description.length < 30) {
                    showToastError('Hata', `${i + 1}. Aksiyon açıklaması en az 30 karakter olmalıdır.`);
                    return;
                }
                if (!act.ownerId) {
                    showToastError('Hata', `${i + 1}. Aksiyon sorumlusu seçilmelidir.`);
                    return;
                }
                if (!act.dueDate) {
                    showToastError('Hata', `${i + 1}. Aksiyon hedef tamamlanma tarihi girilmelidir.`);
                    return;
                }
            }
        }

        setLoading(true);
        try {
            const payload = {
                ...formData,
                testRecordId: testContext?.id || null,
                source: testContext ? 'CONTROL_TEST' : 'INTERNAL_AUDIT',
                impact: 'Kontrol testi veya iç denetim sırasında sapma tespit edilmiştir.',
                actions: !editContext ? actions : undefined,
            };

            if (editContext) {
                const updated = await api.updateFinding(editContext.id, payload) as any;
                showToastSuccess('Başarılı', `${updated.findingId} numaralı bulgu güncellendi.`);
                onSuccess(updated);
            } else {
                const created = await api.createFinding(payload) as any;
                showToastSuccess('Başarılı', `${created.findingId} numaralı bulgu oluşturuldu.`);
                onSuccess(created);
            }
            onClose();
        } catch (err: any) {
            console.error('Failed to save finding:', err);
            showToastError('Hata', err.message || 'Bulgu kaydedilirken hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={editContext ? 'Bulgu Düzenle' : 'Bulgu Oluştur'}
            description={editContext ? 'Bulgu kaydını IKS formatında güncelleyin' : 'IKS standardında kurumsal bulgu kaydını oluşturun'}
            size="xl"
            footer={
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onClose} disabled={loading}>İptal</Button>
                    <Button variant="primary" onClick={handleSave} loading={loading}>
                        {editContext ? 'Değişiklikleri Kaydet' : 'Bulguyu Kaydet'}
                    </Button>
                </div>
            }
        >
            <form className="space-y-5 text-slate-800">

                {/* ── Section 1: Zorunlu Alanlar (IKS) ── */}
                <div className="bg-red-50/60 p-4 rounded-xl border border-red-100 space-y-4">
                    <h4 className="text-xs font-black text-red-500 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                        Zorunlu Alanlar (IKS)
                    </h4>

                    {/* Bulgu Türü */}
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Bulgu Türü *</label>
                        <div className="grid grid-cols-2 gap-2">
                            {findingTypeOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, findingType: opt.value })}
                                    className={`py-2.5 px-3 rounded-lg border text-xs font-semibold text-left transition-all ${
                                        formData.findingType === opt.value
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                            : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="font-black mr-1">{opt.value}</span> — {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Bulgu Metni */}
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Bulgu Metni *</label>
                        <textarea
                            required
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none bg-white"
                            placeholder="Gözlemlenen eksikliği, test adımlarını ve etkisini detaylandırın..."
                        />
                    </div>

                    {/* Bulgu Özeti */}
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Bulgu Özeti *</label>
                        <input
                            type="text"
                            required
                            value={formData.summary}
                            onChange={e => setFormData({ ...formData, summary: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white"
                            placeholder="Tek cümlelik bulgu özeti..."
                        />
                    </div>

                    {/* İlgili Direktörlük + Bulgunun Durumu */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">İlgili Direktörlük *</label>
                            <input
                                type="text"
                                required
                                value={formData.relatedDepartment}
                                onChange={e => setFormData({ ...formData, relatedDepartment: e.target.value })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none bg-white"
                                placeholder="Örn: BT Güvenlik Direktörlüğü..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Bulgunun Durumu *</label>
                            <select
                                value={formData.status}
                                onChange={e => setFormData({ ...formData, status: e.target.value })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 outline-none font-semibold"
                            >
                                {statusOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* ── Section 2: İsteğe Bağlı Alanlar ── */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>
                        İsteğe Bağlı Alanlar
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* İlgili Kontrol */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">İlgili Kontrol</label>
                            <select
                                value={formData.controlId}
                                onChange={e => handleControlChange(e.target.value)}
                                disabled={!!controlContext || !!testContext}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/10 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                            >
                                <option value="">Seçiniz...</option>
                                {controls.map(c => (
                                    <option key={c.id} value={c.id}>{c.controlId} — {c.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Atanan Sorumlu */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Atanan Sorumlu (Assignee)</label>
                            <select
                                value={formData.assigneeId}
                                onChange={e => setFormData({ ...formData, assigneeId: e.target.value })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/10 outline-none"
                            >
                                <option value="">Seçiniz...</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.department || 'Genel'})</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* İlgili GMY */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">İlgili GMY</label>
                            <input
                                type="text"
                                value={formData.gmy}
                                onChange={e => setFormData({ ...formData, gmy: e.target.value })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none bg-white"
                                placeholder="Örn: Teknoloji GMY..."
                            />
                        </div>

                        {/* İletişim Kişisi */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">İletişim Kişisi</label>
                            <input
                                type="text"
                                value={formData.responsiblePerson}
                                onChange={e => setFormData({ ...formData, responsiblePerson: e.target.value })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none bg-white"
                                placeholder="İsim Soyisim..."
                            />
                        </div>
                    </div>

                    {/* Önem Derecesi */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Önem Derecesi</label>
                        <div className="grid grid-cols-4 gap-2">
                            {severityOptions.map(sev => (
                                <button
                                    key={sev.value}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, severity: sev.value })}
                                    className={`py-2 rounded-lg border text-center transition-all ${
                                        formData.severity === sev.value
                                            ? `${sev.color} ring-1`
                                            : 'border-slate-200 text-slate-400 bg-white hover:bg-slate-50'
                                    }`}
                                >
                                    <p className="text-sm font-black">{sev.label}</p>
                                    <p className="text-[10px] font-medium mt-0.5 opacity-80">{sev.sublabel}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Dates Row */}
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
                            <label className={`block text-xs font-bold mb-1.5 uppercase ${isTargetDateMandatory ? 'text-red-500' : 'text-slate-500'}`}>
                                Öngörülen Tamamlanma {isTargetDateMandatory ? '*' : ''}
                            </label>
                            <input
                                type="date"
                                value={formData.targetResolutionDate}
                                onChange={e => setFormData({ ...formData, targetResolutionDate: e.target.value })}
                                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none bg-white ${
                                    isTargetDateMandatory ? 'border-red-300 focus:border-red-400' : 'border-slate-200'
                                }`}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                                Bulgu Kapanma Tarihi {formData.status === 'CLOSED' ? '(Otomatik)' : ''}
                            </label>
                            <input
                                type="date"
                                value={formData.closedDate}
                                readOnly={formData.status === 'CLOSED' && !!editContext?.closedDate}
                                onChange={e => setFormData({ ...formData, closedDate: e.target.value })}
                                className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none bg-white ${
                                    formData.status === 'CLOSED' ? 'bg-slate-50 text-slate-500' : ''
                                }`}
                            />
                        </div>
                    </div>

                    {/* Assessments */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">İç Kontrol Değerlendirmesi</label>
                            <textarea
                                value={formData.internalControlAssessment}
                                onChange={e => setFormData({ ...formData, internalControlAssessment: e.target.value })}
                                rows={2}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none resize-none bg-white"
                                placeholder="Risk ve etki değerlendirmesi..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Bulgunun Güncel Durumu</label>
                            <textarea
                                value={formData.currentStatusDetail}
                                onChange={e => setFormData({ ...formData, currentStatusDetail: e.target.value })}
                                rows={2}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none resize-none bg-white"
                                placeholder="Takip ve kapatılma süreci..."
                            />
                        </div>
                    </div>
                </div>

                {/* ── Section 3: Birim Cevabı (İş Birimi Tarafından) ── */}
                <div className="bg-blue-50/40 p-4 rounded-xl border border-blue-100 space-y-4">
                    <h4 className="text-xs font-black text-blue-600 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                        İş Birimi Tarafından Doldurulur
                    </h4>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Birim Cevabı</label>
                        <textarea
                            value={formData.birimCevabi}
                            onChange={e => setFormData({ ...formData, birimCevabi: e.target.value })}
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none resize-none bg-white"
                            placeholder="Bulguya maruz kalan iş biriminin aksiyon planı ve görüşü..."
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Dosya Eki</label>
                            <input
                                type="text"
                                value={formData.attachment}
                                onChange={e => setFormData({ ...formData, attachment: e.target.value })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 outline-none bg-white"
                                placeholder="kanit_dosyasi.xlsx, bulgu_kanit.pdf..."
                            />
                        </div>
                        <div className="flex items-center mt-5">
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={formData.sendEmail}
                                    onChange={e => setFormData({ ...formData, sendEmail: e.target.checked })}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div>
                                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">📧 Mail Gönderilsin Mi</span>
                                    <p className="text-[10px] text-slate-400 font-medium">Sorumlu kişiye bildirim gönder</p>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* ── Section 4: Düzeltici Aksiyonlar (Zorunlu) ── */}
                {!editContext && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-slate-600 inline-block"></span>
                                Düzeltici Aksiyon Planı (En az 1 Adet Zorunlu)
                            </h4>
                            <button
                                type="button"
                                onClick={addAction}
                                className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold transition-all flex items-center gap-1.5"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Aksiyon Ekle
                            </button>
                        </div>

                        {actions.map((act, index) => (
                            <div key={index} className="p-4 bg-white rounded-lg border border-slate-200 relative space-y-4 shadow-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-500 uppercase">
                                        #{(index + 1).toString().padStart(2, '0')} Aksiyon Detayı
                                    </span>
                                    {actions.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeAction(index)}
                                            className="text-xs text-rose-500 hover:text-rose-700 font-semibold flex items-center gap-1"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            Sil
                                        </button>
                                    )}
                                </div>

                                {/* Aksiyon Açıklaması */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Aksiyon Açıklaması *</label>
                                    <textarea
                                        value={act.description}
                                        onChange={e => handleActionChange(index, 'description', e.target.value)}
                                        rows={2}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 outline-none resize-none bg-white"
                                        placeholder="Yapılacak somut adımı, kapsamı ve nihai çıktıyı açıklayınız (min. 30 karakter)..."
                                    />
                                    <p className="text-[10px] text-right font-medium text-slate-400 mt-0.5">
                                        {act.description.length}/30 karakter
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Aksiyon Sahibi */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Aksiyon Sorumlusu *</label>
                                        <select
                                            value={act.ownerId}
                                            onChange={e => {
                                                const selectedUser = users.find(u => u.id === e.target.value);
                                                handleActionChange(index, 'ownerId', e.target.value);
                                                if (selectedUser?.department) {
                                                    handleActionChange(index, 'responsibleDepartment', selectedUser.department);
                                                }
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-500/20 outline-none cursor-pointer"
                                        >
                                            <option value="">Sorumlu Seçiniz...</option>
                                            {users.map(u => (
                                                <option key={u.id} value={u.id}>
                                                    {u.firstName} {u.lastName} ({u.department || 'Genel'})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Sorumlu Departman */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Sorumlu Birim / Departman</label>
                                        <input
                                            type="text"
                                            value={act.responsibleDepartment}
                                            onChange={e => handleActionChange(index, 'responsibleDepartment', e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-500/20 outline-none bg-white"
                                            placeholder="Örn: Altyapı Yönetimi..."
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Hedef Tarih */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Hedef Tamamlanma Tarihi *</label>
                                        <input
                                            type="date"
                                            value={act.dueDate}
                                            onChange={e => handleActionChange(index, 'dueDate', e.target.value)}
                                            min={new Date().toISOString().split('T')[0]}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-500/20 outline-none bg-white"
                                        />
                                    </div>

                                    {/* Kanıt / JIRA Linki */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Kanıt / JIRA Bağlantısı</label>
                                        <input
                                            type="text"
                                            value={act.evidence}
                                            onChange={e => handleActionChange(index, 'evidence', e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-500/20 outline-none bg-white"
                                            placeholder="örn. JIRA-402 veya belge linki..."
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </form>
        </Modal>
    );
}

export default CreateFindingModal;
