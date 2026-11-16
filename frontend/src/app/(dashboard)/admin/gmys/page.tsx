'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { type GmyOption, type UserOption } from '@/lib/api';
import { classifyLoadError, type LoadError } from '@/lib/load-error';
import { useAuth } from '@/components/auth';
import { PageShell, PageHeader, Button, Modal, EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

interface FormState { name: string; code: string; responsibleUserId: string; isActive: boolean }
const EMPTY: FormState = { name: '', code: '', responsibleUserId: '', isActive: true };

/**
 * GMY (Genel Müdür Yardımcılığı) tanımları. Riskte "İlgili GMY" bu listeden seçilir.
 * Okuma tüm oturumlu kullanıcılara açık; ekleme/düzenleme yalnız sistem yöneticisine
 * (backend `gmys.controller.ts` @Roles('SYSTEM_ADMIN') ile aynı).
 */
export default function GmysPage() {
    const { user } = useAuth();
    const { success, error: showError } = useToast();
    const canManage = user?.role?.name === 'SYSTEM_ADMIN';

    const [gmys, setGmys] = useState<GmyOption[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<LoadError | null>(null);
    const [editing, setEditing] = useState<GmyOption | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setGmys(await api.getGmys(true));
            setLoadError(null);
        } catch (e) {
            setLoadError(classifyLoadError(e, 'GMY listesi'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        // Sorumlu seçimi yalnız yönetimde gerekir; liste alınamazsa form yine açılır.
        if (canManage) api.getUserChoices().then(setUsers).catch(() => setUsers([]));
    }, [canManage]);

    const openForm = (g: GmyOption | null) => {
        setEditing(g);
        setForm(g ? { name: g.name, code: g.code ?? '', responsibleUserId: g.responsibleUser?.id ?? '', isActive: g.isActive } : EMPTY);
        setModalOpen(true);
    };

    const save = async () => {
        if (!form.name.trim()) { showError('Zorunlu', 'GMY adı gerekli.'); return; }
        setSaving(true);
        try {
            if (editing) {
                await api.updateGmy(editing.id, {
                    name: form.name.trim(), code: form.code.trim() || null,
                    responsibleUserId: form.responsibleUserId || null, isActive: form.isActive,
                });
                success('Güncellendi', 'GMY bilgileri güncellendi.');
            } else {
                await api.createGmy({ name: form.name.trim(), code: form.code.trim() || undefined, responsibleUserId: form.responsibleUserId || undefined });
                success('Eklendi', 'GMY tanımlandı.');
            }
            setModalOpen(false);
            load();
        } catch (e) {
            showError('Kaydedilemedi', e instanceof Error ? e.message : 'GMY kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

    return (
        <PageShell>
            <PageHeader
                title="GMY Tanımları"
                description="Genel Müdür Yardımcılıkları — riskte İlgili GMY bu listeden seçilir"
                actions={canManage ? <Button variant="primary" onClick={() => openForm(null)}>Yeni GMY</Button> : undefined}
            />
            {loading ? <LoadingState message="GMY listesi yükleniyor..." />
                : loadError ? <ErrorState title={loadError.title} description={loadError.description} onRetry={loadError.retryable ? load : undefined} />
                : gmys.length === 0 ? <EmptyState title="Henüz GMY tanımlı değil" description={canManage ? 'Yeni GMY ekleyerek başlayın.' : 'Sistem yöneticisi GMY tanımladığında burada görünür.'} />
                : (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                                <tr>
                                    <th className="text-left px-4 py-2">Ad</th>
                                    <th className="text-left px-4 py-2">Kod</th>
                                    <th className="text-left px-4 py-2">Sorumlu</th>
                                    <th className="text-left px-4 py-2">Direktörlük / Risk</th>
                                    <th className="text-left px-4 py-2">Durum</th>
                                    {canManage && <th className="px-4 py-2" />}
                                </tr>
                            </thead>
                            <tbody>
                                {gmys.map(g => (
                                    <tr key={g.id} className="border-t border-slate-100">
                                        <td className="px-4 py-2 font-medium text-slate-800">{g.name}</td>
                                        <td className="px-4 py-2 text-slate-500">{g.code || '—'}</td>
                                        <td className="px-4 py-2 text-slate-600">{g.responsibleUser ? `${g.responsibleUser.firstName} ${g.responsibleUser.lastName}` : '—'}</td>
                                        <td className="px-4 py-2 text-slate-500">{g._count?.directorates ?? 0} / {g._count?.risks ?? 0}</td>
                                        <td className="px-4 py-2"><StatusBadge variant={g.isActive ? 'success' : 'neutral'}>{g.isActive ? 'Aktif' : 'Pasif'}</StatusBadge></td>
                                        {canManage && <td className="px-4 py-2 text-right"><Button variant="secondary" size="xs" onClick={() => openForm(g)}>Düzenle</Button></td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

            {canManage && (
                <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'GMY Düzenle' : 'Yeni GMY'}
                    footer={<>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button>
                        <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Button>
                    </>}>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Ad *</label>
                            <input value={form.name} onChange={set('name')} maxLength={200} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2" placeholder="Örn: Bilgi Teknolojileri GMY" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Kod</label>
                            <input value={form.code} onChange={set('code')} maxLength={50} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2" placeholder="Örn: GMY-1" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Sorumlu (Genel Müdür Yardımcısı)</label>
                            <select value={form.responsibleUserId} onChange={set('responsibleUserId')} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2">
                                <option value="">-- Seçin --</option>
                                {users.filter(u => u.isActive || u.id === form.responsibleUserId).map(u => (
                                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}{u.department ? ` — ${u.department}` : ''}</option>
                                ))}
                            </select>
                        </div>
                        {editing && (
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Aktif (pasif GMY yeni risklerde seçilemez)
                            </label>
                        )}
                    </div>
                </Modal>
            )}
        </PageShell>
    );
}
