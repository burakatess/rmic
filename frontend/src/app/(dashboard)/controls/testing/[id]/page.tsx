'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api, { ApiError } from '@/lib/api';
import { StatusBadge, Button, ConfirmDialog, Tabs, Timeline } from '@/components/ui';
import type { TimelineItem } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/auth';
import { useFocusMode } from '@/components/layout/FocusModeContext';
import { CreateFindingModal } from '@/components/modals/CreateFindingModal';
import { ReasonModal } from '@/components/controls/ReasonModal';
import { RichTextArea, MarkdownLiteView } from '@/components/controls/RichTextArea';
import { ResizableSplit } from '@/components/controls/ResizableSplit';
import { EvidenceList, type EvidenceItem } from '@/components/controls/EvidenceList';
import { EvidencePreview } from '@/components/controls/EvidencePreview';

// ─── Config ───────────────────────────────────────────────────────────────────

type BV = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';

const statusConfig: Record<string, { label: string; variant: BV }> = {
    BEKLIYOR: { label: 'Bekliyor', variant: 'neutral' },
    DEVAM_EDIYOR: { label: 'Devam Ediyor', variant: 'warning' },
    TAMAMLANDI: { label: 'Onay Bekliyor', variant: 'info' },
    GERI_GONDERILDI: { label: 'Geri Gönderildi', variant: 'critical' },
    ONAYLANDI: { label: 'Onaylandı', variant: 'success' },
    IPTAL: { label: 'İptal Edildi', variant: 'neutral' },
    KAPSAM_DISI: { label: 'Kapsam Dışı', variant: 'neutral' },
};
const findingStatusConfig: Record<string, { label: string; variant: BV }> = {
    BULGUSU_YOK: { label: 'Bulgu Yok', variant: 'success' },
    BULGUSU_VAR: { label: 'Bulgu Var', variant: 'critical' },
};
const severityConfig: Record<string, { label: string; variant: BV }> = {
    CRITICAL: { label: 'KZ', variant: 'critical' },
    HIGH: { label: 'KD', variant: 'high' },
    MEDIUM: { label: 'ÖK', variant: 'medium' },
    LOW: { label: 'Düşük', variant: 'low' },
};
const saveStatusLabel: Record<string, string> = {
    idle: '', saving: 'Kaydediliyor…', saved: 'Kaydedildi', error: 'Kaydedilemedi', conflict: 'Çakışma',
};

const fmt = (d?: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('tr-TR');
};
const fmtDateTime = (d?: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleString('tr-TR');
};

const icn = 'w-3.5 h-3.5';
const IconCalendar = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
const IconPin = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const IconUser = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
const IconPlay = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconCheck = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
const IconCheckCircle = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconReturn = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v1M3 10l5-5m-5 5l5 5" /></svg>;
const IconBan = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>;
const IconWarning = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
const IconLink = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.102-1.101m9.554-9.554l1.102-1.101a4 4 0 015.656 5.656l-4 4a4 4 0 01-5.656 0" /></svg>;
const IconPlus = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const IconFocus = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h4M4 16v4h4M16 4h4v4M16 20h4v-4" /></svg>;
const IconBack = () => <svg className={icn} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useIsWide(breakpoint = 1024) {
    const [isWide, setIsWide] = useState(true);
    useEffect(() => {
        const check = () => setIsWide(window.innerWidth >= breakpoint);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, [breakpoint]);
    return isWide;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ControlTestDetailPage() {
    const params = useParams<{ id: string }>();
    const testId = params.id;
    const router = useRouter();
    const { success, error: showError } = useToast();
    const { user } = useAuth();
    const isSystemAdmin = user?.role?.name === 'SYSTEM_ADMIN';
    const { focusMode, toggleFocusMode, setFocusMode } = useFocusMode();
    const isWide = useIsWide();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [test, setTest] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const [form, setForm] = useState({ resultText: '', evidenceSummary: '', findingStatus: null as string | null });
    const [stepObservations, setStepObservations] = useState<string[]>([]);
    const [selectedAttachment, setSelectedAttachment] = useState<EvidenceItem | null>(null);
    const [mobileTab, setMobileTab] = useState<'evidence' | 'evaluation'>('evaluation');
    const [controlOpen, setControlOpen] = useState(true);

    const [dirty, setDirty] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
    const versionRef = useRef(0);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveOkRef = useRef(true);
    // Yalnızca gerçek kullanıcı onChange/onClick handler'ları tarafından true
    // yapılır — load()'un sunucudan veri doldurması ASLA bunu tetiklemez. Bu
    // sayede tetikleyici effect (post-render, güncel closure ile çalışır) hem
    // "hayalet" kayıt sorunundan hem de eski-closure/stale-değer sorunundan
    // kaçınır: effect POST-render çalıştığı için scheduleSave/doSave güncel
    // form değerini yakalar, ama yalnızca bu bayrak true iken tetiklenir.
    const userEditedRef = useRef(false);

    const [findingModalOpen, setFindingModalOpen] = useState(false);
    const [reasonModal, setReasonModal] = useState<null | 'return' | 'cancel'>(null);
    const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [openFindings, setOpenFindings] = useState<{ id: string; findingId: string; summary?: string | null }[]>([]);
    const [referencedFindingId, setReferencedFindingId] = useState('');
    const [referenceReason, setReferenceReason] = useState('');

    // ── Veri yükleme ─────────────────────────────────────────────────────────
    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        userEditedRef.current = false; // sunucudan taze veri geliyor — bu bir kullanıcı düzenlemesi değil
        try {
            const t = await api.getControlTestById(testId);
            setTest(t);
            const hasFindings = (t.findings?.length ?? 0) > 0;
            setForm({
                resultText: t.resultText || '',
                evidenceSummary: t.evidenceSummary || '',
                findingStatus: t.findingStatus ?? (hasFindings ? 'BULGUSU_VAR' : null),
            });
            const steps: string[] = (t.control?.testSteps || '').split('\n').filter((s: string) => s.trim());
            const savedObs: any[] = Array.isArray(t.stepObservations) ? t.stepObservations : [];
            setStepObservations(steps.map((_, i) => savedObs.find(o => o.index === i)?.observation || ''));
            versionRef.current = t.contentVersion || 0;
            setDirty(false);
            setSaveStatus('idle');
        } catch (e) {
            if (e instanceof ApiError && e.status === 404) setNotFound(true);
            else showError('Hata', 'Test yüklenemedi.');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [testId]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => () => setFocusMode(false), [setFocusMode]);

    // Açık bulgu referansı için aday listesi
    useEffect(() => {
        if (!test || (test.findings?.length ?? 0) > 0) return;
        api.getFindings({ controlId: test.control.id, limit: 100 })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then((res: any) => {
                const list = Array.isArray(res) ? res : (res?.data || []);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setOpenFindings(list.filter((f: any) => f.status !== 'CLOSED'));
            })
            .catch(() => setOpenFindings([]));
    }, [test]);

    // ── Otomatik kayıt (debounce + iyimser eşzamanlılık) ────────────────────
    // saveChainRef: her çağrı bir öncekinin TAMAMEN bitmesini bekleyen bir kuyruğa
    // eklenir (boolean bayraklarla el ile eşzamanlılık yönetimi yerine) — bu sayede
    // aynı anda/art arda gelen doSave() çağrıları arasında versionRef.current'ın
    // hangi çağrının hangi anda okuduğu belirsizliği (yarış durumu, sahte 409)
    // tamamen ortadan kalkar: her çağrı sırasını bekler, en güncel versiyonu okur.
    const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true));

    const doSave = useCallback((): Promise<boolean> => {
        const testId2 = test?.id;
        const snapshot = { resultText: form.resultText, evidenceSummary: form.evidenceSummary, findingStatus: form.findingStatus, stepObservations: [...stepObservations] };
        const run = async (): Promise<boolean> => {
            if (!testId2) return false;
            setSaveStatus('saving');
            try {
                const obsPayload = snapshot.stepObservations.map((observation, index) => ({ index, observation }));
                const updated = await api.saveTestDraft(testId2, {
                    resultText: snapshot.resultText,
                    evidenceSummary: snapshot.evidenceSummary,
                    findingStatus: snapshot.findingStatus ?? undefined,
                    stepObservations: obsPayload,
                    contentVersion: versionRef.current,
                });
                versionRef.current = updated.contentVersion;
                setSaveStatus('saved');
                setDirty(false);
                saveOkRef.current = true;
                return true;
            } catch (e) {
                if (e instanceof ApiError && e.status === 409) {
                    setSaveStatus('conflict');
                } else {
                    setSaveStatus('error');
                }
                saveOkRef.current = false;
                return false;
            }
        };
        const next = saveChainRef.current.then(run, run);
        saveChainRef.current = next;
        return next;
    }, [test, form, stepObservations]);

    const scheduleSave = useCallback(() => {
        if (saveStatus === 'conflict') return; // kullanıcı karar verene kadar otomatik kaydetme durur
        setDirty(true);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => { void doSave(); }, 900);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doSave, saveStatus]);

    // Tetikleyici effect POST-RENDER çalışır (güncel closure/değerler garantili —
    // "stale closure" riski yok), ama yalnızca userEditedRef bir onChange/onClick
    // handler'ı tarafından true yapılmışsa kaydeder. load()'un setForm'u da bu
    // effect'i tetikler (form değişti) ama userEditedRef hâlâ false olduğu için
    // (load() başında sıfırlanır) güvenle atlanır — "hangi effect çalışması mount'a
    // ait, hangisi veri yüklemeye ait" zamanlamasıyla UĞRAŞILMAZ; yalnızca DEĞER
    // bazlı bir bayrağa bakılır.
    useEffect(() => {
        if (!userEditedRef.current) return;
        scheduleSave();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.resultText, form.evidenceSummary, form.findingStatus, stepObservations]);

    const flushSave = useCallback(async (): Promise<boolean> => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        // doSave() artık bir kuyruğa katılan promise döndürüyor — await, önündeki
        // TÜM bekleyen kayıtlar dahil tam bitişi bekler (ayrı bir polling'e gerek yok).
        const ok = await doSave();
        return ok && saveOkRef.current;
    }, [doSave]);

    // Sekme kapatma/yenileme koruması
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (dirty) { e.preventDefault(); e.returnValue = ''; }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);

    const goToList = () => {
        if (dirty) { setLeaveConfirmOpen(true); return; }
        router.push('/controls/testing');
    };

    // ── İş akışı aksiyonları ─────────────────────────────────────────────────
    const hasFindings = (test?.findings?.length ?? 0) > 0;
    const canStart = test?.status === 'BEKLIYOR';
    const canComplete = test?.status === 'DEVAM_EDIYOR' || test?.status === 'GERI_GONDERILDI';
    const canApprove = test?.status === 'TAMAMLANDI';
    const canReturn = test?.status === 'TAMAMLANDI';
    const isDone = test?.status === 'ONAYLANDI';
    const isCancelled = test?.status === 'IPTAL' || test?.status === 'KAPSAM_DISI';
    const needsFindingFirst = form.findingStatus === 'BULGUSU_VAR' && !hasFindings;
    const completeBlockedReason = needsFindingFirst ? 'Önce "Bulgu Kaydı Oluştur" ile bir bulgu kaydı ekleyin.' : null;

    const handleStart = async () => {
        setSubmitting(true);
        try {
            await api.startControlTest(test.id);
            success('Başlatıldı', 'Test Devam Ediyor statüsüne alındı.');
            await load(true);
        } catch { showError('Hata', 'Test başlatılamadı.'); }
        finally { setSubmitting(false); }
    };

    const handleComplete = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const ok = await flushSave();
            if (!ok) {
                showError('Kayıt Başarısız', 'Değerlendirmeniz kaydedilemedi — onaya gönderilmedi. Lütfen tekrar deneyin.');
                return;
            }
            await api.completeControlTest(test.id, {
                findingStatus: form.findingStatus,
                resultText: form.resultText,
                evidenceSummary: form.evidenceSummary,
            });
            success('Tamamlandı', 'Test sonucu kaydedildi, 2. kontrolcü onayına gönderildi.');
            await load(true);
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Test tamamlanamadı.');
        } finally { setSubmitting(false); }
    };

    const handleReference = async () => {
        if (!referencedFindingId || submitting) return;
        setSubmitting(true);
        try {
            const ok = await flushSave();
            if (!ok) { showError('Kayıt Başarısız', 'Değerlendirmeniz kaydedilemedi.'); return; }
            await api.completeControlTest(test.id, { referencedFindingId, referenceReason });
            success('İlerletildi', 'Test, referans verilen açık bulgu ile 2. kontrolcü onayına gönderildi.');
            await load(true);
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Referans ile ilerletilemedi.');
        } finally { setSubmitting(false); }
    };

    const handleOpenFinding = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const ok = await flushSave();
            if (!ok) {
                showError('Kayıt Başarısız', 'Bulgu oluşturmadan önce test gözlemleri kaydedilemedi. Lütfen tekrar deneyin.');
                return;
            }
            setFindingModalOpen(true);
        } finally {
            setSubmitting(false);
        }
    };

    const handleApprove = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            await api.approveControlTest(test.id);
            success('Onaylandı', 'Test onaylandı.');
            await load(true);
        } catch (e) { showError('Hata', e instanceof Error ? e.message : 'Test onaylanamadı.'); }
        finally { setSubmitting(false); }
    };

    const handleReturnConfirm = async (reason: string) => {
        setSubmitting(true);
        try {
            await api.returnControlTest(test.id, reason);
            success('Geri Gönderildi', 'Test testi yapan kullanıcıya düzeltme için geri gönderildi.');
            setReasonModal(null);
            await load(true);
        } catch { showError('Hata', 'Geri gönderilemedi.'); }
        finally { setSubmitting(false); }
    };

    const handleCancelFinalConfirm = async (reason: string) => {
        setSubmitting(true);
        try {
            await api.cancelControlTest(test.id, reason);
            success('İptal Edildi', 'Final onaylı test iptal edildi.');
            setReasonModal(null);
            await load(true);
        } catch { showError('Hata', 'Test iptal edilemedi.'); }
        finally { setSubmitting(false); }
    };

    // ── Kanıt ─────────────────────────────────────────────────────────────────
    const handleUploaded = (a: EvidenceItem) => {
        setTest((prev: any) => prev ? { ...prev, attachments: [a, ...prev.attachments] } : prev);
    };
    const handleRemoved = (id: string) => {
        setTest((prev: any) => prev ? { ...prev, attachments: prev.attachments.filter((a: EvidenceItem) => a.id !== id) } : prev);
        setSelectedAttachment(prev => prev?.id === id ? null : prev);
    };
    const handleEvidenceUpdated = (updated: EvidenceItem) => {
        setTest((prev: any) => prev ? { ...prev, attachments: prev.attachments.map((a: EvidenceItem) => a.id === updated.id ? updated : a) } : prev);
        setSelectedAttachment(prev => prev?.id === updated.id ? updated : prev);
    };

    // ── Timeline ─────────────────────────────────────────────────────────────
    const timelineItems: TimelineItem[] = useMemo(() => {
        if (!test) return [];
        const items: TimelineItem[] = [];
        if (test.completedAt) items.push({ id: 'completed', title: 'Tamamlandı ve onaya gönderildi', date: fmtDateTime(test.completedAt), variant: 'info' });
        if (test.returnedAt) items.push({ id: 'returned', title: 'Geri gönderildi', description: test.rejectionReason, date: fmtDateTime(test.returnedAt), variant: 'warning' });
        if (test.approvedAt) items.push({ id: 'approved', title: 'Onaylandı', date: fmtDateTime(test.approvedAt), variant: 'success' });
        if (test.cancelledAt) items.push({ id: 'cancelled', title: 'Final onay iptal edildi', description: test.cancelReason, date: fmtDateTime(test.cancelledAt), variant: 'critical' });
        return items;
    }, [test]);

    // ── Yükleniyor / bulunamadı ─────────────────────────────────────────────
    if (loading) {
        return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
    }
    if (notFound || !test) {
        return (
            <div className="max-w-lg mx-auto py-16 text-center">
                <p className="text-lg font-bold text-slate-700">Test bulunamadı</p>
                <p className="text-sm text-slate-400 mt-1">Bu bağlantı geçersiz olabilir veya test silinmiş olabilir.</p>
                <Link href="/controls/testing" className="inline-block mt-4 text-sm font-bold text-emerald-700 hover:underline">← Test Listesine Dön</Link>
            </div>
        );
    }

    const stCfg = statusConfig[test.status] || { label: test.status, variant: 'neutral' as BV };
    const control = test.control;
    const testSteps: string[] = (control.testSteps || '').split('\n').filter((s: string) => s.trim());

    // ── Bölüm A: Kontrol ─────────────────────────────────────────────────────
    const sectionA = (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <button onClick={() => setControlOpen(p => !p)} className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50/60 border-b border-slate-100 text-left">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">A. Kontrol</span>
                <span className="text-slate-400 text-xs font-bold">{controlOpen ? 'Daralt −' : 'Genişlet +'}</span>
            </button>
            {controlOpen && (
                <div className="p-5 space-y-4 text-sm">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Açıklama / Amaç</p>
                        <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{control.description || '—'}</p>
                    </div>
                    {control.risks?.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">İlişkili Risk</p>
                            <div className="flex flex-wrap gap-1.5">
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {control.risks.map((rm: any) => (
                                    <Link key={rm.id} href={`/risks/${rm.risk.id}`} className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg hover:bg-blue-100">
                                        {rm.risk.riskId} — {rm.risk.name}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                    {testSteps.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Test Adımları</p>
                            <ol className="list-decimal pl-5 space-y-1 text-slate-700">
                                {testSteps.map((s, i) => <li key={i}>{s}</li>)}
                            </ol>
                        </div>
                    )}
                    {control.notes && (
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Beklenen Kanıt / Not</p>
                            <p className="text-slate-700 whitespace-pre-wrap">{control.notes}</p>
                        </div>
                    )}
                    {(control.regulations?.length > 0 || control.sourceMappings?.length > 0) && (
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">İlgili Mevzuat / Kurumsal Kaynak</p>
                            <div className="flex flex-wrap gap-1.5">
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {(control.regulations || []).map((r: any) => (
                                    <span key={r.id} className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg">
                                        {r.article.regulation.code} · {r.article.articleCode}
                                    </span>
                                ))}
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {(control.sourceMappings || []).map((sm: any) => (
                                    <span key={sm.id} className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
                                        {sm.version.source.title} ({sm.version.versionLabel})
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Yıl / Dönem</p>
                            <p className="text-slate-700 font-semibold">{test.periodLabel || (test.year ? `${test.year}` : '—')}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Periyodiklik</p>
                            <p className="text-slate-700 font-semibold">{control.frequency}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // ── Bölüm B — Sol: Kanıt ────────────────────────────────────────────────
    const evidencePane = (
        <div className="h-full flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="max-h-64 border-b border-slate-100 overflow-y-auto">
                <EvidenceList
                    testId={test.id}
                    attachments={test.attachments || []}
                    selectedId={selectedAttachment?.id ?? null}
                    onSelect={setSelectedAttachment}
                    onUploaded={handleUploaded}
                    onUpdated={handleEvidenceUpdated}
                    onRemoved={handleRemoved}
                    disabled={isDone}
                    disabledReason="Onaylanmış testin kanıtları değiştirilemez. Önce SYSTEM_ADMIN final onayı iptal etmeli."
                />
            </div>
            <div className="flex-1 min-h-[280px]">
                <EvidencePreview attachment={selectedAttachment} />
            </div>
        </div>
    );

    // ── Bölüm B — Sağ: Değerlendirme ────────────────────────────────────────
    const evaluationPane = (
        <div className="space-y-4">
            {testSteps.length > 0 && (canComplete || isDone || canApprove) && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Adım Gözlemleri</p>
                    <div className="space-y-3">
                        {testSteps.map((step, i) => (
                            <div key={i} className="border border-slate-100 rounded-xl p-3">
                                <p className="text-xs font-semibold text-slate-600 mb-1.5">{i + 1}. {step}</p>
                                <textarea
                                    disabled={isDone || canApprove}
                                    value={stepObservations[i] || ''}
                                    onChange={(e) => { userEditedRef.current = true; setStepObservations(prev => { const n = [...prev]; n[i] = e.target.value; return n; }); }}
                                    rows={2}
                                    placeholder="Bu adıma ilişkin gözleminiz..."
                                    className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-y disabled:bg-slate-50"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Gerçekleştirilen Test / Genel Değerlendirme</p>
                <RichTextArea
                    value={form.resultText}
                    onChange={(v) => { userEditedRef.current = true; setForm(p => ({ ...p, resultText: v })); }}
                    disabled={isDone || canApprove}
                    minRows={12}
                    placeholder="Gerçekleştirilen test/inceleme, gözlemler ve sonuca ilişkin değerlendirmenizi yazın..."
                />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-4 mb-1.5">Kanıt Özeti</p>
                <textarea
                    disabled={isDone || canApprove}
                    value={form.evidenceSummary}
                    onChange={(e) => { userEditedRef.current = true; setForm(p => ({ ...p, evidenceSummary: e.target.value })); }}
                    rows={3}
                    placeholder="İncelenen kanıtların kısa özeti..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-y disabled:bg-slate-50"
                />
            </div>

            {(canComplete || isDone || canApprove) && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Kontrol Sonucu</p>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        {['BULGUSU_YOK', 'BULGUSU_VAR'].map(opt => (
                            <button key={opt} type="button"
                                disabled={isDone || canApprove || (opt === 'BULGUSU_YOK' && hasFindings)}
                                title={opt === 'BULGUSU_YOK' && hasFindings ? 'Bu teste bağlı bulgu kaydı var, sonuç Bulgu Yok olamaz.' : undefined}
                                onClick={() => { userEditedRef.current = true; setForm(p => ({ ...p, findingStatus: opt })); }}
                                className={`p-3 rounded-xl border-2 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${form.findingStatus === opt
                                    ? opt === 'BULGUSU_YOK' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-red-400 bg-red-50 text-red-800'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                    } ${isDone || canApprove ? 'opacity-60 cursor-default' : ''}`}
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    {opt === 'BULGUSU_YOK' ? <IconCheck /> : <IconWarning />}
                                    {opt === 'BULGUSU_YOK' ? 'Bulgu Yok' : 'Bulgu Var'}
                                </span>
                            </button>
                        ))}
                    </div>
                    {!form.findingStatus && <p className="text-xs text-slate-400 mb-2">Değerlendirilmedi — devam etmeden önce bir sonuç seçin.</p>}

                    {form.findingStatus === 'BULGUSU_VAR' && !isDone && !canApprove && (
                        <Button variant={needsFindingFirst ? 'primary' : 'secondary'} size="sm" className={`w-full ${needsFindingFirst ? 'bg-rose-600 hover:bg-rose-700 ring-rose-600' : ''}`}
                            onClick={handleOpenFinding} disabled={submitting} icon={<IconPlus />}>
                            Bulgu Kaydı Oluştur {hasFindings ? `(${test.findings.length})` : ''}
                        </Button>
                    )}

                    {needsFindingFirst && openFindings.length > 0 && (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                            <p className="text-xs font-semibold text-amber-700">Ya da mevcut açık bir bulguyu referans alarak ilerletin</p>
                            <select value={referencedFindingId} onChange={e => setReferencedFindingId(e.target.value)}
                                className="w-full px-2.5 py-2 text-xs border border-amber-300 rounded-lg bg-white">
                                <option value="">Açık bulgu seçiniz...</option>
                                {openFindings.map(f => <option key={f.id} value={f.id}>{f.findingId} — {f.summary || ''}</option>)}
                            </select>
                            {referencedFindingId && (
                                <>
                                    <textarea value={referenceReason} onChange={e => setReferenceReason(e.target.value)} rows={2}
                                        placeholder="Referans gerekçesi (opsiyonel)..." className="w-full px-2.5 py-2 text-xs border border-amber-300 rounded-lg resize-none" />
                                    <Button variant="primary" size="sm" className="w-full" onClick={handleReference} disabled={submitting} icon={<IconLink />}>
                                        Referans ile Onaya Gönder
                                    </Button>
                                </>
                            )}
                        </div>
                    )}

                    {test.findings?.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {test.findings.map((f: any) => {
                                const sv = severityConfig[f.severity];
                                return (
                                    <Link key={f.id} href={`/findings/${f.id}`} className="flex items-center gap-2 p-2.5 bg-slate-50 hover:bg-blue-50 rounded-lg border border-slate-200 hover:border-blue-300 transition-all">
                                        {sv && <StatusBadge variant={sv.variant}>{sv.label}</StatusBadge>}
                                        <span className="text-xs font-mono font-bold text-slate-600">{f.findingId}</span>
                                        <span className="text-xs text-slate-500 truncate flex-1">{f.summary}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {timelineItems.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">İnceleme / Onay Geçmişi</p>
                    <Timeline items={timelineItems} />
                </div>
            )}
        </div>
    );

    // ── Alt sabit işlem çubuğu ───────────────────────────────────────────────
    const actionBar = !isCancelled && (
        <div className="sticky bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-3 z-20">
            <div className="flex items-center gap-2 text-xs text-slate-400">
                {saveStatus !== 'idle' && (
                    <span className={saveStatus === 'error' || saveStatus === 'conflict' ? 'text-rose-600 font-semibold' : saveStatus === 'saving' ? 'text-slate-400' : 'text-emerald-600 font-semibold'}>
                        {saveStatusLabel[saveStatus]}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2">
                {!isDone && (
                    <Button variant="outline" size="sm" onClick={() => void doSave()} disabled={saveStatus === 'saving'}>Taslak Kaydet</Button>
                )}
                {canStart && <Button variant="primary" size="sm" onClick={handleStart} disabled={submitting} icon={<IconPlay />}>Testi Başlat</Button>}
                {canComplete && (
                    <Button variant="primary" size="sm" onClick={handleComplete} disabled={submitting || !form.findingStatus || needsFindingFirst}
                        title={completeBlockedReason ?? undefined} icon={<IconCheck />}>
                        Testi Tamamla ve Onaya Gönder
                    </Button>
                )}
                {canApprove && (
                    <>
                        <Button variant="secondary" size="sm" onClick={() => setReasonModal('return')} disabled={submitting} icon={<IconReturn />}>Revizyona Gönder</Button>
                        <Button variant="primary" size="sm" onClick={handleApprove} disabled={submitting} icon={<IconCheckCircle />}>Onayla</Button>
                    </>
                )}
                {isDone && isSystemAdmin && (
                    <Button variant="secondary" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setReasonModal('cancel')} disabled={submitting} icon={<IconBan />}>
                        Final Onayı İptal Et
                    </Button>
                )}
            </div>
        </div>
    );

    return (
        <div className={`flex flex-col min-h-screen bg-slate-50/50 ${focusMode ? '' : ''}`}>
            {/* Üst kimlik şeridi */}
            <div className={`bg-white border-b border-slate-200 px-5 py-4 ${focusMode ? '' : ''}`}>
                <div className="flex items-start justify-between gap-4 mb-2">
                    <button onClick={goToList} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 shrink-0">
                        <IconBack /> Test Listesine Dön
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                        {completeBlockedReason && canComplete && <span className="text-[11px] text-amber-600 hidden md:inline">{completeBlockedReason}</span>}
                        <button onClick={toggleFocusMode} aria-pressed={focusMode}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${focusMode ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                            title="Odak Modu — sol menüyü gizler">
                            <IconFocus /> {focusMode ? 'Odak Modundan Çık' : 'Odak Modu'}
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-2 py-0.5">{test.testNo}</span>
                    <StatusBadge variant={stCfg.variant}>{stCfg.label}</StatusBadge>
                    {form.findingStatus && (
                        <StatusBadge variant={findingStatusConfig[form.findingStatus]?.variant || 'neutral'}>
                            {findingStatusConfig[form.findingStatus]?.label || form.findingStatus}
                        </StatusBadge>
                    )}
                </div>
                <p className="text-lg font-bold text-slate-800 leading-snug">
                    {control.controlId} — {control.name}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Link href={`/controls/${control.id}`} target="_blank" className="text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-2 py-0.5 hover:underline">
                        Ana Kontrol: {control.controlId}
                    </Link>
                    {test.scope?.code && (
                        <Link href={`/controls/agenda/${test.scope.id}`} target="_blank" className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 hover:underline">
                            Dönem Kontrolü: {test.scope.code}
                        </Link>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1.5">
                    <span className="inline-flex items-center gap-1"><IconCalendar />{test.periodLabel || (test.year ? `${test.year}` : '—')}</span>
                    {test.directorate?.name && <span className="inline-flex items-center gap-1"><IconPin />{test.directorate.name}</span>}
                    <span className="inline-flex items-center gap-1"><IconUser />{test.assignee ? `${test.assignee.firstName} ${test.assignee.lastName}` : 'Atanmamış'}</span>
                    <span className="inline-flex items-center gap-1"><IconCalendar />Hedef: {fmt(test.plannedDate)}</span>
                </div>
            </div>

            {/* Gövde */}
            <div className="flex-1 flex flex-col gap-4 p-5 max-w-[1800px] w-full mx-auto">
                {sectionA}

                <div className="bg-transparent">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 px-1">B. Test Değerlendirmesi</p>
                    {isWide ? (
                        <div className="flex min-h-[560px]">
                            <ResizableSplit storageKey="control-test-eval" left={evidencePane} right={<div className="pl-4">{evaluationPane}</div>} />
                        </div>
                    ) : (
                        <div>
                            <Tabs
                                tabs={[{ key: 'evidence', label: 'Kanıtlar' }, { key: 'evaluation', label: 'Değerlendirme' }]}
                                activeTab={mobileTab}
                                onChange={(k) => setMobileTab(k as 'evidence' | 'evaluation')}
                            />
                            <div className={mobileTab === 'evidence' ? 'mt-3' : 'hidden'}><div className="min-h-[420px]">{evidencePane}</div></div>
                            <div className={mobileTab === 'evaluation' ? 'mt-3' : 'hidden'}>{evaluationPane}</div>
                        </div>
                    )}
                </div>
            </div>

            {actionBar}

            <CreateFindingModal
                isOpen={findingModalOpen}
                onClose={() => setFindingModalOpen(false)}
                onSuccess={() => { setFindingModalOpen(false); load(true); }}
                prefillData={{ controlId: control.id, controlTestId: test.id, directorateId: control.directorateId }}
            />

            <ReasonModal
                open={reasonModal === 'return'}
                title="Testi Revizyona Gönder"
                description="Geri gönderme gerekçesi testi yapan kullanıcıya iletilecektir."
                confirmLabel="Geri Gönder"
                reasonRequired
                saving={submitting}
                onConfirm={handleReturnConfirm}
                onClose={() => setReasonModal(null)}
            />
            <ReasonModal
                open={reasonModal === 'cancel'}
                title="Final Onayı İptal Et"
                description="Bu işlem yalnızca SYSTEM_ADMIN tarafından yapılabilir."
                confirmLabel="İptal Et"
                reasonRequired={false}
                saving={submitting}
                onConfirm={handleCancelFinalConfirm}
                onClose={() => setReasonModal(null)}
            />

            <ConfirmDialog
                open={leaveConfirmOpen}
                onClose={() => setLeaveConfirmOpen(false)}
                onConfirm={() => { setLeaveConfirmOpen(false); router.push('/controls/testing'); }}
                title="Kaydedilmemiş Değişiklikler"
                message="Bu testte kaydedilmemiş değişiklikleriniz var. Yine de listeye dönmek istiyor musunuz?"
                confirmLabel="Evet, Listeye Dön"
                variant="warning"
            />

            {saveStatus === 'conflict' && (
                <div className="fixed bottom-20 right-5 z-30 max-w-sm bg-white border border-amber-300 shadow-lg rounded-xl p-4">
                    <p className="text-sm font-bold text-amber-800 mb-1">Bu test başka bir oturumda güncellendi</p>
                    <p className="text-xs text-slate-500 mb-3">Metniniz kaybolmadı ama otomatik kayıt durduruldu. Sayfayı yenileyip güncel veriyle devam edin (yazdıklarınızı önce başka yere kopyalayabilirsiniz).</p>
                    <Button variant="primary" size="sm" onClick={() => load()}>Sayfayı Yenile</Button>
                </div>
            )}
        </div>
    );
}
