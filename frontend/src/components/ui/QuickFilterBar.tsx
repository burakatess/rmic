'use client';

import React from 'react';

/* ============================================
   QUICK FILTER BAR — Design System v2
   Chip bazlı hızlı filtreler (Benim Kayıtlarım,
   Bu Ay, Gecikenler...). Tek tıkla uygula/kaldır.
   ============================================ */

export interface QuickFilterItem {
  key: string;
  label: string;
  /** Canlı kayıt sayısı (opsiyonel) */
  count?: number;
  icon?: React.ReactNode;
}

interface QuickFilterBarProps {
  items: QuickFilterItem[];
  /** Aktif chip key'i; null = hiçbiri */
  active: string | null;
  /** Aktif chip'e tekrar tıklanırsa null gönderilir */
  onChange: (key: string | null) => void;
  label?: string;
  className?: string;
}

export function QuickFilterBar({ items, active, onChange, label, className = '' }: QuickFilterBarProps) {
  if (items.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 mb-3 ${className}`}>
      {label && <span className="text-xs font-medium text-slate-400 mr-1">{label}</span>}
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(isActive ? null : item.key)}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border
              transition-colors duration-150 cursor-pointer
              ${isActive
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50/50'
              }`}
          >
            {item.icon && <span className="w-3.5 h-3.5 flex-shrink-0">{item.icon}</span>}
            {item.label}
            {item.count !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums
                  ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default QuickFilterBar;
