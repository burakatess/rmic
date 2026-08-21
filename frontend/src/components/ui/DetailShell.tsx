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
      className={`mb-6 ${sticky ? 'sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-slate-50/95 backdrop-blur border-b border-slate-200' : ''} ${className}`}
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
    <div className={`flex flex-col min-h-full bg-slate-50/50 px-4 sm:px-6 lg:px-8 pt-6 lg:pt-8 pb-12 ${className}`}>
      {children}
    </div>
  );
}

/** Detay sayfası section kartı — tek kart dili */
export function DetailSection({
  title,
  actions,
  children,
  className = '',
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
          {title && <h2 className="text-sm font-semibold text-slate-700">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export default DetailShell;
