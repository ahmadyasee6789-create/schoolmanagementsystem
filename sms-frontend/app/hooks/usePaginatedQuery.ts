import { useEffect, useRef, useState } from "react";
import { debounce } from "../lib/debounce";

interface Options<TFilters> {
  fetcher: (params: TFilters & { page: number; limit: number }) => Promise<{
    data: any[];
    totalPages: number;
  }>;
  filters?: TFilters;
  debounceKeys?: (keyof TFilters)[];
  initialPage?: number;
  initialLimit?: number;
  debounceMs?: number;
}

export function usePaginatedQuery<TFilters extends Record<string, any>>({
  fetcher,
  filters = {} as TFilters,
  debounceKeys = [],
  initialPage = 1,
  initialLimit = 10,
  debounceMs = 500,
}: Options<TFilters>) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [totalPages, setTotalPages] = useState(1);

  // ── Refs always hold the latest values — no stale closures ──────
  const pageRef    = useRef(page);
  const limitRef   = useRef(limit);
  const filtersRef = useRef(filters);
  const fetcherRef = useRef(fetcher);

  pageRef.current    = page;
  limitRef.current   = limit;
  filtersRef.current = filters;
  fetcherRef.current = fetcher;

  // ── Stable debounced runner (created once) ───────────────────────
  const debouncedFetch = useRef(
    debounce(async (params: any) => {
      setLoading(true);
      try {
        const res = await fetcherRef.current(params);
        setData(res.data);
        setTotalPages(res.totalPages);
      } finally {
        setLoading(false);
      }
    }, debounceMs)
  );

  // ── Core fetch — always reads from refs, never stale ────────────
  const triggerFetch = useRef((useDebounce = false) => {
    const params = {
      ...filtersRef.current,
      page:  pageRef.current,
      limit: limitRef.current,
    };

    if (useDebounce) {
      debouncedFetch.current(params);
    } else {
      debouncedFetch.current.cancel?.();
      setLoading(true);
      fetcherRef.current(params)
        .then((res) => {
          setData(res.data);
          setTotalPages(res.totalPages);
        })
        .finally(() => setLoading(false));
    }
  });

  // ── Debounced filter keys (e.g. search) ─────────────────────────
  useEffect(() => {
    if (!debounceKeys.length) return;
    setPage(1);
    // page ref won't be 1 yet — pass override directly
    const params = {
      ...filtersRef.current,
      page: 1,
      limit: limitRef.current,
    };
    debouncedFetch.current(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, debounceKeys.map((k) => filters[k]));

  // ── Page / limit / non-debounced filter changes ─────────────────
  useEffect(() => {
    triggerFetch.current(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    limit,
    ...Object.keys(filters)
      .filter((k) => !debounceKeys.includes(k as keyof TFilters))
      .map((k) => filters[k]),
  ]);

  return {
    data,
    loading,
    page,
    limit,
    totalPages,
    setPage,
    setLimit,
    refetch: () => triggerFetch.current(false),
  };
}