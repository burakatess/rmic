'use client';

import React, { useEffect, useRef } from 'react';

/* ============================================
   MODAL — Quaresma + Aboubakar
   Overlay modal dialog
   ============================================ */

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: ModalSize;
  footer?: React.ReactNode;
  closeOnOverlay?: boolean;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  footer,
  closeOnOverlay = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn"
        onClick={closeOnOverlay ? onClose : undefined}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className={`
          relative w-full ${sizeClasses[size]}
          bg-white rounded-xl shadow-xl
          animate-scaleIn
          flex flex-col max-h-[90vh]
        `}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
            <div>
              {title && <h3 className="text-lg font-semibold text-slate-800">{title}</h3>}
              {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1 -mr-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
