'use client';

import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

/* ============================================
   CONFIRM DIALOG — Quaresma + Aboubakar
   Destructive action confirmation modal
   ============================================ */

type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
}

const iconByVariant: Record<ConfirmVariant, React.ReactNode> = {
  danger: (
    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 mx-auto">
      <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    </div>
  ),
  warning: (
    <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4 mx-auto">
      <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  ),
  info: (
    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4 mx-auto">
      <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  ),
};

const confirmVariantMap: Record<ConfirmVariant, 'danger' | 'primary'> = {
  danger: 'danger',
  warning: 'primary',
  info: 'primary',
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Onayla',
  cancelLabel = 'İptal',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="text-center py-2">
        {iconByVariant[variant]}
        <h3 className="text-lg font-semibold text-slate-800 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-6">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariantMap[variant]} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
