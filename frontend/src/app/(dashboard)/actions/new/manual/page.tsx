'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DetailShell, DetailHeader, DetailSection, Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';
import api, { type UserOption } from '@/lib/api';

interface Directorate { id: string; name: string }

const field = 'w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const label = 'block text-xs font-semibold text-slate-600 mb-1.5';

/**
 * Manuel aksiyon planı: herhangi bir bulgudan bağımsız. Kod sunucuda üretilir (AM-YYYY-NNNN).
 * Bulgu kaynaklı aksiyonla aynı onay ve takip altyapısı: taslak → 1. kontrolcü onaya gönderir →
 * 2. kontrolcü onaylar → hedef tarihte takip çalışması oluşur (aksiyon ↔ takip iki yönlü).
 */
export default function NewManualActionPage() {
    const router = useRouter();
    const { user } = useAuth();
    const { success, error: showError } = useToast();
    const [users, setUsers] = useState<UserOption[]>([]);
    const [approvers, setApprovers] = useState<UserOption[]>([]);
    const [directorates, setDirectorates] = useState<Directorate[]>([]);
    const [saving, setSaving] = useState(false);
    const [sendToApproval, setSendToApproval] = useState(true);
    const [form, setForm] = useState({
        title: '', description: '', ownerId: '', dueDate: '', status: 'BEKLIYOR' as 'BEKLIYOR' | 'DEVAM_EDIYOR',
        firstControllerId: '', secondControllerId: '', directorateId: '', notes: '',
    });

    useEffect(() => {
        api.getUserChoices().then(u => setUsers(u.filter(x => x.isActive !== false))).catch(() => setUsers([]));
        api.getApproverChoices().then(setApprovers).catch(() => setApprovers([]));
        api.getDirectorates({ isActive: 'true' })
            .then((r: unknown) => setDirectorates(Array.isArray(r) ? r as Directorate[] : ((r as { data?: Directorate[] })?.data ?? [])))
            .catch(() => setDirectorates([]));
    }, []);
    useEffect(() => { if (user?.id) setForm(f => (f.firstControllerId ? f : { ...f, firstControllerId: user.id })); }, [user?.id]);

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(f => ({ ...f, [k]: e.target.value }));
    const name = (u: UserOption) => `${u.firstName} ${u.lastName}`;
    const sameControllers = !!form.firstControllerId && form.firstControllerId === form.secondControllerId;
    const missing = !form.title.trim() || !form.description.trim() || !form.ownerId || !form.dueDate || !form.firstControllerId || !form.secondControllerId;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (missing) { showError('Zorunlu alanlar', 'Başlık, açıklama, sorumlu, hedef tarih ve iki kontrolcü zorunludur.'); return; }
        if (sameControllers) { showError('Kontrolcüler', '1. ve 2. kontrolcü aynı kişi olamaz.'); return; }
        setSaving(true);
        try {
            const created = await api.createManualAction({
                title: form.title.trim(), description: form.description.trim(), ownerId: form.ownerId, dueDate: form.dueDate, status: form.status,
                firstControllerId: form.firstControllerId, secondControllerId: form.secondControllerId,
                ...(form.directorateId ? { directorateId: form.directorateId } : {}), ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
            });
            let submitted = false;
            // Onaya gönderme yalnız 1. kontrolcüdür (kendisi değilse taslak kalır).
            if (sendToApproval && form.firstControllerId === user?.id) {
                try { await api.workflowTransition('ACTION', created.id, 'COMPLETE'); submitted = true; }
                catch (err) { showError('Onaya gönderilemedi', (err as Error).message); }
            }
            success(submitted ? 'Manuel aksiyon onaya gönderildi' : 'Manuel aksiyon taslak olarak kaydedildi',
                submitted ? `${created.actionId} 2. kontrolcü onayında; onaylanınca takip çalışması oluşur.` : `${created.actionId} taslak; detay sayfasından onaya gönderebilirsiniz.`);
            router.push(`/actions/${created.id}`);
        } catch (err) {
            showError('Kaydedilemedi', (err as Error).message);
        } finally { setSaving(false); }
    };

    return (
        <DetailShell>
            <DetailHeader
                breadcrumbs={[{ label: 'Aksiyon Yönetimi' }, { label: 'Aksiyon Planı Envanteri', href: '/actions' }, { label: 'Manuel Aksiyon Planı' }]}
                title="Manuel Aksiyon Planı Oluştur"
                meta={<span>Bulgudan bağımsız; onay ve takip altyapısı bulgu kaynaklı aksiyonlarla aynıdır.</span>}
                actions={<>
                    <Button variant="outline" size="sm" onClick={() => router.push('/actions')} disabled={saving}>Vazgeç</Button>
                    <Button variant="primary" size="sm" loading={saving} disabled={missing || sameControllers} onClick={submit}>Kaydet</Button>
                </>}
            />
            <form onSubmit={submit} className="grid grid-cols-1 xl:grid-cols-3 gap-5 max-w-6xl" data-testid="manual-action-form">
                <div className="xl:col-span-2 space-y-5">
                    <DetailSection title="Aksiyon planı">
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="ma-title" className={label}>Başlık *</label>
                                <input id="ma-title" className={field} value={form.title} onChange={set('title')} maxLength={300} placeholder="Ör. Yedekleme prosedürünün güncellenmesi" />
                            </div>
                            <div>
                                <label htmlFor="ma-desc" className={label}>Açıklama *</label>
                                <textarea id="ma-desc" className={`${field} h-auto py-2`} rows={5} value={form.description} onChange={set('description')} maxLength={5000} placeholder="Yapılacak düzeltici çalışmayı ve beklenen çıktıyı yazın" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label htmlFor="ma-owner" className={label}>Sorumlu *</label>
                                    <select id="ma-owner" className={field} value={form.ownerId} onChange={set('ownerId')}>
                                        <option value="">Seçin</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{name(u)}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="ma-due" className={label}>Hedef tarih *</label>
                                    <input id="ma-due" type="date" className={field} value={form.dueDate} onChange={set('dueDate')} />
                                </div>
                                <div>
                                    <label htmlFor="ma-status" className={label}>Durum</label>
                                    <select id="ma-status" className={field} value={form.status} onChange={set('status')}>
                                        <option value="BEKLIYOR">Bekliyor</option>
                                        <option value="DEVAM_EDIYOR">Devam ediyor</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="ma-dir" className={label}>Sorumlu birim</label>
                                    <select id="ma-dir" className={field} value={form.directorateId} onChange={set('directorateId')}>
                                        <option value="">Seçilmedi</option>
                                        {directorates.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="ma-notes" className={label}>Not</label>
                                    <input id="ma-notes" className={field} value={form.notes} onChange={set('notes')} maxLength={5000} />
                                </div>
                            </div>
                        </div>
                    </DetailSection>
                </div>
                <div className="space-y-5">
                    <DetailSection title="Onay (maker-checker)">
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="ma-first" className={label}>1. kontrolcü *</label>
                                <select id="ma-first" className={field} value={form.firstControllerId} onChange={set('firstControllerId')}>
                                    <option value="">Seçin</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{name(u)}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="ma-second" className={label}>2. kontrolcü (onaycı) *</label>
                                <select id="ma-second" className={field} value={form.secondControllerId} onChange={set('secondControllerId')}>
                                    <option value="">Seçin</option>
                                    {approvers.map(u => <option key={u.id} value={u.id}>{name(u)}</option>)}
                                </select>
                                {sameControllers && <p className="text-xs text-red-600 mt-1">1. ve 2. kontrolcü aynı kişi olamaz.</p>}
                            </div>
                            <label className="flex items-start gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={sendToApproval} onChange={e => setSendToApproval(e.target.checked)} className="mt-0.5" />
                                <span>Kaydedince 2. kontrolcü onayına gönder<span className="block text-xs text-slate-500">Yalnız 1. kontrolcü kendisiyse gönderilir; aksi halde taslak kalır.</span></span>
                            </label>
                            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">2. kontrolcü onaylayınca hedef tarihte bir takip çalışması oluşur. Aynı aksiyon için ikinci açık takip açılamaz.</p>
                        </div>
                    </DetailSection>
                </div>
            </form>
        </DetailShell>
    );
}
