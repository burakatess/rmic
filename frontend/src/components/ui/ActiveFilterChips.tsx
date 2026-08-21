'use client';

import React from 'react';

/* ============================================
   ACTIVE FILTER CHIPS — Design System v2
   Uygulanan filtrelerin silinebilir chip gösterimi:
   "GMY: BT ✕" · "Durum: Açık ✕" · Tümünü temizle
   ============================================ */

export interface ActiveFilterChip {
  key: string;
  /** Filtre adı (örn. "Durum") */
  label: string;
  /** Seçili değer (örn. "Açık") */
  value: string;
  onRemove: () => void;
}

interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[];
  onClearAll?: () => void;
  className?: string;
}

export function ActiveFilterChips({ chips, onClearAll, className = '' }: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 mb-3 ${className}`}>
      <span className="text-xs text-slate-400">Aktif filtreler:</span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-blue-50 border border-blue-200 text-xs text-blue-700"
        >
          <span className="font-medium">{chip.label}:</span>
          <span className="max-w-[160px] truncate">{chip.value}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`${chip.label} filtresini kaldır`}
            className="w-5 h-5 flex items-center justify-center rounded-full text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      {onClearAll && chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="h-7 px-2.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors cursor-pointer"
        >
          Tümünü temizle
        </button>
      )}
    </div>
  );
}

export default ActiveFilterChips;
