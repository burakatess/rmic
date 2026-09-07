'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { PageShell, PageHeader, Button, Input, Textarea, Select, Modal, LoadingState, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { PermissionGate } from '@/components/auth';
import type { KnowledgeDoc, KnowledgeDocKind } from '@/types/ai';
import { KNOWLEDGE_KIND_LABEL } from '@/types/ai';

const KIND_OPTIONS: { value: KnowledgeDocKind; label: string }[] = (
    Object.keys(KNOWLEDGE_KIND_LABEL) as KnowledgeDocKind[]
).map((k) => ({ value: k, label: KNOWLEDGE_KIND_LABEL[k] }));

const KIND_BADGE: Record<KnowledgeDocKind, string> = {
    POLICY: 'bg-blue-100 text-blue-700',
    PROCEDURE: 'bg-cyan-100 text-cyan-700',
    METHODOLOGY: 'bg-violet-100 text-violet-700',
    RUBRIC: 'bg-amber-100 text-amber-700',
    GLOSSARY: 'bg-slate-100 text-slate-600',
    PRECEDENT: 'bg-emerald-100 text-emerald-700',
};

interface FormState {
    id?: string;
    kind: KnowledgeDocKind;
    code: string;
    title: string;
    body: string;
    category: string;
    tags: string;
    sourceRef: string;
    effectiveDate: string;
}

const EMPTY_FORM: FormState = {
    kind: 'POLICY',
    code: '',
    title: '',
    body: '',
    category: '',
    tags: '',
    sourceRef: '',
    effectiveDate: '',
};

export default function KnowledgeLibraryPage() {
    const { success, error: showError } = useToast();
    const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [kindFilter, setKindFilter] = useState<KnowledgeDocKind | ''>('');
    const [form, setForm] = useState<FormState | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setDocs(await api.searchKnowledgeDocs(q, kindFilter || undefined));
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Kaynaklar yüklenemedi');
        } finally {
            setLoading(false);
        }
    }, [q, kindFilter, showError]);

    useEffect(() => {
        const t = setTimeout(load, 250);
        return () => clearTimeout(t);
    }, [load]);

    const openNew = () => setForm({ ...EMPTY_FORM });
    const openEdit = (d: KnowledgeDoc) =>
        setForm({
            id: d.id,
            kind: d.kind,
            code: d.code,
            title: d.title,
            body: d.body,
            category: d.category ?? '',
            tags: d.tags.join(', '),
            sourceRef: d.sourceRef ?? '',
            effectiveDate: d.effectiveDate ? d.effectiveDate.slice(0, 10) : '',
        });

    const save = async () => {
        if (!form) return;
        if (form.code.trim().length < 2 || form.title.trim().length < 3 || form.body.trim().length < 3) {
            showError('Eksik alan', 'Kod, başlık ve içerik zorunludur.');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                kind: form.kind,
                code: form.code.trim(),
                title: form.title.trim(),
                body: form.body,
                category: form.category.trim() || undefined,
                tags: form.tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                sourceRef: form.sourceRef.trim() || undefined,
                effectiveDate: form.effectiveDate || undefined,
            };
            if (form.id) {
                await api.updateKnowledgeDoc(form.id, payload);
                success('Kaydedildi', 'Kaynak güncellendi.');
            } else {
                await api.createKnowledgeDoc(payload);
                success('Eklendi', 'Yeni kaynak oluşturuldu.');
            }
            setForm(null);
            await load();
        } catch (e) {
            showError('Kaydedilemedi', e instanceof Error ? e.message : 'Bilinmeyen hata');
        } finally {
            setSaving(false);
        }
    };

    const deactivate = async (d: KnowledgeDoc) => {
        if (!confirm(`"${d.code}" pasifleştirilsin mi? Geçmiş değerlendirme kayıtları etkilenmez.`)) return;
        try {
            await api.deleteKnowledgeDoc(d.id);
            success('Pasifleştirildi', `${d.code} artık seçim listesinde görünmeyecek.`);
            await load();
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Pasifleştirilemedi');
        }
    };

    const reactivate = async (d: KnowledgeDoc) => {
        try {
            await api.updateKnowledgeDoc(d.id, { isActive: true });
            success('Etkinleştirildi', `${d.code} yeniden kullanılabilir.`);
            await load();
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Etkinleştirilemedi');
        }
    };

    const kindFilterOptions = useMemo(() => [{ value: '', label: 'Tüm türler' }, ...KIND_OPTIONS], []);

    return (
        <PageShell>
            <PageHeader
                title="Kaynak Kütüphanesi"
                description="AI Kontrol & Kanıt Değerlendirme'nin dayanak metinleri: politika, prosedür, metodoloji, derecelendirme rehberi, terminoloji ve emsaller."
                breadcrumbs={[{ label: 'Yapay Zeka' }, { label: 'Kaynak Kütüphanesi' }]}
            />

            <PermissionGate
                permission="ai:admin"
                fallback={
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                        Bu sayfayı görüntülemek için yetkiniz yok. Kaynak kütüphanesini yalnızca sistem
                        yöneticileri ve risk kontrol yöneticileri düzenleyebilir.
                    </div>
                }
            >
                <div className="mb-4 flex flex-wrap items-end gap-3">
                    <div className="min-w-[220px] flex-1">
                        <Input
                            label="Ara"
                            placeholder="Kod, başlık veya içerik…"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                        />
                    </div>
                    <div className="w-48">
                        <Select
                            label="Tür"
                            options={kindFilterOptions}
                            placeholder="Tüm türler"
                            value={kindFilter}
                            onChange={(e) => setKindFilter(e.target.value as KnowledgeDocKind | '')}
                        />
                    </div>
                    <Button onClick={openNew}>Yeni kaynak</Button>
                </div>

                {loading ? (
                    <LoadingState />
                ) : docs.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white">
                        <EmptyState title="Kaynak yok" description="Aramanızı değiştirin veya yeni bir kaynak ekleyin." />
                    </div>
                ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                        {docs.map((d) => (
                            <div
                                key={d.id}
                                className={`rounded-xl border p-4 ${d.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}
                            >
                                <div className="mb-1.5 flex items-center gap-2">
                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${KIND_BADGE[d.kind]}`}>
                                        {KNOWLEDGE_KIND_LABEL[d.kind]}
                                    </span>
                                    <span className="font-mono text-xs font-semibold text-slate-700">{d.code}</span>
                                    {!d.isActive && (
                                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                            pasif
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-sm font-semibold text-slate-800">{d.title}</h3>
                                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-500">{d.body}</p>
                                <div className="mt-2 flex items-center gap-3 text-[11px]">
                                    <button onClick={() => openEdit(d)} className="font-medium text-blue-600 hover:text-blue-800">
                                        Düzenle
                                    </button>
                                    {d.isActive ? (
                                        <button onClick={() => deactivate(d)} className="font-medium text-red-500 hover:text-red-700">
                                            Pasifleştir
                                        </button>
                                    ) : (
                                        <button onClick={() => reactivate(d)} className="font-medium text-emerald-600 hover:text-emerald-800">
                                            Etkinleştir
                                        </button>
                                    )}
                                    {d.category && <span className="text-slate-400">· {d.category}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <Modal
                    open={!!form}
                    onClose={() => setForm(null)}
                    title={form?.id ? 'Kaynağı düzenle' : 'Yeni kaynak'}
                    size="lg"
                    footer={
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setForm(null)}>
                                Vazgeç
                            </Button>
                            <Button onClick={save} loading={saving}>
                                Kaydet
                            </Button>
                        </div>
                    }
                >
                    {form && (
                        <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Select
                                    label="Tür"
                                    options={KIND_OPTIONS}
                                    placeholder="Tür seçin"
                                    value={form.kind}
                                    onChange={(e) => setForm({ ...form, kind: e.target.value as KnowledgeDocKind })}
                                />
                                <Input
                                    label="Kod"
                                    placeholder="ör. POL-BT-01"
                                    value={form.code}
                                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                                    required
                                />
                            </div>
                            <Input
                                label="Başlık"
                                value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                required
                            />
                            <Textarea
                                label="İçerik (tam metin)"
                                rows={10}
                                value={form.body}
                                onChange={(e) => setForm({ ...form, body: e.target.value })}
                                hint="Değerlendirmede referans olarak modele bu metin verilir."
                                required
                            />
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Input
                                    label="Kategori"
                                    value={form.category}
                                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                                />
                                <Input
                                    label="Kaynak / atıf"
                                    placeholder="doküman no, yayım bilgisi"
                                    value={form.sourceRef}
                                    onChange={(e) => setForm({ ...form, sourceRef: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Input
                                    label="Etiketler (virgülle)"
                                    value={form.tags}
                                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                                />
                                <Input
                                    label="Yürürlük tarihi"
                                    type="date"
                                    value={form.effectiveDate}
                                    onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
                                />
                            </div>
                        </div>
                    )}
                </Modal>
            </PermissionGate>
        </PageShell>
    );
}
