'use client';

import React, { useState } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import type {
    EvalOutputV3, EvalRetrievalNoteV3, EvalV3Evidence, EvalV3Reference,
    EvalV3RefAssessment, EvalV3RefSourceType, EvalV3Status,
} from '@/types/ai';

/* ============================================================================
   Kontrol & Kanıt Değerlendirme raporu — v3 (eval-v3.1)
   Yedi numaralı bölüm: Beklenen Durum · Kanıtlar · Kontrol Sonucu ·
   Mevzuat/Rehber Maddeleri · Etki · Öneri · Bulgu.
   (Gereklilik / Uygulanabilirlik / Sonuç / Gerekçe tablosu YOKTUR.)
   Anlam hiçbir yerde yalnız renkle verilmez: rozetlerde ikon + metin bulunur.
   ============================================================================ */

type Variant = 'success' | 'warning' | 'critical' | 'neutral' | 'info' | 'primary';

// ── İkonlar (dekoratif; anlam yanındaki metindedir) ─────────────────────────
type IconName = 'check' | 'half' | 'cross' | 'question' | 'link' | 'alert' | 'ban';
function Icon({ name, testId }: { name: IconName; testId?: string }) {
    const common = { className: 'h-3.5 w-3.5 shrink-0', viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false as const, 'data-testid': testId, 'data-icon': name };
    switch (name) {
        case 'check': return <svg {...common}><circle cx="10" cy="10" r="8" /><path d="M6.5 10.5l2.5 2.5 4.5-5" /></svg>;
        case 'half': return <svg {...common}><circle cx="10" cy="10" r="8" /><path d="M6.5 10h7" /></svg>;
        case 'cross': return <svg {...common}><circle cx="10" cy="10" r="8" /><path d="M7.5 7.5l5 5M12.5 7.5l-5 5" /></svg>;
        case 'question': return <svg {...common}><circle cx="10" cy="10" r="8" /><path d="M8 8a2 2 0 113 1.7c-.7.4-1 .8-1 1.6M10 14v.01" /></svg>;
        case 'link': return <svg {...common}><path d="M8.5 11.5a3 3 0 004 0l2-2a3 3 0 00-4-4l-.7.7M11.5 8.5a3 3 0 00-4 0l-2 2a3 3 0 004 4l.7-.7" /></svg>;
        case 'alert': return <svg {...common}><path d="M10 3l8 14H2L10 3zM10 8v4M10 14.5v.01" /></svg>;
        case 'ban': return <svg {...common}><circle cx="10" cy="10" r="8" /><path d="M4.5 4.5l11 11" /></svg>;
    }
}

const STATUS_META: Record<EvalV3Status, { label: string; variant: Variant; icon: IconName }> = {
    COMPLIANT: { label: 'Uyumlu', variant: 'success', icon: 'check' },
    PARTIALLY_COMPLIANT: { label: 'Kısmen uyumlu', variant: 'warning', icon: 'half' },
    NON_COMPLIANT: { label: 'Uyumsuz', variant: 'critical', icon: 'cross' },
    INSUFFICIENT_EVIDENCE: { label: 'Yetersiz kanıt', variant: 'neutral', icon: 'question' },
};

const ASSESSMENT_META: Record<EvalV3RefAssessment, { label: string; variant: Variant; icon: IconName }> = {
    COMPLIANT: { label: 'Uyumlu', variant: 'success', icon: 'check' },
    NON_COMPLIANT: { label: 'Uyumsuz', variant: 'critical', icon: 'cross' },
    RELEVANT: { label: 'İlişkili', variant: 'info', icon: 'link' },
    NEEDS_CONFIRMATION: { label: 'Doğrulanmalı', variant: 'warning', icon: 'alert' },
};

const SOURCE_TYPE_LABEL: Record<EvalV3RefSourceType, string> = {
    REGULATION: 'Mevzuat',
    OFFICIAL_GUIDE: 'Resmî Rehber',
    INTERNAL_POLICY: 'Kurumsal',
};

const RETRIEVAL_METHOD_LABEL: Record<string, string> = {
    HYBRID: 'anlamsal + sözcüksel tarama',
    LEXICAL_ONLY: 'yalnız sözcüksel tarama',
    NONE: 'kaynak bulunamadı',
};

const REVIEW_LABEL: Record<string, string> = {
    ACCEPTED: 'Kabul edildi',
    EDITED: 'Düzenlenip kabul edildi',
    REJECTED: 'Reddedildi',
};

export const NO_REFERENCE_FALLBACK =
    'İncelenen kaynaklarda mevcut kanıtla doğrudan ilişkilendirilebilen bir hüküm tespit edilememiştir.';

function Badge({ variant, icon, children, testId }: { variant: Variant; icon?: IconName; children: React.ReactNode; testId?: string }) {
    return (
        <StatusBadge variant={variant} size="md">
            {icon && <Icon name={icon} testId={testId} />}
            <span>{children}</span>
        </StatusBadge>
    );
}

function SectionCard({ n, title, children, id }: { n: number; title: string; children: React.ReactNode; id: string }) {
    return (
        <section aria-labelledby={id} className="rounded-xl border border-slate-200 bg-white p-4" data-testid={`eval-v3-section-${n}`}>
            <h3 id={id} className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
                <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px]">{n}</span>
                {title}
            </h3>
            {children}
        </section>
    );
}

function Prose({ text, empty }: { text?: string | null; empty: string }) {
    return text && text.trim()
        ? <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{text}</p>
        : <p className="text-[12px] italic text-slate-400">{empty}</p>;
}

// ── Kanıt satırı ────────────────────────────────────────────────────────────
function EvidenceItem({ ev }: { ev: EvalV3Evidence }) {
    const used = ev.used !== false;
    return (
        <li className={`rounded-lg border p-3 ${used ? 'border-slate-200 bg-slate-50/50' : 'border-slate-200 bg-slate-50 opacity-80'}`}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-slate-800">{ev.name}</span>
                {ev.type && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{ev.type}</span>}
                {used
                    ? <Badge variant="success" icon="check">Kullanıldı</Badge>
                    : <Badge variant="neutral" icon="ban">Kullanılmadı</Badge>}
                {ev.readStatus === 'FAILED' && <Badge variant="critical" icon="alert">Okunamadı</Badge>}
                {ev.readStatus === 'PARTIAL' && <Badge variant="warning" icon="half">Kısmen okundu</Badge>}
            </div>
            <dl className="mt-2 space-y-1.5 text-[12px]">
                <div>
                    <dt className="font-semibold text-slate-500">Modelin değerlendirmeye aldığı husus</dt>
                    <dd className="whitespace-pre-wrap text-slate-700">{ev.observation || '—'}</dd>
                </div>
                <div>
                    <dt className="font-semibold text-slate-500">Kanıt kısıtı</dt>
                    <dd className="whitespace-pre-wrap text-slate-700">{ev.limitations || '—'}</dd>
                </div>
            </dl>
        </li>
    );
}

// ── Kaynak detay modalı ─────────────────────────────────────────────────────
function ReferenceModal({ r, onClose }: { r: EvalV3Reference | null; onClose: () => void }) {
    if (!r) return null;
    const hasRetrieval = r.retrievalScore != null || r.retrievalRank != null || !!r.retrievalMethod;
    return (
        <Modal open onClose={onClose} title="Kaynak detayı" description={`${r.sourceName} · ${r.articleNumber}`} size="lg">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2">
                <Field label="Kaynak adı" value={r.sourceName} />
                <Field label="Sürüm" value={r.version} />
                <Field label="Madde / tedbir no" value={r.articleNumber} />
                <Field label="Başlık" value={r.articleTitle} />
                {r.page != null && <Field label="Sayfa" value={String(r.page)} />}
                <Field label="Kaynak türü" value={SOURCE_TYPE_LABEL[r.sourceType] ?? r.sourceType} />
            </dl>
            <div className="mt-3">
                <h4 className="text-[12px] font-semibold text-slate-500">Neden kullanıldı</h4>
                <p className="whitespace-pre-wrap text-[13px] text-slate-700">{r.relation || '—'}</p>
            </div>
            {r.bindingNote && (
                <div role="note" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[12px] text-amber-900">
                    <span className="font-semibold">Bağlayıcılık notu: </span>{r.bindingNote}
                </div>
            )}
            <div className="mt-3">
                <h4 className="text-[12px] font-semibold text-slate-500">Kaynak metni</h4>
                <p className="mb-1 text-[11px] text-slate-400">Değerlendirme anındaki kaynak metni</p>
                {r.snapshotText
                    ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-800">{r.snapshotText}</pre>
                    : <p className="text-[12px] italic text-slate-400">Bu değerlendirme için kaynak metni kaydı bulunmuyor.</p>}
            </div>
            {hasRetrieval && (
                <p className="mt-3 text-[11px] text-slate-500">
                    Otomatik tarama:
                    {r.retrievalMethod ? ` yöntem ${r.retrievalMethod}` : ''}
                    {r.retrievalRank != null ? ` · sıra ${r.retrievalRank}` : ''}
                    {r.retrievalScore != null ? ` · skor ${Number(r.retrievalScore).toFixed(3)}` : ''}
                </p>
            )}
        </Modal>
    );
}

function Field({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <dt className="text-[12px] font-semibold text-slate-500">{label}</dt>
            <dd className="text-slate-800">{value || '—'}</dd>
        </div>
    );
}

// ── Ana bileşen ─────────────────────────────────────────────────────────────
export interface EvalReportV3Props {
    e: EvalOutputV3;
    retrievalNote?: EvalRetrievalNoteV3 | null;
    reviewable?: boolean;
    onReview?: (status: 'ACCEPTED' | 'REJECTED' | 'EDITED', reason?: string) => void;
    needsReviewReason?: string | null;
}

export function EvalReportV3({ e, retrievalNote, reviewable, onReview, needsReviewReason }: EvalReportV3Props) {
    const [openRef, setOpenRef] = useState<EvalV3Reference | null>(null);
    const [rejecting, setRejecting] = useState(false);
    const [reason, setReason] = useState('');

    const status = STATUS_META[e.controlResult?.status] ?? STATUS_META.INSUFFICIENT_EVIDENCE;
    const evidence = e.evaluatedEvidence ?? [];
    const refs = e.references ?? [];
    const rejectedRefs = e.rejectedReferences ?? [];
    const finding = e.finding;
    const related = (finding?.relatedReferenceIds ?? [])
        .map((id) => refs.find((r) => r.refId === id))
        .filter((r): r is EvalV3Reference => !!r);
    const extra = e.additionalEvidenceRequired ?? [];
    const sentCount = retrievalNote?.sentUnitIds?.length ?? 0;

    return (
        <div className="space-y-3" data-testid="eval-report-v3">
            {needsReviewReason && (
                <div role="alert" className="rounded-lg border border-orange-300 bg-orange-50 p-2.5 text-xs text-orange-800">
                    <span className="font-semibold">İnsan incelemesi gerekli: </span>{needsReviewReason}
                </div>
            )}

            {retrievalNote && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600" data-testid="eval-v3-retrieval">
                    <p>
                        Otomatik kaynak taraması: {RETRIEVAL_METHOD_LABEL[retrievalNote.method] ?? retrievalNote.method}, {sentCount} birim gönderildi
                        {retrievalNote.unchangedInput ? <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 font-medium text-slate-700">Girdi önceki değerlendirmeyle aynı</span> : null}
                    </p>
                    {retrievalNote.semanticUnavailableReason && (
                        <p className="mt-0.5 text-slate-400">{retrievalNote.semanticUnavailableReason}</p>
                    )}
                </div>
            )}

            {/* 1 · Beklenen Durum */}
            <SectionCard n={1} title="Beklenen Durum" id="evalv3-h1">
                <Prose text={e.expectedState} empty="Beklenen durum belirtilmemiş." />
            </SectionCard>

            {/* 2 · Kanıtlar */}
            <SectionCard n={2} title="Değerlendirmeye Alınan Kanıtlar" id="evalv3-h2">
                {evidence.length === 0
                    ? <p className="text-[12px] italic text-slate-400">Değerlendirmeye alınan kanıt bulunmuyor.</p>
                    : <ul className="space-y-2">{evidence.map((ev, i) => <EvidenceItem key={ev.evidenceId || i} ev={ev} />)}</ul>}
            </SectionCard>

            {/* 3 · Kontrol Sonucu */}
            <SectionCard n={3} title="Kontrol Sonucu" id="evalv3-h3">
                <div className="mb-2" data-testid="eval-v3-status">
                    <Badge variant={status.variant} icon={status.icon} testId={`status-icon-${e.controlResult?.status}`}>{status.label}</Badge>
                </div>
                <Prose text={e.controlResult?.text} empty="Sonuç açıklaması yok." />
                {extra.length > 0 && (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
                        <h4 className="text-[12px] font-semibold text-blue-800">Ek kanıt ihtiyacı</h4>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-blue-900">
                            {extra.map((x, i) => <li key={i}>{x}</li>)}
                        </ul>
                    </div>
                )}
                {e.reEvaluation && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[12px]" data-testid="eval-v3-reeval">
                        <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-slate-700">Önceki değerlendirmeye göre</h4>
                            <Badge variant={e.reEvaluation.changed ? 'warning' : 'neutral'} icon={e.reEvaluation.changed ? 'alert' : 'check'}>
                                {e.reEvaluation.changed ? 'Değişti' : 'Değişmedi'}
                            </Badge>
                        </div>
                        {e.reEvaluation.explanation && <p className="mt-1 whitespace-pre-wrap text-slate-700">{e.reEvaluation.explanation}</p>}
                        {e.reEvaluation.changedPoints?.length > 0 && (
                            <div className="mt-1.5">
                                <p className="font-semibold text-slate-500">Değişen hususlar</p>
                                <ul className="list-disc pl-5 text-slate-700">{e.reEvaluation.changedPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>
                            </div>
                        )}
                        {e.reEvaluation.unchangedPoints?.length > 0 && (
                            <div className="mt-1.5">
                                <p className="font-semibold text-slate-500">Değişmeyen hususlar</p>
                                <ul className="list-disc pl-5 text-slate-700">{e.reEvaluation.unchangedPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>
                            </div>
                        )}
                    </div>
                )}
            </SectionCard>

            {/* 4 · İlişkili Mevzuat ve Rehber Maddeleri */}
            <SectionCard n={4} title="İlişkili Mevzuat ve Rehber Maddeleri" id="evalv3-h4">
                {(e.scopeNotes ?? []).length > 0 && (
                    <div role="note" className="mb-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-[12px] text-blue-900" data-testid="eval-v3-scope-notes">
                        {e.scopeNotes!.map((n, i) => <p key={i}>{n}</p>)}
                    </div>
                )}
                {refs.length === 0 ? (
                    <p className="text-[13px] text-slate-600" data-testid="eval-v3-no-refs">{e.referencesNote || NO_REFERENCE_FALLBACK}</p>
                ) : (
                    <ul className="space-y-2" data-testid="eval-v3-reference-list">
                        {refs.map((r) => {
                            const a = ASSESSMENT_META[r.assessment] ?? ASSESSMENT_META.NEEDS_CONFIRMATION;
                            return (
                                <li key={r.refId} className="rounded-lg border border-slate-200 p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[13px] font-semibold text-slate-800">{r.sourceName}</span>
                                        <button
                                            type="button"
                                            onClick={() => setOpenRef(r)}
                                            title="Kaynak detayını aç"
                                            className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-blue-700 underline decoration-dotted underline-offset-2 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                        >
                                            {r.articleNumber}
                                        </button>
                                        {r.version && <span className="text-[11px] text-slate-500">sürüm {r.version}</span>}
                                        <StatusBadge variant="neutral" size="sm">{SOURCE_TYPE_LABEL[r.sourceType] ?? r.sourceType}</StatusBadge>
                                        <Badge variant={a.variant} icon={a.icon}>{a.label}</Badge>
                                    </div>
                                    {r.articleTitle && <p className="mt-1 text-[12px] text-slate-500">{r.articleTitle}</p>}
                                    <p className="mt-1 whitespace-pre-wrap text-[12px] text-slate-700">{r.relation}</p>
                                    <button
                                        type="button"
                                        onClick={() => setOpenRef(r)}
                                        className="mt-1.5 text-[11px] font-medium text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    >
                                        Kaynak detayını aç
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {rejectedRefs.length > 0 && (
                    <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-500" data-testid="eval-v3-rejected-refs">
                        <summary className="cursor-pointer font-medium">Doğrulanamayan atıflar ({rejectedRefs.length})</summary>
                        <p className="mt-1 text-slate-400">Model bu atıfları önerdi; sistem kaynak doğrulamasında reddetti. Rapora dahil edilmediler.</p>
                        <ul className="mt-1 space-y-1">
                            {rejectedRefs.map((x, i) => (
                                <li key={x.refId || i}><span className="font-mono text-slate-600">{x.claimed}</span> — {x.reason}</li>
                            ))}
                        </ul>
                    </details>
                )}
            </SectionCard>

            {/* 5 · Etki */}
            <SectionCard n={5} title="Etki" id="evalv3-h5">
                <Prose text={e.impact} empty="Etki belirtilmemiş." />
            </SectionCard>

            {/* 6 · Öneri */}
            <SectionCard n={6} title="Öneri" id="evalv3-h6">
                <Prose text={e.recommendation} empty="Öneri belirtilmemiş." />
            </SectionCard>

            {/* 7 · Bulgu */}
            <SectionCard n={7} title="Bulguya İlişkin Açıklama / Değerlendirme" id="evalv3-h7">
                {!finding?.exists ? (
                    <p className="text-[13px] text-slate-600" data-testid="eval-v3-no-finding">Bulgu tespit edilmemiştir.</p>
                ) : (
                    <div className={`rounded-lg border p-3 ${finding._review?.status === 'REJECTED' ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-amber-200 bg-amber-50/60'}`}>
                        <p className="text-[13px] font-semibold text-slate-800">{finding.title}</p>
                        <p className="mt-1 whitespace-pre-wrap text-[12px] text-slate-700">{finding.explanation}</p>
                        {related.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="eval-v3-finding-refs">
                                <span className="text-[11px] font-semibold text-slate-500">İlişkili maddeler:</span>
                                {related.map((r) => (
                                    <button
                                        key={r.refId}
                                        type="button"
                                        onClick={() => setOpenRef(r)}
                                        className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    >
                                        {r.sourceName} {r.articleNumber}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            {finding._review && (
                                <Badge
                                    variant={finding._review.status === 'REJECTED' ? 'critical' : 'success'}
                                    icon={finding._review.status === 'REJECTED' ? 'cross' : 'check'}
                                >
                                    {REVIEW_LABEL[finding._review.status] ?? finding._review.status}
                                </Badge>
                            )}
                            {finding._review?.reason && <span className="text-[11px] text-slate-500">{finding._review.reason}</span>}
                            {reviewable && onReview && !rejecting && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => onReview('ACCEPTED')}
                                        className="rounded border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                    >
                                        Kabul et
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRejecting(true)}
                                        className="rounded border border-red-300 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400"
                                    >
                                        Reddet
                                    </button>
                                </>
                            )}
                        </div>
                        {reviewable && onReview && rejecting && (
                            <div className="mt-2 space-y-1.5">
                                <label htmlFor="evalv3-reject-reason" className="block text-[11px] font-semibold text-slate-600">
                                    Reddetme gerekçesi (zorunlu)
                                </label>
                                <textarea
                                    id="evalv3-reject-reason"
                                    value={reason}
                                    onChange={(ev) => setReason(ev.target.value)}
                                    rows={2}
                                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[12px] focus:border-blue-400 focus:outline-none"
                                />
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        disabled={!reason.trim()}
                                        onClick={() => { onReview('REJECTED', reason.trim()); setRejecting(false); setReason(''); }}
                                        className="rounded border border-red-300 bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-40"
                                    >
                                        Reddi onayla
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setRejecting(false); setReason(''); }}
                                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                                    >
                                        Vazgeç
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </SectionCard>

            <ReferenceModal r={openRef} onClose={() => setOpenRef(null)} />
        </div>
    );
}

export default EvalReportV3;
