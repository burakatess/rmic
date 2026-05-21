'use client';

import React from 'react';

/* ============================================
   STATUS BADGE — Quaresma + Aboubakar
   Severity & status indicator badges
   ============================================ */

type BadgeVariant = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral' | 'primary';
type BadgeSize = 'sm' | 'md';

interface StatusBadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-green-100 text-green-700 border-green-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
  success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  warning: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
  primary: 'bg-blue-100 text-blue-700 border-blue-200',
};

const dotColors: Record<BadgeVariant, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-green-500',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-yellow-500',
  neutral: 'bg-slate-400',
  primary: 'bg-blue-500',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
};

export function StatusBadge({
  variant = 'neutral',
  size = 'sm',
  children,
  dot = false,
  className = '',
}: StatusBadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full border
        whitespace-nowrap
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  );
}

/* Helper: Severity level to badge variant */
export function getSeverityVariant(severity: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    KRITIK: 'critical',
    YUKSEK: 'high',
    ORTA: 'medium',
    DUSUK: 'low',
  };
  return map[severity?.toUpperCase()] || 'neutral';
}

/* Helper: Status to badge variant */
export function getStatusVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    OPEN: 'warning',
    IN_PROGRESS: 'info',
    CLOSED: 'neutral',
    COMPLETED: 'success',
    VERIFIED: 'success',
    OVERDUE: 'critical',
    DRAFT: 'neutral',
    APPROVED: 'success',
    REJECTED: 'critical',
    PENDING_APPROVAL: 'warning',
    IDENTIFIED: 'info',
    ASSESSED: 'primary',
    TREATED: 'success',
    ACCEPTED: 'low',
    ACTIVE: 'success',
    INACTIVE: 'neutral',
    EFFECTIVE: 'success',
    INEFFECTIVE: 'critical',
    PARTIALLY_EFFECTIVE: 'warning',
    NOT_TESTED: 'neutral',
    // Turkish
    AKTIF: 'success',
    PASIF: 'neutral',
    KAPATILDI: 'neutral',
    BEKLEMEDE: 'warning',
    ONAYLI: 'success',
    TASLAK: 'neutral',
  };
  return map[status?.toUpperCase()] || 'neutral';
}

export default StatusBadge;
