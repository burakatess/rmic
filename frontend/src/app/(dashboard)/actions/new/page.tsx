'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { Button, Input, Textarea, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';

interface Finding {
    id: string;
    findingId: string;
    summary: string | null;
    description: string;
    severity: string;
    relatedDepartment: string | null;
    firstControllerId?: string | null;
    secondControllerId?: string | null;
    firstController?: { firstName: string; lastName: string } | null;
}

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
}

export default function NewActionPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const { user } = useAuth();
    const [approvers, setApprovers] = useState<User[]>([]);
    const [sendToApproval, setSendToApproval] = useState(true);

    const [findings, setFindings] = useState<Finding[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        findingId: '',
        description: '',
        ownerId: '',
        dueDate: '',
        responsibleDepartment: '',
        notes: '',
        secondControllerId: '',
    });

    useEffect(() => {
        const load = async () => {
            try {
                const [findingsRes, usersRes] = await Promise.all([
                    api.getFindings({}) as Promise<any>,
                    api.getUserChoices() as Promise<any>,
                ]);
                const fList = Array.isArray(findingsRes) ? findingsRes : (findingsRes.data || []);
                const uList = Array.isArray(usersRes) ? usersRes : (usersRes.data || usersRes.users || []);
                setFindings(fList);
                setUsers(uList);
                api.getApproverChoices().then(a => setApprovers(a as unknown as User[])).catch(() => setApprovers([]));
            } catch {
                showError('Hata', 'Veriler yüklenemedi.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const set = (field: keyof typeof form) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => setForm(prev => ({ ...prev, [field]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.findingId) { showError('Zorunlu', 'Lütfen bir bulgu seçin.'); return; }
        if (!form.description.trim()) { showError('Zorunlu', 'Aksiyon tanımı gerekli.'); return; }
        if (!form.ownerId) { showError('Zorunlu', 'Sorumlu kişi seçin.'); return; }
        if (!form.dueDate) { showError('Zorunlu', 'Hedef tarih girin.'); return; }

        setSaving(true);
        try {
            const created = await api.createAction(form.findingId, {
                description: form.description,
                ownerId: form.ownerId,
                dueDate: form.dueDate,
                responsibleDepartment: form.responsibleDepartment || undefined,
                notes: form.notes || undefined,
                ...(form.secondControllerId ? { secondControllerId: form.secondControllerId } : {}),
            }) as { id: string; actionId: string; secondControllerId?: string | null };
            // Maker-checker: aksiyon taslak oluşur; takip çalışması 2. kontrolcü onayından sonra açılır.
            let submitted = false;
            if (sendToApproval && created.secondControllerId) {
                try { await api.findingActionOp(form.findingId, created.id, 'submit'); submitted = true; }
                catch (err) { showError('Onaya gönderilemedi', (err as Error).message); }
            }
            success(
                submitted ? 'Aksiyon onaya gönderildi' : 'Aksiyon taslak olarak kaydedildi',
                submitted
                    ? `${created.actionId} 2. kontrolcü onayında. Onaylanınca takip çalışması hedef tarihte oluşur.`
                    : `${created.actionId} taslak. Detay sayfasından 2. kontrolcü onayına gönderebilirsiniz; takip çalışması onaydan sonra oluşur.`,
            );
            router.push(`/actions/${created.id}`);
        } catch (err: any) {
            showError('Hata', err?.message || 'Aksiyon oluşturulamadı.');
        } finally {
            setSaving(false);
        }
    };

    const selectedFinding = findings.find(f => f.id === form.findingId);
    const notFirstController = !!selectedFinding?.firstControllerId && !!user && selectedFinding.firstControllerId !== user.id;
    const effectiveSecond = form.secondControllerId || selectedFinding?.secondControllerId || '';

    return (
        <div className="min-h-full bg-slate-50/60">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <div className="px-8 py-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                        <Link href="/actions" className="hover:text-orange-600">Aksiyon Yönetimi</Link>
                        <span>/</span>
                        <span className="text-slate-700 font-semibold">Yeni Aksiyon</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Yeni Düzeltici Aksiyon</h1>
                            <p className="text-sm text-slate-500 mt-0.5">Bir bulguya bağlı düzeltici aksiyon oluşturun</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link href="/actions">
                                <Button variant="secondary">İptal</Button>
                            </Link>
                            <Button
                                variant="primary"
                                loading={saving}
                                onClick={handleSubmit as any}
                                className="bg-orange-600 hover:bg-orange-700 ring-orange-600"
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                            >
                                Kaydet
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                        <div className="w-7 h-7 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" />
                        <span className="text-sm">Yükleniyor…</span>
                    </div>
                </div>
            ) : (
                <div className="px-8 py-6 max-w-3xl">
                    <form onSubmit={handleSubmit} className="space-y-5">

                        {/* Bulgu Seçimi */}
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center">1</span>
                                İlgili Bulgu
                            </h2>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                    Bulgu Seç <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={form.findingId}
                                    onChange={set('findingId')}
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                                    required
                                >
                                    <option value="">-- Bulgu seçin --</option>
                                    {findings.map(f => (
                                        <option key={f.id} value={f.id}>
                                            [{f.findingId}] {f.summary || f.description.slice(0, 60)}
                                            {f.relatedDepartment ? ` — ${f.relatedDepartment}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedFinding && (
                                <div className="mt-3 bg-violet-50 border border-violet-200 rounded-lg p-3">
                                    <p className="text-xs font-semibold text-violet-700 mb-0.5">{selectedFinding.findingId}</p>
                                    <p className="text-xs text-slate-700 leading-relaxed">{selectedFinding.summary || selectedFinding.description}</p>
                                    {selectedFinding.relatedDepartment && (
                                        <p className="text-xs text-slate-400 mt-1">📍 {selectedFinding.relatedDepartment}</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Aksiyon Bilgileri */}
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center">2</span>
                                Aksiyon Detayları
                            </h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                        Aksiyon Tanımı <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        value={form.description}
                                        onChange={set('description')}
                                        rows={4}
                                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors resize-none"
                                        placeholder="Düzeltici aksiyonun detaylı açıklamasını girin…"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                            Sorumlu Kişi <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={form.ownerId}
                                            onChange={set('ownerId')}
                                            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                                            required
                                        >
                                            <option value="">-- Kişi seçin --</option>
                                            {users.map(u => (
                                                <option key={u.id} value={u.id}>
                                                    {u.firstName} {u.lastName}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                            Hedef Tamamlanma Tarihi <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            value={form.dueDate}
                                            onChange={set('dueDate')}
                                            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                        İlgili Direktörlük / Birim
                                    </label>
                                    <input
                                        type="text"
                                        value={form.responsibleDepartment}
                                        onChange={set('responsibleDepartment')}
                                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                                        placeholder="Örn: BT Ağ Yönetimi"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                        Notlar
                                    </label>
                                    <textarea
                                        value={form.notes}
                                        onChange={set('notes')}
                                        rows={3}
                                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors resize-none"
                                        placeholder="Ek notlar veya açıklamalar…"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Kontrolcüler ve onay (maker-checker) */}
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center">3</span>
                                Kontrolcüler ve Onay
                            </h2>
                            <ol className="text-xs text-slate-600 space-y-1 mb-4 list-decimal pl-4">
                                <li>Aksiyonu bulgunun <b>1. kontrolcüsü</b> girer (taslak).</li>
                                <li>2. kontrolcü onayına gönderilir; 2. kontrolcü onaylar veya gerekçeyle reddeder.</li>
                                <li>Onayla birlikte aksiyonun <b>takip çalışması</b> hedef tarihte otomatik oluşur.</li>
                            </ol>
                            {notFirstController && (
                                <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">
                                    Bu bulgunun 1. kontrolcüsü siz değilsiniz{selectedFinding?.firstController ? ` (${selectedFinding.firstController.firstName} ${selectedFinding.firstController.lastName})` : ''}; aksiyonu yalnızca 1. kontrolcü girebilir.
                                </p>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="new-action-second" className="block text-xs font-semibold text-slate-600 mb-1.5">2. Kontrolcü (onaylayan)</label>
                                    <select id="new-action-second" value={effectiveSecond} onChange={set('secondControllerId')}
                                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500">
                                        <option value="">{selectedFinding ? '— Bulgudaki 2. kontrolcü —' : '-- Önce bulgu seçin --'}</option>
                                        {approvers.filter(u => u.id !== selectedFinding?.firstControllerId).map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                                    </select>
                                    <p className="text-[11px] text-slate-400 mt-1">Varsayılan bulgudaki 2. kontrolcüdür; değiştirilebilir.</p>
                                </div>
                                <label className="flex items-start gap-2 text-sm text-slate-700 md:pt-6">
                                    <input type="checkbox" checked={sendToApproval} onChange={e => setSendToApproval(e.target.checked)} className="mt-0.5" />
                                    <span>Kaydettikten sonra 2. kontrolcü onayına gönder<span className="block text-[11px] text-slate-400">İşaretlemezseniz taslak kalır; detay sayfasından gönderebilirsiniz.</span></span>
                                </label>
                            </div>
                        </div>

                        {/* Submit */}
                        <div className="flex items-center justify-end gap-3 pb-8">
                            <Link href="/actions">
                                <Button variant="secondary">İptal</Button>
                            </Link>
                            <Button
                                type="submit"
                                variant="primary"
                                loading={saving}
                                className="bg-orange-600 hover:bg-orange-700 ring-orange-600"
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                            >
                                Aksiyon Oluştur
                            </Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
