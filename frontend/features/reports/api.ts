import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import { apiGet, proxyUrl, type QueryValue } from '@/lib/api/client';
import { readEnvelope, type Pagination } from '@/lib/api/envelope';
import {
  ApiError,
  MALFORMED_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '@/lib/api/errors';

type Query = Record<string, QueryValue>;

export type Dashboard = {
  warehouses: { total: number; active: number };
  stock: {
    items_in_stock: number;
    low_stock: number;
    with_unavailable: number;
  };
  assets: {
    total: number;
    by_status: Record<string, number>;
    pending_registration: number;
  };
  recent_movements: {
    occurred_at: string;
    warehouse: string;
    item: string;
    type: string;
    quantity: string;
    reference: string;
  }[];
  recent_asset_events: {
    occurred_at: string;
    asset_tag: string;
    event_type: string;
    to_status: string;
    by: string;
  }[];
};

export type ReportInfo = {
  name: string;
  title: string;
  description: string;
  columns: { key: string; label: string }[];
  filters: string[];
  formats: string[];
};

export type ReportPage = ReportInfo & {
  results: Record<string, unknown>[];
  pagination: Pagination;
};

export const reportKeys = {
  dashboard: ['reports', 'dashboard'] as const,
  list: ['reports', 'list'] as const,
  page: (name: string, query: Query) =>
    ['reports', 'page', name, query] as const,
};

export function useDashboard() {
  return useQuery({
    queryKey: reportKeys.dashboard,
    queryFn: ({ signal }) => apiGet<Dashboard>('/dashboard/', { signal }),
    select: (response) => response.data,
  });
}

export function useReportList() {
  return useQuery({
    queryKey: reportKeys.list,
    queryFn: ({ signal }) => apiGet<ReportInfo[]>('/reports/', { signal }),
    select: (response) => response.data,
    staleTime: 5 * 60_000,
  });
}

export function useReport(name: string, query: Query, enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.page(name, query),
    queryFn: ({ signal }) =>
      apiGet<ReportPage>(`/reports/${name}/`, { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

const PDF_TIMEOUT_MS = 60_000;

async function fetchPdf(
  name: string,
  query: Query,
): Promise<{ blob: Blob; filename: string }> {
  let response: Response;
  try {
    response = await fetch(
      proxyUrl(`/reports/${name}/`, { ...query, format: 'pdf' }),
      {
        headers: { Accept: 'application/pdf, application/json' },
        signal: AbortSignal.timeout(PDF_TIMEOUT_MS),
      },
    );
  } catch {
    throw new ApiError('network', NETWORK_ERROR_MESSAGE);
  }
  const type = response.headers.get('Content-Type') ?? '';
  if (response.ok && type.includes('application/pdf')) {
    return { blob: await response.blob(), filename: `${name}.pdf` };
  }
  // Throws the backend's refusal. A success that is not a PDF is not something to save.
  await readEnvelope(response);
  throw new ApiError('malformed', MALFORMED_ERROR_MESSAGE, {
    status: response.status,
  });
}

/** Hands a file to the browser to save. */
function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Downloads a report as a PDF. Reading only: it can be asked for as often as wanted. */
export function useDownloadReport(name: string) {
  return useMutation({
    mutationFn: async (query: Query) => {
      const { blob, filename } = await fetchPdf(name, query);
      save(blob, filename);
    },
  });
}
