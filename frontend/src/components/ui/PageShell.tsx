'use client';

import React from 'react';

/* ============================================
   PAGE SHELL — Design System v2
   Tüm dashboard sayfaları için standart dış kabuk
   ============================================ */

interface PageShellProps {
  children: React.ReactNode;
  /** Tam yükseklik master-detail düzenler için (örn. test workspace) */
  fullHeight?: boolean;
  className?: string;
}

export function PageShell({ children, fullHeight = false, className = '' }: PageShellProps) {
  return (
    <div
      className={`flex flex-col pb-8
        ${fullHeight ? 'h-full overflow-hidden pb-0' : 'min-h-full'}
        ${className}`}
    >
      {children}
    </div>
  );
}

export default PageShell;
