import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { PickerResult } from '@/components/shared/entity-picker';
import { accountKeys } from '@/features/accounts/api';
import {
  accountName,
  STATUS_LABELS,
  type Account,
} from '@/features/accounts/types';
import { authKeys } from '@/features/auth/api';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  type QueryValue,
} from '@/lib/api/client';
import type { Envelope, Paginated } from '@/lib/api/envelope';

import type { Assignment, Warehouse, WarehouseType } from './types';

type Query = Record<string, QueryValue>;

const PICKER_PAGE_SIZE = 20;
const HISTORY_PAGE_SIZE = 25;

export const warehouseKeys = {
  all: ['warehouses'] as const,
  list: (query: Query) => ['warehouses', 'list', query] as const,
  detail: (id: string) => ['warehouses', 'detail', id] as const,
  assignments: (id: string) =>
    ['warehouses', 'detail', id, 'assignments'] as const,
  keeperPicker: ['warehouses', 'keeper-picker'] as const,
};

export function useWarehouseList(query: Query) {
  return useQuery({
    queryKey: warehouseKeys.list(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Warehouse>>('/warehouses/', { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useWarehouse(id: string) {
  return useQuery({
    queryKey: warehouseKeys.detail(id),
    queryFn: ({ signal }) =>
      apiGet<Warehouse>(`/warehouses/${id}/`, { signal }),
    select: (response) => response.data,
  });
}

/** Who has kept the warehouse, newest first. */
export function useAssignments(id: string) {
  return useQuery({
    queryKey: warehouseKeys.assignments(id),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Assignment>>(`/warehouses/${id}/assignments/`, {
        query: { page_size: HISTORY_PAGE_SIZE },
        signal,
      }),
    select: (response) => response.data,
  });
}

export async function searchAccounts(
  term: string,
  signal: AbortSignal,
): Promise<PickerResult> {
  const response = await apiGet<Paginated<Account>>('/accounts/', {
    query: {
      search: term,
      responsibility: 'STORE_KEEPER',
      page_size: PICKER_PAGE_SIZE,
    },
    signal,
  });
  return {
    total: response.data.pagination.count,
    options: response.data.results.map((account) => ({
      value: account.id,
      label: accountName(account),
      description: `${account.employee.matricule} · ${account.email} · ${STATUS_LABELS[account.status] ?? account.status}`,
    })),
  };
}

export type WarehouseCreate = {
  code: string;
  name: string;
  type: WarehouseType;
  office_id: string;
  department_id: string | null;
  is_regional_store?: boolean;
};
export type WarehouseUpdate = {
  name: string;
  is_active: boolean;
  is_regional_store?: boolean;
};

function useWarehouseMutation<TInput, TData>(
  mutationFn: (input: TInput) => Promise<Envelope<TData>>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: warehouseKeys.all }),
        queryClient.invalidateQueries({ queryKey: accountKeys.all }),
        queryClient.invalidateQueries({ queryKey: authKeys.me }),
      ]),
  });
}

export const useSaveWarehouse = () =>
  useWarehouseMutation(
    (input: { id?: string; values: WarehouseCreate | WarehouseUpdate }) =>
      input.id
        ? apiPatch<Warehouse>(`/warehouses/${input.id}/`, input.values)
        : apiPost<Warehouse>('/warehouses/', input.values),
  );

/** Makes an account the Store Keeper. If the warehouse has one, they are replaced in the same step. */
export const useAssignStoreKeeper = (id: string) =>
  useWarehouseMutation((input: { user_id: string; reason: string }) =>
    apiPost<Warehouse>(`/warehouses/${id}/store-keeper/`, input),
  );

/** Leaves the warehouse without a Store Keeper. */
export const useRemoveStoreKeeper = (id: string) =>
  useWarehouseMutation((reason: string) =>
    apiDelete<null>(`/warehouses/${id}/store-keeper/`, { reason }),
  );
