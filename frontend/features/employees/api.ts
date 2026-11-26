import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiGet, apiPatch, apiPost, type QueryValue } from '@/lib/api/client';
import type { Paginated } from '@/lib/api/envelope';

import type { Employee, EmployeeAsset } from './types';

type Query = Record<string, QueryValue>;

export const employeeKeys = {
  all: ['employees'] as const,
  list: (query: Query) => ['employees', 'list', query] as const,
  detail: (id: string) => ['employees', 'detail', id] as const,
  assets: (id: string) => ['employees', 'detail', id, 'assets'] as const,
};

export function useEmployeeList(query: Query) {
  return useQuery({
    queryKey: employeeKeys.list(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Employee>>('/employees/', { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: employeeKeys.detail(id),
    queryFn: ({ signal }) => apiGet<Employee>(`/employees/${id}/`, { signal }),
    select: (response) => response.data,
  });
}

export function useEmployeeAssets(id: string, enabled: boolean) {
  return useQuery({
    queryKey: employeeKeys.assets(id),
    queryFn: ({ signal }) =>
      apiGet<EmployeeAsset[]>(`/employees/${id}/assets/`, { signal }),
    select: (response) => response.data,
    enabled,
  });
}

export type EmployeeInput = {
  matricule: string;
  first_name: string;
  last_name: string;
  email: string | null;
  telephone: string;
  department_id: string;
  work_location_id: string | null;
};

export function useSaveEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; values: EmployeeInput }) =>
      input.id
        ? apiPatch<Employee>(`/employees/${input.id}/`, input.values)
        : apiPost<Employee>('/employees/', input.values),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}

export function useSetEmployeeActive(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { active: boolean; reason: string }) =>
      apiPost<Employee>(
        `/employees/${id}/${input.active ? 'reactivate' : 'deactivate'}/`,
        {
          reason: input.reason,
        },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}
