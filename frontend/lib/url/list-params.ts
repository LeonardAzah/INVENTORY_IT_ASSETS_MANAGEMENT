'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZES = [10, 25, 50, 100] as const;

export type ListState<F extends string> = {
  page: number;
  pageSize: number;
  search: string;
  ordering: string;
  filters: Record<F, string>;
};

export type ListPatch<F extends string> = Partial<
  Omit<ListState<F>, 'filters'>
> & {
  filters?: Partial<Record<F, string>>;
};

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readListState<F extends string>(
  params: URLSearchParams,
  filterKeys: readonly F[],
): ListState<F> {
  const pageSize = positiveInt(params.get('page_size'), DEFAULT_PAGE_SIZE);
  const filters = {} as Record<F, string>;
  for (const key of filterKeys) {
    filters[key] = params.get(key) ?? '';
  }
  return {
    page: positiveInt(params.get('page'), 1),
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize)
      ? pageSize
      : DEFAULT_PAGE_SIZE,
    search: params.get('search') ?? '',
    ordering: params.get('ordering') ?? '',
    filters,
  };
}

export function writeListState<F extends string>(state: ListState<F>): string {
  const params = new URLSearchParams();
  if (state.page > 1) params.set('page', String(state.page));
  if (state.pageSize !== DEFAULT_PAGE_SIZE)
    params.set('page_size', String(state.pageSize));
  if (state.search) params.set('search', state.search);
  if (state.ordering) params.set('ordering', state.ordering);
  for (const [key, value] of Object.entries<string>(state.filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function toQuery<F extends string>(state: ListState<F>) {
  return {
    page: state.page,
    page_size: state.pageSize,
    search: state.search,
    ordering: state.ordering,
    ...state.filters,
  };
}

export function useListParams<F extends string>(filterKeys: readonly F[]) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.toString();
  const keys = filterKeys.join(',');

  const state = useMemo(
    () =>
      readListState(
        new URLSearchParams(raw),
        keys ? (keys.split(',') as F[]) : [],
      ),
    [raw, keys],
  );

  const update = useCallback(
    (patch: ListPatch<F>) => {
      const next: ListState<F> = {
        ...state,
        ...patch,
        filters: { ...state.filters, ...patch.filters },
        page: patch.page ?? 1,
      };
      const query = writeListState(next);
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname, state],
  );

  const hasFilters =
    Boolean(state.search) || Object.values<string>(state.filters).some(Boolean);
  const clear = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  return { state, update, clear, hasFilters, query: toQuery(state) };
}
