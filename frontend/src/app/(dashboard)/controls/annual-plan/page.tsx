'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api, { ApiError } from '@/lib/api';
import {
    PageShell, PageHeader, Button, KpiCard, KpiGrid, DataTable, StatusBadge,
    LoadingState, EmptyState, ErrorState, Modal,
} from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import type {
    AnnualPlanRow, AnnualPlanWorkspace, AnnualPlanPreview, AnnualPlanScope, EligibleController,
} from '@/types/annual-plan';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { computeMonthGroup, MONTH_LABELS_TR } from '@/lib/month-group';

// ─── Sabitler ────────────────────────────────────────────────────────────────

const FREQUENCY_LABELS: Record<string, string> = {
    DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık', QUARTERLY: '3 Aylık',
    SEMI_ANNUAL: '6 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi',
};
const MONTH_LABELS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const SCOPE_LABELS: Record<AnnualPlanScope, string> = { MINE: 'İşlerim', UNIT: 'Birimim', ORG: 'Kurum' };
const CURRENT_YEAR = new Date().getFullYear();

const inputCls = 'px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400';

// Bir kontrolün taslakta önerilen (henüz kaydedilmemiş) yerel düzenlemesi.
interface PendingEdit {
    inScope: boolean;
    frequency?: string;
    referenceMonth?: number | null;
    selectedMonths?: string[];
    controlDate?: string;
    reason?: string;
    assigneeId?: string | null;
    secondControllerId?: string | null;
}

const MONTH_ABBR_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Artık serbest referans-ay seçimine göre (madde 6) — sabit takvim değil.
// Yalnızca GÖSTERİM amaçlı; kalıcı hesap her zaman backend'de yapılır.
function describeSchedule(row: AnnualPlanRow): string {
    switch (row.effectiveFrequency) {
        case 'MONTHLY': return 'Her ay (12 task) — otomatik';
        case 'WEEKLY': return 'Her Cuma — otomatik';
        case 'DAILY': return 'Otomatik task üretilmiyor';
        case 'QUARTERLY':
        case 'SEMI_ANNUAL':
        case 'ANNUAL': {
            if (row.effectiveReferenceMonth != null) {
                const months = computeMonthGroup(row.effectiveFrequency, row.effectiveReferenceMonth);
                return months.map(m => MONTH_ABBR_TR[m - 1]).join(', ');
            }
            // referenceMonth hiç seçilmemiş eski/legacy kapsam — takvim-sabit varsayılan.
            if (row.effectiveFrequency === 'QUARTERLY') return 'Çeyrek sonu (Mar, Haz, Eyl, Ara) — varsayılan';
            if (row.effectiveFrequency === 'SEMI_ANNUAL') return 'Yarıyıl sonu (Haz, Ara) — varsayılan';
            return 'Yıl sonu (Ara) — varsayılan';
        }
        case 'AD_HOC':
            if (row.effectiveControlDate) return new Date(row.effectiveControlDate).toLocaleDateString('tr-TR');
            if (row.effectiveSelectedMonths?.length) return row.effectiveSelectedMonths[0];
            return 'Ay seçilmedi';
        default: return '—';
    }
}

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default function AnnualPlanPage() {
    return (
        <Suspense fallback={<PageShell><LoadingState message="Yıllık Plan yükleniyor..." /></PageShell>}>
            <AnnualPlanPageContent />
        </Suspense>
    );
}

function AnnualPlanPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { success: toastSuccess, error: toastError } = useToast();

    const [year, setYear] = useState<number>(Number(searchParams.get('year')) || CURRENT_YEAR);
    const [scope, setScope] = useState<AnnualPlanScope>((searchParams.get('scope') as AnnualPlanScope) || 'ORG');
    const [directorateIds, setDirectorateIds] = useState<string[]>(searchParams.getAll('dir'));
    const [search, setSearch] = useState(searchParams.get('q') || '');
    const [frequencyFilter, setFrequencyFilter] = useState(searchParams.get('freq') || '');
    const [scopeFilter, setScopeFilter] = useState<'IN_SCOPE' | 'OUT_OF_SCOPE' | ''>((searchParams.get('sf') as any) || '');
    const [missingOnly, setMissingOnly] = useState(searchParams.get('missing') === '1');
    const [changedOnly, setChangedOnly] = useState(searchParams.get('changed') === '1');
    const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
    const focusControlId = searchParams.get('controlId') || undefined;

    const [workspace, setWorkspace] = useState<AnnualPlanWorkspace | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(new Map());
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [editingRow, setEditingRow] = useState<AnnualPlanRow | null>(null);
    const [previewData, setPreviewData] = useState<AnnualPlanPreview | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [applying, setApplying] = useState(false);
    // İki çalışma görünümü — AYNI taslak/state üzerinde (madde 4): sekme değişince
    // pendingEdits/workspace kaybolmaz.
    const [view, setView] = useState<'schedule' | 'assignments'>('schedule');
    const [bulkAssignRole, setBulkAssignRole] = useState<'assigneeId' | 'secondControllerId' | null>(null);
    const reqId = useRef(0);

    const scopeParams = useMemo(() => ({ scope, directorateId: scope === 'UNIT' ? directorateIds : undefined }), [scope, directorateIds]);

    // URL senkronizasyonu
    useEffect(() => {
        const params = new URLSearchParams();
        params.set('year', String(year));
        params.set('scope', scope);
        directorateIds.forEach(d => params.append('dir', d));
        if (search) params.set('q', search);
        if (frequencyFilter) params.set('freq', frequencyFilter);
        if (scopeFilter) params.set('sf', scopeFilter);
        if (missingOnly) params.set('missing', '1');
        if (changedOnly) params.set('changed', '1');
        if (page !== 1) params.set('page', String(page));
        router.replace(`/controls/annual-plan?${params.toString()}`, { scroll: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [year, scope, directorateIds, search, frequencyFilter, scopeFilter, missingOnly, changedOnly, page]);

    const loadWorkspace = useCallback(() => {
        const id = ++reqId.current;
        setLoading(true);
        setError(null);
        api.getAnnualPlanWorkspace(year, {
            ...scopeParams,
            search: search || undefined,
            frequency: frequencyFilter || undefined,
            scopeFilter: scopeFilter || undefined,
            missingSchedule: missingOnly || undefined,
            changedInDraft: changedOnly || undefined,
            page, pageSize: 20,
        }).then(data => {
            if (id !== reqId.current) return;
            setWorkspace(data);
        }).catch(err => {
            if (id !== reqId.current) return;
            setError(err instanceof ApiError ? err.message : 'Yıllık Plan verileri alınamadı.');
        }).finally(() => {
            if (id === reqId.current) setLoading(false);
        });
    }, [year, scopeParams, search, frequencyFilter, scopeFilter, missingOnly, changedOnly, page]);

    useEffect(() => { loadWorkspace(); }, [loadWorkspace]);
    useEffect(() => { setPage(1); }, [year, scope, directorateIds, search, frequencyFilter, scopeFilter, missingOnly, changedOnly]);

    // Sayfadan ayrılmada kaydedilmemiş değişiklik koruması (Madde 22).
    useEffect(() => {
        if (pendingEdits.size === 0) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [pendingEdits.size]);

    const effectiveRow = useCallback((row: AnnualPlanRow): AnnualPlanRow => {
        const edit = pendingEdits.get(row.controlId);
        if (!edit) return row;
        const effFrequency = edit.frequency ?? row.effectiveFrequency;
        const effReferenceMonth = edit.referenceMonth !== undefined ? edit.referenceMonth : row.effectiveReferenceMonth;
        const effAssigneeId = edit.assigneeId !== undefined ? edit.assigneeId : row.assigneeId;
        const effSecondControllerId = edit.secondControllerId !== undefined ? edit.secondControllerId : row.secondControllerId;
        const isPeriodic = effFrequency !== 'AD_HOC' && effFrequency !== 'DAILY';
        return {
            ...row,
            inScope: edit.inScope,
            effectiveFrequency: effFrequency,
            effectiveReferenceMonth: effReferenceMonth,
            effectiveSelectedMonths: edit.selectedMonths ?? row.effectiveSelectedMonths,
            effectiveControlDate: edit.controlDate ?? row.effectiveControlDate,
            assigneeId: effAssigneeId, secondControllerId: effSecondControllerId,
            assignmentComplete: !isPeriodic || !edit.inScope || (!!effAssigneeId && !!effSecondControllerId),
            changedInDraft: true,
        };
    }, [pendingEdits]);

    const toggleScope = (row: AnnualPlanRow) => {
        const current = effectiveRow(row);
        setPendingEdits(prev => {
            const next = new Map(prev);
            next.set(row.controlId, {
                inScope: !current.inScope,
                frequency: current.effectiveFrequency,
                referenceMonth: current.effectiveReferenceMonth,
                selectedMonths: current.effectiveSelectedMonths,
                controlDate: current.effectiveControlDate ?? undefined,
                assigneeId: current.assigneeId ?? undefined,
                secondControllerId: current.secondControllerId ?? undefined,
            });
            return next;
        });
    };

    const setAssignment = (row: AnnualPlanRow, patch: { assigneeId?: string | null; secondControllerId?: string | null }) => {
        const current = effectiveRow(row);
        setPendingEdits(prev => {
            const next = new Map(prev);
            next.set(row.controlId, {
                inScope: current.inScope,
                frequency: current.effectiveFrequency,
                referenceMonth: current.effectiveReferenceMonth,
                selectedMonths: current.effectiveSelectedMonths,
                controlDate: current.effectiveControlDate ?? undefined,
                assigneeId: patch.assigneeId !== undefined ? patch.assigneeId : current.assigneeId,
                secondControllerId: patch.secondControllerId !== undefined ? patch.secondControllerId : current.secondControllerId,
            });
            return next;
        });
    };

    const switchToYear = (targetYear: number) => {
        if (pendingEdits.size > 0) {
            const ok = window.confirm(`${year} yılında ${pendingEdits.size} kaydedilmemiş değişikliğiniz var. Taslağı kaydetmeden yıl değiştirirseniz bu değişiklikler kaybolur. Devam edilsin mi?`);
            if (!ok) return;
            setPendingEdits(new Map());
        }
        setYear(targetYear);
    };

    const saveDraft = async () => {
        if (!workspace || pendingEdits.size === 0) return;
        setSaving(true);
        try {
            // '' = ataması sil, undefined = bu alana hiç dokunulmadı (backend deseni —
            // bkz. dto/annual-plan.dto.ts::AnnualPlanDraftItemPatchDto).
            const items = Array.from(pendingEdits.entries()).map(([controlId, edit]) => ({
                controlId, inScope: edit.inScope, frequency: edit.frequency,
                referenceMonth: edit.referenceMonth ?? undefined, selectedMonths: edit.selectedMonths,
                controlDate: edit.controlDate, reason: edit.reason,
                assigneeId: edit.assigneeId === undefined ? undefined : (edit.assigneeId ?? ''),
                secondControllerId: edit.secondControllerId === undefined ? undefined : (edit.secondControllerId ?? ''),
            }));
            await api.saveAnnualPlanDraftItems(year, { expectedRevision: workspace.draftRevision, items }, scopeParams);
            setPendingEdits(new Map());
            toastSuccess('Kaydedildi', `${items.length} değişiklik taslağa kaydedildi.`);
            loadWorkspace();
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                toastError('Çakışma', 'Taslak başka bir kullanıcı tarafından güncellendi. Sayfa yenileniyor.');
                setPendingEdits(new Map());
                loadWorkspace();
            } else {
                toastError('Hata', err instanceof Error ? err.message : 'Taslak kaydedilemedi.');
            }
        } finally {
            setSaving(false);
        }
    };

    const discardChanges = async () => {
        if (!window.confirm('Bu yılın taslağındaki TÜM kaydedilmiş ve kaydedilmemiş değişiklikler geri alınacak. Emin misiniz?')) return;
        setPendingEdits(new Map());
        try {
            await api.discardAnnualPlanDraft(year);
            toastSuccess('Geri alındı', 'Taslak gerçek duruma sıfırlandı.');
            loadWorkspace();
        } catch (err) {
            toastError('Hata', err instanceof Error ? err.message : 'Geri alma başarısız.');
        }
    };

    const copyFromPreviousYear = async () => {
        if (pendingEdits.size > 0) { toastError('Önce kaydedin', 'Kopyalamadan önce kaydedilmemiş değişikliklerinizi kaydedin veya geri alın.'); return; }
        try {
            const result = await api.copyAnnualPlanFromYear(year, year - 1, scopeParams) as any;
            toastSuccess('Kopyalandı', `${result.seeded} kontrol ${year - 1} yılından taslağa eklendi (${result.skippedAlreadyInDraft} zaten taslaktaydı, atlandı).`);
            loadWorkspace();
        } catch (err) {
            toastError('Hata', err instanceof Error ? err.message : 'Kopyalama başarısız.');
        }
    };

    const openPreview = async () => {
        if (pendingEdits.size > 0) { toastError('Önce kaydedin', 'Önizleme, kaydedilmiş taslağı kullanır. Lütfen önce "Taslağı Kaydet" yapın.'); return; }
        try {
            const preview = await api.previewAnnualPlanApply(year);
            setPreviewData(preview);
            setPreviewOpen(true);
        } catch (err) {
            toastError('Hata', err instanceof Error ? err.message : 'Önizleme alınamadı.');
        }
    };

    const applyPlan = async () => {
        if (!workspace) return;
        setApplying(true);
        try {
            const result = await api.applyAnnualPlan(year, workspace.draftRevision);
            if (!result.applied) {
                toastError('Uygulanamadı', 'Çözülmemiş çatışmalar/eksik takvimler var. Önizlemeyi tekrar kontrol edin.');
            } else {
                toastSuccess('Plan uygulandı', `${result.added} eklendi, ${result.removed} çıkarıldı, ${result.modified} güncellendi, ${result.tasksCreated} task oluşturuldu.`);
                setPreviewOpen(false);
                loadWorkspace();
            }
        } catch (err) {
            toastError('Hata', err instanceof Error ? err.message : 'Plan uygulanamadı.');
        } finally {
            setApplying(false);
        }
    };

    const bulkAction = async (action: 'ADD' | 'REMOVE') => {
        if (!workspace || selectedRows.size === 0) return;
        // Yerel taslağa uygula (kaydetme "Taslağı Kaydet" ile ayrı adım — tutarlılık için).
        setPendingEdits(prev => {
            const next = new Map(prev);
            for (const controlId of selectedRows) {
                const row = workspace.data.find(r => r.controlId === controlId);
                if (!row) continue;
                const current = effectiveRow(row);
                next.set(controlId, {
                    inScope: action === 'ADD',
                    frequency: current.effectiveFrequency,
                    referenceMonth: current.effectiveReferenceMonth,
                    selectedMonths: current.effectiveSelectedMonths,
                    controlDate: current.effectiveControlDate ?? undefined,
                    assigneeId: current.assigneeId ?? undefined,
                    secondControllerId: current.secondControllerId ?? undefined,
                });
            }
            return next;
        });
        setSelectedRows(new Set());
    };

    const bulkAssign = async (role: 'assigneeId' | 'secondControllerId', userId: string, onlyMissing: boolean) => {
        if (!workspace || selectedRows.size === 0) return;
        try {
            const result: any = await api.bulkAnnualPlanDraftAction(year, {
                controlIds: Array.from(selectedRows), action: 'ASSIGN',
                [role]: userId, onlyMissing, expectedRevision: workspace.draftRevision,
            } as any, scopeParams);
            toastSuccess('Atandı', `${result.items?.length ?? selectedRows.size} kontrole atama uygulandı.`);
            setSelectedRows(new Set());
            loadWorkspace();
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                toastError('Çakışma', 'Taslak başka bir kullanıcı tarafından güncellendi. Sayfa yenileniyor.');
                loadWorkspace();
            } else {
                toastError('Hata', err instanceof Error ? err.message : 'Toplu atama başarısız.');
            }
        }
    };

    const rows = useMemo(() => (workspace?.data ?? []).map(effectiveRow), [workspace, effectiveRow]);
    const canManage = !!workspace; // sayfaya erişebilen zaten control:* sahibi (backend guard)

    // ─── Kolonlar ───────────────────────────────────────────────────────────
    const columns: ColumnDef<AnnualPlanRow>[] = useMemo(() => [
        {
            key: 'code', header: 'Kontrol', defaultWidth: 260,
            render: (row) => (
                <Link
                    href={`/controls/${row.controlId}`} target="_blank"
                    className={`block hover:underline ${row.controlId === focusControlId ? 'ring-2 ring-blue-300 rounded px-1 -mx-1' : ''}`}
                >
                    <p className="text-xs font-mono font-bold text-blue-700">{row.controlCode}</p>
                    <p className="text-sm text-slate-700 truncate max-w-[220px]" title={row.name}>{row.name}</p>
                </Link>
            ),
        },
        { key: 'freq', header: 'Sıklık', defaultWidth: 90, render: (row) => <span className="text-xs text-slate-500">{FREQUENCY_LABELS[row.frequency] || row.frequency}</span> },
        {
            key: 'prev', header: `${year - 1}`, defaultWidth: 80,
            render: (row) => (
                <button onClick={() => switchToYear(year - 1)} className="w-5 h-5 rounded border border-slate-300 flex items-center justify-center hover:border-blue-400"
                    title={`${year - 1} yılına geç`}>
                    {row.prevYearScoped && <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" />}
                </button>
            ),
        },
        {
            key: 'current', header: `${year} (aktif)`, defaultWidth: 100, headerClassName: 'bg-blue-50', cellClassName: 'bg-blue-50/40',
            render: (row) => (
                <button
                    onClick={() => canManage && toggleScope(row)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${row.inScope ? 'bg-blue-600 border-blue-600' : 'border-slate-300 hover:border-blue-400'}`}
                >
                    {row.inScope && <span className="text-white text-[10px] leading-none">✓</span>}
                </button>
            ),
        },
        {
            key: 'next', header: `${year + 1}`, defaultWidth: 80,
            render: (row) => (
                <button onClick={() => switchToYear(year + 1)} className="w-5 h-5 rounded border border-slate-300 flex items-center justify-center hover:border-blue-400"
                    title={`${year + 1} yılına geç`}>
                    {row.nextYearScoped && <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" />}
                </button>
            ),
        },
        {
            key: 'schedule', header: 'Uygulama Takvimi', defaultWidth: 200,
            render: (row) => (
                <button onClick={() => setEditingRow(row)} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 text-left">
                    <span className="truncate max-w-[160px]">{describeSchedule(row)}</span>
                    <span aria-hidden>✏️</span>
                </button>
            ),
        },
        {
            key: 'status', header: 'Durum', defaultWidth: 150,
            render: (row) => (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {row.pendingAction === 'ADD' && <StatusBadge variant="success" size="sm">Eklenecek</StatusBadge>}
                    {row.pendingAction === 'REMOVE' && <StatusBadge variant="critical" size="sm">Kapsamdan çıkarılacak</StatusBadge>}
                    {row.pendingAction === 'MODIFY' && <StatusBadge variant="info" size="sm">Değişti</StatusBadge>}
                    {pendingEdits.has(row.controlId) && <StatusBadge variant="warning" size="sm" dot>Kaydedilmedi</StatusBadge>}
                    {row.missingSchedule && <StatusBadge variant="warning" size="sm">Takvim eksik</StatusBadge>}
                    {row.inScope && !row.assignmentComplete && <StatusBadge variant="warning" size="sm">Atama eksik</StatusBadge>}
                </div>
            ),
        },
    ], [year, focusControlId, canManage, pendingEdits]);

    // ─── Kontrolcü Atamaları sekmesi — AYNI taslak, filtre olarak yalnızca kapsamdaki satırlar ──
    const assignmentRows = useMemo(() => rows.filter(r => r.inScope), [rows]);
    const assignmentColumns: ColumnDef<AnnualPlanRow>[] = useMemo(() => [
        {
            key: 'code', header: 'Kontrol', defaultWidth: 240,
            render: (row) => (
                <Link href={`/controls/${row.controlId}`} target="_blank" className="block hover:underline">
                    <p className="text-xs font-mono font-bold text-blue-700">{row.controlCode}</p>
                    <p className="text-sm text-slate-700 truncate max-w-[200px]" title={row.name}>{row.name}</p>
                </Link>
            ),
        },
        { key: 'freq', header: 'Sıklık', defaultWidth: 80, render: (row) => <span className="text-xs text-slate-500">{FREQUENCY_LABELS[row.frequency] || row.frequency}</span> },
        { key: 'months', header: 'Uygulama Ayları', defaultWidth: 160, render: (row) => <span className="text-xs text-slate-600">{describeSchedule(row)}</span> },
        { key: 'count', header: 'Planlanan Test', defaultWidth: 90, render: (row) => <span className="text-xs font-semibold text-slate-700">{row.plannedTestCount}</span> },
        {
            key: 'assignee', header: 'Atanan Kontrolcü', defaultWidth: 200,
            render: (row) => (
                <UserPicker
                    year={year} role="assignee" controlId={row.controlId}
                    value={row.assigneeId} otherValue={row.secondControllerId}
                    onChange={(v) => setAssignment(row, { assigneeId: v })}
                />
            ),
        },
        {
            key: 'secondController', header: 'İkinci Kontrolcü', defaultWidth: 200,
            render: (row) => (
                <UserPicker
                    year={year} role="secondController" controlId={row.controlId}
                    value={row.secondControllerId} otherValue={row.assigneeId}
                    onChange={(v) => setAssignment(row, { secondControllerId: v })}
                />
            ),
        },
        {
            key: 'status', header: 'Atama Durumu', defaultWidth: 130,
            render: (row) => row.assignmentComplete
                ? <StatusBadge variant="success" size="sm">Tamamlandı</StatusBadge>
                : <StatusBadge variant="warning" size="sm">Eksik</StatusBadge>,
        },
    ], [year]);

    return (
        <PageShell>
            <PageHeader
                title="Yıllık Plan"
                description="Kontrolleri yıl bazında planlayın, iş yükünü canlı görün, taslağı önizleyip uygulayın"
                breadcrumbs={[{ label: 'Kontrol Yönetimi', href: '/controls' }, { label: 'Yıllık Plan' }]}
                actions={
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={copyFromPreviousYear}>Önceki Yıldan Kopyala</Button>
                        <Button size="sm" variant="outline" onClick={discardChanges} disabled={!workspace || (workspace.draftRevision === 0 && pendingEdits.size === 0)}>Değişiklikleri Geri Al</Button>
                        <Button size="sm" variant="outline" onClick={saveDraft} disabled={pendingEdits.size === 0 || saving}>
                            {saving ? 'Kaydediliyor...' : `Taslağı Kaydet${pendingEdits.size > 0 ? ` (${pendingEdits.size})` : ''}`}
                        </Button>
                        <Button size="sm" variant="primary" onClick={openPreview} disabled={!workspace}>Planı Uygula</Button>
                    </div>
                }
            />

            {/* Yıl + taslak durumu */}
            <div className="flex flex-wrap items-center gap-3 mb-5 bg-white border border-slate-200 rounded-xl px-4 py-3">
                <select value={year} onChange={(e) => switchToYear(Number(e.target.value))} className={inputCls}>
                    {[year - 2, year - 1, year, year + 1, year + 2].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                {workspace && (
                    <>
                        <StatusBadge variant={workspace.draftStatus === 'APPLIED' && workspace.changedCount === 0 ? 'success' : workspace.changedCount > 0 || pendingEdits.size > 0 ? 'warning' : 'neutral'}>
                            {workspace.changedCount > 0 || pendingEdits.size > 0 ? 'Değişiklik Var' : workspace.draftStatus === 'APPLIED' ? 'Uygulandı' : 'Taslak'}
                        </StatusBadge>
                        <span className="text-xs text-slate-400">
                            Son güncelleme: {new Date(workspace.draftUpdatedAt).toLocaleString('tr-TR')}
                            {workspace.draftLastAppliedAt && ` · Son uygulama: ${new Date(workspace.draftLastAppliedAt).toLocaleString('tr-TR')}`}
                        </span>
                    </>
                )}

                <div className="h-5 w-px bg-slate-200 mx-1" />
                <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                    {(['MINE', 'UNIT', 'ORG'] as AnnualPlanScope[])
                        .filter(s => !workspace || s === 'MINE' || (s === 'UNIT' ? workspace.scope.options.unit.available : workspace.scope.options.org.available))
                        .map(s => (
                            <button key={s} onClick={() => setScope(s)} className={`px-3 py-1.5 text-sm font-medium ${scope === s ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                                {SCOPE_LABELS[s]}
                            </button>
                        ))}
                </div>
            </div>

            {/* Görünüm sekmesi — aynı taslak, iki çalışma görünümü (madde 4) */}
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden mb-5 w-fit">
                <button onClick={() => setView('schedule')} className={`px-4 py-2 text-sm font-semibold ${view === 'schedule' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                    Kapsam ve Takvim
                </button>
                <button onClick={() => setView('assignments')} className={`px-4 py-2 text-sm font-semibold ${view === 'assignments' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                    Kontrolcü Atamaları
                </button>
            </div>

            {/* KPI + Grafik */}
            {loading && !workspace ? (
                <LoadingState message="Yükleniyor..." />
            ) : error ? (
                <ErrorState description={error} onRetry={loadWorkspace} />
            ) : workspace ? (
                <>
                    <KpiGrid columns={5}>
                        <KpiCard title="Kapsamdaki Kontrol" value={workspace.workload.controlCount} variant="primary" />
                        <KpiCard title="Toplam Task" value={workspace.workload.totalTasks} variant="default" subtitle="AD_HOC ve günlük hariç" />
                        <KpiCard
                            title="Sıklık Kırılımı"
                            value={Object.keys(workspace.workload.byFrequency).length}
                            variant="info"
                            subtitle={
                                <span className="flex flex-col gap-0.5 mt-0.5">
                                    {Object.entries(workspace.workload.byFrequency).map(([f, c]) => (
                                        <span key={f}>{FREQUENCY_LABELS[f] || f}: <b>{c}</b></span>
                                    ))}
                                </span>
                            }
                        />
                        <KpiCard title="Arızi (İhtiyaç Halinde)" value={workspace.workload.adHocCount} variant="violet" subtitle={workspace.workload.missingScheduleCount > 0 ? `${workspace.workload.missingScheduleCount} takvimsiz` : undefined} />
                        <KpiCard title="En Yoğun Ay" value={workspace.workload.peakMonths.length > 0 ? workspace.workload.peakMonths.map(m => MONTH_LABELS_SHORT[m]).join(', ') : '—'} variant="warning" subtitle={workspace.workload.peakCount > 0 ? `${workspace.workload.peakCount} task` : undefined} />
                    </KpiGrid>

                    <div className="bg-white rounded-xl border border-slate-200 p-5 my-6">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3">Aylık İş Yükü — {year} (yetkili kapsamın tamamı, tablo filtrelerinden bağımsız)</h3>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={workspace.workload.byMonth.map((count, i) => ({ month: MONTH_LABELS_SHORT[i], count, idx: i }))}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                                    <Bar dataKey="count" name="Task" radius={[4, 4, 0, 0]}>
                                        {workspace.workload.byMonth.map((_, i) => <Cell key={i} fill={workspace.workload.peakMonths.includes(i) ? '#2563eb' : '#93c5fd'} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {view === 'schedule' ? (
                        <>
                            {/* Filtreler */}
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Kod veya tanım ara..." className={`${inputCls} w-56`} />
                                <select value={frequencyFilter} onChange={(e) => setFrequencyFilter(e.target.value)} className={inputCls}>
                                    <option value="">Tüm sıklıklar</option>
                                    {Object.entries(FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                                <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value as any)} className={inputCls}>
                                    <option value="">Kapsamda / Dışında (tümü)</option>
                                    <option value="IN_SCOPE">Yalnızca kapsamda</option>
                                    <option value="OUT_OF_SCOPE">Yalnızca kapsam dışı</option>
                                </select>
                                <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} className="rounded border-slate-300" />
                                    Planlaması eksik
                                </label>
                                <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={changedOnly} onChange={(e) => setChangedOnly(e.target.checked)} className="rounded border-slate-300" />
                                    Taslakta değiştirilmiş
                                </label>
                                {selectedRows.size > 0 && (
                                    <div className="flex items-center gap-2 ml-auto bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                                        <span className="text-xs font-semibold text-blue-700">{selectedRows.size} seçili</span>
                                        <Button size="sm" variant="outline" onClick={() => bulkAction('ADD')}>Kapsama Al</Button>
                                        <Button size="sm" variant="outline" onClick={() => bulkAction('REMOVE')}>Kapsamdan Çıkar</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setSelectedRows(new Set())}>Temizle</Button>
                                    </div>
                                )}
                            </div>

                            {rows.length === 0 ? (
                                <EmptyState title="Kayıt bulunamadı" description="Filtre kriterlerinizi değiştirin veya kapsamınızı kontrol edin." />
                            ) : (
                                <>
                                    <DataTable
                                        columns={columns}
                                        data={rows}
                                        rowKey={(r) => r.controlId}
                                        showCheckbox
                                        selectedRows={selectedRows}
                                        onRowSelect={(id) => setSelectedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                                        onSelectAll={() => setSelectedRows(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => r.controlId)))}
                                        loading={loading}
                                        storageKey="annual-plan-table"
                                        onRefresh={loadWorkspace}
                                    />
                                    <div className="flex items-center justify-between px-1 pt-3 text-sm text-slate-500">
                                        <span>{rows.length} / {workspace.totalCount} kayıt (bu sayfa) — Bu sayfadakiler otomatik seçili değildir</span>
                                        <div className="flex items-center gap-2">
                                            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Önceki</Button>
                                            <span>{page} / {Math.max(1, Math.ceil(workspace.totalCount / workspace.pageSize))}</span>
                                            <Button size="sm" variant="outline" disabled={page >= Math.ceil(workspace.totalCount / workspace.pageSize)} onClick={() => setPage(p => p + 1)}>Sonraki</Button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Kontrolcü Atamaları — aynı taslak, yalnızca kapsamdaki satırlar */}
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Kod veya tanım ara..." className={`${inputCls} w-56`} />
                                <select value={frequencyFilter} onChange={(e) => setFrequencyFilter(e.target.value)} className={inputCls}>
                                    <option value="">Tüm sıklıklar</option>
                                    {Object.entries(FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                                {selectedRows.size > 0 && (
                                    <div className="flex items-center gap-2 ml-auto bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                                        <span className="text-xs font-semibold text-blue-700">{selectedRows.size} seçili</span>
                                        <Button size="sm" variant="outline" onClick={() => setBulkAssignRole('assigneeId')}>Kontrolcü Ata</Button>
                                        <Button size="sm" variant="outline" onClick={() => setBulkAssignRole('secondControllerId')}>İkinci Kontrolcü Ata</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setSelectedRows(new Set())}>Temizle</Button>
                                    </div>
                                )}
                            </div>

                            {assignmentRows.length === 0 ? (
                                <EmptyState title="Kapsamda kontrol yok" description="Önce Kapsam ve Takvim sekmesinden kontrolleri bu yılın kapsamına alın." />
                            ) : (
                                <DataTable
                                    columns={assignmentColumns}
                                    data={assignmentRows}
                                    rowKey={(r) => r.controlId}
                                    showCheckbox
                                    selectedRows={selectedRows}
                                    onRowSelect={(id) => setSelectedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                                    onSelectAll={() => setSelectedRows(prev => prev.size === assignmentRows.length ? new Set() : new Set(assignmentRows.map(r => r.controlId)))}
                                    loading={loading}
                                    storageKey="annual-plan-assignments-table"
                                    onRefresh={loadWorkspace}
                                />
                            )}
                        </>
                    )}
                </>
            ) : null}

            {/* Ay/takvim düzenleme modalı */}
            {editingRow && (
                <ScheduleEditModal
                    year={year}
                    row={editingRow}
                    onClose={() => setEditingRow(null)}
                    onSave={(patch) => {
                        setPendingEdits(prev => {
                            const next = new Map(prev);
                            const current = effectiveRow(editingRow);
                            next.set(editingRow.controlId, {
                                inScope: current.inScope,
                                frequency: patch.frequency ?? current.effectiveFrequency,
                                referenceMonth: patch.referenceMonth !== undefined ? patch.referenceMonth : current.effectiveReferenceMonth,
                                selectedMonths: patch.selectedMonths ?? current.effectiveSelectedMonths,
                                controlDate: patch.controlDate,
                                reason: patch.reason,
                                assigneeId: current.assigneeId ?? undefined,
                                secondControllerId: current.secondControllerId ?? undefined,
                            });
                            return next;
                        });
                        setEditingRow(null);
                    }}
                />
            )}

            {/* Toplu kontrolcü/ikinci kontrolcü atama */}
            {bulkAssignRole && (
                <BulkAssignModal
                    role={bulkAssignRole}
                    count={selectedRows.size}
                    year={year}
                    onClose={() => setBulkAssignRole(null)}
                    onConfirm={(userId, onlyMissing) => {
                        bulkAssign(bulkAssignRole, userId, onlyMissing);
                        setBulkAssignRole(null);
                    }}
                />
            )}

            {/* Planı Uygula önizleme */}
            <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={`Planı Uygula — ${year} Önizleme`} description="Onaylamadan hiçbir gerçek kayıt değişmez.">
                {previewData && (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">
                            {previewData.toAdd.length} kontrol kapsama alınacak, {previewData.toRemove.length} kontrol kapsamdan çıkarılacak, {previewData.toModify.length} kontrolün periyodikliği değişecek —{' '}
                            <b>{previewData.taskSummary.toCreate} task oluşturulacak</b>, {previewData.taskSummary.toCancel} task iptal edilecek, {previewData.taskSummary.protectedCount} devam eden/tamamlanmış task korunacak.
                        </p>

                        {previewData.missingSchedule.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <p className="text-xs font-bold text-amber-700 mb-1">Eksik takvim — plan bu kontroller nedeniyle uygulanamaz:</p>
                                {previewData.missingSchedule.map(c => <p key={c.controlId} className="text-xs text-amber-700">{c.controlCode} — {c.name}</p>)}
                            </div>
                        )}
                        {previewData.conflicts.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <p className="text-xs font-bold text-red-700 mb-1">Çatışma — devam eden task kararı gerekli (ilgili kontrolün detay sayfasından çözün):</p>
                                {previewData.conflicts.map(c => <p key={c.controlId} className="text-xs text-red-700">{c.controlCode} — {c.name}: {c.reason}</p>)}
                            </div>
                        )}
                        {previewData.assignmentBlocked.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <p className="text-xs font-bold text-amber-700 mb-1">Atama eksik — periyodik kontroller için Atanan Kontrolcü + İkinci Kontrolcü tamamlanmadan plan uygulanamaz:</p>
                                {previewData.assignmentBlocked.map(c => (
                                    <button key={c.controlId} onClick={() => { setPreviewOpen(false); setView('assignments'); }} className="block text-xs text-amber-700 hover:underline">
                                        {c.controlCode} — {c.name} (Kontrolcü Atamaları sekmesine git)
                                    </button>
                                ))}
                            </div>
                        )}

                        {previewData.toAdd.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-emerald-700 mb-1">Eklenecek ({previewData.toAdd.length})</p>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                    {previewData.toAdd.map(c => <p key={c.controlId} className="text-xs text-slate-600">{c.controlCode} — {c.name} ({c.periodCount} task)</p>)}
                                </div>
                            </div>
                        )}
                        {previewData.toRemove.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-red-700 mb-1">Kapsamdan çıkarılacak ({previewData.toRemove.length})</p>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                    {previewData.toRemove.map(c => <p key={c.controlId} className="text-xs text-slate-600">{c.controlCode} — {c.name}</p>)}
                                </div>
                            </div>
                        )}
                        {previewData.toModify.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-blue-700 mb-1">Değişecek ({previewData.toModify.length})</p>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                    {previewData.toModify.map(c => (
                                        <div key={c.controlId} className="text-xs text-slate-600">
                                            <span>{c.controlCode} — {c.name}: {c.toCreate} yeni, {c.toCancel} iptal, {c.protectedCount} korunan</span>
                                            {c.assigneeChange && <span className="block text-blue-600 ml-4">Atanan Kontrolcü değişecek</span>}
                                            {c.secondControllerChange && <span className="block text-blue-600 ml-4">İkinci Kontrolcü değişecek</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Vazgeç</Button>
                            <Button variant="primary" onClick={applyPlan} disabled={applying || previewData.blocked}>
                                {applying ? 'Uygulanıyor...' : previewData.blocked ? 'Çatışmalar çözülmeden uygulanamaz' : 'Onayla ve Uygula'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </PageShell>
    );
}

// ─── Kontrolcü seçici — yalnızca aktif/uygun kullanıcılar, aynı kişi iki alana ──
function UserPicker({ year, role, controlId, value, otherValue, onChange }: {
    year: number; role: 'assignee' | 'secondController'; controlId: string;
    value: string | null; otherValue: string | null;
    onChange: (userId: string | null) => void;
}) {
    const [options, setOptions] = useState<EligibleController[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        api.getEligibleControllers(year, role, controlId).then(res => {
            if (!cancelled) { setOptions(res.data); setLoaded(true); }
        }).catch(() => { if (!cancelled) setLoaded(true); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [year, role, controlId]);

    return (
        <select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            className={`${inputCls} w-full max-w-[190px] ${!loaded ? 'opacity-60' : ''}`}
            disabled={!loaded}
        >
            <option value="">{role === 'assignee' ? 'Atanan Kontrolcü Seçin' : 'İkinci Kontrolcü Seçin'}</option>
            {options.filter(u => u.id !== otherValue).map(u => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
        </select>
    );
}

// ─── Toplu atama diyaloğu ────────────────────────────────────────────────────
function BulkAssignModal({ role, count, year, onClose, onConfirm }: {
    role: 'assigneeId' | 'secondControllerId'; count: number; year: number;
    onClose: () => void; onConfirm: (userId: string, onlyMissing: boolean) => void;
}) {
    const [options, setOptions] = useState<EligibleController[]>([]);
    const [userId, setUserId] = useState('');
    const [onlyMissing, setOnlyMissing] = useState(true);
    const apiRole = role === 'assigneeId' ? 'assignee' : 'secondController';

    useEffect(() => {
        api.getEligibleControllers(year, apiRole).then(res => setOptions(res.data)).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [year, apiRole]);

    return (
        <Modal open onClose={onClose} title={role === 'assigneeId' ? 'Toplu Atanan Kontrolcü Ata' : 'Toplu İkinci Kontrolcü Ata'} description={`${count} kontrol seçili.`}>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Kontrolcü</label>
                    <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`${inputCls} w-full`}>
                        <option value="">Seçin</option>
                        {options.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                    </select>
                </div>
                <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="rounded border-slate-300" />
                    Yalnızca ataması eksik olan kontrollere uygula (mevcut atamaların üzerine yazma)
                </label>
                {!onlyMissing && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                        Bu seçenek kapalıyken, seçili kontrollerin MEVCUT atamaları varsa üzerine yazılır.
                    </p>
                )}
                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                    <Button variant="outline" onClick={onClose}>Vazgeç</Button>
                    <Button variant="primary" disabled={!userId} onClick={() => onConfirm(userId, onlyMissing)}>Uygula</Button>
                </div>
            </div>
        </Modal>
    );
}

// ─── Takvim düzenleme modalı ─────────────────────────────────────────────────

function ScheduleEditModal({ year, row, onClose, onSave }: {
    year: number;
    row: AnnualPlanRow;
    onClose: () => void;
    onSave: (patch: { frequency?: string; referenceMonth?: number | null; selectedMonths?: string[]; controlDate?: string; reason?: string }) => void;
}) {
    const [frequency, setFrequency] = useState(row.effectiveFrequency);
    const [referenceMonth, setReferenceMonth] = useState<number | null>(row.effectiveReferenceMonth);
    const [controlDate, setControlDate] = useState(row.effectiveControlDate ? row.effectiveControlDate.slice(0, 10) : '');
    const [reason, setReason] = useState('');
    const isAdHoc = frequency === 'AD_HOC';
    const usesMonthPicker = frequency === 'QUARTERLY' || frequency === 'SEMI_ANNUAL' || frequency === 'ANNUAL';
    const frequencyChanged = frequency !== row.effectiveFrequency;
    const referenceMonthChanged = usesMonthPicker && referenceMonth !== row.effectiveReferenceMonth;
    const requiresReason = frequencyChanged || referenceMonthChanged;

    const selectedGroup = usesMonthPicker && referenceMonth != null ? computeMonthGroup(frequency, referenceMonth) : [];
    const taskCount = frequency === 'MONTHLY' ? 12 : frequency === 'WEEKLY' ? '~52' : frequency === 'DAILY' ? 0
        : isAdHoc ? (controlDate ? 1 : 0) : selectedGroup.length;

    return (
        <Modal open onClose={onClose} title={`${row.controlCode} — ${row.name}`} description={`Planlanan yıl: ${year}`}>
            <div className="space-y-4">
                <Link href={`/controls/${row.controlId}`} target="_blank" className="text-xs text-blue-600 hover:underline -mt-2 inline-block">
                    Kontrol detayını aç ↗
                </Link>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Sıklık</label>
                    <select value={frequency} onChange={(e) => { setFrequency(e.target.value); setReferenceMonth(null); }} className={`${inputCls} w-full bg-white`}>
                        {Object.entries(FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                </div>

                {isAdHoc ? (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Hedef Tarih (Arızi — tek tarih)</label>
                        <input type="date" value={controlDate} onChange={(e) => setControlDate(e.target.value)} className={`${inputCls} w-full`} />
                        <p className="text-xs text-slate-400 mt-1">Arızi kontroller yıllık periyodik toplama dahil edilmez, "İhtiyaç Halinde" olarak izlenir.</p>
                    </div>
                ) : usesMonthPicker ? (
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-slate-700">12 Ay Seçicisi — bir referans ay seçin</label>
                            {referenceMonth != null && (
                                <button onClick={() => setReferenceMonth(null)} className="text-xs text-slate-400 hover:text-red-600">Seçimi Temizle</button>
                            )}
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                            {MONTH_LABELS_TR.map((label, idx) => {
                                const m = idx + 1;
                                const isRef = referenceMonth === m;
                                const isInGroup = referenceMonth != null && computeMonthGroup(frequency, referenceMonth).includes(m);
                                return (
                                    <button
                                        key={m}
                                        onClick={() => setReferenceMonth(m)}
                                        className={`px-2 py-2 rounded-lg text-xs font-semibold border transition-colors ${isRef ? 'bg-blue-600 border-blue-600 text-white' : isInGroup ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 mt-3 text-sm text-slate-600">
                            <p className="font-semibold text-slate-700 mb-1">
                                {referenceMonth == null ? 'Referans ay seçilmedi' : `Otomatik seçilen aylar: ${selectedGroup.map(m => MONTH_LABELS_TR[m - 1]).join(', ')}`}
                            </p>
                            <p className="text-xs text-slate-400">
                                Oluşacak uygulama sayısı: <b>{taskCount}</b> · Hedef tarih kuralı: her ayın son iş günü (hafta sonuysa bir önceki iş günü — resmî tatil takvimi yok).
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-sm text-slate-600">
                        <p className="font-semibold text-slate-700 mb-1">{describeSchedule({ ...row, effectiveFrequency: frequency })}</p>
                        <p className="text-xs text-slate-400">Oluşacak uygulama sayısı: <b>{taskCount}</b></p>
                    </div>
                )}

                {requiresReason && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Değişiklik Gerekçesi <span className="text-red-500">*</span></label>
                        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={`${inputCls} w-full`} placeholder="Sıklık/takvim değişikliği gerekçesi..." />
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                    <Button variant="outline" onClick={onClose}>Vazgeç</Button>
                    <Button
                        variant="primary"
                        disabled={requiresReason && !reason.trim()}
                        onClick={() => onSave({
                            frequency,
                            referenceMonth: usesMonthPicker ? referenceMonth : undefined,
                            selectedMonths: isAdHoc ? [] : row.effectiveSelectedMonths,
                            controlDate: isAdHoc && controlDate ? new Date(controlDate).toISOString() : undefined,
                            reason: requiresReason ? reason : undefined,
                        })}
                    >
                        Taslağa Uygula
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
