'use client';

import React, { useEffect } from 'react';

/* ============================================
   DETAIL DRAWER — Quaresma + Aboubakar
   Right-side sliding detail panel
   ============================================ */

type DrawerSize = 'sm' | 'md' | 'lg' | 'xl';

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: DrawerSize;
  footer?: React.ReactNode;
}

const sizeClasses: Record<DrawerSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  footer,
}: DetailDrawerProps) {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`
          relative w-full ${sizeClasses[size]}
          bg-white shadow-2xl
          animate-slideInRight
          flex flex-col h-full
        `}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="min-w-0 pr-4">
            {title && <h3 className="text-lg font-semibold text-slate-800 truncate">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-500 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default DetailDrawer;
