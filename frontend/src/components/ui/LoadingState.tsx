'use client';

import React from 'react';

/* ============================================
   LOADING STATE — Design System v2
   Tüm async ekranlar için tek yükleme dili.
   ============================================ */

interface LoadingStateProps {
  /** Kısa açıklama (örn. "Bulgular yükleniyor...") */
  message?: string;
  /** Tam sayfa ortalama yerine kompakt satır */
  compact?: boolean;
  className?: string;
}

export function LoadingState({ message = 'Yükleniyor...', compact = false, className = '' }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 text-slate-400
        ${compact ? 'py-6' : 'py-24'} ${className}`}
    >
      <span className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

export default LoadingState;
