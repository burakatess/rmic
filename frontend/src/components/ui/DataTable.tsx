'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { EmptyState } from './EmptyState';

/* ============================================
   DATA TABLE — Quaresma + Aboubakar
   Enterprise data table with sort, pagination,
   row selection, resizable columns, column filters
   ============================================ */

export interface ColumnFilter {
  type: 'text' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Applied by the parent page in its filteredX useMemo via columns.every(col => col.filter?.fn(...)) */
  fn?: (item: any, value: string) => boolean;
}

export interface ColumnDef<T> {
  key: string;
  header: string;
  minWidth?: number;
  defaultWidth?: number;
  maxWidth?: number;
  sortable?: boolean;
  render: (item: T, index: number) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  /** Column-level inline filter config */
  filter?: ColumnFilter;
}

type SortDirection = 'asc' | 'desc' | null;

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: (item: T) => string;
  onRowClick?: (item: T) => void;
  selectedRows?: Set<string>;
  onRowSelect?: (id: string) => void;
  onSelectAll?: () => void;
  showCheckbox?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  className?: string;
  stickyHeader?: boolean;
  storageKey?: string;
  // Pagination
  totalCount?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  // Sort
  sortKey?: string;
  sortDirection?: SortDirection;
  onSort?: (key: string, direction: SortDirection) => void;
  loading?: boolean;
  // Column filters (controlled by parent)
  columnFilters?: Record<string, string>;
  onColumnFilterChange?: (key: string, value: string) => void;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  selectedRows,
  onRowSelect,
  onSelectAll,
  showCheckbox = false,
  emptyTitle = 'Veri bulunamadı',
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  className = '',
  stickyHeader = true,
  storageKey,
  totalCount,
  page = 1,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  sortKey,
  sortDirection,
  onSort,
  loading = false,
  columnFilters = {},
  onColumnFilterChange,
}: DataTableProps<T>) {
  // Column widths
  const getInitialWidths = useCallback(() => {
    if (storageKey && typeof window !== 'undefined') {
      const saved = localStorage.getItem(`table-widths-${storageKey}`);
      if (saved) {
        try { return JSON.parse(saved); } catch { /* ignore */ }
      }
    }
    return columns.reduce((acc, col) => {
      acc[col.key] = col.defaultWidth || 150;
      return acc;
    }, {} as Record<string, number>);
  }, [columns, storageKey]);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(getInitialWidths);
  const [resizing, setResizing] = useState<string | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    if (storageKey && typeof window !== 'undefined') {
      localStorage.setItem(`table-widths-${storageKey}`, JSON.stringify(columnWidths));
    }
  }, [columnWidths, storageKey]);

  const handleMouseDown = useCallback((e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    setResizing(colKey);
    startX.current = e.clientX;
    startWidth.current = columnWidths[colKey] || 150;
  }, [columnWidths]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizing) return;
    const delta = e.clientX - startX.current;
    const col = columns.find(c => c.key === resizing);
    const min = col?.minWidth || 60;
    const max = col?.maxWidth || 600;
    const newW = Math.min(max, Math.max(min, startWidth.current + delta));
    setColumnWidths(prev => ({ ...prev, [resizing]: newW }));
  }, [resizing, columns]);

  const handleMouseUp = useCallback(() => { setResizing(null); }, []);

  useEffect(() => {
    if (resizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizing, handleMouseMove, handleMouseUp]);

  // Sort handler
  const handleSort = (key: string) => {
    if (!onSort) return;
    const col = columns.find(c => c.key === key);
    if (!col?.sortable) return;
    if (sortKey === key) {
      onSort(key, sortDirection === 'asc' ? 'desc' : sortDirection === 'desc' ? null : 'asc');
    } else {
      onSort(key, 'asc');
    }
  };

  // Check if any column filters are active
  const hasActiveColFilters = onColumnFilterChange && columns.some(c => c.filter);

  // Pagination
  const total = totalCount ?? data.length;
  const totalPages = Math.ceil(total / pageSize);
  const isAllSelected = data.length > 0 && selectedRows?.size === data.length;

  const activeFilterCount = Object.values(columnFilters).filter(v => v && v !== '').length;

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      {/* Active filter count badge */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          <span><span className="font-semibold">{activeFilterCount}</span> sütun filtresi aktif</span>
          {onColumnFilterChange && (
            <button
              onClick={() => columns.forEach(c => c.filter && onColumnFilterChange(c.key, ''))}
              className="ml-1 text-blue-500 hover:text-blue-800 underline"
            >
              Temizle
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className={`bg-slate-50/80 border-b border-slate-200 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
            {/* Main header row */}
            <tr>
              {showCheckbox && (
                <th className="px-3 py-3 text-center w-10 bg-slate-50/80">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={onSelectAll}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                </th>
              )}
              {columns.map((col, idx) => (
                <th
                  key={col.key}
                  className={`px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider
                    relative select-none bg-slate-50/80
                    ${col.sortable ? 'cursor-pointer hover:text-slate-700' : ''}
                    ${col.headerClassName || ''}`}
                  style={{ width: columnWidths[col.key], minWidth: col.minWidth || 60 }}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{col.header}</span>
                    {col.sortable && sortKey === col.key && sortDirection && (
                      <svg className={`w-3.5 h-3.5 text-blue-600 flex-shrink-0 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                  {/* Resize handle */}
                  {idx < columns.length - 1 && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group"
                      onMouseDown={(e) => handleMouseDown(e, col.key)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-slate-300 group-hover:bg-blue-500 transition-colors ${resizing === col.key ? 'bg-blue-500' : ''}`} />
                    </div>
                  )}
                </th>
              ))}
            </tr>

            {/* Column filter row */}
            {hasActiveColFilters && (
              <tr className="bg-slate-100/80 border-b border-slate-200">
                {showCheckbox && <th className="px-2 py-1.5 bg-slate-100/80 w-10" />}
                {columns.map((col) => {
                  const filterVal = columnFilters[col.key] || '';
                  const isActive = filterVal !== '';
                  return (
                    <th
                      key={col.key}
                      className="px-2 py-1.5 bg-slate-100/80"
                      style={{ width: columnWidths[col.key], minWidth: col.minWidth || 60 }}
                    >
                      {col.filter ? (
                        col.filter.type === 'select' ? (
                          <select
                            value={filterVal}
                            onChange={e => onColumnFilterChange?.(col.key, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className={`w-full h-7 px-2 text-[11px] rounded border focus:outline-none focus:ring-1 transition-all
                              ${isActive
                                ? 'bg-blue-50 border-blue-400 text-blue-800 ring-blue-400'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                              }`}
                          >
                            <option value="">Tümü</option>
                            {col.filter.options?.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="relative">
                            <input
                              type="text"
                              value={filterVal}
                              onChange={e => onColumnFilterChange?.(col.key, e.target.value)}
                              onClick={e => e.stopPropagation()}
                              placeholder={col.filter.placeholder || `${col.header}...`}
                              className={`w-full h-7 pl-6 pr-6 text-[11px] rounded border focus:outline-none focus:ring-1 transition-all
                                ${isActive
                                  ? 'bg-blue-50 border-blue-400 text-blue-800 placeholder-blue-300 ring-blue-400'
                                  : 'bg-white border-slate-200 text-slate-600 placeholder-slate-300 hover:border-slate-300'
                                }`}
                            />
                            <svg className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none ${isActive ? 'text-blue-400' : 'text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                            </svg>
                            {isActive && (
                              <button
                                onClick={e => { e.stopPropagation(); onColumnFilterChange?.(col.key, ''); }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-blue-400 hover:text-blue-600 rounded-full hover:bg-blue-100"
                              >
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      ) : (
                        <div className="h-7" />
                      )}
                    </th>
                  );
                })}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading ? (
              // Skeleton loading
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  {showCheckbox && <td className="px-3 py-3"><div className="w-4 h-4 bg-slate-100 rounded animate-shimmer" /></td>}
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-3">
                      <div className="h-4 bg-slate-100 rounded animate-shimmer" style={{ width: `${60 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (showCheckbox ? 1 : 0)}>
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    actionLabel={emptyActionLabel}
                    onAction={onEmptyAction}
                  />
                </td>
              </tr>
            ) : (
              data.map((item, idx) => {
                const key = rowKey(item);
                const isSelected = selectedRows?.has(key);
                return (
                  <tr
                    key={key}
                    className={`
                      group transition-colors duration-100
                      ${isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50/50'}
                      ${onRowClick ? 'cursor-pointer' : ''}
                    `}
                    onClick={() => onRowClick?.(item)}
                  >
                    {showCheckbox && (
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onRowSelect?.(key)}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-3 ${col.cellClassName || ''}`}
                        style={{ width: columnWidths[col.key], maxWidth: columnWidths[col.key] }}
                      >
                        <div className="truncate">{col.render(item, idx)}</div>
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(onPageChange || totalCount !== undefined) && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              Toplam <span className="font-semibold text-slate-700">{total}</span> kayıt
            </span>
            {onPageSizeChange && (
              <>
                <span>·</span>
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="h-7 px-2 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {[10, 20, 50, 100].map(s => (
                    <option key={s} value={s}>{s} / sayfa</option>
                  ))}
                </select>
              </>
            )}
          </div>

          {totalPages > 1 && onPageChange && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (page <= 4) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = page - 3 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => onPageChange(pageNum)}
                    className={`min-w-[28px] h-7 px-1.5 text-xs font-medium rounded-md transition-colors
                      ${page === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-200'
                      }
                    `}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DataTable;
