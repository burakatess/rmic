'use client';

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { PageShell, PageHeader, Button, LoadingState, EmptyState, ErrorState, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import {
    AiEvalListParams, AiEvalListResponse, AiEvalRunStatus, AiEvalSessionListItem,
    OUTCOME_LABEL, RUN_STATUS_LABEL,
} from '@/types/ai';

const RUN_BADGE: Record<AiEvalRunStatus, 'neutral' | 'info' | 'warning' | 'success' | 'critical'> = {
    DRAFT: 'neutral',
    RUNNING: 'info',
    AWAITING_REVIEW: 'warning',
    COMPLETED: 'success',
    ERROR: 'critical',
};

const VIEWS: { key: 'active' | 'archived' | 'trashed'; label: string }[] = [
    { key: 'active', label: 'Aktif' },
    { key: 'archived', label: 'Arşiv' },
    { key: 'trashed', label: 'Çöp Kutusu' },
];

function AiEvalListInner() {
    const router = useRouter();
    const params = useSearchParams();
    const { success, error: showError } = useToast();

    const view = (params.get('view') as 'active' | 'archived' | 'trashed') || 'active';
    const q = params.get('q') || '';
    const runStatus = (params.get('runStatus') as AiEvalRunStatus) || '';
    const outcome = params.get('outcome') || '';
    const sort = (params.get('sort') as AiEvalListParams['sort']) || 'updatedAt';
    const dir = (params.get('dir') as 'asc' | 'desc') || 'desc';
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);

    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [resp, setResp] = useState<AiEvalListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);
    const [search, setSearch] = useState(q);
    const [menuOpen, setMenuOpen] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const setParam = useCallback(
        (patch: Record<string, string | number | null>) => {
            const next = new URLSearchParams(params.toString());
            Object.entries(patch).forEach(([k, v]) => {
                if (v === null || v === '') next.delete(k);
                else next.set(k, String(v));
            });
            // Filtre değişiminde sayfayı başa al (sıralama/arama hariç patch'te page verilir).
            router.replace(`/ai/kontrol-kanit?${next.toString()}`, { scroll: false });
        },
        [params, router],
    );

    const load = useCallback(async () => {
        setLoading(true);
        setErrored(false);
        try {
            const status = await api.getAiStatus().catch(() => ({ enabled: false }));
            setEnabled(status.enabled);
            const data = await api.listAiEvalSessions({
                view,
                q: q || undefined,
                runStatus: (runStatus || undefined) as AiEvalListParams['runStatus'],
                outcome: (outcome || undefined) as AiEvalListParams['outcome'],
                sort,
                dir,
                page,
                pageSize: 20,
            });
            setResp(data);
        } catch {
            setErrored(true);
        } finally {
            setLoading(false);
        }
    }, [view, q, runStatus, outcome, sort, dir, page]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        setSearch(q);
    }, [q]);

    const onSearchChange = (value: string) => {
        setSearch(value);
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => setParam({ q: value || null, page: 1 }), 350);
    };

    const rows = resp?.data ?? [];
    const total = resp?.total ?? 0;
    const totalPages = resp?.totalPages ?? 1;

    const runAction = async (fn: () => Promise<unknown>, okMsg: string) => {
        try {
            await fn();
            success('Tamam', okMsg);
            setMenuOpen(null);
            await load();
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'İşlem tamamlanamadı');
        } finally {
            setBusyId(null);
        }
    };

    const onRename = (row: AiEvalSessionListItem) => {
        const title = window.prompt('Yeni ad', row.title);
        if (!title || !title.trim() || title.trim() === row.title) return;
        setBusyId(row.id);
        runAction(() => api.renameAiEvalSession(row.id, title.trim()), 'Yeniden adlandırıldı.');
    };

    const onClone = (row: AiEvalSessionListItem) => {
        const period = window.prompt('Yeni dönem (ör. "Ocak 2027")', '');
        if (!period || !period.trim()) return;
        setBusyId(row.id);
        (async () => {
            try {
                const created = await api.cloneAiEvalSession(row.id, period.trim());
                success('Çoğaltıldı', 'Yeni dönem için kopya oluşturuldu.');
                router.push(`/ai/kontrol-kanit/${created.id}`);
            } catch (e) {
                showError('Hata', e instanceof Error ? e.message : 'Çoğaltılamadı');
                setBusyId(null);
            }
        })();
    };

    return (
        <PageShell>
            <PageHeader
                title="Kontrol & Kanıt Değerlendirme"
                description="Bir kontrol (envanterden veya elle) ve mevzuat maddeleri için sunduğunuz belge, ekran görüntüsü ve e-postaları yapay zekâ ile uyum açısından değerlendirin."
                breadcrumbs={[{ label: 'Yapay Zeka' }, { label: 'Kontrol & Kanıt Değerlendirme' }]}
                actions={
                    <Button onClick={() => router.push('/ai/kontrol-kanit/new')} disabled={enabled === false}>
                        Yeni Değerlendirme
                    </Button>
                }
            />

            {enabled === false && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Yapay zeka modülü kapalı. Yeni değerlendirme oluşturup düzenleyebilirsiniz; çalıştırmak için
                    yönetici tarafından servis açılmalıdır.
                </div>
            )}

            {/* Görünüm sekmeleri */}
            <div className="mb-3 flex gap-1 border-b border-slate-200">
                {VIEWS.map((v) => (
                    <button
                        key={v.key}
                        onClick={() => setParam({ view: v.key === 'active' ? null : v.key, page: 1 })}
                        className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                            view === v.key
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {v.label}
                    </button>
                ))}
            </div>

            {/* Arama + filtreler */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Değerlendirme adı, kontrol adı veya kodu…"
                    className="w-72 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                />
                <select
                    value={runStatus}
                    onChange={(e) => setParam({ runStatus: e.target.value || null, page: 1 })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                >
                    <option value="">Tüm işlem durumları</option>
                    {(Object.keys(RUN_STATUS_LABEL) as AiEvalRunStatus[]).map((k) => (
                        <option key={k} value={k}>{RUN_STATUS_LABEL[k]}</option>
                    ))}
                </select>
                <select
                    value={outcome}
                    onChange={(e) => setParam({ outcome: e.target.value || null, page: 1 })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                >
                    <option value="">Tüm sonuçlar</option>
                    {Object.entries(OUTCOME_LABEL).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                    ))}
                </select>
                <select
                    value={`${sort}:${dir}`}
                    onChange={(e) => {
                        const [s, d] = e.target.value.split(':');
                        setParam({ sort: s, dir: d });
                    }}
                    className="ml-auto rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                >
                    <option value="updatedAt:desc">Son güncelleme (yeni→eski)</option>
                    <option value="updatedAt:asc">Son güncelleme (eski→yeni)</option>
                    <option value="title:asc">Ad (A→Z)</option>
                    <option value="title:desc">Ad (Z→A)</option>
                </select>
            </div>

            {loading ? (
                <LoadingState />
            ) : errored ? (
                <ErrorState
                    title="Liste yüklenemedi"
                    description="Değerlendirmeler alınırken bir hata oluştu."
                    onRetry={load}
                />
            ) : rows.length === 0 ? (
                q || runStatus || outcome ? (
                    <EmptyState
                        title="Eşleşen değerlendirme yok"
                        description="Arama ve filtreleri değiştirip tekrar deneyin."
                        actionLabel="Filtreleri temizle"
                        onAction={() => setParam({ q: null, runStatus: null, outcome: null, page: 1 })}
                    />
                ) : view === 'trashed' ? (
                    <EmptyState title="Çöp kutusu boş" description="Silinen değerlendirmeler burada listelenir ve geri alınabilir." />
                ) : view === 'archived' ? (
                    <EmptyState title="Arşiv boş" description="Arşivlenen değerlendirmeler burada listelenir." />
                ) : (
                    <EmptyState
                        title="Henüz değerlendirme yok"
                        description="Yeni bir değerlendirme başlatın; kontrol alanını doldurup kanıt ekleyin."
                        actionLabel="Yeni Değerlendirme"
                        onAction={() => router.push('/ai/kontrol-kanit/new')}
                    />
                )
            ) : (
                <>
                    <div className="mb-2 text-xs text-slate-400">{total} kayıt</div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="w-full min-w-[900px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                                    <th className="px-4 py-2.5">Değerlendirme / kontrol</th>
                                    <th className="px-3 py-2.5">Dönem</th>
                                    <th className="px-3 py-2.5">Kanıtlar</th>
                                    <th className="px-3 py-2.5">İşlem durumu</th>
                                    <th className="px-3 py-2.5">Sonuç</th>
                                    <th className="px-3 py-2.5">Son güncelleme</th>
                                    <th className="px-3 py-2.5 text-right">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {rows.map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/ai/kontrol-kanit/${row.id}`}
                                                className="font-medium text-slate-800 hover:text-blue-600"
                                            >
                                                {row.title}
                                            </Link>
                                            {row.control?.name && (
                                                <p className="text-xs text-slate-400">
                                                    {row.control.controlId ? `${row.control.controlId} · ` : ''}
                                                    {row.control.name}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-slate-600">{row.period || '—'}</td>
                                        <td className="px-3 py-3 text-xs text-slate-500">{evidenceLabel(row)}</td>
                                        <td className="px-3 py-3">
                                            <StatusBadge variant={RUN_BADGE[row.runStatus]}>
                                                {RUN_STATUS_LABEL[row.runStatus]}
                                            </StatusBadge>
                                            {row.inputsDirty && (
                                                <p className="mt-1 text-[10px] text-amber-600">Girdiler değişti</p>
                                            )}
                                            {row.needsReview && (
                                                <p className="mt-1 text-[10px] font-medium text-orange-600">İnceleme gerekli</p>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-slate-600">
                                            {row.outcome ? OUTCOME_LABEL[row.outcome] : '—'}
                                            {row.findingCount != null && row.findingCount > 0 && (
                                                <p className="text-[10px] text-red-500">{row.findingCount} tespit</p>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-xs text-slate-500">
                                            {new Date(row.updatedAt).toLocaleDateString('tr-TR')}
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            <RowActions
                                                open={menuOpen === row.id}
                                                onToggle={() => setMenuOpen(menuOpen === row.id ? null : row.id)}
                                                onClose={() => setMenuOpen(null)}
                                            >
                                                <MenuItem onClick={() => router.push(`/ai/kontrol-kanit/${row.id}`)}>
                                                    {row.runStatus === 'DRAFT' ? 'Devam et' : 'Aç'}
                                                </MenuItem>
                                                {row.lifecycle === 'TRASHED' ? (
                                                    <MenuItem
                                                        disabled={busyId === row.id}
                                                        onClick={() =>
                                                            runAction(() => api.restoreAiEvalSession(row.id), 'Geri alındı.')
                                                        }
                                                    >
                                                        Geri al
                                                    </MenuItem>
                                                ) : (
                                                    <>
                                                        <MenuItem onClick={() => onRename(row)}>Yeniden adlandır</MenuItem>
                                                        <MenuItem onClick={() => onClone(row)}>Yeni dönem için çoğalt</MenuItem>
                                                        {row.lifecycle === 'ARCHIVED' ? (
                                                            <MenuItem
                                                                onClick={() =>
                                                                    runAction(
                                                                        () => api.unarchiveAiEvalSession(row.id),
                                                                        'Arşivden çıkarıldı.',
                                                                    )
                                                                }
                                                            >
                                                                Arşivden çıkar
                                                            </MenuItem>
                                                        ) : (
                                                            <MenuItem
                                                                onClick={() =>
                                                                    runAction(
                                                                        () => api.archiveAiEvalSession(row.id),
                                                                        'Arşivlendi.',
                                                                    )
                                                                }
                                                            >
                                                                Arşivle
                                                            </MenuItem>
                                                        )}
                                                        <MenuItem
                                                            danger
                                                            onClick={() =>
                                                                runAction(
                                                                    () => api.trashAiEvalSession(row.id),
                                                                    'Çöp kutusuna taşındı. Çöp Kutusu sekmesinden geri alabilirsiniz.',
                                                                )
                                                            }
                                                        >
                                                            Sil
                                                        </MenuItem>
                                                    </>
                                                )}
                                            </RowActions>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="text-xs text-slate-400">
                                Sayfa {page} / {totalPages}
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={page <= 1}
                                    onClick={() => setParam({ page: page - 1 })}
                                >
                                    Önceki
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={page >= totalPages}
                                    onClick={() => setParam({ page: page + 1 })}
                                >
                                    Sonraki
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </PageShell>
    );
}

function evidenceLabel(row: AiEvalSessionListItem): string {
    const parts: string[] = [];
    if (row.evidenceCount > 0) parts.push(`${row.evidenceCount} dosya`);
    if (row.hasEvidenceText) parts.push('yazılı beyan var');
    if (row.missingEvidenceCount != null && row.missingEvidenceCount > 0) {
        parts.push(`${row.missingEvidenceCount} eksik kanıt`);
    }
    return parts.length ? parts.join(' · ') : 'kanıt yok';
}

/** Satır işlem menüsü — taşan tablo konteynerinden kaçması için portal + fixed konum. */
function RowActions({
    open,
    onToggle,
    onClose,
    children,
}: {
    open: boolean;
    onToggle: () => void;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const btnRef = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 208) });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const close = () => onClose();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('resize', close);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('resize', close);
            window.removeEventListener('keydown', onKey);
        };
    }, [open, onClose]);

    return (
        <>
            <button
                ref={btnRef}
                onClick={onToggle}
                className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="İşlemler"
                aria-haspopup="menu"
            >
                ⋯
            </button>
            {open && pos && typeof document !== 'undefined' &&
                createPortal(
                    <>
                        <div className="fixed inset-0 z-40" onClick={onClose} />
                        <div
                            role="menu"
                            style={{ top: pos.top, left: pos.left }}
                            className="fixed z-50 w-52 rounded-lg border border-slate-200 bg-white py-1 text-left text-sm shadow-lg"
                        >
                            {children}
                        </div>
                    </>,
                    document.body,
                )}
        </>
    );
}

function MenuItem({
    children,
    onClick,
    danger,
    disabled,
}: {
    children: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
}) {
    return (
        <button
            disabled={disabled}
            onClick={onClick}
            className={`block w-full px-3 py-1.5 text-left hover:bg-slate-50 disabled:opacity-40 ${
                danger ? 'text-red-600' : 'text-slate-700'
            }`}
        >
            {children}
        </button>
    );
}

export default function AiEvalListPage() {
    return (
        <Suspense fallback={<PageShell><LoadingState /></PageShell>}>
            <AiEvalListInner />
        </Suspense>
    );
}
