'use client';

import React from 'react';
import Link from 'next/link';

/* ============================================
   DETAY KART BİLEŞENLERİ — tüm detay ekranlarında ortak dil
   (Bulgu, Kontrol, Kontrol Testi, Aksiyon Planı, Takip Çalışması, Risk, Dönem Kontrolü)
   - FieldGrid / Field  : etiket (küçük, büyük harf) + değer; ekran genişliğine göre 2→4 sütun
   - RecordCard         : ilişkili kayıt kartı — durum renkli sol şerit, kod + rozetler + işlemler,
                          başlık, açıklama, alan ızgarası, alt şerit (ekler / bağlı kayıtlar)
   - HistoryList        : işlem geçmişi (metin, kişi, zaman, gerekçe)
   Kart kabuğu: DetailSection (DetailShell.tsx).
   ============================================ */

export function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={`min-w-0 ${className}`}>
            <dt className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-slate-900 break-words">{children}</dd>
        </div>
    );
}

/** Alan ızgarası: dar ekranda 2, geniş ekranda `cols` sütun; satır çok uzamasın diye genişlik sınırlı. */
export function FieldGrid({ children, cols = 4, className = '' }: { children: React.ReactNode; cols?: 2 | 3 | 4; className?: string }) {
    const c = cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 xl:grid-cols-4';
    return <dl className={`grid grid-cols-1 ${c} gap-x-6 gap-y-3 max-w-6xl ${className}`}>{children}</dl>;
}

export type RecordTone = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'danger' | 'violet';
const TONE: Record<RecordTone, string> = {
    neutral: 'border-l-slate-300', info: 'border-l-blue-500', progress: 'border-l-amber-400', warning: 'border-l-orange-500',
    success: 'border-l-emerald-500', danger: 'border-l-red-500', violet: 'border-l-violet-500',
};
const CODE_TONE: Record<RecordTone, string> = {
    neutral: 'text-slate-700', info: 'text-blue-700', progress: 'text-orange-600', warning: 'text-orange-600',
    success: 'text-emerald-700', danger: 'text-red-700', violet: 'text-violet-700',
};

/**
 * İlişkili kayıt kartı (aksiyon, takip, bulgu, test, risk). `href` verilirse kod gerçek kayıt kimliğiyle
 * detay ekranına bağlanır. `actions` sağ üstte, `footer` alt şeritte (açık zemin) gösterilir.
 */
export function RecordCard({
    code, href, tone = 'neutral', codeTone, badges, actions, title, description, fields, footer, children, muted = false, testId,
}: {
    code: React.ReactNode; href?: string; tone?: RecordTone; codeTone?: RecordTone;
    badges?: React.ReactNode; actions?: React.ReactNode; title?: React.ReactNode; description?: React.ReactNode;
    fields?: React.ReactNode; footer?: React.ReactNode; children?: React.ReactNode; muted?: boolean; testId?: string;
}) {
    const codeCls = `font-mono text-sm font-semibold ${CODE_TONE[codeTone ?? tone]}`;
    return (
        <article data-testid={testId} className={`bg-white border border-slate-200 border-l-4 ${TONE[tone]} rounded-xl shadow-sm overflow-hidden ${muted ? 'opacity-60' : ''}`}>
            <div className="p-4 lg:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            {href ? <Link href={href} className={`${codeCls} hover:underline`}>{code}</Link> : <span className={codeCls}>{code}</span>}
                            {badges}
                        </div>
                        {title && <h3 className="mt-2 text-base font-semibold text-slate-900 leading-snug break-words">{title}</h3>}
                        {description && <div className="mt-1 text-sm text-slate-600 leading-relaxed break-words">{description}</div>}
                    </div>
                    {actions && <div className="flex items-center gap-2 flex-wrap sm:justify-end shrink-0">{actions}</div>}
                </div>
                {fields && <div className="mt-4 pt-4 border-t border-slate-100">{fields}</div>}
                {children}
            </div>
            {footer && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 lg:px-5 py-3 bg-slate-50/70 border-t border-slate-100">{footer}</div>}
        </article>
    );
}

export interface HistoryEntry { id: string; text: React.ReactNode; at: string | Date; by?: string | null; reason?: string | null }
const fmtDt = (d: string | Date) => new Date(d).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

/** İşlem geçmişi listesi (en yeni üstte); boşsa açıklayıcı metin. */
export function HistoryList({ items, empty = 'Kayıtlı işlem yok.', testId }: { items: HistoryEntry[]; empty?: string; testId?: string }) {
    if (items.length === 0) return <p className="text-sm text-slate-400">{empty}</p>;
    return (
        <ol className="relative border-l border-slate-200 ml-2 space-y-4" data-testid={testId}>
            {items.map(h => (
                <li key={h.id} className="ml-5">
                    <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white" aria-hidden />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm text-slate-900">{h.text}</span>
                        <span className="ml-auto text-xs text-slate-400">{fmtDt(h.at)} · {h.by ?? 'Sistem'}</span>
                    </div>
                    {h.reason && <p className="text-[13px] text-slate-600 mt-0.5">Gerekçe: {h.reason}</p>}
                </li>
            ))}
        </ol>
    );
}
