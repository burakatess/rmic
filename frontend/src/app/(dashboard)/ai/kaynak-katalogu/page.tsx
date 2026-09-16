'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { PageShell, PageHeader, Button, LoadingState, EmptyState, ErrorState, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';
import type {
    Source, SourceVersionDetail, ControlTestCard, ProcessScopeCard, EvidenceRule, EvalDataset, EvalScenario,
    RetrievalResponse, QualityRun, SourceMapping,
} from '@/types/library';
import {
    SOURCE_KIND_LABEL, USAGE_LABEL, CONF_LABEL, STATUS_LABEL, MAPPING_STATUS_LABEL, MATCH_LABEL,
    SCENARIO_KIND_LABEL, type SourceKind, type UsagePermission,
} from '@/types/library';

type Tab = 'sources' | 'test-cards' | 'process-cards' | 'evidence' | 'scenarios' | 'quality' | 'retrieval';
const TABS: { key: Tab; label: string }[] = [
    { key: 'sources', label: 'Kaynaklar' },
    { key: 'test-cards', label: 'Kontrol Test Kartları' },
    { key: 'process-cards', label: 'Borsa Süreç Kartları' },
    { key: 'evidence', label: 'Kanıt Yeterliliği Rehberi' },
    { key: 'scenarios', label: 'Değerlendirme Senaryoları' },
    { key: 'quality', label: 'Kalite' },
    { key: 'retrieval', label: 'Kaynaklı Arama' },
];

const USAGE_VARIANT: Record<UsagePermission, 'success' | 'critical' | 'neutral'> = {
    ALLOWED: 'success', DENIED: 'critical', UNKNOWN: 'neutral',
};
const ACTION_LABEL: Record<string, string> = {
    addUnit: 'Birim ekle',
    reviewContent: 'İçerik incelendi',
    approveVersion: 'Sürümü onayla',
    verifyRights: 'Hakkı doğrula',
    buildIndex: 'İndeks üret',
};

const STATUS_VARIANT: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'critical'> = {
    DRAFT: 'neutral', IN_REVIEW: 'info', APPROVED: 'success', SUPERSEDED: 'warning', WITHDRAWN: 'critical',
    PENDING: 'warning', AI_DRAFT: 'info', USER_CONFIRMED: 'success', REJECTED: 'critical',
    SYNTHETIC_PENDING_REVIEW: 'warning', EXPERT_APPROVED: 'success',
};

export default function KaynakKataloguPage() {
    const { hasPermission } = useAuth();
    const canWrite = hasPermission('ai:admin') || hasPermission('*');
    const [tab, setTab] = useState<Tab>('sources');

    return (
        <PageShell>
            <PageHeader
                title="Kaynak Kataloğu"
                description="Mevzuat, standart ve metodolojileri sürümleyerek madde/kontrol düzeyinde tutar; kaynak → kontrol amacı → test adımı → beklenen kanıt → karar ölçütü → kaynaklı değerlendirme zincirini kurar."
                breadcrumbs={[{ label: 'Yapay Zeka' }, { label: 'Kaynak Kataloğu' }]}
            />
            <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                            tab === t.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'sources' && <SourcesTab canWrite={canWrite} />}
            {tab === 'test-cards' && <TestCardsTab canWrite={canWrite} />}
            {tab === 'process-cards' && <ProcessCardsTab />}
            {tab === 'evidence' && <EvidenceTab />}
            {tab === 'scenarios' && <ScenariosTab canWrite={canWrite} />}
            {tab === 'quality' && <QualityTab />}
            {tab === 'retrieval' && <RetrievalTab />}
        </PageShell>
    );
}

// ─── KAYNAKLAR ─────────────────────────────────────────────────────────────
function SourcesTab({ canWrite }: { canWrite: boolean }) {
    const { success, error: showError } = useToast();
    const [rows, setRows] = useState<Source[] | null>(null);
    const [err, setErr] = useState(false);
    const [q, setQ] = useState('');
    const [kind, setKind] = useState('');
    const [selected, setSelected] = useState<string | null>(null);

    const load = useCallback(async () => {
        setErr(false);
        try {
            setRows(await api.listLibrarySources({ q: q || undefined, kind: kind || undefined }));
        } catch {
            setErr(true);
        }
    }, [q, kind]);
    useEffect(() => {
        const t = setTimeout(load, 250);
        return () => clearTimeout(t);
    }, [load]);

    if (err) return <ErrorState title="Kaynaklar yüklenemedi" onRetry={load} />;
    if (!rows) return <LoadingState />;

    return (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <div>
                <div className="mb-3 flex flex-wrap gap-2">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Başlık, kod, yayıncı ara…"
                        className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    />
                    <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    >
                        <option value="">Tüm türler</option>
                        {(Object.keys(SOURCE_KIND_LABEL) as SourceKind[]).map((k) => (
                            <option key={k} value={k}>{SOURCE_KIND_LABEL[k]}</option>
                        ))}
                    </select>
                    {canWrite && <NewSourceButton onDone={load} />}
                </div>
                {rows.length === 0 ? (
                    <EmptyState title="Kaynak yok" description="Manifesti içe aktarın veya yeni kaynak ekleyin." />
                ) : (
                    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        {rows.map((s) => (
                            <li key={s.id}>
                                <button
                                    onClick={() => setSelected(s.id)}
                                    className={`block w-full px-3 py-2.5 text-left hover:bg-slate-50 ${selected === s.id ? 'bg-blue-50' : ''}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{s.title}</span>
                                        <StatusBadge variant="neutral">{SOURCE_KIND_LABEL[s.kind]}</StatusBadge>
                                    </div>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                                        <span className="font-mono">{s.slug}</span>
                                        {s.publisher && <span>· {s.publisher}</span>}
                                        <span>· {s.versions.length} sürüm</span>
                                        <RightsPill label="RAG" perm={s.rightRag} />
                                        <RightsPill label="Tam metin" perm={s.rightFullText} />
                                    </p>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div>{selected ? <SourceDetail id={selected} canWrite={canWrite} onChanged={load} /> : (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                    Detay için soldan bir kaynak seçin.
                </div>
            )}</div>
        </div>
    );
}

function RightsPill({ label, perm }: { label: string; perm: UsagePermission }) {
    return (
        <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                perm === 'ALLOWED' ? 'bg-emerald-50 text-emerald-700' : perm === 'DENIED' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'
            }`}
        >
            {label}: {USAGE_LABEL[perm]}
        </span>
    );
}

function NewSourceButton({ onDone }: { onDone: () => void }) {
    const { success, error: showError } = useToast();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ slug: '', title: '', kind: 'STANDARD_FRAMEWORK', publisher: '', officialUrl: '', docCode: '' });
    const submit = async () => {
        try {
            await api.createLibrarySource(form);
            success('Eklendi', 'Kaynak oluşturuldu.');
            setOpen(false);
            setForm({ slug: '', title: '', kind: 'STANDARD_FRAMEWORK', publisher: '', officialUrl: '', docCode: '' });
            onDone();
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Oluşturulamadı');
        }
    };
    if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>+ Kaynak</Button>;
    return (
        <div className="w-full space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <div className="grid grid-cols-2 gap-2">
                <input placeholder="slug (nist-...)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="rounded border px-2 py-1 text-xs" />
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="rounded border px-2 py-1 text-xs">
                    {(Object.keys(SOURCE_KIND_LABEL) as SourceKind[]).map((k) => <option key={k} value={k}>{SOURCE_KIND_LABEL[k]}</option>)}
                </select>
            </div>
            <input placeholder="Başlık" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded border px-2 py-1 text-xs" />
            <input placeholder="Yayıncı" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} className="w-full rounded border px-2 py-1 text-xs" />
            <input placeholder="Resmî URL" value={form.officialUrl} onChange={(e) => setForm({ ...form, officialUrl: e.target.value })} className="w-full rounded border px-2 py-1 text-xs" />
            <div className="flex gap-2">
                <Button size="sm" onClick={submit}>Kaydet</Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>İptal</Button>
            </div>
        </div>
    );
}

function SourceDetail({ id, canWrite, onChanged }: { id: string; canWrite: boolean; onChanged: () => void }) {
    const { success, error: showError } = useToast();
    const [src, setSrc] = useState<Source | null>(null);
    const [openVersion, setOpenVersion] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setSrc(await api.getLibrarySource(id));
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Yüklenemedi');
        }
    }, [id, showError]);
    useEffect(() => {
        setSrc(null);
        setOpenVersion(null);
        load();
    }, [load]);

    if (!src) return <LoadingState />;
    const rights: [string, UsagePermission][] = [
        ['Referans/link', src.rightRefLink], ['Tam metin', src.rightFullText], ['RAG', src.rightRag],
        ['Fine-tuning', src.rightFineTune], ['Dışa aktarım', src.rightExport],
    ];

    return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-slate-800">{src.title}</h3>
                    <p className="text-[11px] text-slate-400">
                        {SOURCE_KIND_LABEL[src.kind]} · {src.publisher || '—'} · gizlilik: {CONF_LABEL[src.confidentiality]}
                    </p>
                </div>
                {src.officialUrl && (
                    <a href={src.officialUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-blue-600 hover:underline">
                        Resmî kaynak ↗
                    </a>
                )}
            </div>

            <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Kullanım hakları</p>
                <div className="flex flex-wrap gap-1.5">
                    {rights.map(([label, perm]) => (
                        <StatusBadge key={label} variant={USAGE_VARIANT[perm]}>{label}: {USAGE_LABEL[perm]}</StatusBadge>
                    ))}
                </div>
                {src.rightsNote && <p className="mt-1.5 rounded bg-slate-50 p-2 text-[11px] text-slate-500">{src.rightsNote}</p>}
                {canWrite && <RightsEditor source={src} onDone={() => { load(); onChanged(); }} />}
            </div>

            <div>
                <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sürümler</p>
                    {canWrite && <AddVersionButton sourceId={src.id} versions={src.versions} onDone={load} />}
                </div>
                <ul className="space-y-1.5">
                    {src.versions.map((v) => (
                        <li key={v.id} className="rounded-lg border border-slate-200">
                            <button
                                onClick={() => setOpenVersion(openVersion === v.id ? null : v.id)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
                            >
                                <span className="font-mono font-semibold text-slate-700">{v.versionLabel}</span>
                                <StatusBadge variant={STATUS_VARIANT[v.approvalStatus]}>{STATUS_LABEL[v.approvalStatus]}</StatusBadge>
                                {v.supersededById && <span className="text-amber-600">yerine geçildi</span>}
                                <span className="ml-auto text-slate-400">
                                    {v._count.units} birim · {v._count.chunks} chunk · {v._count.mappings} eşleşme
                                    {!v.contentRetrieved && ' · içerik alınmadı'}
                                </span>
                            </button>
                            {openVersion === v.id && <VersionPanel versionId={v.id} canWrite={canWrite} onChanged={load} />}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function RightsEditor({ source, onDone }: { source: Source; onDone: () => void }) {
    const { success, error: showError } = useToast();
    const [open, setOpen] = useState(false);
    const [v, setV] = useState({
        rightRefLink: source.rightRefLink, rightFullText: source.rightFullText, rightRag: source.rightRag,
        rightFineTune: source.rightFineTune, rightExport: source.rightExport, rightsNote: source.rightsNote ?? '',
    });
    if (!open) return <button onClick={() => setOpen(true)} className="mt-1 text-[11px] text-blue-600 hover:underline">Hakları düzenle</button>;
    const fields: [keyof typeof v, string][] = [
        ['rightRefLink', 'Referans/link'], ['rightFullText', 'Tam metin'], ['rightRag', 'RAG'],
        ['rightFineTune', 'Fine-tuning'], ['rightExport', 'Dışa aktarım'],
    ];
    return (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-2">
            {fields.map(([k, label]) => (
                <label key={k} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{label}</span>
                    <select value={v[k] as string} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="rounded border px-1.5 py-0.5 text-xs">
                        <option value="UNKNOWN">Bilinmiyor</option>
                        <option value="ALLOWED">İzinli</option>
                        <option value="DENIED">İzin yok</option>
                    </select>
                </label>
            ))}
            <textarea value={v.rightsNote} onChange={(e) => setV({ ...v, rightsNote: e.target.value })} rows={2} placeholder="Hukuk teyidi notu" className="w-full rounded border px-2 py-1 text-xs" />
            <div className="flex gap-2">
                <Button size="sm" onClick={async () => {
                    try {
                        await api.updateLibrarySource(source.id, v);
                        success('Kaydedildi', 'Kullanım hakları güncellendi.');
                        setOpen(false);
                        onDone();
                    } catch (e) { showError('Hata', e instanceof Error ? e.message : 'Kaydedilemedi'); }
                }}>Kaydet</Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>İptal</Button>
            </div>
        </div>
    );
}

function AddVersionButton({ sourceId, versions, onDone }: { sourceId: string; versions: Source['versions']; onDone: () => void }) {
    const { success, error: showError } = useToast();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ versionLabel: '', effectiveDate: '', supersedesVersionId: '' });
    if (!open) return <button onClick={() => setOpen(true)} className="text-[11px] text-blue-600 hover:underline">+ Sürüm</button>;
    return (
        <div className="w-full space-y-2 rounded-lg border border-slate-200 p-2">
            <input placeholder="Sürüm etiketi (Rev.5, 2.0…)" value={form.versionLabel} onChange={(e) => setForm({ ...form, versionLabel: e.target.value })} className="w-full rounded border px-2 py-1 text-xs" />
            <input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} className="w-full rounded border px-2 py-1 text-xs" />
            <select value={form.supersedesVersionId} onChange={(e) => setForm({ ...form, supersedesVersionId: e.target.value })} className="w-full rounded border px-2 py-1 text-xs">
                <option value="">Yerine geçtiği sürüm (opsiyonel)</option>
                {versions.map((v) => <option key={v.id} value={v.id}>{v.versionLabel}</option>)}
            </select>
            <p className="text-[10px] text-slate-400">Yeni sürüm eskisini EZMEZ; eski değerlendirmeler kendi sürümüne bağlı kalır.</p>
            <div className="flex gap-2">
                <Button size="sm" onClick={async () => {
                    try {
                        await api.addLibraryVersion(sourceId, {
                            versionLabel: form.versionLabel,
                            effectiveDate: form.effectiveDate || undefined,
                            supersedesVersionId: form.supersedesVersionId || undefined,
                        });
                        success('Eklendi', 'Sürüm oluşturuldu.');
                        setOpen(false);
                        onDone();
                    } catch (e) { showError('Hata', e instanceof Error ? e.message : 'Eklenemedi'); }
                }}>Kaydet</Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>İptal</Button>
            </div>
        </div>
    );
}

function VersionPanel({ versionId, canWrite, onChanged }: { versionId: string; canWrite: boolean; onChanged: () => void }) {
    const { success, error: showError } = useToast();
    const [v, setV] = useState<SourceVersionDetail | null>(null);
    const [usedIn, setUsedIn] = useState<{ id: string; title: string }[]>([]);
    const [mappings, setMappings] = useState<SourceMapping[]>([]);
    const [readiness, setReadiness] = useState<import('@/types/library').VersionReadiness | null>(null);
    const [jobs, setJobs] = useState<import('@/types/library').IndexJob[]>([]);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [ver, used, maps, rd, jb] = await Promise.all([
                api.getLibraryVersion(versionId),
                api.libraryUsedInEvaluations(versionId).catch(() => []),
                api.listLibraryVersionMappings(versionId).catch(() => []),
                api.libraryVersionReadiness(versionId).catch(() => null),
                api.libraryIndexJobs(versionId).catch(() => []),
            ]);
            setV(ver);
            setUsedIn(used);
            setMappings(maps as SourceMapping[]);
            setReadiness(rd);
            setJobs(jb);
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Yüklenemedi');
        }
    }, [versionId, showError]);
    useEffect(() => { load(); }, [load]);

    const act = async (verb: string) => {
        setBusy(verb);
        try {
            if (verb === 'reviewContent') { await api.libraryReviewContent(versionId); success('Tamam', 'İçerik incelemesi işaretlendi.'); }
            else if (verb === 'approveVersion') { await api.updateLibraryVersion(versionId, { approvalStatus: 'APPROVED' }); success('Onaylandı', 'Sürüm APPROVED.'); }
            else if (verb === 'verifyRights') {
                const basis = window.prompt('Kullanım hakkı dayanağı (lisans / karar / yazışma) — RAG hakkı "İzinli" işaretlenecek:');
                if (!basis || !basis.trim()) { setBusy(null); return; }
                await api.libraryVerifyRights(v!.source.id, { basis: basis.trim(), rightRag: 'ALLOWED', rightRefLink: 'ALLOWED' });
                success('Kaydedildi', 'RAG kullanım hakkı doğrulandı.');
            }
            else if (verb === 'buildIndex') { const r = await api.buildLibraryChunks(versionId); success('Tamam', `${r.chunks} parça — indeks hazır.`); }
            load();
            onChanged();
        } catch (e) { showError('Hata', e instanceof Error ? e.message : 'İşlem başarısız'); }
        finally { setBusy(null); }
    };

    if (!v) return <div className="border-t border-slate-100 p-3"><LoadingState compact /></div>;

    return (
        <div className="space-y-3 border-t border-slate-100 p-3 text-xs">
            {v.storageNote && <p className="rounded bg-amber-50 p-2 text-amber-700">{v.storageNote}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                <span>Yürürlük: {v.effectiveDate ? new Date(v.effectiveDate).toLocaleDateString('tr-TR') : '—'}</span>
                <span>Geçerlilik sonu: {v.validUntil ? new Date(v.validUntil).toLocaleDateString('tr-TR') : '—'}</span>
                <span>Erişim: {v.accessedAt ? new Date(v.accessedAt).toLocaleDateString('tr-TR') : '—'}</span>
                {v.contentHash && <span>Hash: {v.contentHash.slice(0, 12)}…</span>}
                {v.supersedes && <span className="text-amber-600">← {v.supersedes.versionLabel}</span>}
                {v.supersededBy && <span className="text-amber-600">{v.supersededBy.versionLabel} →</span>}
            </div>

            {/* HAZIRLIK DURUMU — 5 kontrol + yetkiye uygun işlem */}
            {readiness && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <p className="mb-1.5 flex items-center gap-2 font-semibold text-slate-700">
                        Hazırlık durumu
                        {readiness.usableInEvaluation
                            ? <StatusBadge variant="success">Değerlendirmede kullanılabilir (manuel seçim)</StatusBadge>
                            : <StatusBadge variant="warning">Henüz kullanılamaz</StatusBadge>}
                        {readiness.autoRetrievalReady && <StatusBadge variant="success">Otomatik öneri/arama hazır</StatusBadge>}
                    </p>
                    <ul className="space-y-1">
                        {readiness.steps.map((st) => (
                            <li key={st.key} className="flex items-center gap-2">
                                <span className={st.done ? 'text-emerald-600' : st.optional ? 'text-slate-400' : 'text-amber-600'}>
                                    {st.done ? '✓' : st.optional ? '○' : '•'}
                                </span>
                                <span className={st.done ? 'text-slate-500 line-through' : 'text-slate-700'}>{st.label}</span>
                                {!st.done && canWrite && st.action && (
                                    <button
                                        disabled={busy === st.action.verb}
                                        onClick={() => act(st.action!.verb)}
                                        className="ml-auto rounded border border-blue-300 bg-white px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40"
                                        title={st.action.hint}
                                    >
                                        {busy === st.action.verb ? '…' : ACTION_LABEL[st.action.verb] ?? 'İşlem'}
                                    </button>
                                )}
                                {!st.done && st.action && <span className="ml-2 text-[10px] text-slate-400">{st.action.hint}</span>}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-1.5 text-[10px] text-slate-400">
                        İçerik incelemesi ile kullanım hakkı onayı AYRI adımlardır. İndeks üretilmeden «otomatik öneri/arama hazır» gösterilmez.
                    </p>
                    {readiness.indexStatus === 'ERROR' && (
                        <div className="mt-1.5 rounded bg-red-50 p-1.5 text-[10px] text-red-700">
                            İndeksleme hatası ({readiness.indexAttempts}. deneme): {readiness.indexError}
                            {canWrite && (
                                <button
                                    onClick={async () => { try { await api.retryLibraryIndex(versionId); success('Başladı', 'Yeniden denendi.'); load(); } catch (e) { showError('Hata', e instanceof Error ? e.message : ''); } }}
                                    className="ml-2 rounded border border-red-300 bg-white px-1.5 py-0.5 font-medium"
                                >
                                    Yeniden dene
                                </button>
                            )}
                        </div>
                    )}
                    {readiness.indexStatus === 'STALE' && (
                        <p className="mt-1.5 rounded bg-amber-50 p-1.5 text-[10px] text-amber-700">
                            İçerik değişti — indeks eskidi. Otomatik arama için yeniden üretin.
                        </p>
                    )}
                    {jobs.length > 0 && (
                        <details className="mt-1.5">
                            <summary className="cursor-pointer text-[10px] text-slate-500">İndeks işi geçmişi ({jobs.length})</summary>
                            <ul className="mt-1 space-y-0.5 text-[10px] text-slate-500">
                                {jobs.map((j) => (
                                    <li key={j.id}>
                                        #{j.attempt} · {j.status} · {j.chunkCount ?? '—'} parça · {new Date(j.startedAt).toLocaleString('tr-TR')}
                                        {j.error ? ` · ${j.error.slice(0, 60)}` : ''}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            )}

            <div>
                <p className="mb-1 font-semibold uppercase tracking-wide text-slate-400">
                    Birimler ({v.units.length}) — madde / kontrol gezgini
                </p>
                {v.units.length === 0 ? (
                    <p className="text-slate-400">Bu sürüme henüz birim (madde/kontrol) eklenmedi.</p>
                ) : (
                    <ul className="max-h-64 space-y-1 overflow-y-auto">
                        {v.units.map((u) => (
                            <li key={u.id} className="rounded border border-slate-200 p-2">
                                <p className="font-medium text-slate-700">
                                    <span className="font-mono">{u.unitCode}</span> — {u.title}
                                </p>
                                <p className="mt-0.5 line-clamp-3 text-slate-500">{u.originalText}</p>
                                {u.translationTr && <p className="mt-0.5 text-[11px] text-blue-600">TR açıklama: {u.translationTr}</p>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div>
                <p className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Eşleşmeler ({mappings.length})</p>
                {mappings.length === 0 ? (
                    <p className="text-slate-400">Eşleştirme bekliyor.</p>
                ) : (
                    <ul className="space-y-1">
                        {mappings.map((m) => (
                            <li key={m.id} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1">
                                <StatusBadge variant={STATUS_VARIANT[m.status]}>{MAPPING_STATUS_LABEL[m.status]}</StatusBadge>
                                <span className="text-slate-600">{MATCH_LABEL[m.matchType]}</span>
                                <span className="truncate text-slate-500">
                                    → {m.control?.name || m.testCard?.title || m.processCard?.title || '—'}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div>
                <p className="mb-1 font-semibold uppercase tracking-wide text-slate-400">
                    Kullanıldığı değerlendirmeler ({usedIn.length})
                </p>
                {usedIn.length === 0 ? (
                    <p className="text-slate-400">Bu sürüm henüz bir değerlendirmede kullanılmadı.</p>
                ) : (
                    <ul className="space-y-0.5">
                        {usedIn.map((e) => (
                            <li key={e.id} className="truncate text-slate-600">• {e.title}</li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

// ─── KONTROL TEST KARTLARI ─────────────────────────────────────────────────
function TestCardsTab({ canWrite }: { canWrite: boolean }) {
    const { success, error: showError } = useToast();
    const [rows, setRows] = useState<ControlTestCard[] | null>(null);
    const [sel, setSel] = useState<string | null>(null);
    const [detail, setDetail] = useState<ControlTestCard | null>(null);

    const load = useCallback(async () => {
        try { setRows(await api.listLibraryTestCards()); } catch (e) { showError('Hata', 'Kartlar yüklenemedi'); }
    }, [showError]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (!sel) return setDetail(null);
        api.getLibraryTestCard(sel).then(setDetail).catch(() => setDetail(null));
    }, [sel]);

    if (!rows) return <LoadingState />;

    return (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {rows.map((c) => {
                    const confirmed = c.mappings?.some((m) => m.status === 'USER_CONFIRMED');
                    return (
                        <li key={c.id}>
                            <button onClick={() => setSel(c.id)} className={`block w-full px-3 py-2.5 text-left hover:bg-slate-50 ${sel === c.id ? 'bg-blue-50' : ''}`}>
                                <p className="text-sm font-medium text-slate-800">
                                    <span className="font-mono text-xs text-slate-400">{c.code}</span> {c.title}
                                </p>
                                <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                                    <StatusBadge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</StatusBadge>
                                    <span>{c._count?.scenarios ?? 0} senaryo</span>
                                    <span className={confirmed ? 'text-emerald-600' : 'text-amber-600'}>
                                        {confirmed ? 'kaynak eşleşti' : 'eşleştirme bekliyor'}
                                    </span>
                                </p>
                            </button>
                        </li>
                    );
                })}
            </ul>
            <div>
                {!detail ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">Kart seçin.</div>
                ) : (
                    <TestCardDetail card={detail} canWrite={canWrite} onChanged={() => { load(); api.getLibraryTestCard(detail.id).then(setDetail); }} />
                )}
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <div className="whitespace-pre-wrap text-xs text-slate-600">{children}</div>
        </div>
    );
}

function TestCardDetail({ card, canWrite, onChanged }: { card: ControlTestCard; canWrite: boolean; onChanged: () => void }) {
    const { success, error: showError } = useToast();
    return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-slate-800">{card.code} · {card.title}</h3>
                    <p className="text-[11px] text-slate-400">
                        Köken: {card.origin} · sürüm {card.version} · <StatusBadge variant={STATUS_VARIANT[card.status]}>{STATUS_LABEL[card.status]}</StatusBadge>
                    </p>
                    <p className="mt-1 text-[10px] text-amber-600">
                        Bu bir kurum içi metodoloji taslağıdır — resmî standart veya kurum politikası değildir.
                    </p>
                </div>
                {canWrite && (
                    <select
                        value={card.status}
                        onChange={async (e) => {
                            try {
                                await api.setLibraryTestCardStatus(card.id, e.target.value);
                                success('Güncellendi', `Durum: ${STATUS_LABEL[e.target.value]}`);
                                onChanged();
                            } catch (err) { showError('Hata', err instanceof Error ? err.message : 'Değiştirilemedi'); }
                        }}
                        className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                        {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                )}
            </div>

            <Field label="Amaç ve risk">{card.purposeRisk}</Field>
            <Field label="Kapsam / önkoşullar">{card.scopePrereq}</Field>
            <Field label="Yöntem">{card.method}</Field>
            <Field label="Test adımları">
                <ol className="ml-4 list-decimal space-y-1">
                    {card.steps.map((s) => <li key={s.no}>{s.text}</li>)}
                </ol>
            </Field>
            <Field label="Beklenen durum">{card.expectedState}</Field>
            <Field label="İstenen kanıtlar">
                <ul className="ml-4 list-disc space-y-0.5">{card.requestedEvidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </Field>
            <Field label="Kanıt yeterlilik koşulları">{card.evidenceSufficiency}</Field>
            <Field label="Karar ölçütleri">
                <ul className="space-y-1">
                    <li><b>Karşılandı:</b> {card.decisionCriteria.met}</li>
                    <li><b>Karşılanmadı:</b> {card.decisionCriteria.notMet}</li>
                    <li><b>Doğrulanamadı:</b> {card.decisionCriteria.inconclusive}</li>
                    <li><b>Çelişkili:</b> {card.decisionCriteria.conflicting}</li>
                </ul>
            </Field>
            <Field label="Yanlış sonuca götürebilecek durumlar">{card.misleadingSignals}</Field>
            <Field label="Kısa kontrol sonucu örneği">{card.sampleControlResult}</Field>
            <Field label="Eksik kanıt talebi örneği">{card.sampleEvidenceRequest}</Field>
            {!!card.decisionCriteria.suggestedSourceRefs?.length && (
                <Field label="Önerilen kaynak referansları (eşleştirme bekliyor)">
                    <ul className="ml-4 list-disc">{card.decisionCriteria.suggestedSourceRefs.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </Field>
            )}
            <TestCardMappings testCardId={card.id} canWrite={canWrite} />
        </div>
    );
}

function TestCardMappings({ testCardId, canWrite }: { testCardId: string; canWrite: boolean }) {
    const [maps, setMaps] = useState<SourceMapping[] | null>(null);
    const { success, error: showError } = useToast();
    const load = useCallback(() => {
        api.listLibraryMappings({ testCardId }).then(setMaps).catch(() => setMaps([]));
    }, [testCardId]);
    useEffect(() => { load(); }, [load]);
    if (!maps) return null;
    return (
        <Field label={`Kaynak eşleşmeleri (${maps.length})`}>
            {maps.length === 0 ? (
                <span className="text-amber-600">Eşleştirme bekliyor — ilgili standart kütüphaneye eklenip birim düzeyinde eşleştirilmeli.</span>
            ) : (
                <ul className="space-y-1">
                    {maps.map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 px-2 py-1">
                            <StatusBadge variant={STATUS_VARIANT[m.status]}>{MAPPING_STATUS_LABEL[m.status]}</StatusBadge>
                            <span>{MATCH_LABEL[m.matchType]}</span>
                            <span className="text-slate-500">
                                {m.version?.source.title} {m.version?.versionLabel} {m.unit ? `· ${m.unit.unitCode}` : ''}
                            </span>
                            {m.matchType === 'RELATED' && (
                                <span className="text-[10px] text-slate-400">(«ilişkili» olması «uyum sağlandı» demek değildir)</span>
                            )}
                            {canWrite && m.status !== 'USER_CONFIRMED' && (
                                <button
                                    onClick={async () => {
                                        try {
                                            await api.reviewLibraryMapping(m.id, { status: 'USER_CONFIRMED' });
                                            success('Onaylandı', 'Eşleşme resmî uyum haritasına alındı.');
                                            load();
                                        } catch (e) { showError('Hata', e instanceof Error ? e.message : 'Onaylanamadı'); }
                                    }}
                                    className="rounded border border-emerald-300 px-1.5 py-0.5 text-[10px] text-emerald-700"
                                >
                                    Onayla
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </Field>
    );
}

// ─── SÜREÇ KARTLARI ────────────────────────────────────────────────────────
function ProcessCardsTab() {
    const [rows, setRows] = useState<ProcessScopeCard[] | null>(null);
    const [sel, setSel] = useState<string | null>(null);
    useEffect(() => { api.listLibraryProcessCards().then(setRows).catch(() => setRows([])); }, []);
    if (!rows) return <LoadingState />;
    const detail = rows.find((r) => r.id === sel);
    return (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {rows.map((c) => (
                    <li key={c.id}>
                        <button onClick={() => setSel(c.id)} className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${sel === c.id ? 'bg-blue-50' : ''}`}>
                            <span className="font-mono text-xs text-slate-400">{c.code}</span> {c.title}
                            <StatusBadge variant={STATUS_VARIANT[c.status]} className="ml-1">{STATUS_LABEL[c.status]}</StatusBadge>
                        </button>
                    </li>
                ))}
            </ul>
            <div>
                {!detail ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">Kart seçin.</div>
                ) : (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                        <h3 className="text-sm font-semibold text-slate-800">{detail.code} · {detail.title}</h3>
                        <Field label="Kapsam">{detail.description}</Field>
                        <Field label="Kritik varlıklar">
                            <ul className="ml-4 list-disc">{detail.criticalAssets.map((a, i) => <li key={i}>{a}</li>)}</ul>
                        </Field>
                        <Field label="Parametreler (kurum dolduracak — uydurulmaz)">
                            <table className="w-full text-xs">
                                <tbody>
                                    {detail.paramSpec.map((p) => (
                                        <tr key={p.key} className="border-b border-slate-100">
                                            <td className="py-1 pr-2 text-slate-600">{p.label}</td>
                                            <td className="py-1 text-slate-400">
                                                {p.filledValue == null ? <span className="italic">boş — kurum girecek</span> : `${p.filledValue} ${p.unit}`}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Field>
                        <p className="text-[11px] text-slate-400">
                            İlgili genel BT kontrolleri kütüphane eşleştirme ekranından bağlanır; kart burada kapsam çerçevesini tutar.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── KANIT REHBERİ ─────────────────────────────────────────────────────────
function EvidenceTab() {
    const [rows, setRows] = useState<EvidenceRule[] | null>(null);
    useEffect(() => { api.listLibraryEvidenceRules().then(setRows).catch(() => setRows([])); }, []);
    if (!rows) return <LoadingState />;
    const distinctions = rows.filter((r) => r.category === 'distinction');
    const dimensions = rows.filter((r) => r.category === 'dimension');
    return (
        <div className="space-y-5">
            <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Ayrımlar (kurallar)</h3>
                <div className="grid gap-2 md:grid-cols-2">
                    {distinctions.map((r) => (
                        <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                            <p className="font-semibold text-slate-800">{r.code} · {r.title}</p>
                            <p className="mt-1 text-slate-600">{r.rule}</p>
                            {r.goodExample && <p className="mt-1.5 text-emerald-700">✓ {r.goodExample}</p>}
                            {r.badExample && <p className="mt-0.5 text-red-600">✗ {r.badExample}</p>}
                        </div>
                    ))}
                </div>
            </section>
            <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Kanıt değerlendirme boyutları</h3>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-xs">
                        <tbody>
                            {dimensions.map((r) => (
                                <tr key={r.id} className="border-b border-slate-100">
                                    <td className="w-32 px-3 py-2 font-medium text-slate-700">{r.title}</td>
                                    <td className="px-3 py-2 text-slate-600">{r.rule}</td>
                                    <td className="w-40 px-3 py-2 text-slate-400">
                                        {r.scoringSpec ? JSON.stringify(r.scoringSpec).slice(0, 90) : ''}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                    Sayısal puan verilecekse boyut puanları ve ağırlıklar gösterilir. Modelin öznel güven yüzdesi doğruluk olasılığı olarak sunulmaz.
                </p>
            </section>
        </div>
    );
}

// ─── SENARYOLAR ────────────────────────────────────────────────────────────
function ScenariosTab({ canWrite }: { canWrite: boolean }) {
    const { success, error: showError } = useToast();
    const [datasets, setDatasets] = useState<EvalDataset[]>([]);
    const [datasetId, setDatasetId] = useState('');
    const [status, setStatus] = useState('');
    const [rows, setRows] = useState<EvalScenario[] | null>(null);
    const [sel, setSel] = useState<string | null>(null);

    useEffect(() => {
        api.listLibraryDatasets().then((d) => {
            setDatasets(d);
            const evalDs = d.find((x) => x.purpose === 'EVAL_HOLDOUT');
            if (evalDs) setDatasetId(evalDs.id);
        });
    }, []);
    const load = useCallback(() => {
        api.listLibraryScenarios({ datasetId: datasetId || undefined, status: status || undefined }).then(setRows).catch(() => setRows([]));
    }, [datasetId, status]);
    useEffect(() => { load(); }, [load]);

    const detail = rows?.find((r) => r.id === sel);
    const exportJsonl = async () => {
        if (!datasetId) return;
        try {
            const r = await api.exportLibraryJsonl(datasetId);
            const blob = new Blob([r.jsonl], { type: 'application/x-ndjson' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${r.dataset.code}.jsonl`;
            a.click();
            success('İndirildi', `${r.count} senaryo — ${r.note}`);
        } catch (e) { showError('Hata', e instanceof Error ? e.message : 'Dışa aktarılamadı'); }
    };

    if (!rows) return <LoadingState />;
    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">Tüm veri setleri</option>
                    {datasets.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name} ({d._count?.scenarios ?? 0})</option>)}
                </select>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">Tüm durumlar</option>
                    <option value="SYNTHETIC_PENDING_REVIEW">Sentetik — onay bekliyor</option>
                    <option value="EXPERT_APPROVED">Uzman onaylı</option>
                    <option value="REJECTED">Reddedildi</option>
                </select>
                <Button size="sm" variant="outline" onClick={exportJsonl} disabled={!datasetId}>JSONL indir</Button>
                <span className="text-xs text-slate-400">{rows.length} senaryo · gerçek eğitim başlatmaz</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    {rows.map((s) => (
                        <li key={s.id}>
                            <button onClick={() => setSel(s.id)} className={`block w-full px-3 py-2 text-left hover:bg-slate-50 ${sel === s.id ? 'bg-blue-50' : ''}`}>
                                <p className="text-xs font-medium text-slate-800">{s.scenarioId}</p>
                                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                                    <StatusBadge variant={STATUS_VARIANT[s.status] ?? 'neutral'}>{SCENARIO_KIND_LABEL[s.kind]}</StatusBadge>
                                    <span>→ {s.expectedDecision}</span>
                                </p>
                            </button>
                        </li>
                    ))}
                </ul>
                <div>
                    {!detail ? (
                        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">Senaryo seçin.</div>
                    ) : (
                        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-800">{detail.scenarioId}</h3>
                                    <p className="text-[11px] text-slate-400">
                                        Aile: {detail.familyKey} · {detail.testCard?.code} · {SCENARIO_KIND_LABEL[detail.kind]} ·{' '}
                                        {detail.synthetic ? 'sentetik' : 'gerçek'}
                                    </p>
                                </div>
                                {canWrite && detail.status === 'SYNTHETIC_PENDING_REVIEW' && (
                                    <div className="flex gap-1">
                                        <button
                                            onClick={async () => {
                                                try { await api.reviewLibraryScenario(detail.id, { status: 'EXPERT_APPROVED' }); success('Onaylandı', 'Uzman onayı verildi.'); load(); }
                                                catch (e) { showError('Hata', e instanceof Error ? e.message : 'Onaylanamadı'); }
                                            }}
                                            className="rounded border border-emerald-300 px-2 py-0.5 text-[10px] text-emerald-700"
                                        >
                                            Uzman onayı
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const note = window.prompt('Reddetme gerekçesi');
                                                if (!note) return;
                                                try { await api.reviewLibraryScenario(detail.id, { status: 'REJECTED', note }); success('Reddedildi', ''); load(); }
                                                catch (e) { showError('Hata', e instanceof Error ? e.message : 'Reddedilemedi'); }
                                            }}
                                            className="rounded border border-red-300 px-2 py-0.5 text-[10px] text-red-700"
                                        >
                                            Reddet
                                        </button>
                                    </div>
                                )}
                            </div>
                            <p className="rounded bg-amber-50 p-2 text-[11px] text-amber-700">
                                Sentetik senaryo — gerçek kurum kanıtı değildir. Beklenen cevap otomatik altın standart sayılmaz.
                            </p>
                            <Field label="Girdi kanıtları">
                                <ul className="ml-4 list-disc space-y-1">
                                    {detail.inputEvidence.map((e, i) => <li key={i}><b>{e.name}</b> ({e.type}): {e.text}</li>)}
                                </ul>
                            </Field>
                            <Field label="Beklenen karar">{detail.expectedDecision}</Field>
                            <Field label="Kısa kanıtlı gerekçe">{detail.rationale}</Field>
                            <Field label="Gerekli referanslar">
                                <ul className="ml-4 list-disc">{detail.requiredRefs.map((r, i) => <li key={i}>{r}</li>)}</ul>
                            </Field>
                            <Field label="Yasak çıkarımlar">
                                <ul className="ml-4 list-disc">{detail.forbiddenInferences.map((r, i) => <li key={i}>{r}</li>)}</ul>
                            </Field>
                            {!!detail.missingEvidence.length && (
                                <Field label="Eksik kanıtlar">
                                    <ul className="ml-4 list-disc">{detail.missingEvidence.map((r, i) => <li key={i}>{r}</li>)}</ul>
                                </Field>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── KALİTE ────────────────────────────────────────────────────────────────
function QualityTab() {
    const [runs, setRuns] = useState<QualityRun[] | null>(null);
    useEffect(() => { api.listLibraryQualityRuns().then(setRuns).catch(() => setRuns([])); }, []);
    if (!runs) return <LoadingState />;
    return (
        <div className="space-y-3">
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                Kalite çalışmaları, sabit değerlendirme setiyle model/prompt/retrieval sürümlerini karşılaştırır. Tahminler AI
                değerlendirme akışında üretilip <code className="font-mono">POST /library/quality-runs</code> ile kaydedilir;
                burada beklenen karara göre metrik hesaplanır. Modelin kendi cevabını onaylaması tek ölçüt değildir.
            </p>
            {runs.length === 0 ? (
                <EmptyState title="Kalite çalışması yok" description="Bir değerlendirme setine karşı çalışma kaydedildiğinde burada listelenir." />
            ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full min-w-[700px] text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                                <th className="px-3 py-2">Çalışma</th><th className="px-3 py-2">Model</th>
                                <th className="px-3 py-2">Doğru oran</th><th className="px-3 py-2">Yanlış «karşılandı»</th>
                                <th className="px-3 py-2">Kaçan eksiklik</th><th className="px-3 py-2">İnsan düzeltmesi</th>
                                <th className="px-3 py-2">Tarih</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {runs.map((r) => (
                                <tr key={r.id} className="text-xs">
                                    <td className="px-3 py-2 font-medium text-slate-700">{r.label}</td>
                                    <td className="px-3 py-2 text-slate-500">{r.modelName || '—'}</td>
                                    <td className="px-3 py-2">{r.metrics?.correctRate != null ? `${Math.round((r.metrics.correctRate as number) * 100)}%` : '—'}</td>
                                    <td className="px-3 py-2 text-red-600">{r.metrics?.falseMet ?? '—'}</td>
                                    <td className="px-3 py-2 text-amber-600">{r.metrics?.missedGaps ?? '—'}</td>
                                    <td className="px-3 py-2">{r.metrics?.humanFixNeeded ?? '—'}</td>
                                    <td className="px-3 py-2 text-slate-400">{new Date(r.startedAt).toLocaleDateString('tr-TR')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── KAYNAKLI ARAMA ────────────────────────────────────────────────────────
function RetrievalTab() {
    const { error: showError } = useToast();
    const [query, setQuery] = useState('');
    const [unitCode, setUnitCode] = useState('');
    const [asOfDate, setAsOfDate] = useState('');
    const [res, setRes] = useState<RetrievalResponse | null>(null);
    const [loading, setLoading] = useState(false);

    const run = async () => {
        if (query.trim().length < 2) return;
        setLoading(true);
        try {
            setRes(await api.libraryRetrievalSearch({
                query: query.trim(),
                unitCode: unitCode.trim() || undefined,
                asOfDate: asOfDate || undefined,
            }));
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Arama başarısız');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-3">
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                Yetki filtresi retrieval oncesinde uygulanir; yetkisiz kaynaklar arama veya ozet uzerinden sizmaz. Yalniz
                onaylı (APPROVED) ve RAG hakki «izinli» kaynaklar aranir. Kesin madde/kontrol kodu girerseniz o birim öne alınır.
            </p>
            <div className="flex flex-wrap gap-2">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Anlamsal sorgu…" className="w-72 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                <input value={unitCode} onChange={(e) => setUnitCode(e.target.value)} placeholder="Madde/kontrol kodu (AC-2)" className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <Button size="sm" onClick={run} loading={loading}>Ara</Button>
            </div>
            {res && (
                <div className="space-y-2">
                    {res.note && <p className="text-xs text-slate-400">{res.note}</p>}
                    {res.results.map((r, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                            <p className="flex items-center gap-2 font-medium text-slate-700">
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">{r.score}</span>
                                {r.source.title} · {r.versionLabel}
                                {r.unit && <span className="text-slate-500">· {r.unit.code}</span>}
                                {r.source.officialUrl && (
                                    <a href={r.source.officialUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">↗</a>
                                )}
                            </p>
                            <p className="mt-1 line-clamp-4 text-slate-600">{r.text}</p>
                        </div>
                    ))}
                    {res.results.length === 0 && !res.note && <p className="text-xs text-slate-400">Sonuç yok.</p>}
                </div>
            )}
        </div>
    );
}
