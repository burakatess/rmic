'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface UserOption { id: string; firstName: string; lastName: string; }

interface ActionEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    action: {
        id: string;
        actionId: string;
        description: string;
        status: string;
        dueDate: string;
        notes?: string | null;
        responsibleDepartment?: string | null;
        owner?: { id: string; firstName: string; lastName: string };
        finding?: { id: string; findingId: string };
    } | null;
}

const STATUS_OPTIONS = [
    { value: 'BEKLIYOR', label: 'Bekliyor' },
    { value: 'DEVAM_EDIYOR', label: 'Devam Ediyor' },
    { value: 'TAMAMLANDI', label: 'Tamamlandı' },
    { value: 'YETERSIZ', label: 'Yetersiz' },
    { value: 'KAPATILDI', label: 'Kapatıldı' },
];

const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

export default function ActionEditModal({ isOpen, onClose, onSuccess, action }: ActionEditModalProps) {
    const { success: toastSuccess, error: toastError } = useToast();
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState<UserOption[]>([]);

    const [form, setForm] = useState({
        description: '',
        ownerId: '',
        responsibleDepartment: '',
        dueDate: '',
        status: 'BEKLIYOR',
        notes: '',
    });

    useEffect(() => {
        if (!isOpen || !action) return;

        api.getUsers().then((u: any[]) => setUsers(u || [])).catch(() => setUsers([]));

        setForm({
            description: action.description || '',
            ownerId: action.owner?.id || '',
            responsibleDepartment: action.responsibleDepartment || '',
            dueDate: action.dueDate ? new Date(action.dueDate).toISOString().split('T')[0] : '',
            status: STATUS_OPTIONS.some(s => s.value === action.status) ? action.status : 'BEKLIYOR',
            notes: action.notes || '',
        });
    }, [isOpen, action]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!action?.finding?.id) {
            toastError('Hata', 'Aksiyonun bağlı olduğu bulgu bulunamadı.');
            return;
        }
        if (!form.description.trim() || form.description.length < 30) {
            toastError('Hata', 'Aksiyon açıklaması en az 30 karakter olmalıdır.');
            return;
        }
        if (!form.ownerId) {
            toastError('Hata', 'Aksiyon sorumlusu seçilmelidir.');
            return;
        }
        if (!form.dueDate) {
            toastError('Hata', 'Hedef tamamlanma tarihi girilmelidir.');
            return;
        }

        setLoading(true);
        try {
            await api.updateFindingAction(action.finding.id, action.id, {
                description: form.description.trim(),
                ownerId: form.ownerId,
                responsibleDepartment: form.responsibleDepartment.trim() || null,
                dueDate: form.dueDate,
                status: form.status,
                notes: form.notes.trim() || null,
            });
            toastSuccess('Başarılı', `${action.actionId} numaralı aksiyon güncellendi.`);
            onSuccess();
            onClose();
        } catch (err: any) {
            toastError('Hata', err.message || 'Aksiyon güncellenirken hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    if (!action) return null;

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Aksiyon Düzenle"
            description={`${action.actionId}${action.finding ? ` · Bağlı Bulgu: ${action.finding.findingId}` : ''}`}
            size="lg"
        >
            <form onSubmit={handleSave} className="space-y-4">
                <div>
                    <label className={labelCls}>Aksiyon Açıklaması * <span className="text-xs text-slate-400">(en az 30 karakter)</span></label>
                    <textarea required rows={3} value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        className={`${inputCls} resize-none`} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelCls}>Sorumlu *</label>
                        <select required value={form.ownerId}
                            onChange={e => setForm(f => ({ ...f, ownerId: e.target.value }))} className={inputCls}>
                            <option value="">Seçiniz...</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Sorumlu Birim</label>
                        <input type="text" value={form.responsibleDepartment}
                            onChange={e => setForm(f => ({ ...f, responsibleDepartment: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>Hedef Tamamlanma Tarihi *</label>
                        <input type="date" required value={form.dueDate}
                            onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>Durum *</label>
                        <select value={form.status}
                            onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                </div>

                <div>
                    <label className={labelCls}>Notlar</label>
                    <textarea rows={2} value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        className={`${inputCls} resize-none`} />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium">İptal</button>
                    <button type="submit" disabled={loading}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
                        {loading ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
