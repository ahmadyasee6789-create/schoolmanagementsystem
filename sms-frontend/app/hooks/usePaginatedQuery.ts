"use client";

import { useEffect, useState, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";

interface Options<TFilters, TItem> {
  queryKey: readonly unknown[];
  fetcher: (params: TFilters & { page: number; limit: number }, signal: AbortSignal) => Promise<{
    data: TItem[];
    totalPages: number;
  }>;
  filters: TFilters;
  debounceKeys?: (keyof TFilters)[];
  initialPage?: number;
  initialLimit?: number;
  debounceMs?: number;
}

export function usePaginatedQuery<TFilters extends Record<string, unknown>, TItem = unknown>({
  queryKey,
  fetcher,
  filters,
  debounceKeys = [],
  initialPage = 1,
  initialLimit = 10,
  debounceMs = 500,
}: Options<TFilters, TItem>) {
  const nextDebounced = JSON.stringify(Object.fromEntries(debounceKeys.map((key) => [key, filters[key]])));
  const [debounced, setDebounced] = useState(nextDebounced);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(nextDebounced), debounceMs);
    return () => clearTimeout(timer);
  }, [nextDebounced, debounceMs]);

  const appliedFilters = { ...filters, ...JSON.parse(debounced) } as TFilters;
  const filterKey = JSON.stringify(appliedFilters);
  const [pagination, setPagination] = useState({ filterKey, page: initialPage });
  const [limit, setLimit] = useState(initialLimit);
  // New filters start on page one without requesting the obsolete page first.
  const page = pagination.filterKey === filterKey ? pagination.page : 1;
  const params = { ...appliedFilters, page, limit };
  const query = useQuery({
    queryKey: [...queryKey, params],
    queryFn: ({ signal }) => fetcher(params, signal),
    refetchOnWindowFocus: false,
    retry: false,
  });

  return {
    data: query.data?.data ?? [],
    loading: query.isPending || query.isFetching,
    page,
    limit,
    totalPages: query.data?.totalPages ?? 1,
    setPage: (value: SetStateAction<number>) => setPagination({
      filterKey, page: typeof value === "function" ? value(page) : value,
    }),
    setLimit,
    refetch: () => { void query.refetch(); },
  };
}
