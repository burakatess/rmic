'use client';

import React from 'react';
import { Button } from './Button';

/* ============================================
   ERROR STATE — Design System v2
   Retry aksiyonlu ortak hata durumu.
   ============================================ */

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  className?: string;
}

export function ErrorState({
  title = 'Veriler yüklenemedi',
  description = 'Bir hata oluştu. Lütfen tekrar deneyin.',
  onRetry,
  retryLabel = 'Tekrar Dene',
  compact = false,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-2 text-center
        ${compact ? 'py-6' : 'py-20'} ${className}`}
    >
      <span className="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </span>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="text-xs text-slate-500 max-w-sm">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export default ErrorState;
