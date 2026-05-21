'use client';

import React from 'react';

/* ============================================
   FILTER BAR — Quaresma + Aboubakar
   Search + dropdown filters + clear
   ============================================ */

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  onClearAll?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Ara...',
  filters = [],
  onClearAll,
  children,
  className = '',
}: FilterBarProps) {
  const hasActiveFilters = searchValue || filters.some(f => f.value !== '' && f.value !== 'all');

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-lg text-sm
                     text-slate-700 placeholder-slate-400
                     focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                     transition-all duration-150"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown Filters */}
      {filters.map((filter) => (
        <select
          key={filter.key}
          value={filter.value}
          onChange={(e) => filter.onChange(e.target.value)}
          className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-600
                     focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                     transition-all duration-150 cursor-pointer"
        >
          <option value="">{filter.label}</option>
          {filter.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}

      {/* Extra children (custom filter elements) */}
      {children}

      {/* Clear all */}
      {hasActiveFilters && onClearAll && (
        <button
          onClick={onClearAll}
          className="flex items-center gap-1 h-9 px-3 text-xs font-medium text-slate-500
                     hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Temizle
        </button>
      )}
    </div>
  );
}

export default FilterBar;
