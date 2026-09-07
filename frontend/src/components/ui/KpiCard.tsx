'use client';

import React from 'react';

/* ============================================
   KPI CARD + KPI GRID — Design System v2
   Tüm liste ekranları ve dashboard için tek KPI standardı.
   Statik variant class map'leri kullanılır — dinamik
   `border-${color}` interpolasyonu YASAK (Tailwind üretemez).
   ============================================ */

export type KpiVariant =
  | 'default'
  | 'primary'
  | 'critical'
  | 'high'
  | 'warning'
  | 'success'
  | 'info'
  | 'violet';

interface VariantStyle {
  border: string;
  iconBg: string;
  iconText: string;
  value: string;
  activeRing: string;
}

const variantStyles: Record<KpiVariant, VariantStyle> = {
  default: {
    border: 'border-slate-200',
    iconBg: 'bg-slate-100',
    iconText: 'text-slate-600',
    value: 'text-slate-800',
    activeRing: 'ring-slate-400',
  },
  primary: {
    border: 'border-blue-200',
    iconBg: 'bg-blue-50',
    iconText: 'text-blue-600',
    value: 'text-blue-700',
    activeRing: 'ring-blue-400',
  },
  critical: {
    border: 'border-red-200',
    iconBg: 'bg-red-50',
    iconText: 'text-red-600',
    value: 'text-red-700',
    activeRing: 'ring-red-400',
  },
  high: {
    border: 'border-orange-200',
    iconBg: 'bg-orange-50',
    iconText: 'text-orange-600',
    value: 'text-orange-700',
    activeRing: 'ring-orange-400',
  },
  warning: {
    border: 'border-amber-200',
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-600',
    value: 'text-amber-700',
    activeRing: 'ring-amber-400',
  },
  success: {
    border: 'border-emerald-200',
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600',
    value: 'text-emerald-700',
    activeRing: 'ring-emerald-400',
  },
  info: {
    border: 'border-sky-200',
    iconBg: 'bg-sky-50',
    iconText: 'text-sky-600',
    value: 'text-sky-700',
    activeRing: 'ring-sky-400',
  },
  violet: {
    border: 'border-violet-200',
    iconBg: 'bg-violet-50',
    iconText: 'text-violet-600',
    value: 'text-violet-700',
    activeRing: 'ring-violet-400',
  },
};

export interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  variant?: KpiVariant;
  icon?: React.ReactNode;
  /** Küçük alt bilgi (örn. "3 gecikmiş" ya da delta) */
  subtitle?: React.ReactNode;
  /** Tıklanınca filtre uygular; verilirse kart buton olur */
  onClick?: () => void;
  /** Filtre olarak aktif mi (click-to-filter seçili durumu) */
  active?: boolean;
  className?: string;
}

export function KpiCard({
  title,
  value,
  variant = 'default',
  icon,
  subtitle,
  onClick,
  active = false,
  className = '',
}: KpiCardProps) {
  const s = variantStyles[variant];
  const interactive = !!onClick;

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 truncate">{title}</p>
        {icon && (
          <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${s.iconBg} ${s.iconText}`}>
            {icon}
          </span>
        )}
      </div>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${s.value}`}>{value}</p>
      {subtitle && <div className="mt-0.5 text-[11px] text-slate-400 truncate">{subtitle}</div>}
    </>
  );

  const baseClasses = `
    bg-white rounded-xl border shadow-sm p-4 text-left w-full
    transition-all duration-150
    ${s.border}
    ${active ? `ring-2 ring-offset-1 ${s.activeRing}` : ''}
    ${interactive ? 'cursor-pointer hover:shadow-md hover:border-slate-300' : ''}
    ${className}
  `;

  if (interactive) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={baseClasses}>
        {content}
      </button>
    );
  }
  return <div className={baseClasses}>{content}</div>;
}

interface KpiGridProps {
  children: React.ReactNode;
  /** Desktop'ta kolon sayısı (4-6). Mobile 2, tablet 3 kolona düşer. */
  columns?: 3 | 4 | 5 | 6;
  className?: string;
}

const gridCols: Record<number, string> = {
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
};

export function KpiGrid({ children, columns = 4, className = '' }: KpiGridProps) {
  return <div className={`grid gap-3 mb-4 ${gridCols[columns]} ${className}`}>{children}</div>;
}

export default KpiCard;
