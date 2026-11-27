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
import { PlanDecisionDialog, PlanDecisionHistory } from '@/components/controls/AnnualPlanLifecycle';
import { AnnualPlanAssignmentDecisions, hasUnresolvedPlanConflicts } from '@/components/controls/AnnualPlanAssignmentDecisions';
import { PermissionGate } from '@/components/auth';
import { useToast } from '@/components/ui/Toast';
import type {
    AnnualPlanAssignmentDecision, AnnualPlanRow, AnnualPlanWorkspace, AnnualPlanPreview, AnnualPlanScope, EligibleController, WorkloadByAssignee,
    AnnualPlanScopeMatrix,
} from '@/types/annual-plan';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { computeMonthGroup } from '@/lib/month-group';

/**
 * Yıllık Plan (kullanıcı tasarımı 2026-11):
 * - Sayfada TEK yıl seçimi: üstteki yıl düğmeleri (varsayılan içinde bulunulan yıl). İş yükü grafiği,
 *   kontrolcü iş yükü (hep açık), onay durumu ve "Takvim ve Atamalar" sekmesi bu yıla göredir.
 * - Kapsam sekmesi: her kontrolün satırında sabit üç yıl kutucuğu (bu yıl + 2). Kutucuk o yılın
 *   kapsamını yerinde değiştirir; sayfa yenilenmez. "Kaydet" her yılın kendi taslağına yazar.
 * - Takvim ve Atamalar sekmesi: seçili yıla açılmış kontroller; o yıla özel sıklık, aylar (satırda
 *   doğrudan seçilir), 1. ve 2. kontrolcü. Her yılın takvimi birbirinden bağımsızdır.
 */

const FREQUENCY_LABELS: Record<string, string> = {
    DAILY: 'Günlük', WEEKLY: 'Haftalık', MONTHLY: 'Aylık', QUARTERLY: '3 Aylık',
    SEMI_ANNUAL: '6 Aylık', ANNUAL: 'Yıllık', AD_HOC: 'Arızi',
};
const MONTH_LABELS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const SCOPE_LABELS: Record<AnnualPlanScope, string> = { MINE: 'İşlerim', UNIT: 'Birimim', ORG: 'Kurum' };
const STATUS_LABELS: Record<AnnualPlanWorkspace['draftStatus'], string> = {
    OPEN: 'Taslak', PENDING_APPROVAL: 'Onay bekliyor', CHANGES_REQUESTED: 'Değişiklik istendi', APPROVED: 'Onaylandı', APPLIED: 'Uygulandı',
};
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_BUTTONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3];
/** Kapsam sekmesindeki sabit yıl sütunları: içinde bulunulan yıl + 2 yıl. */
const SCOPE_YEARS = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];
const MONTH_PICKER_FREQS = new Set(['QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']);

const inputCls = 'px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400';

/** Takvim ve Atamalar satırındaki kaydedilmemiş düzenleme (yalnız seçili yıl). */
interface RowEdit {
    frequency?: string;
    referenceMonth?: number | null;
    controlDate?: string | null;
    assigneeId?: string | null;
    secondControllerId?: string | null;
}

const editable = (status?: AnnualPlanWorkspace['draftStatus']) => !!status && status !== 'PENDING_APPROVAL' && status !== 'APPROVED';

export default function AnnualPlanPage() {
    return (
        <Suspense fallback={<LoadingState message="Yükleniyor..." />}>
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
    const [view, setView] = useState<'scope' | 'schedule'>(searchParams.get('tab') === 'schedule' ? 'schedule' : 'scope');
    const scopeParams = useMemo(() => ({ scope }), [scope]);

    // ── Seçili yıl: durum, iş yükü ve Takvim ve Atamalar satırları (tek istek) ──
    const [plan, setPlan] = useState<AnnualPlanWorkspace | null>(null);
    const [planLoading, setPlanLoading] = useState(true);
    const [planError, setPlanError] = useState<string | null>(null);
    const [workload, setWorkload] = useState<WorkloadByAssignee | null>(null);
    const [schedSearch, setSchedSearch] = useState('');
    const [schedMissingOnly, setSchedMissingOnly] = useState(false);
    const [schedPage, setSchedPage] = useState(1);
    const planReq = useRef(0);

    // ── Kapsam listesi (yıldan bağımsız kontrol listesi) + üç yılın kapsam durumu ──
    const [list, setList] = useState<AnnualPlanWorkspace | null>(null);
    const [listLoading, setListLoading] = useState(false);
    const [listSearch, setListSearch] = useState(searchParams.get('q') || '');
    const [listFreq, setListFreq] = useState('');
    const [listPage, setListPage] = useState(1);
    const [matrix, setMatrix] = useState<AnnualPlanScopeMatrix | null>(null);
    const listReq = useRef(0);
    const matrixReq = useRef(0);

    // ── Kaydedilmemiş değişiklikler ──
    const [scopeEdits, setScopeEdits] = useState<Map<string, boolean>>(new Map()); // `yıl:kontrol` → kapsamda mı
    const [rowEdits, setRowEdits] = useState<Map<string, RowEdit>>(new Map()); // seçili yıl, kontrol → düzenleme
    const [saving, setSaving] = useState(false);
    const [reasonPrompt, setReasonPrompt] = useState<string[] | null>(null); // gerekçe gereken kontrol kodları
    const [reason, setReason] = useState('');

    const [selectedScopeRows, setSelectedScopeRows] = useState<Set<string>>(new Set());
    const [bulkYear, setBulkYear] = useState<number>(year);
    const [selectedSchedRows, setSelectedSchedRows] = useState<Set<string>>(new Set());
    const [bulkAssignRole, setBulkAssignRole] = useState<'assigneeId' | 'secondControllerId' | null>(null);
    const [copyOpen, setCopyOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    const [controllerOptions, setControllerOptions] = useState<{ assignee: EligibleController[]; secondController: EligibleController[] }>({ assignee: [], secondController: [] });
    const [controllerOptionsLoading, setControllerOptionsLoading] = useState(false);

    // Önizleme / onay / uygulama
    const [preview, setPreview] = useState<AnnualPlanPreview | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [decisions, setDecisions] = useState<AnnualPlanAssignmentDecision[]>([]);
    const [busy, setBusy] = useState(false);
    const [decisionMode, setDecisionMode] = useState<'approve' | 'request-changes' | 'reopen' | null>(null);

    const unsavedCount = scopeEdits.size + rowEdits.size;

    useEffect(() => {
        const params = new URLSearchParams({ year: String(year), scope });
        if (view === 'schedule') params.set('tab', 'schedule');
        router.replace(`/controls/annual-plan?${params.toString()}`, { scroll: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [year, scope, view]);

    useEffect(() => {
        if (unsavedCount === 0) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [unsavedCount]);

    const loadPlan = useCallback(() => {
        const id = ++planReq.current;
        setPlanLoading(true);
        setPlanError(null);
        Promise.all([
            api.getAnnualPlanWorkspace(year, {
                ...scopeParams, scopeFilter: 'IN_SCOPE', search: schedSearch || undefined,
                missingSchedule: schedMissingOnly || undefined, page: schedPage, pageSize: 50,
            }),
            api.getWorkloadByAssignee(year, scopeParams),
        ]).then(([w, byAssignee]) => {
            if (id !== planReq.current) return;
            setPlan(w);
            setWorkload(byAssignee);
        }).catch(err => {
            if (id !== planReq.current) return;
            setPlanError(err instanceof ApiError ? err.message : 'Yıllık plan verileri alınamadı.');
        }).finally(() => { if (id === planReq.current) setPlanLoading(false); });
    }, [year, scopeParams, schedSearch, schedMissingOnly, schedPage]);
    useEffect(() => { loadPlan(); }, [loadPlan]);

    const loadList = useCallback(() => {
        if (view !== 'scope') return;
        const id = ++listReq.current;
        setListLoading(true);
        api.getAnnualPlanWorkspace(CURRENT_YEAR, { ...scopeParams, search: listSearch || undefined, frequency: listFreq || undefined, page: listPage, pageSize: 50 })
            .then(w => { if (id === listReq.current) setList(w); })
            .catch(() => { if (id === listReq.current) setList(null); })
            .finally(() => { if (id === listReq.current) setListLoading(false); });
    }, [view, scopeParams, listSearch, listFreq, listPage]);
    useEffect(() => { loadList(); }, [loadList]);

    const loadMatrix = useCallback(() => {
        const ids = (list?.data ?? []).map(r => r.controlId);
        if (ids.length === 0) { setMatrix(null); return; }
        const id = ++matrixReq.current;
        api.getAnnualPlanScopeMatrix(SCOPE_YEARS, ids, scopeParams)
            .then(m => { if (id === matrixReq.current) setMatrix(m); })
            .catch(() => { if (id === matrixReq.current) setMatrix(null); });
    }, [list, scopeParams]);
    useEffect(() => { loadMatrix(); }, [loadMatrix]);

    useEffect(() => {
        if (view !== 'schedule') return;
        setControllerOptionsLoading(true);
        Promise.all([api.getEligibleControllers(year, 'assignee'), api.getEligibleControllers(year, 'secondController')])
            .then(([a, s]) => setControllerOptions({ assignee: a.data, secondController: s.data }))
            .catch(() => toastError('Hata', 'Kontrolcü listesi yüklenemedi.'))
            .finally(() => setControllerOptionsLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, year]);

    useEffect(() => { setListPage(1); }, [listSearch, listFreq, scope]);
    useEffect(() => { setSchedPage(1); }, [schedSearch, schedMissingOnly, year, scope]);

    const refreshAll = () => { loadPlan(); loadList(); };

    const changeYear = (y: number) => {
        if (y === year) return;
        if (rowEdits.size > 0 && !window.confirm(`${year} takvim/atama sekmesinde ${rowEdits.size} kaydedilmemiş değişiklik var. Yıl değişirse bu değişiklikler kaybolur. Devam edilsin mi?`)) return;
        setRowEdits(new Map());
        setSelectedSchedRows(new Set());
        setPreviewOpen(false);
        setYear(y);
        setBulkYear(y);
    };

    // ── Kapsam hücreleri ──
    const yearMeta = (y: number) => matrix?.years.find(m => m.year === y);
    const cellState = (controlId: string, y: number) => {
        const cell = matrix?.cells[controlId]?.[y];
        const edit = scopeEdits.get(`${y}:${controlId}`);
        return { loaded: !!cell, inScope: edit ?? cell?.inScope ?? false, unsaved: edit !== undefined, pendingAction: cell?.pendingAction ?? 'NONE', editable: !!yearMeta(y)?.editable };
    };
    const setScope2 = (controlId: string, y: number, target: boolean) => {
        const cell = matrix?.cells[controlId]?.[y];
        if (!cell) return;
        setScopeEdits(prev => {
            const next = new Map(prev);
            const key = `${y}:${controlId}`;
            if (target === cell.inScope) next.delete(key); else next.set(key, target);
            return next;
        });
    };
    const bulkScope = (target: boolean) => {
        if (!yearMeta(bulkYear)?.editable) { toastError('Düzenlenemez', `${bulkYear} planı onay sürecinde; önce değişiklik istenmeli.`); return; }
        selectedScopeRows.forEach(id => setScope2(id, bulkYear, target));
        setSelectedScopeRows(new Set());
    };

    // ── Takvim ve Atamalar satırları ──
    const effective = useCallback((row: AnnualPlanRow) => {
        const e = rowEdits.get(row.controlId);
        if (!e) return row;
        const frequency = e.frequency ?? row.effectiveFrequency;
        return {
            ...row,
            effectiveFrequency: frequency,
            effectiveReferenceMonth: e.referenceMonth !== undefined ? e.referenceMonth : row.effectiveReferenceMonth,
            effectiveControlDate: e.controlDate !== undefined ? e.controlDate : row.effectiveControlDate,
            assigneeId: e.assigneeId !== undefined ? e.assigneeId : row.assigneeId,
            secondControllerId: e.secondControllerId !== undefined ? e.secondControllerId : row.secondControllerId,
        };
    }, [rowEdits]);
    const editRow = (row: AnnualPlanRow, patch: RowEdit) => setRowEdits(prev => {
        const next = new Map(prev);
        next.set(row.controlId, { ...(prev.get(row.controlId) ?? {}), ...patch });
        return next;
    });
    const planEditable = editable(plan?.draftStatus);

    // ── Kaydet ──
    const save = async (reasonText?: string) => {
        if (unsavedCount === 0) return;
        // Uygulanmış (testleri üretilmiş) bir kontrolün takvimi değişiyorsa gerekçe istenir.
        const needReason = [...rowEdits.entries()].filter(([id, e]) => {
            const raw = plan?.data.find(r => r.controlId === id);
            const applied = !!raw && raw.inScope && raw.pendingAction !== 'ADD';
            return applied && (e.frequency !== undefined || e.referenceMonth !== undefined || e.controlDate !== undefined);
        }).map(([id]) => plan?.data.find(r => r.controlId === id)?.controlCode ?? id);
        if (needReason.length > 0 && !reasonText) { setReason(''); setReasonPrompt(needReason); return; }
        setReasonPrompt(null);
        setSaving(true);
        const byYear = new Map<number, Map<string, Record<string, unknown>>>();
        const put = (y: number, controlId: string, item: Record<string, unknown>) => {
            if (!byYear.has(y)) byYear.set(y, new Map());
            const m = byYear.get(y)!;
            m.set(controlId, { ...(m.get(controlId) ?? { controlId, inScope: true }), ...item });
        };
        scopeEdits.forEach((inScope, key) => { const [y, controlId] = key.split(':'); put(Number(y), controlId, { inScope }); });
        rowEdits.forEach((e, controlId) => {
            const scopeEdit = scopeEdits.get(`${year}:${controlId}`);
            put(year, controlId, {
                inScope: scopeEdit ?? true,
                frequency: e.frequency,
                referenceMonth: e.referenceMonth ?? undefined,
                controlDate: e.controlDate ?? undefined,
                reason: reasonText,
                // '' = atamayı temizle, undefined = dokunulmadı.
                assigneeId: e.assigneeId === undefined ? undefined : (e.assigneeId ?? ''),
                secondControllerId: e.secondControllerId === undefined ? undefined : (e.secondControllerId ?? ''),
            });
        });
        let saved = 0;
        const failures: string[] = [];
        for (const [y, items] of byYear) {
            const revision = y === year && plan ? plan.draftRevision : (yearMeta(y)?.draftRevision ?? 0);
            try {
                await api.saveAnnualPlanDraftItems(y, { expectedRevision: revision, items: [...items.values()] as any }, scopeParams);
                saved += items.size;
                setScopeEdits(prev => new Map([...prev].filter(([k]) => !k.startsWith(`${y}:`))));
                if (y === year) setRowEdits(new Map());
            } catch (err) {
                failures.push(`${y}: ${err instanceof ApiError && err.status === 409 ? 'taslak başka biri tarafından değişti veya plan onay sürecinde; sayfa yenilendi' : err instanceof Error ? err.message : 'kaydedilemedi'}`);
                if (err instanceof ApiError && err.status === 409) {
                    setScopeEdits(prev => new Map([...prev].filter(([k]) => !k.startsWith(`${y}:`))));
                    if (y === year) setRowEdits(new Map());
                }
            }
        }
        setSaving(false);
        if (saved > 0) toastSuccess('Kaydedildi', `${saved} kontrolün değişikliği kaydedildi.`);
        if (failures.length) toastError('Bazı değişiklikler kaydedilemedi', failures.join(' · '));
        refreshAll();
    };

    const discard = async () => {
        if (!window.confirm(`${year} taslağındaki kaydedilmiş ve kaydedilmemiş TÜM değişiklikler geri alınacak. Emin misiniz?`)) return;
        setRowEdits(new Map());
        setScopeEdits(prev => new Map([...prev].filter(([k]) => !k.startsWith(`${year}:`))));
        try { await api.discardAnnualPlanDraft(year); toastSuccess('Geri alındı', `${year} taslağı uygulanmış plana döndü.`); refreshAll(); }
        catch (err) { toastError('Hata', err instanceof Error ? err.message : 'Geri alınamadı.'); }
    };

    const copyFromPrevious = async (options: { copyScope: boolean; copyCalendar: boolean; copyAssignments: boolean }) => {
        if (unsavedCount > 0) { toastError('Önce kaydedin', 'Kopyalamadan önce değişikliklerinizi kaydedin.'); return; }
        try {
            const r = await api.copyAnnualPlanFromYear(year, year - 1, options, scopeParams) as any;
            toastSuccess('Kopyalandı', `${r.seeded} kontrol ${year - 1} yılından ${year} taslağına eklendi.`);
            setCopyOpen(false);
            refreshAll();
        } catch (err) { toastError('Hata', err instanceof Error ? err.message : 'Kopyalanamadı.'); }
    };

    const bulkAssign = async (role: 'assigneeId' | 'secondControllerId', userId: string, onlyMissing: boolean) => {
        if (!plan || selectedSchedRows.size === 0) return;
        if (rowEdits.size > 0) { toastError('Önce kaydedin', 'Toplu atamadan önce satır değişikliklerini kaydedin.'); return; }
        try {
            const r: any = await api.bulkAnnualPlanDraftAction(year, {
                controlIds: [...selectedSchedRows], action: 'ASSIGN', [role]: userId, onlyMissing, expectedRevision: plan.draftRevision,
            } as any, scopeParams);
            const n = r.affectedCount ?? selectedSchedRows.size;
            if (n === 0) toastInfo('Atama yapılmadı', 'Seçili kontrollerde bu alan zaten dolu.');
            else toastSuccess('Atandı', `${n} kontrole atama uygulandı.`);
            loadPlan();
        } catch (err) { toastError('Hata', err instanceof Error ? err.message : 'Toplu atama başarısız.'); }
    };

    // ── Onay akışı: tek düğme ──
    const openPreview = async () => {
        if (unsavedCount > 0) { toastError('Önce kaydedin', 'Onaya göndermeden / uygulamadan önce değişiklikleri kaydedin.'); return; }
        try {
            setDecisions([]);
            setPreview(await api.previewAnnualPlanApply(year));
            setPreviewOpen(true);
        } catch (err) { toastError('Hata', err instanceof Error ? err.message : 'Önizleme alınamadı.'); }
    };
    const submit = async () => {
        if (!plan) return;
        setBusy(true);
        try {
            await api.submitAnnualPlan(year, plan.draftRevision, undefined, decisions);
            toastSuccess('Onaya gönderildi', `${year} planı yönetici onayına gönderildi.`);
            setPreviewOpen(false);
            loadPlan();
        } catch (err) { toastError('Gönderilemedi', err instanceof Error ? err.message : 'Plan onaya gönderilemedi.'); }
        finally { setBusy(false); }
    };
    const apply = async () => {
        if (!plan) return;
        setBusy(true);
        try {
            const r = await api.applyAnnualPlan(year, plan.draftRevision, decisions);
            if (!r.applied) { await openPreview(); toastError('Uygulanamadı', 'Eksikler veya çözülmemiş kararlar var.'); }
            else { toastSuccess('Plan uygulandı', `${r.added} eklendi, ${r.removed} çıkarıldı, ${r.modified} güncellendi, ${r.tasksCreated} test oluşturuldu.`); setPreviewOpen(false); refreshAll(); }
        } catch (err) { toastError('Hata', err instanceof Error ? err.message : 'Plan uygulanamadı.'); }
        finally { setBusy(false); }
    };
    const decide = async (note: string) => {
        if (!plan) return;
        setBusy(true);
        try {
            if (decisionMode === 'approve') { await api.approveAnnualPlan(year, plan.draftRevision, note || undefined); toastSuccess('Onaylandı', `${year} planı onaylandı; artık uygulanabilir.`); }
            else { await api.requestAnnualPlanChanges(year, plan.draftRevision, note); toastSuccess('Düzenlemeye açıldı', `${year} planı yeniden düzenlenebilir.`); }
            setDecisionMode(null);
            refreshAll();
        } catch (err) { toastError('İşlem yapılamadı', err instanceof Error ? err.message : 'Karar kaydedilemedi.'); }
        finally { setBusy(false); }
    };

    // ── Kolonlar ──
    const scopeColumns: ColumnDef<AnnualPlanRow>[] = useMemo(() => [
        {
            key: 'code', header: 'Kontrol', defaultWidth: 300,
            render: (row) => (
                <Link href={`/controls/${row.controlId}`} target="_blank" className="block hover:underline">
                    <p className="text-xs font-mono font-bold text-blue-700">{row.controlCode}</p>
                    <p className="text-sm text-slate-700 truncate max-w-[280px]" title={row.name}>{row.name}</p>
                </Link>
            ),
        },
        { key: 'dir', header: 'Direktörlük', defaultWidth: 180, render: (row) => <span className="text-xs text-slate-600">{row.directorateName || '—'}</span> },
        { key: 'freq', header: 'Envanter sıklığı', defaultWidth: 120, render: (row) => <span className="text-xs text-slate-500">{FREQUENCY_LABELS[row.frequency] || row.frequency}</span> },
        ...SCOPE_YEARS.map((y): ColumnDef<AnnualPlanRow> => ({
            key: `y${y}`, header: String(y), defaultWidth: 90,
            headerClassName: y === year ? 'bg-blue-50' : undefined, cellClassName: y === year ? 'bg-blue-50/40' : undefined,
            render: (row) => {
                const st = cellState(row.controlId, y);
                if (!st.loaded) return <span className="inline-block w-5 h-5 rounded border border-slate-200 bg-slate-50 animate-pulse" aria-hidden />;
                const title = !st.editable ? `${y} planı onay sürecinde; önce değişiklik istenmeli`
                    : st.unsaved ? 'Kaydedilmedi'
                    : st.pendingAction === 'ADD' ? 'Taslakta açılacak (plan uygulanınca testler oluşur)'
                    : st.pendingAction === 'REMOVE' ? 'Taslakta kapsamdan çıkarılacak'
                    : st.inScope ? `${y} için açık — çıkarmak için tıklayın` : `${y} için açmak üzere tıklayın`;
                return (
                    <button type="button" disabled={!st.editable} onClick={() => setScope2(row.controlId, y, !st.inScope)} title={title}
                        aria-label={`${row.controlCode} ${y}`} aria-pressed={st.inScope} data-testid={`scope-${y}-${row.controlCode}`}
                        className={`relative w-5 h-5 rounded border-2 flex items-center justify-center ${st.inScope ? 'bg-blue-600 border-blue-600' : 'border-slate-300 hover:border-blue-400'} ${st.unsaved ? 'ring-2 ring-amber-300 ring-offset-1' : ''} ${!st.editable ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {st.inScope && <span className="text-white text-[10px] leading-none">✓</span>}
                        {!st.unsaved && st.pendingAction !== 'NONE' && <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${st.pendingAction === 'ADD' ? 'bg-emerald-500' : 'bg-red-500'}`} />}
                    </button>
                );
            },
        })),
        // cellState/setScope2 aşağıdaki bağımlılıklardan türer.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [matrix, scopeEdits, year]);

    const scheduleColumns: ColumnDef<AnnualPlanRow>[] = useMemo(() => [
        {
            key: 'code', header: 'Kontrol', defaultWidth: 240,
            render: (row) => (
                <Link href={`/controls/${row.controlId}`} target="_blank" className="block hover:underline">
                    <p className="text-xs font-mono font-bold text-blue-700">{row.controlCode}</p>
                    <p className="text-sm text-slate-700 truncate max-w-[220px]" title={row.name}>{row.name}</p>
                </Link>
            ),
        },
        {
            key: 'freq', header: 'Sıklık', defaultWidth: 120,
            render: (raw) => {
                const row = effective(raw);
                return (
                    <select aria-label={`${row.controlCode} sıklık`} value={row.effectiveFrequency} disabled={!planEditable}
                        onChange={(e) => editRow(raw, { frequency: e.target.value, referenceMonth: null, controlDate: null })}
                        className={`${inputCls} py-1 text-xs`}>
                        {Object.entries(FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                );
            },
        },
        {
            key: 'months', header: 'Uygulama ayları', defaultWidth: 330,
            render: (raw) => {
                const row = effective(raw);
                const f = row.effectiveFrequency;
                if (f === 'MONTHLY') return <span className="text-xs text-slate-500">Her ay (12 test)</span>;
                if (f === 'WEEKLY') return <span className="text-xs text-slate-500">Her hafta</span>;
                if (f === 'DAILY') return <span className="text-xs text-slate-500">Otomatik test üretilmez</span>;
                if (f === 'AD_HOC') {
                    return (
                        <input type="date" aria-label={`${row.controlCode} hedef tarih`} disabled={!planEditable}
                            value={row.effectiveControlDate ? row.effectiveControlDate.slice(0, 10) : ''}
                            onChange={(e) => editRow(raw, { controlDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                            className={`${inputCls} py-1 text-xs`} />
                    );
                }
                const ref = row.effectiveReferenceMonth;
                const group = ref != null && MONTH_PICKER_FREQS.has(f) ? computeMonthGroup(f, ref) : [];
                return (
                    <div className="flex flex-wrap gap-0.5" role="group" aria-label={`${row.controlCode} uygulama ayları`} data-testid={`months-${row.controlCode}`}>
                        {MONTH_LABELS_SHORT.map((m, i) => {
                            const on = group.includes(i + 1);
                            return (
                                <button key={m} type="button" disabled={!planEditable} aria-pressed={on}
                                    onClick={() => editRow(raw, { referenceMonth: i + 1 })}
                                    className={`px-1.5 py-0.5 rounded text-[11px] font-semibold border ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'} disabled:cursor-not-allowed`}>
                                    {m}
                                </button>
                            );
                        })}
                        {ref == null && <span className="text-[11px] text-amber-700 ml-1">Ay seçin (varsayılan: dönem sonları)</span>}
                    </div>
                );
            },
        },
        {
            key: 'assignee', header: '1. kontrolcü', defaultWidth: 190,
            render: (raw) => {
                const row = effective(raw);
                return <UserPicker role="assignee" options={controllerOptions.assignee} loading={controllerOptionsLoading} value={row.assigneeId} otherValue={row.secondControllerId} onChange={(v) => editRow(raw, { assigneeId: v })} />;
            },
        },
        {
            key: 'second', header: '2. kontrolcü', defaultWidth: 190,
            render: (raw) => {
                const row = effective(raw);
                return <UserPicker role="secondController" options={controllerOptions.secondController} loading={controllerOptionsLoading} value={row.secondControllerId} otherValue={row.assigneeId} onChange={(v) => editRow(raw, { secondControllerId: v })} />;
            },
        },
        {
            key: 'status', header: 'Durum', defaultWidth: 150,
            render: (raw) => {
                const row = effective(raw);
                const periodic = !['AD_HOC', 'DAILY'].includes(row.effectiveFrequency);
                const assigned = !periodic || (!!row.assigneeId && !!row.secondControllerId);
                return (
                    <div className="flex flex-wrap gap-1">
                        {rowEdits.has(raw.controlId) && <StatusBadge variant="warning" size="sm" dot>Kaydedilmedi</StatusBadge>}
                        {raw.pendingAction === 'ADD' && <StatusBadge variant="success" size="sm">Yeni</StatusBadge>}
                        {raw.pendingAction === 'MODIFY' && <StatusBadge variant="info" size="sm">Değişti</StatusBadge>}
                        {raw.missingSchedule && <StatusBadge variant="warning" size="sm">Tarih eksik</StatusBadge>}
                        {!assigned && <StatusBadge variant="warning" size="sm">Atama eksik</StatusBadge>}
                    </div>
                );
            },
        },
        // effective/editRow aşağıdaki bağımlılıklardan türer.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [rowEdits, controllerOptions, controllerOptionsLoading, planEditable]);

    const status = plan?.draftStatus;
    const hasDraftChanges = (plan?.changedCount ?? 0) > 0;
    const scheduleRows = plan?.data ?? [];
    const scopeRows = list?.data ?? [];
    const yearScopeUnsaved = [...scopeEdits.keys()].some(k => k.startsWith(`${year}:`));

    return (
        <PageShell>
            <PageHeader
                title="Yıllık Plan"
                description="Kontrolleri yıllara açın, her yılın takvimini ve kontrolcülerini belirleyin"
                breadcrumbs={[{ label: 'Kontrol Yönetimi', href: '/controls' }, { label: 'Yıllık Plan' }]}
            />

            {/* Üst satır: tek yıl seçimi, durum ve tek işlem düğmesi */}
            <div className="flex flex-wrap items-center gap-3 mb-4 bg-white border border-slate-200 rounded-xl px-4 py-3">
                <div role="group" aria-label="Yıl" className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                    {YEAR_BUTTONS.map(y => (
                        <button key={y} type="button" onClick={() => changeYear(y)} aria-pressed={year === y}
                            className={`px-3 py-1.5 text-sm font-semibold ${year === y ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                            {y}
                        </button>
                    ))}
                </div>
                {plan && (
                    <span className="flex items-center gap-2 text-sm text-slate-600" data-testid="plan-status">
                        <StatusBadge variant={status === 'PENDING_APPROVAL' ? 'info' : hasDraftChanges && editable(status) ? 'warning' : status === 'APPLIED' ? 'success' : 'neutral'}>
                            {hasDraftChanges && editable(status) ? 'Değişiklik Var' : STATUS_LABELS[status!]}
                        </StatusBadge>
                        {status === 'PENDING_APPROVAL' && plan.pendingApproval && (
                            <span className="text-xs">Onaylayacak: {plan.pendingApproval.approvers.map(a => a.name).join(', ') || 'yönetici'}</span>
                        )}
                        {plan.decisionNote && status === 'CHANGES_REQUESTED' && <span className="text-xs text-amber-700">Not: {plan.decisionNote}</span>}
                    </span>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => save()} disabled={unsavedCount === 0 || saving}>
                        {saving ? 'Kaydediliyor...' : `Kaydet${unsavedCount ? ` (${unsavedCount})` : ''}`}
                    </Button>
                    <PermissionGate permission="control:*">
                        {status === 'PENDING_APPROVAL' ? (
                            plan?.capabilities?.canApprove ? (
                                <>
                                    <Button size="sm" variant="outline" onClick={() => setDecisionMode('request-changes')} disabled={busy}>Değişiklik iste</Button>
                                    <Button size="sm" variant="primary" onClick={() => setDecisionMode('approve')} disabled={busy}>Onayla</Button>
                                </>
                            ) : <span className="text-xs text-slate-500">Gönderen kendi planını onaylayamaz</span>
                        ) : status === 'APPROVED' ? (
                            <>
                                <Button size="sm" variant="outline" onClick={() => setDecisionMode('reopen')} disabled={busy}>Düzenlemeye aç</Button>
                                <Button size="sm" variant="primary" onClick={openPreview} disabled={busy}>Planı uygula</Button>
                            </>
                        ) : (
                            <Button size="sm" variant="primary" onClick={openPreview} disabled={busy || !plan}>Onaya gönder</Button>
                        )}
                    </PermissionGate>
                </div>
                <div className="w-full flex flex-wrap items-center gap-3 text-xs text-slate-500 border-t border-slate-100 pt-2">
                    <div className="flex items-center rounded-md border border-slate-200 overflow-hidden">
                        {(['MINE', 'UNIT', 'ORG'] as AnnualPlanScope[]).map(s => (
                            <button key={s} type="button" onClick={() => setScope(s)} className={`px-2 py-0.5 ${scope === s ? 'bg-slate-700 text-white' : 'bg-white text-slate-600'}`}>{SCOPE_LABELS[s]}</button>
                        ))}
                    </div>
                    <button type="button" className="hover:text-blue-700" onClick={() => setCopyOpen(true)} disabled={!planEditable}>{year - 1} planını {year}&apos;e kopyala</button>
                    <button type="button" className="hover:text-blue-700" onClick={discard} disabled={!planEditable}>{year} değişikliklerini geri al</button>
                    <button type="button" className="hover:text-blue-700" onClick={() => setHistoryOpen(o => !o)}>{historyOpen ? 'Geçmişi gizle' : 'Onay geçmişi'}</button>
                </div>
                {historyOpen && plan && <div className="w-full"><PlanDecisionHistory year={year} refreshKey={`${plan.draftStatus}:${plan.draftRevision}`} /></div>}
            </div>

            {/* Aylık iş yükü + kontrolcü iş yükü (hep açık) — seçili yıl */}
            <section className="bg-white rounded-xl border border-slate-200 p-5 mb-5 space-y-4" data-testid="workload-section" aria-label={`${year} iş yükü`}>
                {planLoading && !plan ? <LoadingState message="Yükleniyor..." /> : planError ? <ErrorState description={planError} onRetry={loadPlan} /> : plan && (
                    <>
                        <div className="flex flex-wrap items-baseline gap-3">
                            <h3 className="text-sm font-semibold text-slate-700">Aylık iş yükü — {year}</h3>
                            <span className="text-xs text-slate-400">Kaydedilmiş taslağa göre</span>
                        </div>
                        <KpiGrid columns={4}>
                            <KpiCard title="Açık kontrol" value={plan.workload.controlCount} variant="primary" />
                            <KpiCard title="Planlanan test" value={plan.workload.totalTasks} variant="default" subtitle="Arızi ve günlük hariç" />
                            <KpiCard title="Arızi" value={plan.workload.adHocCount} variant="violet" />
                            <KpiCard title="En yoğun ay" value={plan.workload.peakMonths.length ? plan.workload.peakMonths.map(m => MONTH_LABELS_SHORT[m]).join(', ') : '—'} variant="warning" subtitle={plan.workload.peakCount ? `${plan.workload.peakCount} test` : undefined} />
                        </KpiGrid>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={plan.workload.byMonth.map((count, i) => ({ month: MONTH_LABELS_SHORT[i], count }))}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                                    <Bar dataKey="count" name="Test" radius={[4, 4, 0, 0]}>
                                        {plan.workload.byMonth.map((_, i) => <Cell key={i} fill={plan.workload.peakMonths.includes(i) ? '#2563eb' : '#93c5fd'} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Kontrolcü iş yükü — {year}</h4>
                            <WorkloadPanel data={workload} loading={planLoading} />
                        </div>
                    </>
                )}
            </section>

            {/* Sekmeler */}
            <div role="tablist" className="flex items-center gap-1 border-b border-slate-200 mb-4">
                {([['scope', 'Kapsam'], ['schedule', `${year} Takvim ve Atamalar`]] as const).map(([k, l]) => (
                    <button key={k} role="tab" type="button" aria-selected={view === k} onClick={() => setView(k)}
                        className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${view === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        {l}
                    </button>
                ))}
            </div>

            {view === 'scope' ? (
                <>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Kod veya ad ara..." className={`${inputCls} w-56`} />
                        <select value={listFreq} onChange={(e) => setListFreq(e.target.value)} className={inputCls} aria-label="Sıklık filtresi">
                            <option value="">Tüm sıklıklar</option>
                            {Object.entries(FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <span className="text-xs text-slate-500">Kutucuk kontrolü o yıla açar veya kapatır; değişiklikler &quot;Kaydet&quot; ile her yılın taslağına yazılır.</span>
                        {selectedScopeRows.size > 0 && (
                            <div className="flex items-center gap-2 ml-auto bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                                <span className="text-xs font-semibold text-blue-700">{selectedScopeRows.size} seçili</span>
                                <select aria-label="Toplu işlem yılı" value={bulkYear} onChange={(e) => setBulkYear(Number(e.target.value))} className={`${inputCls} py-1`}>
                                    {SCOPE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <Button size="sm" variant="outline" onClick={() => bulkScope(true)}>Yıla aç</Button>
                                <Button size="sm" variant="outline" onClick={() => bulkScope(false)}>Yıldan çıkar</Button>
                                <Button size="sm" variant="ghost" onClick={() => setSelectedScopeRows(new Set())}>Temizle</Button>
                            </div>
                        )}
                    </div>
                    {listLoading && !list ? <LoadingState message="Yükleniyor..." /> : scopeRows.length === 0 ? (
                        <EmptyState title="Kontrol bulunamadı" description="Aramayı veya kapsam seçimini değiştirin." />
                    ) : (
                        <>
                            <DataTable
                                columns={scopeColumns} data={scopeRows} rowKey={(r) => r.controlId} loading={listLoading}
                                showCheckbox selectedRows={selectedScopeRows}
                                onRowSelect={(id) => setSelectedScopeRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                                onSelectAll={() => setSelectedScopeRows(prev => prev.size === scopeRows.length ? new Set() : new Set(scopeRows.map(r => r.controlId)))}
                                storageKey="annual-plan-scope-v2" onRefresh={loadList}
                            />
                            <Pager page={listPage} total={list?.totalCount ?? 0} pageSize={list?.pageSize ?? 50} onChange={setListPage} />
                        </>
                    )}
                </>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <input value={schedSearch} onChange={(e) => setSchedSearch(e.target.value)} placeholder="Kod veya ad ara..." className={`${inputCls} w-56`} />
                        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={schedMissingOnly} onChange={(e) => setSchedMissingOnly(e.target.checked)} className="rounded border-slate-300" />
                            Tarihi eksik
                        </label>
                        <span className="text-xs text-slate-500">Yalnız {year} için geçerlidir; diğer yıllar ayrı planlanır. Aya tıklayınca dönemin diğer ayları kendiliğinden seçilir.</span>
                        {selectedSchedRows.size > 0 && (
                            <div className="flex items-center gap-2 ml-auto bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                                <span className="text-xs font-semibold text-blue-700">{selectedSchedRows.size} seçili</span>
                                <Button size="sm" variant="outline" onClick={() => setBulkAssignRole('assigneeId')}>1. kontrolcü ata</Button>
                                <Button size="sm" variant="outline" onClick={() => setBulkAssignRole('secondControllerId')}>2. kontrolcü ata</Button>
                                <Button size="sm" variant="ghost" onClick={() => setSelectedSchedRows(new Set())}>Temizle</Button>
                            </div>
                        )}
                    </div>
                    {yearScopeUnsaved && (
                        <div className="flex items-center justify-between gap-3 mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <span className="text-sm text-amber-800">Kapsam sekmesinde {year} için kaydedilmemiş değişiklik var; kaydedince bu listeye yansır.</span>
                            <Button size="sm" variant="outline" onClick={() => save()} disabled={saving}>Kaydet</Button>
                        </div>
                    )}
                    {!planEditable && plan && (
                        <p className="mb-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{year} planı {STATUS_LABELS[plan.draftStatus].toLowerCase()}; düzenlemek için önce değişiklik istenmeli.</p>
                    )}
                    {planLoading && !plan ? <LoadingState message="Yükleniyor..." /> : scheduleRows.length === 0 ? (
                        <EmptyState title={`${year} için açılmış kontrol yok`} description={`Kapsam sekmesinde kontrolleri ${year} sütunundan işaretleyip kaydedin.`} />
                    ) : (
                        <>
                            <DataTable
                                columns={scheduleColumns} data={scheduleRows} rowKey={(r) => r.controlId} loading={planLoading}
                                showCheckbox selectedRows={selectedSchedRows}
                                onRowSelect={(id) => setSelectedSchedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                                onSelectAll={() => setSelectedSchedRows(prev => prev.size === scheduleRows.length ? new Set() : new Set(scheduleRows.map(r => r.controlId)))}
                                storageKey="annual-plan-schedule-v2" onRefresh={loadPlan}
                            />
                            <Pager page={schedPage} total={plan?.totalCount ?? 0} pageSize={plan?.pageSize ?? 50} onChange={setSchedPage} />
                        </>
                    )}
                </>
            )}

            {/* Gerekçe: uygulanmış takvim değişikliği */}
            <Modal open={!!reasonPrompt} onClose={() => setReasonPrompt(null)} title="Takvim değişikliği gerekçesi" size="md"
                description={`Şu kontrollerin ${year} takvimi uygulanmıştı; değişiklik testleri yeniden düzenler: ${reasonPrompt?.join(', ') ?? ''}`}
                footer={<div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setReasonPrompt(null)}>Vazgeç</Button>
                    <Button size="sm" variant="primary" disabled={!reason.trim()} onClick={() => save(reason.trim())}>Kaydet</Button>
                </div>}>
                <label htmlFor="plan-reason" className="block text-xs font-semibold text-slate-600 mb-1">Gerekçe *</label>
                <textarea id="plan-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} className={`${inputCls} w-full`} />
            </Modal>

            {copyOpen && <CopyFromYearModal fromYear={year - 1} onClose={() => setCopyOpen(false)} onConfirm={copyFromPrevious} />}
            {bulkAssignRole && (
                <BulkAssignModal role={bulkAssignRole} count={selectedSchedRows.size}
                    options={bulkAssignRole === 'assigneeId' ? controllerOptions.assignee : controllerOptions.secondController}
                    onClose={() => setBulkAssignRole(null)}
                    onConfirm={(userId, onlyMissing) => { bulkAssign(bulkAssignRole, userId, onlyMissing); setBulkAssignRole(null); }} />
            )}
            <PlanDecisionDialog mode={decisionMode} busy={busy} onCancel={() => setDecisionMode(null)} onSubmit={decide} />

            {/* Onaya gönder / uygula önizlemesi */}
            <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={`${year} planı — ${status === 'APPROVED' ? 'uygula' : 'onaya gönder'}`} description="Önizleme hiçbir kaydı değiştirmez.">
                {preview && (
                    <div className="space-y-3">
                        <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">
                            {preview.toAdd.length} kontrol açılacak, {preview.toRemove.length} çıkarılacak, {preview.toModify.length} değişecek —{' '}
                            <b>{preview.taskSummary.toCreate} test oluşturulacak</b>, {preview.taskSummary.toCancel} iptal, {preview.taskSummary.protectedCount} korunacak.
                        </p>
                        {preview.missingSchedule.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                                <p className="font-bold mb-1">Tarihi eksik (arızi):</p>
                                {preview.missingSchedule.map(c => <p key={c.controlId}>{c.controlCode} — {c.name}</p>)}
                            </div>
                        )}
                        {preview.assignmentBlocked.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                                <p className="font-bold mb-1">Kontrolcü ataması eksik:</p>
                                {preview.assignmentBlocked.map(c => (
                                    <button key={c.controlId} type="button" className="block hover:underline" onClick={() => { setPreviewOpen(false); setView('schedule'); }}>{c.controlCode} — {c.name}</button>
                                ))}
                            </div>
                        )}
                        {preview.conflicts.some(c => c.type !== 'ASSIGNMENT') && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                                <p className="font-bold mb-1">Kapsamdan çıkarma engellendi (devam eden testler):</p>
                                {preview.conflicts.filter(c => c.type !== 'ASSIGNMENT').map(c => <p key={c.controlId}>{c.controlCode} — {c.name}: {c.reason}</p>)}
                            </div>
                        )}
                        <AnnualPlanAssignmentDecisions preview={preview} decisions={decisions} onChange={setDecisions} disabled={busy} />
                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Vazgeç</Button>
                            {status === 'APPROVED' ? (
                                <Button variant="primary" onClick={apply} disabled={busy || hasUnresolvedPlanConflicts(preview, decisions)}>{busy ? 'Uygulanıyor...' : 'Planı uygula'}</Button>
                            ) : (
                                <Button variant="primary" onClick={submit} disabled={busy || hasUnresolvedPlanConflicts(preview, decisions)}>{busy ? 'Gönderiliyor...' : 'Onaya gönder'}</Button>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </PageShell>
    );
}

function Pager({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (pages <= 1) return <p className="px-1 pt-3 text-sm text-slate-500">{total} kontrol</p>;
    return (
        <div className="flex items-center justify-between px-1 pt-3 text-sm text-slate-500">
            <span>{total} kontrol</span>
            <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>Önceki</Button>
                <span>{page} / {pages}</span>
                <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>Sonraki</Button>
            </div>
        </div>
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
