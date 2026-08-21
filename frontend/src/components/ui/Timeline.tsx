'use client';

import React from 'react';

/* ============================================
   TIMELINE — Design System v2
   İş akışı / tarihçe / audit trail gösterimi.
   ============================================ */

export type TimelineVariant = 'default' | 'success' | 'warning' | 'critical' | 'info';

const dotStyles: Record<TimelineVariant, string> = {
  default: 'bg-slate-300',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  info: 'bg-blue-500',
};

export interface TimelineItem {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Görüntülenecek tarih metni (formatlanmış) */
  date?: string;
  user?: string;
  variant?: TimelineVariant;
}

interface TimelineProps {
  items: TimelineItem[];
  emptyText?: string;
  className?: string;
}

export function Timeline({ items, emptyText = 'Henüz kayıt yok', className = '' }: TimelineProps) {
  if (items.length === 0) {
    return <p className={`text-sm text-slate-400 py-6 text-center ${className}`}>{emptyText}</p>;
  }
  return (
    <ol className={`relative ${className}`}>
      {items.map((item, idx) => (
        <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
          {/* Dikey çizgi */}
          {idx < items.length - 1 && (
            <span className="absolute left-[5px] top-4 bottom-0 w-px bg-slate-200" aria-hidden />
          )}
          <span
            className={`relative z-[1] mt-1.5 w-[11px] h-[11px] rounded-full ring-4 ring-white flex-shrink-0 ${dotStyles[item.variant || 'default']}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-sm font-medium text-slate-700">{item.title}</p>
              {item.date && <span className="text-[11px] text-slate-400 tabular-nums">{item.date}</span>}
            </div>
            {item.description && <div className="mt-0.5 text-xs text-slate-500">{item.description}</div>}
            {item.user && <p className="mt-0.5 text-[11px] text-slate-400">{item.user}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default Timeline;
