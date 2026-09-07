'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { PageShell, Button, LoadingState, FileUpload } from '@/components/ui';
import type { AttachmentMeta } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import type { AiEvalSession, AiEvalMessage, EvalOutput, EvalFindingCandidate, KnowledgeDoc } from '@/types/ai';
import { KNOWLEDGE_KIND_LABEL } from '@/types/ai';

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

export default function AiEvalSessionPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [session, setSession] = useState<AiEvalSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [savingCtrl, setSavingCtrl] = useState(false);

    // Kontrol Alanı formu
    const [mode, setMode] = useState<'ref' | 'text'>('text');
    const [controlRefId, setControlRefId] = useState('');
    const [controlText, setControlText] = useState('');
    const [controlManualNote, setControlManualNote] = useState('');
    const [evidenceText, setEvidenceText] = useState('');
    const [title, setTitle] = useState('');
    const [regChips, setRegChips] = useState<RegArticle[]>([]);

    const [controls, setControls] = useState<ControlOpt[]>([]);
    const [regQuery, setRegQuery] = useState('');
    const [regResults, setRegResults] = useState<RegArticle[]>([]);
    const [knChips, setKnChips] = useState<KnowledgeChip[]>([]);
    const [knQuery, setKnQuery] = useState('');
    const [knResults, setKnResults] = useState<KnowledgeChip[]>([]);

    const [msg, setMsg] = useState('');
    const threadEnd = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            const s = await api.getAiEvalSession(id);
            setSession(s);
            setTitle(s.title);
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
            }
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Oturum yüklenemedi');
            router.push('/ai/kontrol-kanit');
        } finally {
            setLoading(false);
        }
    }, [id, router, showError]);

    useEffect(() => {
        load();
        api.getControls({ limit: 500 })
            .then((r) => {
                const list = Array.isArray(r) ? r : (r as { data?: ControlOpt[] })?.data || [];
                setControls(list as ControlOpt[]);
            })
            .catch(() => setControls([]));
    }, [load]);

    useEffect(() => {
        threadEnd.current?.scrollIntoView({ behavior: 'smooth' });
    }, [session?.messages.length, running]);

    useEffect(() => {
        const t = setTimeout(async () => {
            const q = regQuery.trim();
            if (q.length < 2) return setRegResults([]);
            try {
                setRegResults(await api.searchRegulationArticles(q));
            } catch {
                setRegResults([]);
            }
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
            } catch {
                setKnResults([]);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [knQuery]);

    const controlBody = () => ({
        title: title.trim() || undefined,
        controlRefId: mode === 'ref' ? controlRefId || null : null,
        controlText: mode === 'text' ? controlText.trim() || null : null,
        controlManualNote: controlManualNote.trim() || null,
        evidenceText: evidenceText.trim() || null,
        regulationArticleIds: regChips.map((r) => r.id),
        knowledgeDocIds: knChips.map((k) => k.id),
    });

    const saveControl = async () => {
        setSavingCtrl(true);
        try {
            const s = await api.updateAiEvalSession(id, controlBody());
            setSession((prev) => (prev ? { ...prev, ...s } : s));
            success('Kaydedildi', 'Kontrol alanı güncellendi.');
        } catch (e) {
            showError('Hata', e instanceof Error ? e.message : 'Kaydedilemedi');
        } finally {
            setSavingCtrl(false);
        }
    };

    const evaluate = async () => {
        setRunning(true);
        try {
            // İlk değerlendirmede Kontrol/Mevzuat/Kanıt alanı kaydedilir. Sonraki
            // turlarda alttaki metin çubuğu bağımsız çalışır — üstteki alanları
            // yeniden kaydetmeye gerek yok (kullanıcı onları ayrıca "kaydet" ile
            // günceller); böylece takip sorusu tek başına gönderilebilir.
            if (!session || session.messages.length === 0) {
                await api.updateAiEvalSession(id, controlBody());
            }
            const s = await api.sendAiEvalMessage(id, msg.trim());
            setSession(s);
            setMsg('');
        } catch (e) {
            showError('Değerlendirme hatası', e instanceof Error ? e.message : 'AI çağrısı başarısız');
            await load();
        } finally {
            setRunning(false);
        }
    };

    const attachments: AttachmentMeta[] = useMemo(
        () => (session?.attachments ?? []).map((a) => ({ ...a })),
        [session?.attachments],
    );

    const hasControl =
        (mode === 'ref' ? !!controlRefId : controlText.trim().length > 0) || controlManualNote.trim().length > 0;
    const hasEvidence =
        attachments.length > 0 ||
        evidenceText.trim().length > 0 ||
        msg.trim().length > 0 ||
        (session?.messages.length ?? 0) > 0;

    if (loading) return <PageShell><LoadingState /></PageShell>;
    if (!session) return null;

    return (
        <PageShell>
            <div className="mb-4 flex items-center gap-3">
                <Link href="/ai/kontrol-kanit" className="text-sm text-slate-400 hover:text-slate-700">← Değerlendirmeler</Link>
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={saveControl}
                    className="flex-1 rounded-md border border-transparent px-2 py-1 text-lg font-semibold text-slate-800 hover:border-slate-200 focus:border-blue-400 focus:outline-none"
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {/* ── Kontrol Alanı ── */}
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="mb-3 text-sm font-semibold text-slate-700">1 · Kontrol Alanı</h2>

                    <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
                        <button
                            onClick={() => setMode('ref')}
                            className={`flex-1 rounded-md px-2 py-1.5 ${mode === 'ref' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
                        >
                            Envanterden seç
                        </button>
                        <button
                            onClick={() => setMode('text')}
                            className={`flex-1 rounded-md px-2 py-1.5 ${mode === 'text' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
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
                            rows={5}
                            placeholder="Kontrolün tanımını ve varsa test adımlarını yazın…"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        />
                    )}

                    <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Mevzuat maddeleri
                    </h3>
                    {regChips.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                            {regChips.map((r) => (
                                <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] text-blue-700">
                                    {r.regulation.code} md.{r.articleCode}
                                    <button onClick={() => setRegChips((p) => p.filter((x) => x.id !== r.id))} className="text-blue-400 hover:text-blue-700">
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <input
                        value={regQuery}
                        onChange={(e) => setRegQuery(e.target.value)}
                        placeholder="Madde kodu veya başlık ara…"
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    />
                    {regResults.length > 0 && (
                        <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 text-xs">
                            {regResults
                                .filter((r) => !regChips.some((c) => c.id === r.id))
                                .map((r) => (
                                    <li key={r.id}>
                                        <button
                                            onClick={() => {
                                                setRegChips((p) => [...p, r]);
                                                setRegQuery('');
                                                setRegResults([]);
                                            }}
                                            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                                        >
                                            <span className="font-mono font-semibold text-blue-700">
                                                {r.regulation.code} md.{r.articleCode}
                                            </span>{' '}
                                            — {r.title}
                                        </button>
                                    </li>
                                ))}
                        </ul>
                    )}

                    <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Kurumsal kaynaklar (politika / prosedür / metodoloji / rehber)
                    </h3>
                    {knChips.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                            {knChips.map((k) => (
                                <span key={k.id} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[11px] text-violet-700">
                                    [{KNOWLEDGE_KIND_LABEL[k.kind]}] {k.code}
                                    <button onClick={() => setKnChips((p) => p.filter((x) => x.id !== k.id))} className="text-violet-400 hover:text-violet-700">
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <input
                        value={knQuery}
                        onChange={(e) => setKnQuery(e.target.value)}
                        placeholder="Kaynak kodu veya başlık ara…"
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    />
                    {knResults.length > 0 && (
                        <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 text-xs">
                            {knResults
                                .filter((k) => !knChips.some((c) => c.id === k.id))
                                .map((k) => (
                                    <li key={k.id}>
                                        <button
                                            onClick={() => {
                                                setKnChips((p) => [...p, k]);
                                                setKnQuery('');
                                                setKnResults([]);
                                            }}
                                            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                                        >
                                            <span className="font-mono font-semibold text-violet-700">
                                                [{KNOWLEDGE_KIND_LABEL[k.kind]}] {k.code}
                                            </span>{' '}
                                            — {k.title}
                                        </button>
                                    </li>
                                ))}
                        </ul>
                    )}

                    <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Ek not (envanter seçimiyle birlikte de kullanılabilir)
                    </h3>
                    <textarea
                        value={controlManualNote}
                        onChange={(e) => setControlManualNote(e.target.value)}
                        rows={3}
                        placeholder="Kontrol hakkında ek bağlam, kapsam daraltma, özel durum…"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    />

                    <Button size="sm" variant="outline" className="mt-4" onClick={saveControl} loading={savingCtrl}>
                        Kontrol alanını kaydet
                    </Button>
                </section>

                {/* ── Yanıt / Kanıt Alanı ── */}
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="mb-3 text-sm font-semibold text-slate-700">2 · Yanıt / Kanıt Alanı</h2>
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
                    <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Yazılı yanıt / kanıt metni
                    </h3>
                    <textarea
                        value={evidenceText}
                        onChange={(e) => setEvidenceText(e.target.value)}
                        onBlur={saveControl}
                        rows={5}
                        placeholder="E-posta metnini yapıştırın, açıklama yazın, sistem çıktısını ekleyin… Her değerlendirmede dikkate alınır."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    />
                </section>
            </div>

            {/* ── Değerlendirme + Sohbet ── */}
            <section className="mt-5 rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                    Değerlendirme
                </div>

                <div className="max-h-[55vh] space-y-4 overflow-y-auto p-4">
                    {session.messages.length === 0 && (
                        <p className="py-6 text-center text-sm text-slate-400">
                            Kontrol alanını doldurup kanıtları ekleyin, ardından “Değerlendir”e basın.
                        </p>
                    )}
                    {session.messages.map((m) => (
                        <MessageBlock key={m.id} m={m} />
                    ))}
                    {running && (
                        <div className="flex items-center gap-2 text-xs text-blue-600">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                            Model değerlendiriyor, bu bir dakikayı bulabilir…
                        </div>
                    )}
                    <div ref={threadEnd} />
                </div>

                <div className="border-t border-slate-100 p-3">
                    <textarea
                        value={msg}
                        onChange={(e) => setMsg(e.target.value)}
                        rows={2}
                        placeholder={
                            session.messages.length === 0
                                ? 'Manuel not / e-posta metni / değerlendirilecek açıklama (opsiyonel)…'
                                : 'Takip sorusu ya da ek bilgi…'
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    />
                    <div className="mt-2 flex items-center gap-3">
                        <Button onClick={evaluate} loading={running} disabled={!hasControl || !hasEvidence}>
                            {session.messages.length === 0 ? 'Değerlendir' : 'Gönder'}
                        </Button>
                        {!hasControl && <span className="text-xs text-amber-600">Kontrol Alanı doldurulmalı.</span>}
                        {hasControl && !hasEvidence && (
                            <span className="text-xs text-amber-600">
                                Kanıt gerekli: dosya ekleyin, yazılı kanıt metni girin ya da bir açıklama yazın.
                            </span>
                        )}
                    </div>
                </div>
            </section>

            <p className="mt-3 text-[11px] text-slate-400">
                AI çıktıları yalnızca öneridir. “Bulguya konu olabilecek durumlar” gerçek bulgu oluşturmaz;
                “Taslağı kopyala” ile metni alıp Bulgular ekranında elle bulgu açabilirsiniz.
            </p>
        </PageShell>
    );
}

// ─── Mesaj bloğu ────────────────────────────────────────────────────────────

function MessageBlock({ m }: { m: AiEvalMessage }) {
    if (m.role === 'USER') {
        return (
            <div className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-blue-600 px-3.5 py-2 text-sm text-white">
                    {m.content}
                </div>
            </div>
        );
    }
    if (m.errorText) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {m.errorText}
            </div>
        );
    }
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            {m.content && <p className="mb-2 text-sm text-slate-700">{m.content}</p>}
            {m.evaluation && <EvalCard e={m.evaluation} />}
            {m.modelName && (
                <p className="mt-2 text-[10px] text-slate-400">
                    {m.modelName}
                    {m.latencyMs ? ` · ${(m.latencyMs / 1000).toFixed(1)} sn` : ''}
                </p>
            )}
        </div>
    );
}

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

function EvalCard({ e }: { e: EvalOutput }) {
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
                <Group title="Uyumsuz Alanlar" tone="red">
                    {e.uyumsuzAlanlar.map((p, i) => (
                        <li key={i}>
                            {p.onem && <span className={`font-mono text-[9px] font-bold ${ONEM_STYLE[p.onem] || ''}`}>[{p.onem}] </span>}
                            <b>{p.konu}</b>
                            {p.gerekce ? ` — ${p.gerekce}` : ''}
                            {p.kaynak && <span className="text-slate-400"> ({p.kaynak})</span>}
                            {!!p.ihlalEdilenMaddeler?.length && (
                                <div className="ml-1 mt-1 space-y-1">
                                    {p.ihlalEdilenMaddeler.map((m, j) => (
                                        <div key={j} className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50/70 px-2 py-1">
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
                        </li>
                    ))}
                </Group>
            )}

            {!!e.bulguAdaylari?.length && (
                <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                        Bulguya Konu Olabilecek Durumlar
                    </p>
                    <div className="space-y-2">
                        {e.bulguAdaylari.map((b, i) => (
                            <FindingCandidateCard key={i} b={b} />
                        ))}
                    </div>
                </div>
            )}

            {!!e.eksikBilgi?.length && (
                <Group title="Eksik Bilgi" tone="slate">
                    {e.eksikBilgi.map((x, i) => (
                        <li key={i}>{x}</li>
                    ))}
                </Group>
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

function FindingCandidateCard({ b }: { b: EvalFindingCandidate }) {
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
    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
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
