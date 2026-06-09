'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { Button, Input, Textarea, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

interface Finding {
    id: string;
    findingId: string;
    summary: string | null;
    description: string;
    severity: string;
    relatedDepartment: string | null;
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
    });

    useEffect(() => {
        const load = async () => {
            try {
                const [findingsRes, usersRes] = await Promise.all([
                    api.getFindings({}) as Promise<any>,
                    api.getUsers() as Promise<any>,
                ]);
                const fList = Array.isArray(findingsRes) ? findingsRes : (findingsRes.data || []);
                const uList = Array.isArray(usersRes) ? usersRes : (usersRes.data || usersRes.users || []);
                setFindings(fList);
                setUsers(uList);
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
            await api.createAction(form.findingId, {
                description: form.description,
                ownerId: form.ownerId,
                dueDate: form.dueDate,
                responsibleDepartment: form.responsibleDepartment || undefined,
                notes: form.notes || undefined,
            });
            success('Oluşturuldu', 'Aksiyon başarıyla kaydedildi.');
            router.push('/actions');
        } catch (err: any) {
            showError('Hata', err?.message || 'Aksiyon oluşturulamadı.');
        } finally {
            setSaving(false);
        }
    };

    const selectedFinding = findings.find(f => f.id === form.findingId);

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
