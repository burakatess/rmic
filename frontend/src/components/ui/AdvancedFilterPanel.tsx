'use client';

import React, { useState } from 'react';

/* ============================================
   ADVANCED FILTER PANEL — Design System v2
   Katlanabilir kurumsal filtre paneli:
   arama + select + multi-select + tarih aralığı.
   Tüm state parent'ta (controlled); backend'e dokunmaz.
   ============================================ */

export interface AdvancedFilterOption {
  value: string;
  label: string;
}

export type AdvancedFilterField =
  | {
      type: 'select';
      key: string;
      label: string;
      options: AdvancedFilterOption[];
      value: string;
      onChange: (value: string) => void;
    }
  | {
      type: 'multiselect';
      key: string;
      label: string;
      options: AdvancedFilterOption[];
      value: string[];
      onChange: (value: string[]) => void;
    }
  | {
      type: 'text';
      key: string;
      label: string;
      placeholder?: string;
      value: string;
      onChange: (value: string) => void;
    }
  | {
      type: 'daterange';
      key: string;
      label: string;
      from: string;
      to: string;
      onChange: (from: string, to: string) => void;
    };

interface AdvancedFilterPanelProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  fields?: AdvancedFilterField[];
  onClearAll?: () => void;
  defaultOpen?: boolean;
  /** Panel başlığının yanında gösterilen aktif filtre sayısı */
  activeCount?: number;
  children?: React.ReactNode;
  className?: string;
}

function MultiSelectField({
  field,
}: {
  field: Extract<AdvancedFilterField, { type: 'multiselect' }>;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = (value: string) => {
    field.onChange(
      field.value.includes(value) ? field.value.filter((v) => v !== value) : [...field.value, value]
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full h-9 px-3 flex items-center justify-between gap-2 bg-white border rounded-lg text-sm
          transition-all duration-150 cursor-pointer
          ${field.value.length > 0 ? 'border-blue-400 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
      >
        <span className="truncate">
          {field.value.length === 0
            ? field.label
            : `${field.label} (${field.value.length})`}
        </span>
        <svg className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-full min-w-[200px] bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 max-h-60 overflow-y-auto">
          {field.options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={field.value.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdvancedFilterPanel({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Ara...',
  fields = [],
  onClearAll,
  defaultOpen = false,
  activeCount = 0,
  children,
  className = '',
}: AdvancedFilterPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm mb-4 ${className}`}>
      {/* Üst şerit: arama her zaman görünür + panel toggle */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-9 pl-9 pr-8 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400
                       focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all duration-150"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Aramayı temizle"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {activeCount > 0 && onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              className="flex items-center gap-1 h-9 px-3 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Temizle
            </button>
          )}
          {(fields.length > 0 || children) && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className={`flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-lg border transition-colors cursor-pointer
                ${open || activeCount > 0
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              Gelişmiş Filtre
              {activeCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-semibold tabular-nums">
                  {activeCount}
                </span>
              )}
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Katlanabilir gövde */}
      {open && (fields.length > 0 || children) && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 animate-fadeInDown">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3">
            {fields.map((field) => (
              <div key={field.key}>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{field.label}</label>
                {field.type === 'select' && (
                  <select
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className={`w-full h-9 px-3 bg-white border rounded-lg text-sm transition-all duration-150 cursor-pointer
                      focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                      ${field.value ? 'border-blue-400 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                  >
                    <option value="">Tümü</option>
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
                {field.type === 'multiselect' && <MultiSelectField field={field} />}
                {field.type === 'text' && (
                  <input
                    type="text"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400
                               focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all duration-150"
                  />
                )}
                {field.type === 'daterange' && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={field.from}
                      onChange={(e) => field.onChange(e.target.value, field.to)}
                      className="flex-1 min-w-0 h-9 px-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700
                                 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <span className="text-slate-300 text-xs">–</span>
                    <input
                      type="date"
                      value={field.to}
                      onChange={(e) => field.onChange(field.from, e.target.value)}
                      className="flex-1 min-w-0 h-9 px-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700
                                 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          {children && <div className="pt-3">{children}</div>}
        </div>
      )}
    </div>
  );
}

export default AdvancedFilterPanel;
