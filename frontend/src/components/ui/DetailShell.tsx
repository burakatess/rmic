'use client';

import React from 'react';

/* ============================================
   DETAIL SHELL + DETAIL HEADER — Design System v2
   Tüm detay sayfaları (Risk, Kontrol, Bulgu,
   Aksiyon, Takip, Onay, Denetim) için ortak layout.
   ============================================ */

interface Breadcrumb {
  label: string;
  href?: string;
}

interface DetailHeaderProps {
  breadcrumbs?: Breadcrumb[];
  /** Kayıt ID'si (monospace gösterilir, örn. "C-2025-0012") */
  entityId?: string;
  title: string;
  /** StatusBadge node'ları */
  badges?: React.ReactNode;
  /** Sağ aksiyon butonları */
  actions?: React.ReactNode;
  /** Başlık altı meta satırı (direktörlük, owner, tarih vb.) */
  meta?: React.ReactNode;
  /** Scroll'da üstte sabit kalsın */
  sticky?: boolean;
  className?: string;
}

export function DetailHeader({
  breadcrumbs,
  entityId,
  title,
  badges,
  actions,
  meta,
  sticky = false,
  className = '',
}: DetailHeaderProps) {
  return (
    <div
      className={`mb-6 ${sticky ? 'sticky top-16 z-20 -mx-4 lg:-mx-6 2xl:-mx-8 px-4 lg:px-6 2xl:px-8 py-4 bg-slate-50/95 backdrop-blur border-b border-slate-200' : ''} ${className}`}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
              {crumb.href ? (
                <a href={crumb.href} className="hover:text-blue-600 transition-colors">{crumb.label}</a>
              ) : (
                <span className="text-slate-600 font-medium">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {entityId && (
              <span className="font-mono text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-md px-2 py-1">
                {entityId}
              </span>
            )}
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h1>
            {badges && <span className="flex flex-wrap items-center gap-1.5">{badges}</span>}
          </div>
          {meta && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              {meta}
            </div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

interface DetailShellProps {
  children: React.ReactNode;
  className?: string;
}

/** Detay sayfası dış kabuğu — PageShell ile aynı zemin/spacing dili */
export function DetailShell({ children, className = '' }: DetailShellProps) {
  return (
    <div className={`flex flex-col min-h-full pb-8 ${className}`}>
      {children}
    </div>
  );
}

/** Detay sayfası section kartı — tek kart dili */
export function DetailSection({
  title,
  count,
  description,
  actions,
  children,
  className = '',
  bodyClassName = 'p-5',
  testId,
}: {
  title?: string;
  /** Başlık yanında sayı rozeti (ör. ilişkili kayıt sayısı). */
  count?: number;
  /** Başlık altında kısa açıklama. */
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Gövde dolgusu (liste/tablo kartlarında 'p-0'). */
  bodyClassName?: string;
  testId?: string;
}) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`} data-testid={testId}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                {title}
                {count !== undefined && <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{count}</span>}
              </h2>
            )}
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export default DetailShell;
