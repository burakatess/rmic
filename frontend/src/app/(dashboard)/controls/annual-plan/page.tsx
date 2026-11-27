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
import { AnnualPlanStepper, PlanDecisionDialog, PlanDecisionHistory } from '@/components/controls/AnnualPlanLifecycle';
import { PendingApprovalNotice } from '@/components/approvals/PendingApprovalNotice';
import { AnnualPlanAssignmentDecisions, hasUnresolvedPlanConflicts } from '@/components/controls/AnnualPlanAssignmentDecisions';
import { PermissionGate } from '@/components/auth';
import { useToast } from '@/components/ui/Toast';
import type {
    AnnualPlanAssignmentDecision, AnnualPlanRow, AnnualPlanWorkspace, AnnualPlanPreview, AnnualPlanScope, EligibleController, WorkloadByAssignee,
    AnnualPlanScopeMatrix, AnnualPlanWorkload,
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
// Plan yılı ve iş yükü grafiği için seçilebilir yıllar (sabit aralık — seçime göre kaymaz).
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3];

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
    const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

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
    const [assignmentDecisions, setAssignmentDecisions] = useState<AnnualPlanAssignmentDecision[]>([]);
    const [previewData, setPreviewData] = useState<AnnualPlanPreview | null>(null);
    const previewRequestId = useRef(0);
    const [previewContext, setPreviewContext] = useState<{ year: number; revision: number } | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [applying, setApplying] = useState(false);
    const [transitioning, setTransitioning] = useState(false);
    // İki çalışma görünümü — AYNI taslak/state üzerinde (madde 4): sekme değişince
    // pendingEdits/workspace kaybolmaz.
    const [view, setView] = useState<'schedule' | 'assignments'>('schedule');
    const [bulkAssignRole, setBulkAssignRole] = useState<'assigneeId' | 'secondControllerId' | null>(null);
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    const [workloadData, setWorkloadData] = useState<WorkloadByAssignee | null>(null);
    const reqId = useRef(0);

    // Kapsam tablosu yıl sütunları (kullanıcı kararı 2026-11): kutucuk o yılın kapsamını yerinde
    // değiştirir; sayfa yılı ve grafik yenilenmez. Plan yılı dışındaki yılların işaretlemeleri
    // `scopeEdits`te (`yıl:kontrol`) tutulur ve "Taslağı Kaydet" ile o yılın taslağına yazılır.
    const [yearWindowStart, setYearWindowStart] = useState(() => Math.min(CURRENT_YEAR, Number(searchParams.get('year')) || CURRENT_YEAR));
    const windowYears = useMemo(() => [yearWindowStart, yearWindowStart + 1, yearWindowStart + 2], [yearWindowStart]);
    const [matrix, setMatrix] = useState<AnnualPlanScopeMatrix | null>(null);
    const matrixReqId = useRef(0);
    const [scopeEdits, setScopeEdits] = useState<Map<string, boolean>>(new Map());
    const [bulkYear, setBulkYear] = useState<number | null>(null);

    // Aylık İş Yükü grafiği kendi yıl seçicisiyle çalışır (varsayılan: içinde bulunulan yıl);
    // tablo/plan yılı değişiklikleri grafiği yenilemez, yalnız kayıt/uygulama sonrası tazelenir.
    const [chartYear, setChartYear] = useState(CURRENT_YEAR);
    const [chartWorkload, setChartWorkload] = useState<AnnualPlanWorkload | null>(null);
    const [chartLoading, setChartLoading] = useState(false);
    const [chartRefresh, setChartRefresh] = useState(0);
    const chartReqId = useRef(0);

    // Kontrolcü seçenekleri — TEK sefer sekme/yıl bazında çekilir ve tüm satır
    // seçicileri arasında paylaşılır. Önceden her satırın kendi UserPicker'ı
    // bağımsız fetch atıyordu (N satır × 2 alan = 2N eşzamanlı istek) ve hata
    // sessizce yutuluyordu (.catch(() => setLoaded(true))) — bu da "seçim
    // boş geliyor" şikayetinin kök nedeniydi: tek bir isteğin başarısız
    // olması, hiçbir hata göstermeden o satırı kalıcı olarak boş bırakıyordu.
    const [controllerOptions, setControllerOptions] = useState<{ assignee: EligibleController[]; secondController: EligibleController[] }>({ assignee: [], secondController: [] });
    const [controllerOptionsLoading, setControllerOptionsLoading] = useState(false);
    const [controllerOptionsError, setControllerOptionsError] = useState(false);

    const loadControllerOptions = useCallback(async () => {
        setControllerOptionsLoading(true);
        setControllerOptionsError(false);
        try {
            const [assignee, secondController] = await Promise.all([
                api.getEligibleControllers(year, 'assignee'),
                api.getEligibleControllers(year, 'secondController'),
            ]);
            setControllerOptions({ assignee: assignee.data, secondController: secondController.data });
        } catch {
            setControllerOptionsError(true);
        } finally {
            setControllerOptionsLoading(false);
        }
    }, [year]);

    useEffect(() => {
        if (view === 'assignments') loadControllerOptions();
    }, [view, year, loadControllerOptions]);

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
            // Yıllık Takvim ve Atamalar: yalnız plan yılının kapsamındaki kontroller.
            scopeFilter: view === 'assignments' ? 'IN_SCOPE' : (scopeFilter || undefined),
            missingSchedule: (view === 'assignments' && missingOnly) || undefined,
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
    }, [year, scopeParams, search, frequencyFilter, scopeFilter, missingOnly, changedOnly, page, view]);

    useEffect(() => { loadWorkspace(); }, [loadWorkspace]);
    const refreshAll = () => { loadWorkspace(); setChartRefresh(k => k + 1); };

    // Kapsam tablosundaki kontrollerin pencere yıllarındaki durumu.
    const loadMatrix = useCallback(() => {
        const ids = (workspace?.data ?? []).map(r => r.controlId);
        if (view !== 'schedule' || ids.length === 0) { setMatrix(null); return; }
        const id = ++matrixReqId.current;
        api.getAnnualPlanScopeMatrix(windowYears, ids, scopeParams)
            .then(m => { if (id === matrixReqId.current) setMatrix(m); })
            .catch(() => { if (id === matrixReqId.current) setMatrix(null); });
    }, [workspace, windowYears, scopeParams, view]);
    useEffect(() => { loadMatrix(); }, [loadMatrix]);

    // Aylık İş Yükü + Kontrolcü İş Yükü (her zaman açık) — grafik yılına göre.
    useEffect(() => {
        const id = ++chartReqId.current;
        setChartLoading(true);
        Promise.all([
            api.getAnnualPlanWorkspace(chartYear, { ...scopeParams, page: 1, pageSize: 1 }),
            api.getWorkloadByAssignee(chartYear, scopeParams),
        ]).then(([w, byAssignee]) => {
            if (id !== chartReqId.current) return;
            setChartWorkload(w.workload);
            setWorkloadData(byAssignee);
        }).catch(() => {
            if (id !== chartReqId.current) return;
            setChartWorkload(null);
            setWorkloadData(null);
        }).finally(() => {
            if (id === chartReqId.current) setChartLoading(false);
        });
    }, [chartYear, scopeParams, chartRefresh]);
    useEffect(() => { setPage(1); }, [year, scope, directorateIds, search, frequencyFilter, scopeFilter, missingOnly, changedOnly, view]);

    // Sayfadan ayrılmada kaydedilmemiş değişiklik koruması (Madde 22).
    const unsavedCount = pendingEdits.size + scopeEdits.size;
    useEffect(() => {
        if (unsavedCount === 0) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [unsavedCount]);

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
        if (unsavedCount > 0) {
            const ok = window.confirm(`${unsavedCount} kaydedilmemiş değişikliğiniz var. Taslağı kaydetmeden plan yılını değiştirirseniz bu değişiklikler kaybolur. Devam edilsin mi?`);
            if (!ok) return;
            setPendingEdits(new Map());
            setScopeEdits(new Map());
        }
        // Plan yılı Kapsam tablosundaki yıl sütunlarında görünsün.
        if (targetYear < yearWindowStart) setYearWindowStart(targetYear);
        else if (targetYear > yearWindowStart + 2) setYearWindowStart(targetYear - 2);
        ++reqId.current;
        ++previewRequestId.current;
        setWorkspace(null);
        setLoading(true);
        setSelectedRows(new Set());
        setPreviewOpen(false);
        setPreviewData(null);
        setPreviewContext(null);
        setAssignmentDecisions([]);
        setBulkAssignRole(null);
        setEditingRow(null);
        setPage(1);
        setYear(targetYear);
    };

    const saveDraft = async () => {
        if (!workspace || unsavedCount === 0) return;
        setSaving(true);
        let saved = 0;
        const failures: string[] = [];
        const errText = (err: unknown) => err instanceof ApiError && err.status === 409
            ? 'taslak başka bir kullanıcı tarafından güncellendi veya plan onay sürecinde'
            : err instanceof Error ? err.message : 'kaydedilemedi';
        // 1) Plan yılı: kapsam + takvim + atama düzenlemeleri.
        if (pendingEdits.size > 0) {
            // '' = ataması sil, undefined = bu alana hiç dokunulmadı (backend deseni —
            // bkz. dto/annual-plan.dto.ts::AnnualPlanDraftItemPatchDto).
            const items = Array.from(pendingEdits.entries()).map(([controlId, edit]) => ({
                controlId, inScope: edit.inScope, frequency: edit.frequency,
                referenceMonth: edit.referenceMonth ?? undefined, selectedMonths: edit.selectedMonths,
                controlDate: edit.controlDate, reason: edit.reason,
                assigneeId: edit.assigneeId === undefined ? undefined : (edit.assigneeId ?? ''),
                secondControllerId: edit.secondControllerId === undefined ? undefined : (edit.secondControllerId ?? ''),
            }));
            try {
                await api.saveAnnualPlanDraftItems(year, { expectedRevision: workspace.draftRevision, items }, scopeParams);
                saved += items.length;
                setPendingEdits(new Map());
            } catch (err) {
                failures.push(`${year}: ${errText(err)}`);
                if (err instanceof ApiError && err.status === 409) setPendingEdits(new Map());
            }
        }
        // 2) Diğer yıllar: yalnız kapsam işaretlemeleri, her yılın kendi taslağına.
        const byYear = new Map<number, Array<{ controlId: string; inScope: boolean }>>();
        scopeEdits.forEach((inScope, key) => {
            const [y, controlId] = key.split(':');
            const list = byYear.get(Number(y)) ?? [];
            list.push({ controlId, inScope });
            byYear.set(Number(y), list);
        });
        for (const [y, items] of byYear) {
            const meta = matrix?.years.find(m => m.year === y);
            const dropYear = () => setScopeEdits(prev => new Map([...prev].filter(([k]) => !k.startsWith(`${y}:`))));
            try {
                await api.saveAnnualPlanDraftItems(y, { expectedRevision: meta?.draftRevision ?? 0, items }, scopeParams);
                saved += items.length;
                dropYear();
            } catch (err) {
                failures.push(`${y}: ${errText(err)}`);
                if (err instanceof ApiError && err.status === 409) dropYear();
            }
        }
        setSaving(false);
        if (saved > 0) toastSuccess('Kaydedildi', `${saved} değişiklik ilgili yılların taslağına kaydedildi.`);
        if (failures.length) toastError('Bazı değişiklikler kaydedilemedi', failures.join(' · '));
        refreshAll();
    };

    const discardChanges = async () => {
        if (!window.confirm(`${year} taslağındaki TÜM kaydedilmiş ve kaydedilmemiş değişiklikler geri alınacak. Emin misiniz?`)) return;
        setPendingEdits(new Map());
        setScopeEdits(prev => new Map([...prev].filter(([k]) => !k.startsWith(`${year}:`))));
        try {
            await api.discardAnnualPlanDraft(year);
            toastSuccess('Geri alındı', 'Taslak gerçek duruma sıfırlandı.');
            refreshAll();
        } catch (err) {
            toastError('Hata', err instanceof Error ? err.message : 'Geri alma başarısız.');
        }
    };

    const copyFromPreviousYear = async (options: { copyScope: boolean; copyCalendar: boolean; copyAssignments: boolean }) => {
        if (unsavedCount > 0) { toastError('Önce kaydedin', 'Kopyalamadan önce kaydedilmemiş değişikliklerinizi kaydedin veya geri alın.'); return; }
        try {
            const result = await api.copyAnnualPlanFromYear(year, year - 1, options, scopeParams) as any;
            const parts = [`${result.seeded} kontrol ${year - 1} yılından taslağa eklendi`, `${result.skippedAlreadyInDraft} zaten taslaktaydı (atlandı)`];
            if (options.copyAssignments && result.assignmentsDroppedInactive > 0) {
                parts.push(`${result.assignmentsDroppedInactive} atama pasif/geçersiz kullanıcı nedeniyle düşürüldü`);
            }
            toastSuccess('Kopyalandı', parts.join(' · '));
            setCopyModalOpen(false);
            refreshAll();
        } catch (err) {
            toastError('Hata', err instanceof Error ? err.message : 'Kopyalama başarısız.');
        }
    };

    const openPreview = async () => {
        if (!workspace || workspace.year !== year || loading) return;
        const requestId = ++previewRequestId.current;
        const context = { year, revision: workspace.draftRevision };
        if (pendingEdits.size > 0) { toastError('Önce kaydedin', 'Önizleme, kaydedilmiş taslağı kullanır. Lütfen önce "Taslağı Kaydet" yapın.'); return; }
        try {
            const preview = await api.previewAnnualPlanApply(year);
            if (requestId !== previewRequestId.current) return;
            setAssignmentDecisions([]);
            setPreviewContext(context);
            setPreviewData(preview);
            setPreviewOpen(true);
        } catch (err) {
            toastError('Hata', err instanceof Error ? err.message : 'Önizleme alınamadı.');
        }
    };

    const applyPlan = async () => {
        if (!workspace || !previewContext || previewContext.year !== year || workspace.year !== year) return;
        setApplying(true);
        try {
            const result = await api.applyAnnualPlan(previewContext.year, previewContext.revision, assignmentDecisions);
            if (!result.applied) {
                await openPreview();
                toastError('Uygulanamadı', 'Çözülmemiş çatışmalar/eksik takvimler var. Önizlemeyi tekrar kontrol edin.');
            } else {
                toastSuccess('Plan uygulandı', `${result.added} eklendi, ${result.removed} çıkarıldı, ${result.modified} güncellendi, ${result.tasksCreated} task oluşturuldu.`);
                setPreviewOpen(false);
                refreshAll();
            }
        } catch (err) {
            if (err instanceof ApiError && (err.status === 400 || err.status === 409)) {
                setPreviewOpen(false);
                setAssignmentDecisions([]);
                refreshAll();
            }
            toastError('Hata', err instanceof Error ? err.message : 'Plan uygulanamadı.');
        } finally {
            setApplying(false);
        }
    };

    // Karar notu penceresi (onay / değişiklik iste / onayı geri aç) — window.prompt yerine.
    const [decisionMode, setDecisionMode] = useState<'approve' | 'request-changes' | 'reopen' | null>(null);

    const submitForApproval = async () => {
        if (!workspace || pendingEdits.size > 0) {
            toastError('Önce kaydedin', 'Planı onaya göndermeden önce taslak değişikliklerini kaydedin.');
            return;
        }
        setTransitioning(true);
        try {
            await api.submitAnnualPlan(year, workspace.draftRevision, undefined, assignmentDecisions);
            toastSuccess('Onaya gönderildi', `${year} Yıllık Planı yönetici onayına gönderildi.`);
            setPreviewOpen(false);
            refreshAll();
        } catch (err) {
            toastError('Gönderilemedi', err instanceof Error ? err.message : 'Plan onaya gönderilemedi.');
        } finally { setTransitioning(false); }
    };

    const approvePlan = async (note?: string) => {
        if (!workspace) return;
        setTransitioning(true);
        try {
            await api.approveAnnualPlan(year, workspace.draftRevision, note || undefined);
            toastSuccess('Plan onaylandı', 'Onaylanan revision artık uygulanabilir.');
            setDecisionMode(null);
            refreshAll();
        } catch (err) {
            toastError('Onaylanamadı', err instanceof Error ? err.message : 'Plan onaylanamadı.');
        } finally { setTransitioning(false); }
    };

    const requestChanges = async (note: string) => {
        if (!workspace || !note) return;
        setTransitioning(true);
        try {
            await api.requestAnnualPlanChanges(year, workspace.draftRevision, note);
            toastSuccess('Değişiklik istendi', 'Plan yeniden düzenlemeye açıldı.');
            setDecisionMode(null);
            refreshAll();
        } catch (err) {
            toastError('İşlem başarısız', err instanceof Error ? err.message : 'Değişiklik talebi kaydedilemedi.');
        } finally { setTransitioning(false); }
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

    /** Toplu kapsama al/çıkar — seçilen yıl için (plan yılı ise takvim/atama ile birlikte). */
    const bulkScope = (action: 'ADD' | 'REMOVE', y: number) => {
        if (y === year) { bulkAction(action); return; }
        const meta = matrix?.years.find(m => m.year === y);
        if (!meta?.editable) { toastError('Düzenlenemez', `${y} planı onay sürecinde; değişiklik için önce değişiklik istenmeli.`); return; }
        setScopeEdits(prev => {
            const next = new Map(prev);
            for (const controlId of selectedRows) {
                const cell = matrix?.cells[controlId]?.[y];
                if (!cell) continue;
                const key = `${y}:${controlId}`;
                const target = action === 'ADD';
                if (target === cell.inScope) next.delete(key); else next.set(key, target);
            }
            return next;
        });
        setSelectedRows(new Set());
    };

    const planEditable = !!workspace && workspace.draftStatus !== 'PENDING_APPROVAL' && workspace.draftStatus !== 'APPROVED';
    const cellState = (row: AnnualPlanRow, y: number) => {
        if (y === year) {
            return { inScope: effectiveRow(row).inScope, unsaved: pendingEdits.has(row.controlId), pendingAction: row.pendingAction === 'MODIFY' ? 'NONE' : row.pendingAction, editable: planEditable, loaded: true };
        }
        const cell = matrix?.cells[row.controlId]?.[y];
        const edit = scopeEdits.get(`${y}:${row.controlId}`);
        return { inScope: edit ?? cell?.inScope ?? false, unsaved: edit !== undefined, pendingAction: cell?.pendingAction ?? 'NONE', editable: !!matrix?.years.find(m => m.year === y)?.editable, loaded: !!cell };
    };
    const toggleYearScope = (row: AnnualPlanRow, y: number) => {
        if (y === year) { toggleScope(row); return; }
        const cell = matrix?.cells[row.controlId]?.[y];
        if (!cell) return;
        const key = `${y}:${row.controlId}`;
        setScopeEdits(prev => {
            const next = new Map(prev);
            const target = !(prev.get(key) ?? cell.inScope);
            if (target === cell.inScope) next.delete(key); else next.set(key, target);
            return next;
        });
    };

    const bulkAssign = async (role: 'assigneeId' | 'secondControllerId', userId: string, onlyMissing: boolean) => {
        if (!workspace || selectedRows.size === 0) return;
        try {
            const result: any = await api.bulkAnnualPlanDraftAction(year, {
                controlIds: Array.from(selectedRows), action: 'ASSIGN',
                [role]: userId, onlyMissing, expectedRevision: workspace.draftRevision,
            } as any, scopeParams);
            // Backend TÜM taslağı döner (result.items = taslağın tamamı) — bu
            // işlemden gerçekten etkilenen kontrol sayısı ayrıca `affectedCount`
            // olarak gelir (onlyMissing nedeniyle bazı seçili kontroller
            // atlanmış olabilir, bu yüzden selectedRows.size de tam doğru değil).
            const affectedCount = result.affectedCount ?? selectedRows.size;
            if (affectedCount === 0) {
                toastInfo('Atama yapılmadı', 'Seçili kontrollerde hedef kontrolcü alanı zaten dolu. Değiştirmek için “Yalnızca eksikler” seçimini kaldırın.');
            } else {
                toastSuccess('Atandı', `${affectedCount} kontrole atama uygulandı.`);
            }
            // Seçim BİLEREK korunur — aynı seçili gruba art arda 1. ve 2.
            // kontrolcü ataması yapılabilsin (önceden burada sıfırlanıyordu,
            // bu da "başarılı ama seçimler sıfırlanıyor" şikayetinin nedeniydi).
            refreshAll();
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                toastError('Çakışma', 'Taslak başka bir kullanıcı tarafından güncellendi. Sayfa yenileniyor.');
                setSelectedRows(new Set());
                refreshAll();
            } else {
                toastError('Hata', err instanceof Error ? err.message : 'Toplu atama başarısız.');
            }
        }
    };

    const rows = useMemo(() => (workspace?.data ?? []).map(effectiveRow), [workspace, effectiveRow]);

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
        {
            key: 'description', header: 'Kontrol Tanımı', defaultWidth: 340,
            render: (row) => (
                <details className="group text-xs text-slate-600">
                    <summary className="list-none cursor-pointer">
                        <span className="line-clamp-3 leading-relaxed">{row.description || '—'}</span>
                        {row.description?.length > 180 && <span className="mt-1 inline-block font-semibold text-blue-700 group-open:hidden">Tam metni gör</span>}
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap leading-relaxed max-h-64 overflow-auto">{row.description}</p>
                </details>
            ),
        },
        {
            key: 'directorate', header: 'İlgili Direktörlük', defaultWidth: 190,
            render: (row) => <span className="text-xs text-slate-600" title="Kaynak kontrolün ilgili direktörlüğü">{row.directorateName || 'Atanmamış'}</span>,
        },
        { key: 'freq', header: 'Envanter Sıklığı', defaultWidth: 110, render: (row) => <span className="text-xs text-slate-500">{FREQUENCY_LABELS[row.frequency] || row.frequency}</span> },
        // Yıl sütunları: kutucuk o yılın kapsamını yerinde değiştirir (sayfa yılı ve grafik değişmez).
        ...windowYears.map((y): ColumnDef<AnnualPlanRow> => ({
            key: `y${y}`, header: y === year ? `${y} (plan yılı)` : `${y}`, defaultWidth: y === year ? 120 : 90,
            headerClassName: y === year ? 'bg-blue-50' : undefined, cellClassName: y === year ? 'bg-blue-50/40' : undefined,
            render: (row) => {
                const st = cellState(row, y);
                if (!st.loaded) return <span className="inline-block w-5 h-5 rounded border border-slate-200 bg-slate-50 animate-pulse" aria-hidden />;
                const title = !st.editable ? `${y} planı onay sürecinde; değişiklik için önce değişiklik istenmeli`
                    : st.unsaved ? `${y}: kaydedilmedi (Taslağı Kaydet)`
                    : st.pendingAction === 'ADD' ? `${y}: taslakta kapsama alınacak (plan uygulanınca)`
                    : st.pendingAction === 'REMOVE' ? `${y}: taslakta kapsamdan çıkarılacak (plan uygulanınca)`
                    : st.inScope ? `${y} kapsamında — çıkarmak için tıklayın` : `${y} kapsamına almak için tıklayın`;
                return (
                    <button type="button" disabled={!st.editable} onClick={() => toggleYearScope(row, y)} title={title}
                        aria-label={`${row.controlCode} ${y} kapsamı`} aria-pressed={st.inScope} data-testid={`scope-${y}-${row.controlCode}`}
                        className={`relative w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${st.inScope ? 'bg-blue-600 border-blue-600' : 'border-slate-300 hover:border-blue-400'} ${st.unsaved ? 'ring-2 ring-amber-300 ring-offset-1' : ''} ${!st.editable ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {st.inScope && <span className="text-white text-[10px] leading-none">✓</span>}
                        {!st.unsaved && st.pendingAction !== 'NONE' && (
                            <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${st.pendingAction === 'ADD' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        )}
                    </button>
                );
            },
        })),
        {
            key: 'status', header: `Durum (${year})`, defaultWidth: 150,
            render: (row) => (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {row.pendingAction === 'ADD' && <StatusBadge variant="success" size="sm">Eklenecek</StatusBadge>}
                    {row.pendingAction === 'REMOVE' && <StatusBadge variant="critical" size="sm">Kapsamdan çıkarılacak</StatusBadge>}
                    {row.pendingAction === 'MODIFY' && <StatusBadge variant="info" size="sm">Değişti</StatusBadge>}
                    {pendingEdits.has(row.controlId) && <StatusBadge variant="warning" size="sm" dot>Kaydedilmedi</StatusBadge>}
                </div>
            ),
        },
        // cellState/toggleYearScope bu bağımlılıklardan türer; her render'da yeniden oluşturulurlar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [year, focusControlId, windowYears, matrix, scopeEdits, pendingEdits, effectiveRow, planEditable]);

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
        {
            key: 'freq', header: `Sıklık (${year})`, defaultWidth: 110,
            render: (row) => (
                <span className="text-xs text-slate-600" title={row.effectiveFrequency !== row.frequency ? `Envanterdeki sıklık: ${FREQUENCY_LABELS[row.frequency] || row.frequency}` : undefined}>
                    {FREQUENCY_LABELS[row.effectiveFrequency] || row.effectiveFrequency}
                    {row.effectiveFrequency !== row.frequency && <span className="ml-1 text-[10px] text-amber-600">(bu yıl farklı)</span>}
                </span>
            ),
        },
        {
            key: 'schedule', header: `Uygulama Takvimi (${year})`, defaultWidth: 210,
            render: (row) => (
                <button onClick={() => setEditingRow(row)} disabled={!planEditable} data-testid={`schedule-${row.controlCode}`}
                    className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 text-left disabled:opacity-60 disabled:cursor-not-allowed"
                    title={planEditable ? `${year} uygulama takvimini düzenle` : 'Plan onay sürecinde; düzenlemek için önce değişiklik istenmeli'}>
                    <span className="truncate max-w-[170px]">{describeSchedule(row)}</span>
                    <span aria-hidden>✏️</span>
                </button>
            ),
        },
        { key: 'count', header: 'Planlanan Test', defaultWidth: 90, render: (row) => <span className="text-xs font-semibold text-slate-700">{row.plannedTestCount}</span> },
        {
            key: 'assignee', header: 'Atanan Kontrolcü', defaultWidth: 200,
            render: (row) => (
                <UserPicker
                    role="assignee" options={controllerOptions.assignee} loading={controllerOptionsLoading}
                    value={row.assigneeId} otherValue={row.secondControllerId}
                    onChange={(v) => setAssignment(row, { assigneeId: v })}
                />
            ),
        },
        {
            key: 'secondController', header: 'İkinci Kontrolcü', defaultWidth: 200,
            render: (row) => (
                <UserPicker
                    role="secondController" options={controllerOptions.secondController} loading={controllerOptionsLoading}
                    value={row.secondControllerId} otherValue={row.assigneeId}
                    onChange={(v) => setAssignment(row, { secondControllerId: v })}
                />
            ),
        },
        {
            key: 'status', header: 'Durum', defaultWidth: 170,
            render: (row) => (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {pendingEdits.has(row.controlId) && <StatusBadge variant="warning" size="sm" dot>Kaydedilmedi</StatusBadge>}
                    {row.pendingAction === 'ADD' && <StatusBadge variant="success" size="sm">Eklenecek</StatusBadge>}
                    {row.pendingAction === 'MODIFY' && <StatusBadge variant="info" size="sm">Değişti</StatusBadge>}
                    {row.missingSchedule && <StatusBadge variant="warning" size="sm">Takvim eksik</StatusBadge>}
                    {row.assignmentComplete
                        ? <StatusBadge variant="success" size="sm">Atama tamam</StatusBadge>
                        : <StatusBadge variant="warning" size="sm">Atama eksik</StatusBadge>}
                </div>
            ),
        },
    ], [year, controllerOptions, controllerOptionsLoading, pendingEdits, planEditable]);

    return (
        <PageShell>
            <PageHeader
                title="Yıllık Plan"
                description="Kontrolleri yıl bazında planlayın, iş yükünü canlı görün, taslağı önizleyip uygulayın"
                breadcrumbs={[{ label: 'Kontrol Yönetimi', href: '/controls' }, { label: 'Yıllık Plan' }]}
                actions={
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setCopyModalOpen(true)}>Önceki Yıldan Kopyala</Button>
                        <Button size="sm" variant="outline" onClick={discardChanges} disabled={!workspace || (workspace.draftRevision === 0 && pendingEdits.size === 0)}>Değişiklikleri Geri Al</Button>
                        <Button size="sm" variant="outline" onClick={saveDraft} disabled={unsavedCount === 0 || saving}>
                            {saving ? 'Kaydediliyor...' : `Taslağı Kaydet${unsavedCount > 0 ? ` (${unsavedCount})` : ''}`}
                        </Button>
                        <Button size="sm" variant="primary" onClick={openPreview} disabled={loading || !workspace || workspace.year !== year}>Önizle</Button>
                    </div>
                }
            />

            {/* Yıl + taslak durumu */}
            <div className="flex flex-wrap items-center gap-3 mb-5 bg-white border border-slate-200 rounded-xl px-4 py-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    Plan Yılı
                    <select aria-label="Plan yılı" value={year} onChange={(e) => switchToYear(Number(e.target.value))} className={inputCls}>
                        {[...new Set([...YEAR_OPTIONS, year])].sort().map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </label>
                {workspace && (
                    <>
                        <StatusBadge variant={workspace.draftStatus === 'APPLIED' && workspace.changedCount === 0 ? 'success' : workspace.changedCount > 0 || pendingEdits.size > 0 ? 'warning' : 'neutral'}>
                            {workspace.changedCount > 0 || pendingEdits.size > 0 ? 'Değişiklik Var' : ({ OPEN: 'Taslak', PENDING_APPROVAL: 'Onay Bekliyor', CHANGES_REQUESTED: 'Değişiklik İstendi', APPROVED: 'Onaylandı', APPLIED: 'Uygulandı' } as Record<string, string>)[workspace.draftStatus]}
                        </StatusBadge>
                        <span className="text-xs text-slate-400">
                            Son güncelleme: {new Date(workspace.draftUpdatedAt).toLocaleString('tr-TR')}
                            {workspace.draftLastAppliedAt && ` · Son uygulama: ${new Date(workspace.draftLastAppliedAt).toLocaleString('tr-TR')}`}
                        </span>
                    </>
                )}

                {workspace && (
                    <div className="ml-auto flex items-center gap-2">
                        {workspace.draftStatus === 'PENDING_APPROVAL' && (
                            <>
                                {workspace.capabilities?.canRequestChanges && <Button size="sm" variant="outline" onClick={() => setDecisionMode('request-changes')} disabled={transitioning}>Değişiklik İste</Button>}
                                {workspace.capabilities?.canApprove
                                    ? <Button size="sm" variant="primary" onClick={() => setDecisionMode('approve')} disabled={transitioning}>Onayla</Button>
                                    : <span className="text-xs text-slate-500">Onay başka bir yöneticide (gönderen kendi planını onaylayamaz)</span>}
                            </>
                        )}
                        {workspace.draftStatus === 'APPROVED' && (
                            <Button size="sm" variant="outline" onClick={() => setDecisionMode('reopen')} disabled={transitioning}>Onayı Geri Aç</Button>
                        )}
                    </div>
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

            {workspace && (
                <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <AnnualPlanStepper status={workspace.draftStatus} />
                    {workspace.decisionNote && (workspace.draftStatus === 'CHANGES_REQUESTED' || workspace.draftStatus === 'APPROVED' || workspace.draftStatus === 'PENDING_APPROVAL') && (
                        <p className="text-xs text-slate-600"><span className="font-semibold">Son karar notu:</span> {workspace.decisionNote}</p>
                    )}
                </div>
            )}
            {workspace?.draftStatus === 'PENDING_APPROVAL' && workspace.pendingApproval && (
                <div className="mb-5">
                    <PendingApprovalNotice
                        title={`${year} Yıllık Planı onay bekliyor`}
                        waitingFor={workspace.pendingApproval.approvers}
                        sentBy={workspace.pendingApproval.submittedBy?.name}
                        sentAt={workspace.pendingApproval.submittedAt}
                        hint="Planı gönderen kişi kendi planını onaylayamaz; yetkili başka bir yönetici onaylar."
                    />
                </div>
            )}
            {workspace && <PlanDecisionHistory year={year} refreshKey={`${workspace.draftStatus}:${workspace.draftRevision}:${workspace.draftLastAppliedAt ?? ''}`} />}
            <PlanDecisionDialog
                mode={decisionMode} busy={transitioning} onCancel={() => setDecisionMode(null)}
                onSubmit={(note) => (decisionMode === 'approve' ? approvePlan(note) : requestChanges(note))}
            />

            {/* Aylık İş Yükü — kendi yıl seçicisiyle; tablo ve plan yılı değişikliklerinde yenilenmez. */}
            <section className="bg-white rounded-xl border border-slate-200 p-5 mb-6 space-y-4" aria-labelledby="workload-title" data-testid="workload-section">
                <div className="flex flex-wrap items-center gap-3">
                    <h3 id="workload-title" className="text-sm font-semibold text-slate-700">Aylık İş Yükü — {chartYear}</h3>
                    <div role="group" aria-label="İş yükü yılı" className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                        {YEAR_OPTIONS.map(y => (
                            <button key={y} type="button" onClick={() => setChartYear(y)} aria-pressed={chartYear === y}
                                className={`px-3 py-1 text-xs font-semibold ${chartYear === y ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                                {y}
                            </button>
                        ))}
                    </div>
                    <span className="text-xs text-slate-400">Yetkili kapsamın tamamı, kaydedilmiş taslağa göre; tablo filtrelerinden ve plan yılından bağımsız.</span>
                </div>
                {chartLoading && !chartWorkload ? (
                    <LoadingState message="Yükleniyor..." />
                ) : !chartWorkload ? (
                    <p className="text-sm text-slate-500">İş yükü yüklenemedi.</p>
                ) : (
                    <>
                        <KpiGrid columns={5}>
                            <KpiCard title="Kapsamdaki Kontrol" value={chartWorkload.controlCount} variant="primary" />
                            <KpiCard title="Toplam Task" value={chartWorkload.totalTasks} variant="default" subtitle="AD_HOC ve günlük hariç" />
                            <KpiCard
                                title="Sıklık Kırılımı"
                                value={Object.keys(chartWorkload.byFrequency).length}
                                variant="info"
                                subtitle={
                                    <span className="flex flex-col gap-0.5 mt-0.5">
                                        {Object.entries(chartWorkload.byFrequency).map(([f, c]) => (
                                            <span key={f}>{FREQUENCY_LABELS[f] || f}: <b>{c}</b></span>
                                        ))}
                                    </span>
                                }
                            />
                            <KpiCard title="Arızi (İhtiyaç Halinde)" value={chartWorkload.adHocCount} variant="violet" subtitle={chartWorkload.missingScheduleCount > 0 ? `${chartWorkload.missingScheduleCount} takvimsiz` : undefined} />
                            <KpiCard title="En Yoğun Ay" value={chartWorkload.peakMonths.length > 0 ? chartWorkload.peakMonths.map(m => MONTH_LABELS_SHORT[m]).join(', ') : '—'} variant="warning" subtitle={chartWorkload.peakCount > 0 ? `${chartWorkload.peakCount} task` : undefined} />
                        </KpiGrid>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartWorkload.byMonth.map((count, i) => ({ month: MONTH_LABELS_SHORT[i], count, idx: i }))}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                                    <Bar dataKey="count" name="Task" radius={[4, 4, 0, 0]}>
                                        {chartWorkload.byMonth.map((_, i) => <Cell key={i} fill={chartWorkload.peakMonths.includes(i) ? '#2563eb' : '#93c5fd'} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </>
                )}
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Kontrolcü İş Yükü — {chartYear}</h4>
                    <WorkloadPanel data={workloadData} loading={chartLoading} />
                </div>
            </section>

            {/* Görünüm sekmesi — aynı taslak, iki çalışma görünümü (madde 4) */}
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden mb-5 w-fit">
                <button onClick={() => { setView('schedule'); setSelectedRows(new Set()); }} className={`px-4 py-2 text-sm font-semibold ${view === 'schedule' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                    Kapsam
                </button>
                <button onClick={() => { setView('assignments'); setSelectedRows(new Set()); }} className={`px-4 py-2 text-sm font-semibold ${view === 'assignments' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                    Yıllık Takvim ve Atamalar — {year}
                </button>
            </div>

            {/* Tablolar */}
            {loading && !workspace ? (
                <LoadingState message="Yükleniyor..." />
            ) : error ? (
                <ErrorState description={error} onRetry={loadWorkspace} />
            ) : workspace ? (
                <>
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
                                    <option value="">{year} kapsamında / dışında (tümü)</option>
                                    <option value="IN_SCOPE">Yalnızca {year} kapsamında</option>
                                    <option value="OUT_OF_SCOPE">Yalnızca {year} kapsamı dışında</option>
                                </select>
                                <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={changedOnly} onChange={(e) => setChangedOnly(e.target.checked)} className="rounded border-slate-300" />
                                    Taslakta değiştirilmiş
                                </label>
                                {selectedRows.size > 0 && (
                                    <div className="flex items-center gap-2 ml-auto bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                                        <span className="text-xs font-semibold text-blue-700">{selectedRows.size} seçili</span>
                                        <select aria-label="Toplu işlem yılı" value={bulkYear ?? year} onChange={(e) => setBulkYear(Number(e.target.value))} className={`${inputCls} py-1`}>
                                            {windowYears.map(y => <option key={y} value={y}>{y}{y === year ? ' (plan yılı)' : ''}</option>)}
                                        </select>
                                        <Button size="sm" variant="outline" onClick={() => bulkScope('ADD', bulkYear ?? year)}>Kapsama Al</Button>
                                        <Button size="sm" variant="outline" onClick={() => bulkScope('REMOVE', bulkYear ?? year)}>Kapsamdan Çıkar</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setSelectedRows(new Set())}>Temizle</Button>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-slate-500">
                                <div className="flex items-center gap-1" role="group" aria-label="Yıl sütunları">
                                    <Button size="sm" variant="outline" onClick={() => setYearWindowStart(s => s - 1)} aria-label="Önceki yıllar">◀</Button>
                                    <span className="px-2 font-semibold text-slate-700">{windowYears[0]} – {windowYears[2]}</span>
                                    <Button size="sm" variant="outline" onClick={() => setYearWindowStart(s => s + 1)} aria-label="Sonraki yıllar">▶</Button>
                                </div>
                                <span>Kutucuğa tıklayarak kontrolü o yılın kapsamına alın veya çıkarın; sayfa yenilenmez.</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> taslakta eklenecek</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> taslakta çıkarılacak</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded ring-2 ring-amber-300" /> kaydedilmedi</span>
                                <span>Takvim ve kontrolcüler: <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => setView('assignments')}>Yıllık Takvim ve Atamalar</button></span>
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
                            {controllerOptionsError && (
                                <div className="flex items-center justify-between gap-3 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                    <span className="text-sm text-red-700">Kontrolcü listesi yüklenemedi — seçim alanları bu nedenle boş görünüyor.</span>
                                    <Button size="sm" variant="outline" onClick={loadControllerOptions}>Tekrar Dene</Button>
                                </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Kod veya tanım ara..." className={`${inputCls} w-56`} />
                                <select value={frequencyFilter} onChange={(e) => setFrequencyFilter(e.target.value)} className={inputCls}>
                                    <option value="">Tüm sıklıklar</option>
                                    {Object.entries(FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                                <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} className="rounded border-slate-300" />
                                    Takvimi eksik
                                </label>
                                <span className="text-xs text-slate-500">Sıklık, uygulama ayları ve kontrolcüler yalnız {year} için geçerlidir; diğer yıllar ayrı planlanır.</span>
                                {selectedRows.size > 0 && (
                                    <div className="flex items-center gap-2 ml-auto bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                                        <span className="text-xs font-semibold text-blue-700">{selectedRows.size} seçili</span>
                                        <Button size="sm" variant="outline" onClick={() => setBulkAssignRole('assigneeId')}>Kontrolcü Ata</Button>
                                        <Button size="sm" variant="outline" onClick={() => setBulkAssignRole('secondControllerId')}>İkinci Kontrolcü Ata</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setSelectedRows(new Set())}>Temizle</Button>
                                    </div>
                                )}
                            </div>

                            {[...pendingEdits.keys()].some(id => !workspace.data.some(r => r.controlId === id)) ? (
                                <div className="flex items-center justify-between gap-3 mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                    <span className="text-sm text-amber-800">Kapsam sekmesinde kaydedilmemiş değişiklikler var; yeni kapsama alınan kontroller kaydedince bu listede görünür.</span>
                                    <Button size="sm" variant="outline" onClick={saveDraft} disabled={saving}>Taslağı Kaydet</Button>
                                </div>
                            ) : null}

                            {assignmentRows.length === 0 ? (
                                <EmptyState title={`${year} kapsamında kontrol yok`} description={`Önce Kapsam sekmesinden kontrolleri ${year} kapsamına alıp taslağı kaydedin.`} />
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
                    applied={(() => { const raw = workspace?.data.find(r => r.controlId === editingRow.controlId); return !!raw && raw.inScope && raw.pendingAction !== 'ADD'; })()}
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

            {/* Önceki yıldan kopyalama — üç bağımsız seçenek (madde 18) */}
            {copyModalOpen && (
                <CopyFromYearModal
                    fromYear={year - 1}
                    onClose={() => setCopyModalOpen(false)}
                    onConfirm={copyFromPreviousYear}
                />
            )}

            {/* Toplu kontrolcü/ikinci kontrolcü atama */}
            {bulkAssignRole && (
                <BulkAssignModal
                    role={bulkAssignRole}
                    count={selectedRows.size}
                    options={bulkAssignRole === 'assigneeId' ? controllerOptions.assignee : controllerOptions.secondController}
                    onClose={() => setBulkAssignRole(null)}
                    onConfirm={(userId, onlyMissing) => {
                        bulkAssign(bulkAssignRole, userId, onlyMissing);
                        setBulkAssignRole(null);
                    }}
                />
            )}

            {/* Planı Uygula önizleme */}
            <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={`Yıllık Plan — ${year} Önizleme`} description="Önizleme hiçbir gerçek kayıt değiştirmez.">
                {previewData && (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">
                            {previewData.toAdd.length} kontrol kapsama alınacak, {previewData.toRemove.length} kontrol kapsamdan çıkarılacak, {previewData.toModify.length} kontrolün takvimi veya ataması değişecek —{' '}
                            <b>{previewData.taskSummary.toCreate} task oluşturulacak</b>, {previewData.taskSummary.toCancel} task iptal edilecek, {previewData.taskSummary.protectedCount} devam eden/tamamlanmış task korunacak.
                        </p>

                        {previewData.missingSchedule.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <p className="text-xs font-bold text-amber-700 mb-1">Eksik takvim — plan bu kontroller nedeniyle uygulanamaz:</p>
                                {previewData.missingSchedule.map(c => <p key={c.controlId} className="text-xs text-amber-700">{c.controlCode} — {c.name}</p>)}
                            </div>
                        )}
                        {previewData.conflicts.some(c => c.type !== 'ASSIGNMENT') && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <p className="text-xs font-bold text-red-700 mb-1">Kapsamdan çıkarma engellendi — devam eden görevler var:</p>
                                {previewData.conflicts.filter(c => c.type !== 'ASSIGNMENT').map(c => <p key={c.controlId} className="text-xs text-red-700">{c.controlCode} — {c.name}: {c.reason}</p>)}
                            </div>
                        )}
                        <PermissionGate permission="control:*">
                            <AnnualPlanAssignmentDecisions preview={previewData} decisions={assignmentDecisions} onChange={setAssignmentDecisions} disabled={applying} />
                        </PermissionGate>
                        {previewData.assignmentBlocked.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <p className="text-xs font-bold text-amber-700 mb-1">Atama eksik — periyodik kontroller için Atanan Kontrolcü + İkinci Kontrolcü tamamlanmadan plan uygulanamaz:</p>
                                {previewData.assignmentBlocked.map(c => (
                                    <button key={c.controlId} onClick={() => { setPreviewOpen(false); setView('assignments'); }} className="block text-xs text-amber-700 hover:underline">
                                        {c.controlCode} — {c.name} (Yıllık Takvim ve Atamalar sekmesine git)
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
                            <PermissionGate permission="control:*">
                                {workspace?.draftStatus === 'APPROVED' ? (
                                    <Button variant="primary" onClick={applyPlan} disabled={applying || hasUnresolvedPlanConflicts(previewData, assignmentDecisions)}>
                                        {applying ? 'Uygulanıyor...' : hasUnresolvedPlanConflicts(previewData, assignmentDecisions) ? 'Eksikleri ve görev kararlarını tamamlayın' : 'Onaylanmış Planı Uygula'}
                                    </Button>
                                ) : (
                                    <Button variant="primary" onClick={submitForApproval} disabled={transitioning || hasUnresolvedPlanConflicts(previewData, assignmentDecisions)}>
                                        {transitioning ? 'Gönderiliyor...' : hasUnresolvedPlanConflicts(previewData, assignmentDecisions) ? 'Eksikleri tamamlayın' : 'Onaya Gönder'}
                                    </Button>
                                )}
                            </PermissionGate>
                        </div>
                    </div>
                )}
            </Modal>
        </PageShell>
    );
}

// ─── Kontrolcü İş Yükü — madde 12: kontrol sayısı ≠ task sayısı, birinci+
// ikinci kontrolcü nedeniyle toplam task sayısı ikiye katlanmaz (ayrı sütun). ──
function WorkloadPanel({ data, loading }: { data: WorkloadByAssignee | null; loading: boolean }) {
    if (loading && !data) {
        return <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 text-sm text-slate-400">Yükleniyor...</div>;
    }
    if (!data) return null;

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 space-y-4">
            <div className="flex items-center gap-4">
                <StatusBadge variant={data.unassignedControlCount > 0 ? 'warning' : 'success'} size="sm">
                    {data.unassignedControlCount} atanmamış kontrol
                </StatusBadge>
                <StatusBadge variant={data.unassignedTaskCount > 0 ? 'warning' : 'success'} size="sm">
                    {data.unassignedTaskCount} atanmamış task
                </StatusBadge>
                <span className="text-xs text-slate-400">Task sayısı gerçek iş yükü saati değildir — yalnızca planlanan kayıt sayısıdır.</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Atanan Kontrolcü Başına</h4>
                    {data.byAssignee.length === 0 ? (
                        <p className="text-xs text-slate-400">Henüz atama yok.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead><tr className="text-left text-xs text-slate-400"><th className="font-medium pb-1">Kontrolcü</th><th className="font-medium pb-1 text-right">Kontrol</th><th className="font-medium pb-1 text-right">Task</th></tr></thead>
                            <tbody>
                                {data.byAssignee.sort((a, b) => b.taskCount - a.taskCount).map(a => (
                                    <tr key={a.userId} className="border-t border-slate-50">
                                        <td className="py-1 text-slate-700">{a.name}</td>
                                        <td className="py-1 text-right text-slate-600">{a.controlCount}</td>
                                        <td className="py-1 text-right font-semibold text-slate-700">{a.taskCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">İkinci Kontrolcü Başına (İnceleme)</h4>
                    {data.bySecondController.length === 0 ? (
                        <p className="text-xs text-slate-400">Henüz atama yok.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead><tr className="text-left text-xs text-slate-400"><th className="font-medium pb-1">Kontrolcü</th><th className="font-medium pb-1 text-right">İnceleme</th></tr></thead>
                            <tbody>
                                {data.bySecondController.sort((a, b) => b.reviewCount - a.reviewCount).map(a => (
                                    <tr key={a.userId} className="border-t border-slate-50">
                                        <td className="py-1 text-slate-700">{a.name}</td>
                                        <td className="py-1 text-right font-semibold text-slate-700">{a.reviewCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Kontrolcü seçici — yalnızca aktif/uygun kullanıcılar, aynı kişi iki alana ──
// Seçenekler artık üst bileşenden (bir kez, sekme/yıl bazında) prop olarak
// gelir — her satırın kendi bağımsız fetch'i atması ve hatayı sessizce
// yutması KALDIRILDI (bkz. üstteki loadControllerOptions yorumu).
function UserPicker({ role, options, loading, value, otherValue, onChange }: {
    role: 'assignee' | 'secondController'; options: EligibleController[]; loading: boolean;
    value: string | null; otherValue: string | null;
    onChange: (userId: string | null) => void;
}) {
    return (
        <select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            className={`${inputCls} w-full max-w-[190px] ${loading ? 'opacity-60' : ''}`}
            disabled={loading}
        >
            <option value="">{role === 'assignee' ? 'Atanan Kontrolcü Seçin' : 'İkinci Kontrolcü Seçin'}</option>
            {options.filter(u => u.id !== otherValue).map(u => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
        </select>
    );
}

// ─── Toplu atama diyaloğu ────────────────────────────────────────────────────
// ─── Önceki yıldan kopyalama — üç bağımsız anahtar (madde 18) ────────────────
function CopyFromYearModal({ fromYear, onClose, onConfirm }: {
    fromYear: number;
    onClose: () => void;
    onConfirm: (options: { copyScope: boolean; copyCalendar: boolean; copyAssignments: boolean }) => void;
}) {
    const [copyScope, setCopyScope] = useState(true);
    const [copyCalendar, setCopyCalendar] = useState(true);
    const [copyAssignments, setCopyAssignments] = useState(false);

    return (
        <Modal open onClose={onClose} title="Önceki Yıldan Kopyala" description={`${fromYear} yılının kapsamı bu yılın taslağına eklenecek.`}>
            <div className="space-y-3">
                <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={copyScope} onChange={(e) => setCopyScope(e.target.checked)} className="mt-0.5 rounded border-slate-300" />
                    <span>
                        <span className="font-semibold">Kapsamı kopyala</span>
                        <span className="block text-xs text-slate-400">{fromYear} yılında kapsamda olan kontroller bu yılın taslağına eklenir. Kapalıysa hiçbir şey kopyalanmaz.</span>
                    </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={copyCalendar} onChange={(e) => setCopyCalendar(e.target.checked)} disabled={!copyScope} className="mt-0.5 rounded border-slate-300" />
                    <span>
                        <span className="font-semibold">Takvimi kopyala</span>
                        <span className="block text-xs text-slate-400">Sıklık ve referans ay {fromYear}&apos;den aynen kopyalanır. Kapalıysa kontrolün kendi varsayılan sıklığı kullanılır.</span>
                    </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={copyAssignments} onChange={(e) => setCopyAssignments(e.target.checked)} disabled={!copyScope} className="mt-0.5 rounded border-slate-300" />
                    <span>
                        <span className="font-semibold">Kontrolcü atamalarını kopyala</span>
                        <span className="block text-xs text-slate-400">Varsayılan kapalı. Açılırsa kopyalanan kullanıcıların aktiflik durumu yeniden doğrulanır — pasif kullanıcı sessizce düşürülür.</span>
                    </span>
                </label>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                    <Button variant="outline" onClick={onClose}>Vazgeç</Button>
                    <Button variant="primary" onClick={() => onConfirm({ copyScope, copyCalendar, copyAssignments })}>Kopyala</Button>
                </div>
            </div>
        </Modal>
    );
}

function BulkAssignModal({ role, count, options, onClose, onConfirm }: {
    role: 'assigneeId' | 'secondControllerId'; count: number; options: EligibleController[];
    onClose: () => void; onConfirm: (userId: string, onlyMissing: boolean) => void;
}) {
    const [userId, setUserId] = useState('');
    const [onlyMissing, setOnlyMissing] = useState(true);

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

function ScheduleEditModal({ year, row, applied, onClose, onSave }: {
    year: number;
    row: AnnualPlanRow;
    /** Kontrol bu yılın kapsamında UYGULANMIŞ mı (testleri üretilmiş). Yeni planlanan yılda gerekçe istenmez. */
    applied: boolean;
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
    // Gerekçe yalnız uygulanmış bir yılın takvimi değişirken istenir (testler yeniden üretilir).
    // Önceden her ay değişikliğinde zorunluydu; 2028 için Ocak→Mart gibi yeni yıl seçimi
    // gerekçe yazılmadan uygulanamıyordu.
    const requiresReason = applied && (frequencyChanged || referenceMonthChanged);

    const selectedGroup = usesMonthPicker && referenceMonth != null ? computeMonthGroup(frequency, referenceMonth) : [];
    const taskCount = frequency === 'MONTHLY' ? 12 : frequency === 'WEEKLY' ? '~52' : frequency === 'DAILY' ? 0
        : isAdHoc ? (controlDate ? 1 : 0) : selectedGroup.length;

    return (
        <Modal open onClose={onClose} title={`${row.controlCode} — ${row.name}`} description={`Planlanan yıl: ${year}`}>
            <div className="space-y-4">
                <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2" data-testid="schedule-year-note">
                    Bu takvim yalnızca <b>{year}</b> için geçerlidir. Diğer yılların sıklığı ve ayları ayrı belirlenir
                    (ör. 2027'de Ocak–Temmuz, 2028'de Mart–Eylül).
                </p>
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
                        <p className="text-xs text-slate-500 mb-1">Bu kontrolün {year} takvimi uygulanmış; değişiklik testleri yeniden düzenler.</p>
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
