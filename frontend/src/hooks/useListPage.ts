'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/* ============================================
   useListPage — Design System v2
   Liste sayfalarındaki tekrar eden state üçlüsünü
   (fetch + loading/error, arama, filtreler, quick filter,
   kolon filtreleri, sayfalama) tek hook'ta toplar.
   Backend'e dokunmaz: fetcher lib/api.ts metodudur,
   tüm filtreleme client-side'da kalır.
   ============================================ */

export interface UseListPageOptions<T> {
  fetcher: () => Promise<T[]>;
  /** Hata durumunda çağrılır (örn. toast.error) */
  onError?: (err: unknown) => void;
  initialPageSize?: number;
}

export interface ListFilterState {
  search: string;
  /** Gelişmiş filtre değerleri: key → value (multiselect için virgülle birleştirme yerine dizi tutulabilir) */
  filters: Record<string, string>;
  /** Quick filter chip key'i */
  quickFilter: string | null;
  /** Kolon filtreleri: columnKey → value */
  columnFilters: Record<string, string>;
}

export function useListPage<T>({ fetcher, onError, initialPageSize = 20 }: UseListPageOptions<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err);
      onError?.(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const setColumnFilter = useCallback((key: string, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearch('');
    setFilters({});
    setQuickFilter(null);
    setColumnFilters({});
    setPage(1);
  }, []);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => v && v !== '').length,
    [filters]
  );

  /** SavedViewMenu için görünüm snapshot'ı */
  const getViewPayload = useCallback(
    (): Record<string, unknown> => ({
      search,
      filters,
      quickFilter,
      columnFilters,
      pageSize,
    }),
    [search, filters, quickFilter, columnFilters, pageSize]
  );

  /** SavedViewMenu'den gelen snapshot'ı uygular */
  const applyViewPayload = useCallback((payload: Record<string, unknown>) => {
    if (typeof payload.search === 'string') setSearch(payload.search);
    if (payload.filters && typeof payload.filters === 'object') {
      setFilters(payload.filters as Record<string, string>);
    }
    setQuickFilter(typeof payload.quickFilter === 'string' ? payload.quickFilter : null);
    if (payload.columnFilters && typeof payload.columnFilters === 'object') {
      setColumnFilters(payload.columnFilters as Record<string, string>);
    }
    if (typeof payload.pageSize === 'number') setPageSize(payload.pageSize);
    setPage(1);
  }, []);

  return {
    // veri
    data,
    setData,
    loading,
    error,
    reload: load,
    // filtre state
    search,
    setSearch: (v: string) => { setSearch(v); setPage(1); },
    filters,
    setFilter,
    setFilters,
    quickFilter,
    setQuickFilter: (v: string | null) => { setQuickFilter(v); setPage(1); },
    columnFilters,
    setColumnFilter,
    setColumnFilters,
    clearAllFilters,
    activeFilterCount,
    // sayfalama
    page,
    setPage,
    pageSize,
    setPageSize: (v: number) => { setPageSize(v); setPage(1); },
    // saved views
    getViewPayload,
    applyViewPayload,
  };
}

export default useListPage;
