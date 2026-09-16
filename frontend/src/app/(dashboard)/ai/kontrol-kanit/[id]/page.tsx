'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api, { ApiError } from '@/lib/api';
import { PageShell, Button, LoadingState, FileUpload, StatusBadge } from '@/components/ui';
import type { AttachmentMeta } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import type {
    AiEvalSession, AiEvalMessage, AiEvalAttachment, AiEvalRunStatus, AiEvalOutcome,
    EvalOutput, EvalFindingCandidate, EvalCompliancePoint, KnowledgeDoc,
    EvalOutputV2, EvalRequirementAssessment, EvalFindingAssessment, EvalSourceRefV2, ReqResult,
} from '@/types/ai';
import { KNOWLEDGE_KIND_LABEL, OUTCOME_LABEL, READ_STATUS_LABEL, RUN_STATUS_LABEL } from '@/types/ai';

interface ControlOpt {
    id: string;
    controlId: string;
    name: string;
    description?: string;
}
interface RegArticle {
    id: string;
    articleCode: string;
    title: string;
    regulation: { code: string; name: string };
}
type KnowledgeChip = Pick<KnowledgeDoc, 'id' | 'kind' | 'code' | 'title'>;
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type Tab = 'current' | 'evidence' | 'history' | 'outputs';

const RUN_BADGE: Record<AiEvalRunStatus, 'neutral' | 'info' | 'warning' | 'success' | 'critical'> = {
    DRAFT: 'neutral', RUNNING: 'info', AWAITING_REVIEW: 'warning', COMPLETED: 'success', ERROR: 'critical',
};

export default function AiEvalSessionPage() {
    const { id: routeId } = useParams<{ id: string }>();
    const router = useRouter();
    const { success, error: showError } = useToast();

    // Taslak oluşturulduğunda URL değişse de değişmese de kimlik burada tutulur;
    // böylece "yeni" akışı URL yönlendirmesine bağlı kalmaz (mükerrer taslak önlenir).
    const [liveId, setLiveId] = useState<string | null>(null);
    const id = liveId ?? routeId;
    const isNew = id === 'new';

    const [session, setSession] = useState<AiEvalSession | null>(null);
    const [loading, setLoading] = useState(routeId !== 'new');
    const [tab, setTab] = useState<Tab>('current');

    // Kontrol Alanı formu
    const [mode, setMode] = useState<'ref' | 'text'>('text');
    const [controlRefId, setControlRefId] = useState('');
    const [controlText, setControlText] = useState('');
    const [controlManualNote, setControlManualNote] = useState('');
    const [evidenceText, setEvidenceText] = useState('');
    const [title, setTitle] = useState('');
    const [period, setPeriod] = useState('');
    const [regChips, setRegChips] = useState<RegArticle[]>([]);
    const [knChips, setKnChips] = useState<KnowledgeChip[]>([]);

    const [controls, setControls] = useState<ControlOpt[]>([]);
    const [regQuery, setRegQuery] = useState('');
    const [regResults, setRegResults] = useState<RegArticle[]>([]);
    const [knQuery, setKnQuery] = useState('');
    const [knResults, setKnResults] = useState<KnowledgeChip[]>([]);
    // Kaynak Kataloğu birimleri (sürümlü, yetkilendirilmiş).
    const [srcChips, setSrcChips] = useState<{ id: string; label: string; sub: string }[]>([]);
    const [srcQuery, setSrcQuery] = useState('');
    const [srcResults, setSrcResults] = useState<{ id: string; label: string; sub: string }[]>([]);
    const [srcSuggest, setSrcSuggest] = useState<import('@/types/library').SuggestSourcesResponse | null>(null);
    const [suggesting, setSuggesting] = useState(false);

    const [msg, setMsg] = useState('');
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [running, setRunning] = useState(false);

    const threadEnd = useRef<HTMLDivElement>(null);
    const creatingRef = useRef(false);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savingRef = useRef(false);
    const pendingSaveRef = useRef(false);
    const saveOkRef = useRef(true);
    const versionRef = useRef(0);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hydrating = useRef(true);

    // ── Yükleme ───────────────────────────────────────────────────────────
    const applySession = useCallback((s: AiEvalSession) => {
        setSession(s);
        versionRef.current = s.contentVersion;
        hydrating.current = true;
        setTitle(s.title);
        setPeriod(s.period || '');
        setControlText(s.controlText || '');
        setControlManualNote(s.controlManualNote || '');
        setEvidenceText(s.evidenceText || '');
        setControlRefId(s.controlRefId || '');
        setMode(s.controlRefId ? 'ref' : 'text');
        if (s.regulationSnapshot && s.regulationArticleIds.length) {
            setRegChips(
                s.regulationArticleIds.map((rid, i) => ({
                    id: rid,
                    articleCode: s.regulationSnapshot![i]?.madde.split('md.')[1] ?? '',
                    title: s.regulationSnapshot![i]?.baslik ?? '',
                    regulation: {
                        code: s.regulationSnapshot![i]?.madde.split(' md.')[0] ?? '',
                        name: s.regulationSnapshot![i]?.regulasyon ?? '',
                    },
                })),
            );
        } else {
            setRegChips([]);
        }
        if (s.knowledgeSnapshot && s.knowledgeDocIds.length) {
            setKnChips(
                s.knowledgeDocIds.map((kid, i) => ({
                    id: kid,
                    kind: s.knowledgeSnapshot![i]?.tur ?? 'POLICY',
                    code: s.knowledgeSnapshot![i]?.kod ?? '',
                    title: s.knowledgeSnapshot![i]?.baslik ?? '',
                })),
            );
        } else {
            setKnChips([]);
        }
        if (s.sourceSnapshot && s.sourceUnitIds.length) {
            setSrcChips(
                s.sourceUnitIds.map((uid, i) => {
                    const snap = s.sourceSnapshot![i];
                    return {
                        id: uid,
                        label: snap ? `${snap.kod}` : uid,
                        sub: snap ? `${snap.kaynak} ${snap.surum} — ${snap.baslik}` : '',
                    };
                }),
            );
        } else {
            setSrcChips([]);
        }
        setTimeout(() => (hydrating.current = false), 0);
    }, []);

    const load = useCallback(async () => {
        try {
            const s = await api.getAiEvalSession(id);
            applySession(s);
            setRunning(s.runStatus === 'RUNNING');
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Oturum yüklenemedi');
            router.push('/ai/kontrol-kanit');
        } finally {
            setLoading(false);
        }
    }, [id, router, showError, applySession]);

    const loadedIdRef = useRef<string | null>(null);
    useEffect(() => {
        // Gerçek bir id için bir kez yükle; yerelde oluşturulan taslağı tekrar çekme.
        if (isNew) {
            hydrating.current = false;
        } else if (loadedIdRef.current !== id) {
            loadedIdRef.current = id;
            if (id !== liveId) load();
        }
        api.getControls({ limit: 500 })
            .then((r) => {
                const list = Array.isArray(r) ? r : (r as { data?: ControlOpt[] })?.data || [];
                setControls(list as ControlOpt[]);
            })
            .catch(() => setControls([]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isNew, id]);

    useEffect(() => {
        threadEnd.current?.scrollIntoView({ behavior: 'smooth' });
    }, [session?.messages?.length, running]);

    // Madde / kaynak arama
    useEffect(() => {
        const t = setTimeout(async () => {
            const q = regQuery.trim();
            if (q.length < 2) return setRegResults([]);
            try { setRegResults(await api.searchRegulationArticles(q)); } catch { setRegResults([]); }
        }, 300);
        return () => clearTimeout(t);
    }, [regQuery]);

    useEffect(() => {
        const t = setTimeout(async () => {
            const q = knQuery.trim();
            if (q.length < 2) return setKnResults([]);
            try {
                const docs = await api.searchKnowledgeDocs(q);
                setKnResults(docs.map((d) => ({ id: d.id, kind: d.kind, code: d.code, title: d.title })));
            } catch { setKnResults([]); }
        }, 300);
        return () => clearTimeout(t);
    }, [knQuery]);

    // Kaynak Kataloğu birim araması — MANUEL SEÇİM yolu (unit-lookup): onaylı + hak
    // izinli + erişilebilir birimler; embedding servisi kapalı olsa da çalışır.
    useEffect(() => {
        const t = setTimeout(async () => {
            const q = srcQuery.trim();
            if (q.length < 2) return setSrcResults([]);
            try {
                // Kod gibi görünüyorsa (AC-2, md.3.1) kesin kod araması, değilse metin.
                const isCode = /^[a-z0-9][a-z0-9.\- ]{0,18}$/i.test(q) && /[0-9]/.test(q);
                const r = await api.libraryUnitLookup(isCode ? { code: q } : { q });
                setSrcResults(
                    r.map((x) => ({
                        id: x.unitId,
                        label: x.unitCode,
                        sub: `${x.source.title} ${x.versionLabel} — ${x.title}${x.withinLimit ? '' : ` · ⚠ ${x.charCount} krk (sınır ${x.limit}, kısaltılır)`}`,
                    })),
                );
            } catch { setSrcResults([]); }
        }, 350);
        return () => clearTimeout(t);
    }, [srcQuery]);

    const controlBody = useCallback(
        () => ({
            title: title.trim() || undefined,
            period: period.trim() || undefined,
            controlRefId: mode === 'ref' ? controlRefId || null : null,
            controlText: mode === 'text' ? controlText.trim() || null : null,
            controlManualNote: controlManualNote.trim() || null,
            evidenceText: evidenceText.trim() || null,
            regulationArticleIds: regChips.map((r) => r.id),
            knowledgeDocIds: knChips.map((k) => k.id),
            sourceUnitIds: srcChips.map((s) => s.id),
        }),
        [title, period, mode, controlRefId, controlText, controlManualNote, evidenceText, regChips, knChips, srcChips],
    );

    const hasMeaningfulContent =
        (mode === 'ref' ? !!controlRefId : controlText.trim().length > 0) ||
        controlManualNote.trim().length > 0 ||
        evidenceText.trim().length > 0;

    // ── Taslak oluşturma (yalnızca anlamlı içerikte) ──────────────────────
    const ensureCreated = useCallback(async (): Promise<string | null> => {
        if (!isNew || creatingRef.current) return liveId ?? session?.id ?? null;
        if (!hasMeaningfulContent) return null;
        creatingRef.current = true;
        try {
            const created = await api.createAiEvalSession(controlBody());
            setLiveId(created.id);
            applySession(created);
            setLoading(false);
            router.replace(`/ai/kontrol-kanit/${created.id}`);
            return created.id;
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Taslak oluşturulamadı');
            creatingRef.current = false;
            return null;
        }
    }, [isNew, liveId, session?.id, hasMeaningfulContent, controlBody, router, applySession, showError]);

    // ── Debounced autosave (seri; eşzamanlı istek yok, 409 kendini onarır) ──
    const doSave = useCallback(async () => {
        if (isNew) {
            await ensureCreated();
            return;
        }
        const sid = liveId ?? session?.id;
        if (!sid) return;
        // Aynı anda tek kayıt isteği: biri uçarken gelen çağrı bekletilir.
        if (savingRef.current) {
            pendingSaveRef.current = true;
            return;
        }
        savingRef.current = true;
        setSaveStatus('saving');
        try {
            let attempts = 0;
            // 409 → güncel sürümü çek, güncel içerikle bir kez daha dene.
            while (attempts < 2) {
                attempts++;
                try {
                    const s = await api.updateAiEvalSession(sid, {
                        ...controlBody(),
                        contentVersion: versionRef.current,
                    });
                    versionRef.current = s.contentVersion;
                    setSession((prev) => (prev ? { ...prev, ...s } : s));
                    setSaveStatus('saved');
                    break;
                } catch (e) {
                    if (e instanceof ApiError && e.status === 409 && attempts < 2) {
                        const fresh = await api.getAiEvalSession(sid);
                        versionRef.current = fresh.contentVersion;
                        continue;
                    }
                    throw e;
                }
            }
            saveOkRef.current = true;
        } catch {
            saveOkRef.current = false;
            setSaveStatus('error');
        } finally {
            savingRef.current = false;
            if (pendingSaveRef.current) {
                pendingSaveRef.current = false;
                void doSave();
            }
        }
    }, [isNew, liveId, session?.id, controlBody, ensureCreated]);

    const scheduleSave = useCallback(() => {
        if (hydrating.current) return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setSaveStatus('saving');
        saveTimer.current = setTimeout(doSave, 800);
    }, [doSave]);

    useEffect(() => {
        scheduleSave();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title, period, mode, controlRefId, controlText, controlManualNote, evidenceText, regChips, knChips, srcChips]);

    const flushSave = useCallback(async () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        await doSave();
        // Uçuşta/bekleyen kayıt varsa tamamen dinsin (değerlendirme öncesi güvence).
        for (let i = 0; i < 30 && (savingRef.current || pendingSaveRef.current); i++) {
            await new Promise((r) => setTimeout(r, 100));
        }
    }, [doSave]);

    // ── Çalışma ilerlemesi izleme ────────────────────────────────────────
    const startPolling = useCallback(() => {
        if (pollRef.current || isNew) return;
        pollRef.current = setInterval(async () => {
            try {
                const s = await api.getAiEvalSession(id);
                setSession((prev) => (prev ? { ...prev, ...s } : s));
                if (s.runStatus !== 'RUNNING') {
                    if (pollRef.current) clearInterval(pollRef.current);
                    pollRef.current = null;
                    setRunning(false);
                    applySession(s);
                }
            } catch {
                /* geçici ağ hatası — sonraki turda tekrar dene */
            }
        }, 2000);
    }, [id, isNew, applySession]);

    useEffect(() => {
        if (running) startPolling();
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
        };
    }, [running, startPolling]);

    // "Değerlendir / Yeniden Değerlendir" — EKRANDAKİ girdinin tamamını tek
    // çağrıda gönderir; sunucu önce kaydeder, kayıt başarısızsa değerlendirmez.
    const evaluate = async () => {
        const sid = await ensureCreated().then((r) => r ?? session?.id ?? null);
        if (!sid) {
            showError('Eksik bilgi', 'Önce kontrol alanını doldurun veya kanıt ekleyin.');
            return;
        }
        // Bekleyen debounce autosave'i iptal et — evaluate zaten güncel gövdeyi taşıyor.
        if (saveTimer.current) clearTimeout(saveTimer.current);
        // Uçuştaki bir autosave varsa dinsin (kendi PATCH'imizle 409 çakışmasın).
        for (let i = 0; i < 40 && (savingRef.current || pendingSaveRef.current); i++) {
            await new Promise((r) => setTimeout(r, 100));
        }
        setRunning(true);
        setTab('current');
        try {
            const s = await api.evaluateAiEvalSession(sid, {
                ...controlBody(),
                additionalNote: msg.trim() || null,
                contentVersion: versionRef.current,
            });
            applySession(s);
            setMsg('');
        } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
                // Sunucudaki güncel sürümle bir kez daha dene (autosave yarışı kendini onarsın).
                try {
                    const fresh = await api.getAiEvalSession(sid);
                    versionRef.current = fresh.contentVersion;
                    const s = await api.evaluateAiEvalSession(sid, {
                        ...controlBody(),
                        additionalNote: msg.trim() || null,
                        contentVersion: fresh.contentVersion,
                    });
                    applySession(s);
                    setMsg('');
                    return;
                } catch {
                    showError('Girdi değişmiş', 'Bu değerlendirme başka bir yerden güncellendi. Sayfa yenilendi — tekrar deneyin.');
                    await load();
                }
            } else {
                showError('Değerlendirme hatası', e instanceof Error ? e.message : 'AI çağrısı başarısız');
                await load();
            }
        } finally {
            setRunning(false);
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        }
    };

    // "Ek soru sor" — 6 başlıklı raporu YENİDEN ÜRETMEZ; soruya yanıt verir.
    const askQuestion = async () => {
        const sid = liveId ?? session?.id;
        if (!sid || !msg.trim()) return;
        setRunning(true);
        setTab('current');
        try {
            const s = await api.askAiEvalSession(sid, msg.trim(), versionRef.current);
            applySession(s);
            setMsg('');
        } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
                showError('Girdi değişmiş', 'Ekrandaki girdi değişti — sayfa yenilendi, soruyu tekrar sorun.');
                await load();
            } else {
                showError('Soru yanıtlanamadı', e instanceof Error ? e.message : 'AI çağrısı başarısız');
                await load();
            }
        } finally {
            setRunning(false);
        }
    };

    const cancelRun = async () => {
        if (!session) return;
        try {
            await api.cancelAiEvalRun(session.id);
            success('İptal istendi', 'Model yanıtı geldiğinde uygulanmayacak.');
            setSession((prev) => (prev ? { ...prev, cancelRequested: true } : prev));
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'İptal edilemedi');
        }
    };

    const complete = async (outcome: AiEvalOutcome) => {
        if (!session) return;
        try {
            const s = await api.completeAiEvalSession(session.id, outcome);
            applySession(s);
            success('Tamamlandı', 'Değerlendirme sonucu kaydedildi.');
        } catch (e) {
            showError('Tamamlanamadı', e instanceof Error ? e.message : 'İşlem başarısız');
        }
    };

    const reopen = async () => {
        if (!session) return;
        try {
            const s = await api.reopenAiEvalSession(session.id);
            applySession(s);
            success('Yeniden açıldı', 'İnceleme yeniden düzenlenebilir.');
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Yeniden açılamadı');
        }
    };

    const reviewFinding = async (
        group: 'uyumsuzAlanlar' | 'bulguAdaylari' | 'findingAssessment' | 'requirementAssessments',
        index: number,
        status: 'ACCEPTED' | 'EDITED' | 'REJECTED',
        reason?: string,
        edited?: unknown,
    ) => {
        if (!session) return;
        try {
            const s = await api.reviewAiEvalFinding(session.id, { group, index, status, reason, edited });
            applySession(s);
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'İnceleme kaydedilemedi');
        }
    };

    const attachments: AttachmentMeta[] = useMemo(
        () => (session?.attachments ?? []).filter((a) => a.active).map((a) => ({ ...a })),
        [session?.attachments],
    );

    const hasControl =
        (mode === 'ref' ? !!controlRefId : controlText.trim().length > 0) || controlManualNote.trim().length > 0;
    const hasEvidence =
        attachments.length > 0 ||
        evidenceText.trim().length > 0 ||
        msg.trim().length > 0 ||
        (session?.messages?.length ?? 0) > 0;

    const runStatus: AiEvalRunStatus = session?.runStatus ?? 'DRAFT';
    const latestEval = session?.latestEvaluation?.effective ?? null;
    const priorRuns = (session?.messages ?? []).filter(
        (m) => m.role === 'ASSISTANT' && (m.kind ?? 'EVALUATION') === 'EVALUATION',
    );

    if (loading) return <PageShell><LoadingState /></PageShell>;

    return (
        <PageShell>
            {/* ── Başlık ── */}
            <div className="mb-3 flex flex-wrap items-center gap-3">
                <Link href="/ai/kontrol-kanit" className="text-sm text-slate-400 hover:text-slate-700">
                    ← Değerlendirmeler
                </Link>
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={flushSave}
                    placeholder="Değerlendirme adı"
                    className="min-w-[240px] flex-1 rounded-md border border-transparent px-2 py-1 text-lg font-semibold text-slate-800 hover:border-slate-200 focus:border-blue-400 focus:outline-none"
                />
                {!isNew && (
                    <StatusBadge variant={RUN_BADGE[runStatus]}>{RUN_STATUS_LABEL[runStatus]}</StatusBadge>
                )}
                {session?.outcome && (
                    <StatusBadge variant="neutral">Sonuç: {OUTCOME_LABEL[session.outcome]}</StatusBadge>
                )}
                <SaveIndicator status={isNew ? (hasMeaningfulContent ? saveStatus : 'idle') : saveStatus} />
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <label className="flex items-center gap-1.5">
                    Dönem:
                    <input
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        onBlur={flushSave}
                        placeholder="Eylül 2026"
                        className="w-32 rounded border border-slate-200 px-2 py-0.5 focus:border-blue-400 focus:outline-none"
                    />
                </label>
                {session?.clonedFromId && (
                    <Link
                        href={`/ai/kontrol-kanit/${session.clonedFromId}`}
                        className="text-blue-500 hover:underline"
                    >
                        Kaynak değerlendirmeden çoğaltıldı →
                    </Link>
                )}
                {session?.inputsDirty && latestEval && (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                        Girdiler değişti — yeniden değerlendirme gerekli
                    </span>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {/* ── Kontrol Alanı ── */}
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="mb-3 text-sm font-semibold text-slate-700">1 · Kontrol Alanı</h2>

                    <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
                        <button
                            onClick={() => setMode('ref')}
                            className={`flex-1 rounded-md px-2 py-1.5 ${mode === 'ref' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                        >
                            Envanterden seç
                        </button>
                        <button
                            onClick={() => setMode('text')}
                            className={`flex-1 rounded-md px-2 py-1.5 ${mode === 'text' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                        >
                            Elle yaz
                        </button>
                    </div>

                    {mode === 'ref' ? (
                        <>
                            <select
                                value={controlRefId}
                                onChange={(e) => setControlRefId(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                            >
                                <option value="">Kontrol seçin…</option>
                                {controls.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.controlId} — {c.name}
                                    </option>
                                ))}
                            </select>
                            {controlRefId && (
                                <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                                    {controls.find((c) => c.id === controlRefId)?.description || 'Tanım yok'}
                                </p>
                            )}
                        </>
                    ) : (
                        <textarea
                            value={controlText}
                            onChange={(e) => setControlText(e.target.value)}
                            onBlur={flushSave}
                            rows={5}
                            placeholder="Kontrolün tanımını ve varsa test adımlarını yazın…"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        />
                    )}

                    <ChipPicker
                        label="Mevzuat maddeleri"
                        tone="blue"
                        chips={regChips.map((r) => ({ id: r.id, label: `${r.regulation.code} md.${r.articleCode}` }))}
                        query={regQuery}
                        onQuery={setRegQuery}
                        results={regResults
                            .filter((r) => !regChips.some((c) => c.id === r.id))
                            .map((r) => ({ id: r.id, label: `${r.regulation.code} md.${r.articleCode}`, sub: r.title }))}
                        onAdd={(rid) => {
                            const r = regResults.find((x) => x.id === rid);
                            if (r) setRegChips((p) => [...p, r]);
                            setRegQuery('');
                            setRegResults([]);
                        }}
                        onRemove={(rid) => setRegChips((p) => p.filter((x) => x.id !== rid))}
                        placeholder="Madde kodu veya başlık ara…"
                    />

                    <ChipPicker
                        label="Kurumsal kaynaklar (politika / prosedür / metodoloji / rehber)"
                        tone="violet"
                        chips={knChips.map((k) => ({ id: k.id, label: `[${KNOWLEDGE_KIND_LABEL[k.kind]}] ${k.code}` }))}
                        query={knQuery}
                        onQuery={setKnQuery}
                        results={knResults
                            .filter((k) => !knChips.some((c) => c.id === k.id))
                            .map((k) => ({ id: k.id, label: `[${KNOWLEDGE_KIND_LABEL[k.kind]}] ${k.code}`, sub: k.title }))}
                        onAdd={(kid) => {
                            const k = knResults.find((x) => x.id === kid);
                            if (k) setKnChips((p) => [...p, k]);
                            setKnQuery('');
                            setKnResults([]);
                        }}
                        onRemove={(kid) => setKnChips((p) => p.filter((x) => x.id !== kid))}
                        placeholder="Kaynak kodu veya başlık ara…"
                    />

                    <ChipPicker
                        label="Kaynak Kataloğu birimleri (sürümlü mevzuat / standart maddesi)"
                        tone="blue"
                        chips={srcChips.map((s) => ({ id: s.id, label: s.label }))}
                        query={srcQuery}
                        onQuery={setSrcQuery}
                        results={srcResults.filter((s) => !srcChips.some((c) => c.id === s.id))}
                        onAdd={(uid) => {
                            const s = srcResults.find((x) => x.id === uid);
                            if (s) setSrcChips((p) => [...p, s]);
                            setSrcQuery('');
                            setSrcResults([]);
                        }}
                        onRemove={(uid) => setSrcChips((p) => p.filter((x) => x.id !== uid))}
                        placeholder="Madde/kontrol kodu ya da konu ara… (yalnız onaylı, yetkili kaynaklar)"
                    />
                    {!isNew && session && (
                        <div className="mt-2 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px]">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500">
                                <span>Önerilen: <b>{session.suggestedSourceUnitIds.length}</b></span>
                                <span>Kullanıcı seçti: <b>{session.sourceUnitIds.length}</b></span>
                                <span>Son çalışmada modele iletilen: <b>{session.usedSourceUnitIds.length}</b></span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    loading={suggesting}
                                    className="ml-auto !py-0.5 !text-[10px]"
                                    onClick={async () => {
                                        if (isNew || !session) return;
                                        setSuggesting(true);
                                        try {
                                            setSrcSuggest(await api.suggestEvalSources(session.id));
                                        } catch (e) {
                                            showError('Hata', e instanceof Error ? e.message : 'Öneri alınamadı');
                                        } finally {
                                            setSuggesting(false);
                                        }
                                    }}
                                >
                                    Kaynak öner
                                </Button>
                            </div>
                            {srcSuggest && srcSuggest.suggestions.length === 0 && (
                                <p className="text-amber-700">
                                    {srcSuggest.reason}
                                    {srcSuggest.catalogLink && (
                                        <>
                                            {' '}
                                            <Link href={srcSuggest.catalogLink} className="text-blue-600 hover:underline">
                                                Kaynak Kataloğu →
                                            </Link>
                                        </>
                                    )}
                                </p>
                            )}
                            {srcSuggest && srcSuggest.suggestions.length > 0 && (
                                <ul className="space-y-1">
                                    {srcSuggest.suggestions.map((s) => {
                                        const added = srcChips.some((c) => c.id === s.unitId);
                                        return (
                                            <li key={s.unitId} className="flex items-start gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <span className="font-mono text-slate-700">{s.unitCode}</span>{' '}
                                                    <span className="text-slate-500">
                                                        {s.sourceTitle} {s.versionLabel}
                                                    </span>
                                                    <p className="text-[10px] text-slate-400">{s.rationale}</p>
                                                </div>
                                                <button
                                                    disabled={added}
                                                    onClick={() =>
                                                        setSrcChips((p) => [
                                                            ...p,
                                                            { id: s.unitId, label: s.unitCode, sub: `${s.sourceTitle} ${s.versionLabel}` },
                                                        ])
                                                    }
                                                    className="shrink-0 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-blue-700 disabled:opacity-40"
                                                >
                                                    {added ? 'seçildi' : '+ seç'}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            <p className="text-[10px] text-slate-400">
                                Kaynaklar önerilir; değerlendirmeye eklenmesi için siz seçersiniz (gizli enjeksiyon yok).
                            </p>
                        </div>
                    )}

                    <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Kapsam / ek not
                    </h3>
                    <textarea
                        value={controlManualNote}
                        onChange={(e) => setControlManualNote(e.target.value)}
                        onBlur={flushSave}
                        rows={3}
                        placeholder="Kontrol hakkında ek bağlam, kapsam daraltma, özel durum…"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    />
                </section>

                {/* ── Yanıt / Kanıt Alanı ── */}
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="mb-3 text-sm font-semibold text-slate-700">2 · Yanıt / Kanıt Alanı</h2>
                    {isNew ? (
                        <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
                            Kanıt eklemek için önce kontrol alanını doldurun; taslak otomatik oluşturulur.
                        </p>
                    ) : (
                        <FileUpload
                            label="Doküman, görsel, e-posta (.eml/.msg)"
                            attachments={attachments}
                            onUpload={async (meta) => {
                                try {
                                    await api.addAiEvalAttachment(id, meta);
                                    await load();
                                } catch (e) {
                                    showError('Hata', e instanceof Error ? e.message : 'Eklenemedi');
                                }
                            }}
                            onRemove={async (att) => {
                                if (!att.id) return;
                                try {
                                    await api.removeAiEvalAttachment(id, att.id);
                                    await load();
                                } catch {
                                    showError('Hata', 'Silinemedi');
                                }
                            }}
                        />
                    )}
                    <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Yazılı yanıt / kanıt metni
                    </h3>
                    <textarea
                        value={evidenceText}
                        onChange={(e) => setEvidenceText(e.target.value)}
                        onBlur={flushSave}
                        rows={5}
                        placeholder="E-posta metnini yapıştırın, açıklama yazın, sistem çıktısını ekleyin… Her değerlendirmede dikkate alınır."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    />
                </section>
            </div>

            {/* ── Sekmeler: güncel değerlendirme / kanıt / geçmiş / çıktı ── */}
            {!isNew && (
                <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex gap-1 border-b border-slate-100 px-2">
                        {([
                            ['current', 'Güncel değerlendirme'],
                            ['evidence', `Kanıt (${(session?.attachments ?? []).filter((a) => a.active).length})`],
                            ['history', `Geçmiş çalışmalar (${priorRuns.length})`],
                            ['outputs', 'Çıktılar'],
                        ] as [Tab, string][]).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setTab(key)}
                                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium ${
                                    tab === key ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="p-4">
                        {tab === 'current' && (
                            <CurrentTab
                                session={session!}
                                running={running}
                                latestEval={latestEval}
                                msg={msg}
                                setMsg={setMsg}
                                hasControl={hasControl}
                                hasEvidence={hasEvidence}
                                onEvaluate={evaluate}
                                onAsk={askQuestion}
                                onCancel={cancelRun}
                                onReview={reviewFinding}
                                onComplete={complete}
                                onReopen={reopen}
                                threadEndRef={threadEnd}
                            />
                        )}
                        {tab === 'evidence' && (
                            <EvidenceTab
                                sessionId={id}
                                attachments={session?.attachments ?? []}
                                onChanged={load}
                            />
                        )}
                        {tab === 'history' && <HistoryTab runs={priorRuns} />}
                        {tab === 'outputs' && <OutputsTab sessionId={id} runStatus={runStatus} />}
                    </div>
                </section>
            )}

            {isNew && (
                <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                    Kontrol alanını doldurduğunuzda taslak oluşturulur ve değerlendirme araçları burada açılır.
                </div>
            )}

            <p className="mt-3 text-[11px] text-slate-400">
                AI çıktıları yalnızca öneridir. Başarılı bir değerlendirme kaydı otomatik olarak “Tamamlandı” sayılmaz;
                tespitleri inceledikten sonra sonucu siz sonuçlandırırsınız.
            </p>
        </PageShell>
    );
}

// ─── Kaydetme göstergesi ────────────────────────────────────────────────────

function SaveIndicator({ status }: { status: SaveStatus }) {
    const map: Record<SaveStatus, { text: string; cls: string }> = {
        idle: { text: '', cls: '' },
        saving: { text: 'Kaydediliyor…', cls: 'text-slate-400' },
        saved: { text: 'Kaydedildi', cls: 'text-emerald-600' },
        error: { text: 'Kaydedilemedi', cls: 'text-red-600' },
    };
    const s = map[status];
    if (!s.text) return null;
    return <span className={`text-xs ${s.cls}`}>{s.text}</span>;
}

// ─── Chip picker ────────────────────────────────────────────────────────────

function ChipPicker({
    label, tone, chips, query, onQuery, results, onAdd, onRemove, placeholder,
}: {
    label: string;
    tone: 'blue' | 'violet';
    chips: { id: string; label: string }[];
    query: string;
    onQuery: (v: string) => void;
    results: { id: string; label: string; sub?: string }[];
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
    placeholder: string;
}) {
    const toneCls =
        tone === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700';
    return (
        <>
            <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</h3>
            {chips.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                    {chips.map((c) => (
                        <span key={c.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] ${toneCls}`}>
                            {c.label}
                            <button onClick={() => onRemove(c.id)} className="opacity-60 hover:opacity-100">×</button>
                        </span>
                    ))}
                </div>
            )}
            <input
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
            {results.length > 0 && (
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 text-xs">
                    {results.map((r) => (
                        <li key={r.id}>
                            <button onClick={() => onAdd(r.id)} className="block w-full px-3 py-2 text-left hover:bg-slate-50">
                                <span className="font-mono font-semibold">{r.label}</span>
                                {r.sub ? ` — ${r.sub}` : ''}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}

// ─── Güncel değerlendirme sekmesi ───────────────────────────────────────────

function isV2Eval(e: (EvalOutput & EvalOutputV2) | null): boolean {
    return !!e && (Array.isArray(e.requirementAssessments) || !!e.controlResult || Array.isArray(e.expectedState));
}

function CurrentTab({
    session, running, latestEval, msg, setMsg, hasControl, hasEvidence,
    onEvaluate, onAsk, onCancel, onReview, onComplete, onReopen, threadEndRef,
}: {
    session: AiEvalSession;
    running: boolean;
    latestEval: (EvalOutput & EvalOutputV2) | null;
    msg: string;
    setMsg: (v: string) => void;
    hasControl: boolean;
    hasEvidence: boolean;
    onEvaluate: () => void;
    onAsk: () => void;
    onCancel: () => void;
    onReview: (g: 'uyumsuzAlanlar' | 'bulguAdaylari' | 'findingAssessment' | 'requirementAssessments', i: number, s: 'ACCEPTED' | 'EDITED' | 'REJECTED', reason?: string, edited?: unknown) => void;
    onComplete: (o: AiEvalOutcome) => void;
    onReopen: () => void;
    threadEndRef: React.RefObject<HTMLDivElement | null>;
}) {
    const rs = session.runStatus;
    const progress = session.runProgress;
    const lastRun = [...(session.messages ?? [])].reverse().find(
        (m) => m.role === 'ASSISTANT' && (m.kind ?? 'EVALUATION') === 'EVALUATION' && (m.evaluation || m.errorText),
    );
    const cited = lastRun?.citedSourceRefs ?? [];
    const v2 = isV2Eval(latestEval);
    const citOk = (c: { exists: boolean; inSentSet: boolean; textVerified?: boolean; quoteVerified?: boolean }) =>
        c.exists && c.inSentSet && (c.quoteVerified ?? c.textVerified ?? true);
    const hasEval = !!latestEval;
    return (
        <div className="space-y-4">
            {(rs === 'RUNNING' || running) && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                    <div className="flex items-center gap-2">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                        <span className="font-medium">{phaseLabel(progress?.phase)}</span>
                        {progress?.phase === 'reading_files' && progress.filesTotal ? (
                            <span>· {progress.filesRead ?? 0}/{progress.filesTotal} dosya okundu</span>
                        ) : null}
                        <button onClick={onCancel} className="ml-auto rounded border border-blue-300 bg-white px-2 py-0.5 font-medium hover:bg-blue-100">
                            {session.cancelRequested ? 'İptal isteniyor…' : 'İptal et'}
                        </button>
                    </div>
                </div>
            )}

            {rs === 'ERROR' && (
                <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    Son değerlendirme başarısız oldu.
                    <Button size="sm" variant="outline" onClick={onEvaluate}>Tekrar dene</Button>
                </div>
            )}

            {session.needsReview && rs !== 'RUNNING' && (
                <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-xs text-orange-800">
                    <p className="font-semibold">Bu değerlendirme insan incelemesi gerektiriyor.</p>
                    <p className="mt-0.5">{session.needsReviewReason || 'Şema veya atıf doğrulamasında sorun bulundu.'}</p>
                </div>
            )}

            {session.inputsDirty && hasEval && rs !== 'RUNNING' && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
                    Girdiler son değerlendirmeden sonra değişti — güncel sonuç için “Yeniden değerlendir”.
                </div>
            )}

            {!hasEval && rs !== 'RUNNING' && !running && (
                <p className="py-6 text-center text-sm text-slate-400">
                    Kontrol alanını doldurup kanıtları ekleyin, ardından “Değerlendir”e basın.
                </p>
            )}

            {hasEval && (
                <>
                    {(lastRun?.sentSourceUnitIds?.length || cited.length > 0) && (
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px]">
                            <p className="mb-1 font-semibold text-slate-600">
                                Kaynak atıfları — modele iletilen: {lastRun?.sentSourceUnitIds?.length ?? 0} · çıktıda atıf: {cited.length}
                            </p>
                            {cited.length === 0 ? (
                                <p className="text-slate-400">Bu çalışmanın çıktısında bir kaynak birimine geçerli atıf yok.</p>
                            ) : (
                                <ul className="space-y-0.5">
                                    {cited.map((c, i) => (
                                        <li key={i} className="flex items-start gap-1.5">
                                            <span className={citOk(c) ? 'text-emerald-600' : 'text-red-600'}>
                                                {citOk(c) ? '✓' : '✗'}
                                            </span>
                                            <span className="text-slate-600">
                                                {('unitCode' in c && c.unitCode) || c.sourceUnitId?.slice(0, 8) || '—'} — {c.reason}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <p className="mt-1 text-[10px] text-slate-400">
                                Geçerli birim + alıntı eşleşmesi tespitin o kaynaktan çıktığını kanıtlamaz; ilişki insan incelemesi bekliyor.
                            </p>
                        </div>
                    )}
                    {v2 ? (
                        <EvalReportV2
                            e={latestEval as EvalOutputV2}
                            reviewable={rs === 'AWAITING_REVIEW'}
                            onReview={onReview}
                        />
                    ) : (
                        <EvalCard
                            e={latestEval as EvalOutput}
                            reviewable={rs === 'AWAITING_REVIEW'}
                            onReview={onReview}
                        />
                    )}
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        {rs === 'COMPLETED' ? (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                <span>
                                    Sonuçlandırıldı: <b>{session.outcome ? OUTCOME_LABEL[session.outcome] : '—'}</b>
                                    {session.completedAt ? ` · ${new Date(session.completedAt).toLocaleDateString('tr-TR')}` : ''}
                                </span>
                                <Button size="sm" variant="outline" onClick={onReopen}>Yeniden aç</Button>
                            </div>
                        ) : rs === 'AWAITING_REVIEW' ? (
                            <div className="space-y-2">
                                <p className="text-xs font-medium text-slate-600">
                                    Tespitleri inceledikten sonra değerlendirmeyi sonuçlandırın:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {(Object.keys(OUTCOME_LABEL) as AiEvalOutcome[]).map((o) => (
                                        <Button key={o} size="sm" variant="outline" onClick={() => onComplete(o)}>
                                            {OUTCOME_LABEL[o]}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </>
            )}

            {/* Sohbet / takip — kullanıcı soruları + yanıtlar + stale/iptal notları */}
            <div className="rounded-lg border border-slate-100">
                <div className="max-h-[40vh] space-y-3 overflow-y-auto p-3">
                    {session.messages
                        .filter(
                            (m) =>
                                (m.role === 'USER' && (m.kind ?? 'EVALUATION') === 'QUESTION') ||
                                (m.role === 'ASSISTANT' && (m.kind === 'ANSWER' || m.errorText || m.cancelled || m.stale)),
                        )
                        .map((m) => (
                            <MessageBlock key={m.id} m={m} />
                        ))}
                    <div ref={threadEndRef} />
                </div>
                <div className="border-t border-slate-100 p-3">
                    <textarea
                        value={msg}
                        onChange={(e) => setMsg(e.target.value)}
                        rows={2}
                        placeholder={
                            hasEval
                                ? 'Ek açıklama (yeniden değerlendirmeye girer) ya da ek soru (rapora dokunmaz)…'
                                : 'Değerlendirilecek ek açıklama / not (opsiyonel)…'
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button onClick={onEvaluate} loading={running} disabled={!hasControl || !hasEvidence || rs === 'RUNNING'}>
                            {hasEval ? 'Yeniden değerlendir' : 'Değerlendir'}
                        </Button>
                        {hasEval && (
                            <Button
                                variant="outline"
                                onClick={onAsk}
                                disabled={!msg.trim() || rs === 'RUNNING' || running}
                                title="6 başlıklı raporu yeniden üretmez; sorunuza yanıt verir."
                            >
                                Ek soru sor
                            </Button>
                        )}
                        {!hasControl && <span className="text-xs text-amber-600">Kontrol Alanı doldurulmalı.</span>}
                        {hasControl && !hasEvidence && (
                            <span className="text-xs text-amber-600">Kanıt gerekli: dosya, yazılı kanıt metni ya da açıklama.</span>
                        )}
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-400">
                        <b>Yeniden değerlendir</b>: ekrandaki güncel kontrol + kanıt + ek açıklama ile tam raporu
                        yeniden üretir (önceki rapor geçmişte kalır). <b>Ek soru sor</b>: yalnız sorunuzu yanıtlar,
                        raporu değiştirmez.
                    </p>
                </div>
            </div>
        </div>
    );
}

function phaseLabel(phase?: string): string {
    switch (phase) {
        case 'reading_files': return 'Dosyalar okunuyor';
        case 'evaluating': return 'Test adımları değerlendiriliyor';
        case 'preparing':
        default: return 'Sonuç hazırlanıyor';
    }
}

// ─── Kanıt sekmesi ──────────────────────────────────────────────────────────

function EvidenceTab({
    sessionId, attachments, onChanged,
}: {
    sessionId: string;
    attachments: AiEvalAttachment[];
    onChanged: () => Promise<void>;
}) {
    const active = attachments.filter((a) => a.active);
    if (active.length === 0) {
        return <p className="py-6 text-center text-sm text-slate-400">Bu değerlendirmede dosya kanıtı yok.</p>;
    }
    return (
        <div className="space-y-3">
            {active.map((a) => (
                <EvidenceRow key={a.id} sessionId={sessionId} att={a} onChanged={onChanged} />
            ))}
        </div>
    );
}

function EvidenceRow({
    sessionId, att, onChanged,
}: {
    sessionId: string;
    att: AiEvalAttachment;
    onChanged: () => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [meta, setMeta] = useState({
        docDate: att.docDate ?? '',
        relatedSystem: att.relatedSystem ?? '',
        relatedSample: att.relatedSample ?? '',
        relatedTestStep: att.relatedTestStep ?? '',
        note: att.note ?? '',
    });
    const [saving, setSaving] = useState(false);
    const { success, error: showError } = useToast();

    const save = async () => {
        setSaving(true);
        try {
            await api.updateAiEvalAttachmentMeta(sessionId, att.id, {
                docDate: meta.docDate || null,
                relatedSystem: meta.relatedSystem || null,
                relatedSample: meta.relatedSample || null,
                relatedTestStep: meta.relatedTestStep || null,
                note: meta.note || null,
            });
            success('Kaydedildi', 'Kanıt bilgisi güncellendi.');
            await onChanged();
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Kaydedilemedi');
        } finally {
            setSaving(false);
        }
    };

    const READ_BADGE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'critical'> = {
        PENDING: 'neutral', READING: 'info', READ: 'success', PARTIAL: 'warning', FAILED: 'critical',
    };

    return (
        <div className="rounded-lg border border-slate-200">
            <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{att.originalName}</span>
                {att.version > 1 && <span className="text-[10px] text-slate-400">s{att.version}</span>}
                <StatusBadge variant={READ_BADGE[att.readStatus]}>{READ_STATUS_LABEL[att.readStatus]}</StatusBadge>
                <span className="text-xs text-slate-400">{(att.sizeBytes / 1024).toFixed(0)} KB</span>
                <span className="text-slate-300">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div className="space-y-2 border-t border-slate-100 p-3 text-xs">
                    {att.readNote && <p className="rounded bg-slate-50 p-2 text-slate-500">Okuma notu: {att.readNote}</p>}
                    <div className="grid gap-2 sm:grid-cols-2">
                        <Field label="Belge tarihi / dönemi" value={meta.docDate} onChange={(v) => setMeta({ ...meta, docDate: v })} />
                        <Field label="İlgili sistem" value={meta.relatedSystem} onChange={(v) => setMeta({ ...meta, relatedSystem: v })} />
                        <Field label="İlgili örneklem" value={meta.relatedSample} onChange={(v) => setMeta({ ...meta, relatedSample: v })} />
                        <Field label="İlgili test adımı" value={meta.relatedTestStep} onChange={(v) => setMeta({ ...meta, relatedTestStep: v })} />
                    </div>
                    <label className="block">
                        <span className="text-slate-400">Açıklama</span>
                        <textarea
                            value={meta.note}
                            onChange={(e) => setMeta({ ...meta, note: e.target.value })}
                            rows={2}
                            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 focus:border-blue-400 focus:outline-none"
                        />
                    </label>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={save} loading={saving}>Kanıt bilgisini kaydet</Button>
                        <span className="text-slate-400">
                            Yüklenme: {new Date(att.createdAt).toLocaleDateString('tr-TR')}
                        </span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                        Yeni sürüm yüklemek dosyayı yerinde değiştirmez; yeni sürüm sonraki değerlendirmede kullanılır,
                        önceki sürüm referansı korunur.
                    </p>
                </div>
            )}
        </div>
    );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <label className="block">
            <span className="text-slate-400">{label}</span>
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 focus:border-blue-400 focus:outline-none"
            />
        </label>
    );
}

// ─── Geçmiş çalışmalar sekmesi ──────────────────────────────────────────────

function HistoryTab({ runs }: { runs: AiEvalMessage[] }) {
    if (runs.length === 0) {
        return <p className="py-6 text-center text-sm text-slate-400">Henüz çalışma yok.</p>;
    }
    return (
        <div className="space-y-3">
            {[...runs].reverse().map((m, i) => (
                <div key={m.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">Çalışma #{runs.length - i}</span>
                        <span>{new Date(m.createdAt).toLocaleString('tr-TR')}</span>
                        {m.modelName && <span>· {m.modelName}</span>}
                        {m.promptVersion && <span>· prompt {m.promptVersion}</span>}
                        {m.inputVersion != null && <span>· girdi s{m.inputVersion}</span>}
                        {m.cancelled && <StatusBadge variant="neutral">İptal edildi</StatusBadge>}
                        {m.stale && <StatusBadge variant="warning">Girdiler değişmişti</StatusBadge>}
                        {m.errorText && <StatusBadge variant="critical">Hata</StatusBadge>}
                        {m.reviewedAt && <StatusBadge variant="success">İncelendi</StatusBadge>}
                    </div>
                    {m.errorText ? (
                        <p className="text-xs text-red-600">{m.errorText}</p>
                    ) : (
                        (m.editedEvaluation || m.evaluation) && (
                            <details>
                                <summary className="cursor-pointer text-xs text-blue-600">
                                    Çıktıyı görüntüle{m.schemaVersion ? ` · şema ${m.schemaVersion}` : ''}
                                    {m.schemaValid === false ? ' · şema doğrulanamadı' : ''}
                                </summary>
                                <div className="mt-2">
                                    {isV2Eval((m.editedEvaluation || m.evaluation) as EvalOutput & EvalOutputV2) ? (
                                        <EvalReportV2 e={(m.editedEvaluation || m.evaluation) as EvalOutputV2} />
                                    ) : (
                                        <EvalCard e={(m.editedEvaluation || m.evaluation) as EvalOutput} />
                                    )}
                                </div>
                            </details>
                        )
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── Çıktılar sekmesi ───────────────────────────────────────────────────────

function OutputsTab({ sessionId, runStatus }: { sessionId: string; runStatus: AiEvalRunStatus }) {
    const [data, setData] = useState<Awaited<ReturnType<typeof api.getAiEvalOutputs>> | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const { success } = useToast();

    useEffect(() => {
        api.getAiEvalOutputs(sessionId)
            .then(setData)
            .catch((e) => setErr(e instanceof Error ? e.message : 'Çıktı alınamadı'));
    }, [sessionId]);

    if (err) return <p className="py-6 text-center text-sm text-slate-400">{err}</p>;
    if (!data) return <LoadingState />;

    const copy = (text: string, what: string) => {
        navigator.clipboard?.writeText(text).then(
            () => success('Kopyalandı', `${what} panoya alındı.`),
            () => undefined,
        );
    };

    return (
        <div className="space-y-4 text-sm">
            {!data.reviewed && (
                <p className="rounded bg-amber-50 p-2 text-xs text-amber-700">
                    Tespitlerin tamamı incelenmedi. Çıktılar yalnızca incelenmiş (reddedilmemiş) tespitleri içerir.
                </p>
            )}
            {data.needsReview && (
                <p className="rounded border border-orange-300 bg-orange-50 p-2 text-xs text-orange-800">
                    İnceleme gerekiyor: {data.needsReviewReason || 'şema/atıf doğrulaması sorunu.'}
                </p>
            )}
            <p className="text-xs text-slate-400">
                Kullanılan değerlendirme sürümü: {data.evaluationVersion ?? '—'}
                {data.schemaVersion ? ` · şema ${data.schemaVersion}` : ''} ·
                {' '}Sonuç: {data.outcome ? OUTCOME_LABEL[data.outcome] : 'sonuçlandırılmadı'}
            </p>

            <OutputBlock
                title="Kontrol sonucu (yalnızca tespitler)"
                body={data.controlResult}
                onCopy={() => copy(data.controlResult, 'Kontrol sonucu')}
            />
            <OutputBlock
                title="Eksik kanıt talebi"
                body={data.missingEvidenceRequest}
                onCopy={() => copy(data.missingEvidenceRequest, 'Eksik kanıt talebi')}
            />

            <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Bulgu taslakları ({data.findingCandidates.length})
                </h4>
                <div className="space-y-2">
                    {data.findingCandidates.map((b, i) =>
                        'title' in b ? (
                            <FindingV2Card key={i} f={b as EvalFindingAssessment} idx={i} />
                        ) : (
                            <FindingCandidateCard key={i} b={b as EvalFindingCandidate} />
                        ),
                    )}
                    {data.findingCandidates.length === 0 && (
                        <p className="text-xs text-slate-400">İncelenmiş bulgu adayı yok.</p>
                    )}
                </div>
            </div>

            {runStatus !== 'COMPLETED' && (
                <p className="text-[11px] text-slate-400">
                    Not: Değerlendirme henüz sonuçlandırılmadı; çıktıları taslak olarak kullanın.
                </p>
            )}
        </div>
    );
}

function OutputBlock({ title, body, onCopy }: { title: string; body: string; onCopy: () => void }) {
    return (
        <div className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span className="text-xs font-semibold text-slate-600">{title}</span>
                <button onClick={onCopy} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
                    Kopyala
                </button>
            </div>
            <pre className="whitespace-pre-wrap px-3 py-2 text-xs text-slate-600">{body}</pre>
        </div>
    );
}

// ─── Mesaj bloğu ────────────────────────────────────────────────────────────

function MessageBlock({ m }: { m: AiEvalMessage }) {
    if (m.role === 'USER') {
        return (
            <div className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-blue-600 px-3.5 py-2 text-sm text-white">
                    {m.kind === 'QUESTION' && <span className="mr-1 text-[10px] font-semibold uppercase opacity-70">Soru</span>}
                    {m.content}
                </div>
            </div>
        );
    }
    if (m.errorText) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{m.errorText}</div>
        );
    }
    if (m.kind === 'ANSWER') {
        return (
            <div className="flex justify-start">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700">
                    <span className="mr-1 text-[10px] font-semibold uppercase text-slate-400">Yanıt</span>
                    {m.answerText ?? m.content}
                </div>
            </div>
        );
    }
    if (m.cancelled || m.stale) {
        return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                {m.content}
            </div>
        );
    }
    return null;
}

// ─── Yapılandırılmış rapor v2 (6 başlık + gereklilik–kanıt tablosu) ─────────

const REQ_RESULT_LABEL: Record<ReqResult, string> = {
    MET: 'Karşılanıyor',
    PARTIALLY_MET: 'Kısmen karşılanıyor',
    NOT_MET: 'Karşılanmıyor',
    INSUFFICIENT_EVIDENCE: 'Kanıt yetersiz',
    OUT_OF_SCOPE: 'Kapsam dışı',
};
const REQ_RESULT_STYLE: Record<ReqResult, string> = {
    MET: 'bg-emerald-100 text-emerald-800',
    PARTIALLY_MET: 'bg-amber-100 text-amber-800',
    NOT_MET: 'bg-red-100 text-red-800',
    INSUFFICIENT_EVIDENCE: 'bg-slate-200 text-slate-700',
    OUT_OF_SCOPE: 'bg-slate-100 text-slate-500',
};
const OVERALL_LABEL: Record<string, string> = {
    MET: 'Karşılanıyor', PARTIALLY_MET: 'Kısmen karşılanıyor',
    NOT_MET: 'Karşılanmıyor', INSUFFICIENT_EVIDENCE: 'Kanıt yetersiz',
};

function SectionH({ n, title }: { n: number; title: string }) {
    return (
        <h3 className="mb-1.5 mt-1 flex items-center gap-2 text-[13px] font-bold text-slate-700">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px]">{n}</span>
            {title}
        </h3>
    );
}

function RefChip({ r }: { r?: EvalSourceRefV2 }) {
    if (!r || (!r.label && !r.sourceUnitId)) return null;
    return (
        <span className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
            {r.label || r.sourceUnitId?.slice(0, 10)}
            {r.clause ? ` · ${r.clause}` : ''}
            {r.version ? ` (${r.version})` : ''}
            {r.quote ? <span className="italic text-blue-500">“{r.quote.slice(0, 60)}{r.quote.length > 60 ? '…' : ''}”</span> : null}
        </span>
    );
}

function EvalReportV2({
    e, reviewable, onReview,
}: {
    e: EvalOutputV2;
    reviewable?: boolean;
    onReview?: (g: 'findingAssessment' | 'requirementAssessments', i: number, s: 'ACCEPTED' | 'EDITED' | 'REJECTED', reason?: string) => void;
}) {
    const cr = e.controlResult ?? {};
    const reqs = e.requirementAssessments ?? [];
    const findings = e.findingAssessment ?? [];
    const chg = e.changesSincePreviousRun;
    return (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
            {e.summary && <p className="rounded bg-slate-50 p-2 text-[12px] text-slate-700">{e.summary}</p>}

            {/* 1 — Beklenen Durum */}
            <section>
                <SectionH n={1} title="Beklenen Durum" />
                {(e.expectedState ?? []).length === 0 ? (
                    <p className="text-slate-400">Kaynaklardan türetilmiş beklenti belirtilmedi.</p>
                ) : (
                    <ul className="space-y-1">
                        {(e.expectedState ?? []).map((x, i) => (
                            <li key={i} className="rounded border border-slate-100 p-1.5">
                                <span className="font-mono text-[10px] text-slate-400">{x.requirementKey}</span>{' '}
                                {x.statement}
                                {!x.mandatory && <span className="ml-1 text-[10px] text-slate-400">(zorunlu değil)</span>}
                                <div className="mt-0.5"><RefChip r={x.sourceRef} /></div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* 2 — Değerlendirmeye Alınan Kanıtlar */}
            <section>
                <SectionH n={2} title="Değerlendirmeye Alınan Kanıtlar" />
                {(e.evaluatedEvidence ?? []).length === 0 ? (
                    <p className="text-slate-400">Kanıt envanteri boş.</p>
                ) : (
                    <div className="space-y-1.5">
                        {(e.evaluatedEvidence ?? []).map((ev, i) => (
                            <div key={i} className="rounded border border-slate-100 p-1.5">
                                <p className="font-medium text-slate-700">
                                    {ev.evidenceRef}
                                    {ev.readStatus && ev.readStatus !== 'READ' && (
                                        <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">
                                            {ev.readStatus === 'PARTIAL' ? 'KISMEN OKUNDU' : 'OKUNAMADI'}
                                        </span>
                                    )}
                                </p>
                                <p className="text-slate-500">
                                    {[ev.locator, ev.period, ev.scope, ev.evidenceType].filter(Boolean).join(' · ')}
                                </p>
                                {ev.shows && <p><span className="text-slate-400">Gösterir: </span>{ev.shows}</p>}
                                {ev.doesNotShow && <p><span className="text-slate-400">Göstermez: </span>{ev.doesNotShow}</p>}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* 3 — Kontrol Sonucu + gereklilik tablosu */}
            <section>
                <SectionH n={3} title="Kontrol Sonucu" />
                <div className={`mb-2 rounded-lg border p-2 ${cr.overall === 'MET' ? 'border-emerald-200 bg-emerald-50' : cr.overall === 'NOT_MET' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                    <p className="font-semibold text-slate-700">Genel sonuç: {OVERALL_LABEL[cr.overall ?? ''] ?? cr.overall ?? '—'}</p>
                    {cr.summary && <p className="mt-0.5 text-slate-600">{cr.summary}</p>}
                    {cr.designAdequacy && <p className="mt-0.5"><span className="text-slate-400">Tasarım: </span>{cr.designAdequacy}</p>}
                    {cr.operatingEffectiveness && <p><span className="text-slate-400">İşleyiş: </span>{cr.operatingEffectiveness}</p>}
                    {cr.samplingPeriodLimits && <p className="mt-0.5 text-[10px] text-slate-500">Örneklem/dönem sınırı: {cr.samplingPeriodLimits}</p>}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[11px]">
                        <thead>
                            <tr className="border-b border-slate-200 text-left text-slate-500">
                                <th className="py-1 pr-2">Gereklilik</th>
                                <th className="py-1 pr-2">Uygulanabilirlik</th>
                                <th className="py-1 pr-2">Sonuç</th>
                                <th className="py-1">Gerekçe / kanıt</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reqs.map((r, i) => (
                                <RequirementRow key={i} r={r} idx={i} reviewable={reviewable} onReview={onReview} />
                            ))}
                            {reqs.length === 0 && (
                                <tr><td colSpan={4} className="py-2 text-slate-400">Gereklilik değerlendirmesi yok.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 4 — Etki */}
            <section>
                <SectionH n={4} title="Etki" />
                {e.impact ? (
                    <p className="rounded border border-slate-100 p-1.5">
                        <span className={`mr-1 rounded px-1 text-[9px] font-bold ${e.impact.type === 'REALIZED' ? 'bg-red-100 text-red-700' : e.impact.type === 'POTENTIAL' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                            {e.impact.type === 'REALIZED' ? 'GERÇEKLEŞEN' : e.impact.type === 'POTENTIAL' ? 'POTANSİYEL' : 'BELİRSİZ'}
                        </span>
                        {e.impact.description}
                        {e.impact.note && <span className="block text-[10px] text-slate-400">{e.impact.note}</span>}
                    </p>
                ) : <p className="text-slate-400">—</p>}
            </section>

            {/* 5 — Öneri */}
            <section>
                <SectionH n={5} title="Öneri" />
                {(e.recommendations ?? []).length === 0 ? (
                    <p className="text-slate-400">Öneri belirtilmedi.</p>
                ) : (
                    <ul className="space-y-1">
                        {(e.recommendations ?? []).map((r, i) => (
                            <li key={i} className="rounded border border-slate-100 p-1.5">
                                <span className={`mr-1 rounded px-1 text-[9px] font-bold ${r.type === 'EVIDENCE_REQUEST' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {r.type === 'EVIDENCE_REQUEST' ? 'KANIT TALEBİ' : 'DÜZELTİCİ'}
                                </span>
                                {r.text}
                                {r.requestedDocument && <span className="block text-[10px] text-slate-500">İstenen belge: {r.requestedDocument}{r.answersQuestion ? ` — yanıtlayacağı soru: ${r.answersQuestion}` : ''}</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* 6 — Bulguya İlişkin Açıklama */}
            <section>
                <SectionH n={6} title="Bulguya İlişkin Açıklama / Değerlendirme" />
                {findings.length === 0 ? (
                    <p className="rounded bg-slate-50 p-2 text-slate-500">
                        Desteklenen bir bulgu adayı oluşturulmadı. {cr.overall === 'INSUFFICIENT_EVIDENCE'
                            ? 'Kanıt durumu yetersiz — ek kanıt talebi bölümüne bakın.'
                            : 'Mevcut kanıtlarla uyumsuzluk tespit edilmedi.'}
                    </p>
                ) : (
                    <div className="space-y-2">
                        {findings.map((f, i) => (
                            <FindingV2Card key={i} f={f} idx={i} reviewable={reviewable} onReview={onReview} />
                        ))}
                    </div>
                )}
            </section>

            {!!(e.limitations ?? []).length && (
                <section>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sınırlamalar</p>
                    <ul className="ml-4 list-disc text-slate-600">{(e.limitations ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                </section>
            )}
            {!!(e.conflicts ?? []).length && (
                <section>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-orange-500">Çelişkiler</p>
                    <ul className="ml-4 list-disc text-orange-700">{(e.conflicts ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                </section>
            )}
            {chg?.hasPrevious && (
                <section className="rounded-lg border border-violet-200 bg-violet-50 p-2">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                        Önceki değerlendirmeye göre değişenler
                    </p>
                    {chg.changed ? (
                        <>
                            {!!chg.newEvidence?.length && <p><span className="text-slate-400">Yeni kanıt: </span>{chg.newEvidence.join('; ')}</p>}
                            {!!chg.changedSources?.length && <p><span className="text-slate-400">Değişen kaynak: </span>{chg.changedSources.join('; ')}</p>}
                            {(chg.changedResults ?? []).map((c, i) => (
                                <p key={i}>• <b>{c.requirementKey}</b>: {c.from} → {c.to} — {c.reason}</p>
                            ))}
                        </>
                    ) : (
                        <p className="text-slate-600">{chg.explanationIfUnchanged || 'Yeni bilgi sonucu değiştirmedi.'}</p>
                    )}
                </section>
            )}
        </div>
    );
}

function RequirementRow({
    r, idx, reviewable, onReview,
}: {
    r: EvalRequirementAssessment;
    idx: number;
    reviewable?: boolean;
    onReview?: (g: 'requirementAssessments', i: number, s: 'ACCEPTED' | 'EDITED' | 'REJECTED', reason?: string) => void;
}) {
    return (
        <tr className="border-b border-slate-100 align-top">
            <td className="py-1.5 pr-2">
                <span className="font-mono text-[10px] text-slate-400">{r.requirementKey}</span>{' '}
                {r.requirement}
                <div className="mt-0.5 flex flex-wrap gap-1">{(r.sourceRefs ?? []).map((s, i) => <RefChip key={i} r={s} />)}</div>
            </td>
            <td className="py-1.5 pr-2">
                <span className={r.applicability === 'APPLICABLE' ? 'text-slate-600' : 'text-slate-400'}>
                    {r.applicability === 'APPLICABLE' ? 'Uygulanabilir' : r.applicability === 'NOT_APPLICABLE' ? 'Uygulanamaz' : 'Belirlenemedi'}
                </span>
                {r.applicabilityRationale && <span className="block text-[10px] text-slate-400">{r.applicabilityRationale}</span>}
            </td>
            <td className="py-1.5 pr-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${REQ_RESULT_STYLE[r.result]}`}>
                    {REQ_RESULT_LABEL[r.result] ?? r.result}
                </span>
                {r.designVsOperating && r.designVsOperating !== 'NA' && (
                    <span className="block text-[9px] text-slate-400">
                        {r.designVsOperating === 'DESIGN' ? 'tasarım' : r.designVsOperating === 'OPERATING' ? 'işleyiş' : 'tasarım+işleyiş'}
                    </span>
                )}
            </td>
            <td className="py-1.5 text-slate-600">
                {r.observation && <p>{r.observation}</p>}
                {r.rationale && <p className="text-slate-500">{r.rationale}</p>}
                {reviewable && onReview && (
                    <ReviewBar review={r._review} onReview={(s, reason) => onReview('requirementAssessments', idx, s, reason)} />
                )}
                {!reviewable && r._review && <ReviewBar review={r._review} />}
            </td>
        </tr>
    );
}

function FindingV2Card({
    f, idx, reviewable, onReview,
}: {
    f: EvalFindingAssessment;
    idx: number;
    reviewable?: boolean;
    onReview?: (g: 'findingAssessment' | 'requirementAssessments', i: number, s: 'ACCEPTED' | 'EDITED' | 'REJECTED', reason?: string) => void;
}) {
    const rejected = f._review?.status === 'REJECTED';
    return (
        <div className={`rounded-lg border p-2.5 ${rejected ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-amber-200 bg-amber-50/60'}`}>
            <p className="text-[12px] font-semibold text-slate-800">
                {f.suggestedSeverity && <span className="mr-1 font-mono text-[9px] font-bold text-slate-500">[{f.suggestedSeverity}]</span>}
                {f.title}
                {f.recurring && <span className="ml-1.5 rounded bg-amber-200 px-1 py-0.5 font-mono text-[9px] font-bold text-amber-800">TEKRAR{f.precedentFindingId ? ` · ${f.precedentFindingId}` : ''}</span>}
            </p>
            {f.expected && <p className="mt-1 text-[11px]"><span className="font-semibold text-slate-500">Beklenen: </span>{f.expected}</p>}
            {f.observed && <p className="text-[11px]"><span className="font-semibold text-slate-500">Gözlenen: </span>{f.observed}</p>}
            {f.gap && <p className="text-[11px]"><span className="font-semibold text-slate-500">Fark: </span>{f.gap}</p>}
            <div className="mt-1 flex flex-wrap gap-1">{(f.sourceBasis ?? []).map((s, i) => <RefChip key={i} r={s} />)}</div>
            {f.evidenceRefs?.length ? <p className="mt-0.5 text-[10px] text-slate-400">Kanıt: {f.evidenceRefs.join(', ')}</p> : null}
            {f.supported === false && <p className="mt-0.5 text-[10px] text-orange-600">Model bu adayı desteklenmemiş olarak işaretledi.</p>}
            {reviewable && onReview ? (
                <ReviewBar review={f._review} onReview={(s, reason) => onReview('findingAssessment', idx, s, reason)} />
            ) : (
                <ReviewBar review={f._review} />
            )}
        </div>
    );
}

// ─── Değerlendirme kartı ────────────────────────────────────────────────────

const GENEL_STYLE: Record<string, string> = {
    UYUMLU: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    KISMEN_UYUMLU: 'bg-amber-50 text-amber-700 border-amber-200',
    UYUMSUZ: 'bg-red-50 text-red-700 border-red-200',
    DEGERLENDIRILEMEDI: 'bg-slate-100 text-slate-600 border-slate-200',
};
const ONEM_STYLE: Record<string, string> = {
    YUKSEK: 'text-red-600',
    ORTA: 'text-amber-600',
    DUSUK: 'text-slate-500',
};
const REVIEW_LABEL: Record<string, string> = {
    ACCEPTED: 'Kabul edildi',
    EDITED: 'Düzenlenip kabul edildi',
    REJECTED: 'Reddedildi',
};

function EvalCard({
    e, reviewable, onReview,
}: {
    e: EvalOutput;
    reviewable?: boolean;
    onReview?: (g: 'uyumsuzAlanlar' | 'bulguAdaylari' | 'findingAssessment' | 'requirementAssessments', i: number, s: 'ACCEPTED' | 'EDITED' | 'REJECTED', reason?: string, edited?: unknown) => void;
}) {
    return (
        <div className="space-y-3 text-xs">
            {e.genelDurum?.sonuc && (
                <div className={`rounded-lg border p-2.5 ${GENEL_STYLE[e.genelDurum.sonuc] || GENEL_STYLE.DEGERLENDIRILEMEDI}`}>
                    <p className="font-semibold">Genel Durum: {e.genelDurum.sonuc.replace(/_/g, ' ')}</p>
                    {e.genelDurum.ozet && <p className="mt-0.5">{e.genelDurum.ozet}</p>}
                    {!!e.ihlalEdilenMaddeOzeti?.length && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold">Uyumsuzluk içeren maddeler:</span>
                            {e.ihlalEdilenMaddeOzeti.map((m, i) => (
                                <span key={i} className="rounded-full border border-current/30 bg-white/50 px-2 py-0.5 font-mono text-[10.5px] font-semibold">
                                    {m}
                                </span>
                            ))}
                        </p>
                    )}
                </div>
            )}

            {!!e.uyumluAlanlar?.length && (
                <Group title="Uyumlu Alanlar" tone="emerald">
                    {e.uyumluAlanlar.map((p, i) => (
                        <li key={i}>
                            <b>{p.konu}</b>
                            {p.gerekce ? ` — ${p.gerekce}` : ''}
                            {p.kaynak && <span className="text-slate-400"> ({p.kaynak})</span>}
                        </li>
                    ))}
                </Group>
            )}

            {!!e.uyumsuzAlanlar?.length && (
                <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-red-700">Uyumsuz Alanlar</p>
                    <div className="space-y-2">
                        {e.uyumsuzAlanlar.map((p, i) => (
                            <ComplianceRow
                                key={i}
                                p={p}
                                reviewable={reviewable}
                                onReview={onReview ? (s, reason) => onReview('uyumsuzAlanlar', i, s, reason) : undefined}
                            />
                        ))}
                    </div>
                </div>
            )}

            {!!e.bulguAdaylari?.length && (
                <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                        Bulguya Konu Olabilecek Durumlar
                    </p>
                    <div className="space-y-2">
                        {e.bulguAdaylari.map((b, i) => (
                            <FindingCandidateCard
                                key={i}
                                b={b}
                                reviewable={reviewable}
                                onReview={onReview ? (s, reason) => onReview('bulguAdaylari', i, s, reason) : undefined}
                            />
                        ))}
                    </div>
                </div>
            )}

            {!!e.eksikBilgi?.length && (
                <Group title="Eksik Bilgi" tone="slate">
                    {e.eksikBilgi.map((x, i) => <li key={i}>{x}</li>)}
                </Group>
            )}
        </div>
    );
}

function ReviewBar({
    review, onReview,
}: {
    review?: EvalCompliancePoint['_review'];
    onReview?: (s: 'ACCEPTED' | 'EDITED' | 'REJECTED', reason?: string) => void;
}) {
    if (!onReview) {
        return review ? (
            <p className="mt-1.5 text-[10px] text-slate-500">
                {REVIEW_LABEL[review.status]}
                {review.reason ? ` — ${review.reason}` : ''}
            </p>
        ) : null;
    }
    return (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
                onClick={() => onReview('ACCEPTED')}
                className="rounded border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50"
            >
                Kabul et
            </button>
            <button
                onClick={() => {
                    const r = window.prompt('Düzenleme notu / gerekçe');
                    if (r !== null) onReview('EDITED', r || undefined);
                }}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
            >
                Düzenle ve kabul et
            </button>
            <button
                onClick={() => {
                    const r = window.prompt('Reddetme gerekçesi (zorunlu)');
                    if (r && r.trim()) onReview('REJECTED', r.trim());
                }}
                className="rounded border border-red-300 bg-white px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-50"
            >
                Gerekçeyle reddet
            </button>
            {review && (
                <span className="text-[10px] text-slate-500">
                    ({REVIEW_LABEL[review.status]})
                </span>
            )}
        </div>
    );
}

function ComplianceRow({
    p, reviewable, onReview,
}: {
    p: EvalCompliancePoint;
    reviewable?: boolean;
    onReview?: (s: 'ACCEPTED' | 'EDITED' | 'REJECTED', reason?: string) => void;
}) {
    return (
        <div className={`rounded-md border p-2 ${p._review?.status === 'REJECTED' ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-red-200 bg-red-50/60'}`}>
            <p className="text-slate-700">
                {p.onem && <span className={`font-mono text-[9px] font-bold ${ONEM_STYLE[p.onem] || ''}`}>[{p.onem}] </span>}
                <b>{p.konu}</b>
                {p.gerekce ? ` — ${p.gerekce}` : ''}
                {p.kaynak && <span className="text-slate-400"> ({p.kaynak})</span>}
            </p>
            {!!p.ihlalEdilenMaddeler?.length && (
                <div className="ml-1 mt-1 space-y-1">
                    {p.ihlalEdilenMaddeler.map((m, j) => (
                        <div key={j} className="flex items-start gap-1.5 rounded-md border border-red-200 bg-white/70 px-2 py-1">
                            <span className="mt-px flex-shrink-0 rounded bg-red-600 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white">
                                {m.madde}
                            </span>
                            <span className="text-[11px] text-red-700">
                                {m.aciklama || 'Bu maddeye uyumsuzluk içermektedir.'}
                            </span>
                        </div>
                    ))}
                </div>
            )}
            <SourceBasis p={p} />
            {reviewable && <ReviewBar review={p._review} onReview={onReview} />}
            {!reviewable && <ReviewBar review={p._review} />}
        </div>
    );
}

/** Kaynak dayanağı — beklenen (kaynak) vs gözlenen (kanıt) karşılaştırması + normatif atıf. */
function SourceBasis({ p }: { p: EvalCompliancePoint | EvalFindingCandidate }) {
    const has = p.beklenenDurum || p.gozlenenDurum || p.karsilastirma || p.dayanakKaynakBirimId;
    if (!has) return null;
    return (
        <div className="mt-1.5 rounded-md border border-slate-200 bg-white/70 p-1.5 text-[11px] text-slate-600">
            {p.beklenenDurum && <p><span className="font-semibold text-slate-500">Beklenen (kaynak): </span>{p.beklenenDurum}</p>}
            {p.gozlenenDurum && <p><span className="font-semibold text-slate-500">Gözlenen (kanıt): </span>{p.gozlenenDurum}</p>}
            {p.kanitRef && <p><span className="font-semibold text-slate-500">Kanıt ref: </span>{p.kanitRef}</p>}
            {p.karsilastirma && <p><span className="font-semibold text-slate-500">Karşılaştırma: </span>{p.karsilastirma}</p>}
            {p.dayanakKaynakBirimId && (
                <p className="mt-0.5 text-[10px] text-blue-600">
                    Dayanak kaynak birimi: <span className="font-mono">{p.dayanakKaynakBirimId.slice(0, 10)}…</span>
                    {p.dayanakAlinti ? ` — "${p.dayanakAlinti.slice(0, 90)}${p.dayanakAlinti.length > 90 ? '…' : ''}"` : ''}
                </p>
            )}
        </div>
    );
}

function buildFindingDraft(b: EvalFindingCandidate): string {
    const lines = [
        'BULGU TASLAĞI',
        `Başlık: ${b.baslik}`,
        `Önerilen derece: ${b.onerilenSeverity ?? '—'}   Hedef süre: ${b.hedefGunSayisi ?? '—'} gün`,
        b.ilgiliMevzuat ? `İlgili mevzuat: ${b.ilgiliMevzuat}` : null,
        b.tekrarMi ? `Tekrar eden bulgu — emsal: ${b.emsalFindingId ?? 'belirtilmedi'}` : null,
        '',
        'Tespit:',
        b.aciklama ?? '—',
        '',
        'Etki:',
        b.etki ?? '—',
        '',
        'Öneri:',
        b.oneri ?? '—',
    ];
    return lines.filter((l) => l !== null).join('\n');
}

function FindingCandidateCard({
    b, reviewable, onReview,
}: {
    b: EvalFindingCandidate;
    reviewable?: boolean;
    onReview?: (s: 'ACCEPTED' | 'EDITED' | 'REJECTED', reason?: string) => void;
}) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(buildFindingDraft(b));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* pano erişimi yoksa sessiz geç */
        }
    };
    const rejected = b._review?.status === 'REJECTED';
    return (
        <div className={`rounded-lg border p-2.5 ${rejected ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-amber-200 bg-amber-50/60'}`}>
            <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] font-semibold text-slate-800">
                    {b.onerilenSeverity && (
                        <span className="mr-1 font-mono text-[9px] font-bold text-slate-500">[{b.onerilenSeverity}]</span>
                    )}
                    {b.baslik}
                    {b.tekrarMi && (
                        <span className="ml-1.5 rounded bg-amber-200 px-1 py-0.5 font-mono text-[9px] font-bold text-amber-800">
                            TEKRAR{b.emsalFindingId ? ` · ${b.emsalFindingId}` : ''}
                        </span>
                    )}
                </p>
                <button
                    onClick={copy}
                    className="flex-shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                >
                    {copied ? 'Kopyalandı ✓' : 'Taslağı kopyala'}
                </button>
            </div>
            {b.aciklama && (
                <p className="mt-1.5 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-500">Tespit: </span>{b.aciklama}
                </p>
            )}
            {b.etki && (
                <p className="mt-1 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-500">Etki: </span>{b.etki}
                </p>
            )}
            {b.oneri && (
                <p className="mt-1 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-500">Öneri: </span>{b.oneri}
                </p>
            )}
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                {b.hedefGunSayisi ? <span>Hedef süre: {b.hedefGunSayisi} gün</span> : null}
                {b.ilgiliMevzuat ? <span>Mevzuat: {b.ilgiliMevzuat}</span> : null}
            </p>
            <SourceBasis p={b} />
            {reviewable ? <ReviewBar review={b._review} onReview={onReview} /> : <ReviewBar review={b._review} />}
        </div>
    );
}

function Group({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
    const head: Record<string, string> = {
        emerald: 'text-emerald-700',
        red: 'text-red-700',
        amber: 'text-amber-700',
        slate: 'text-slate-600',
    };
    return (
        <div>
            <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${head[tone] || 'text-slate-600'}`}>{title}</p>
            <ul className="ml-4 list-disc space-y-1 text-slate-600">{children}</ul>
        </div>
    );
}
