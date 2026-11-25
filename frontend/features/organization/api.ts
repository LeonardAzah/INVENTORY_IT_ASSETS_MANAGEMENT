import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiGet, apiPatch, apiPost, type QueryValue } from '@/lib/api/client';
import type { Paginated } from '@/lib/api/envelope';

import type {
  Department,
  DepartmentKind,
  Location,
  Office,
  OfficeKind,
  Region,
} from './types';

type Query = Record<string, QueryValue>;

const REFERENCE_STALE_MS = 5 * 60_000;
const OPTIONS_PAGE_SIZE = 100;

export const organizationKeys = {
  all: ['organization'] as const,
  list: (resource: Resource, query: Query) =>
    ['organization', resource, 'list', query] as const,
  options: (resource: Resource, query: Query) =>
    ['organization', resource, 'options', query] as const,
};

type Resource = 'regions' | 'offices' | 'departments' | 'locations';

type Records = {
  regions: Region;
  offices: Office;
  departments: Department;
  locations: Location;
};

export function useOrganizationList<R extends Resource>(
  resource: R,
  query: Query,
) {
  return useQuery({
    queryKey: organizationKeys.list(resource, query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Records[R]>>(`/${resource}/`, { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useOrganizationOptions<R extends Resource>(
  resource: R,
  query: Query = {},
  enabled = true,
) {
  const full = { ...query, page_size: OPTIONS_PAGE_SIZE };
  return useQuery({
    queryKey: organizationKeys.options(resource, full),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Records[R]>>(`/${resource}/`, { query: full, signal }),
    select: (response) => ({
      records: response.data.results,
      truncated: response.data.pagination.count > response.data.results.length,
    }),
    staleTime: REFERENCE_STALE_MS,
    enabled,
  });
}

export type RegionCreate = { code: string; name: string };
export type RegionUpdate = { name: string; is_active: boolean };

export type OfficeCreate = {
  region_id: string;
  parent_id: string | null;
  kind: OfficeKind;
  code: string;
  name: string;
  town: string;
};
export type OfficeUpdate = {
  parent_id: string | null;
  code: string;
  name: string;
  town: string;
  is_active: boolean;
};

export type DepartmentCreate = {
  office_id: string;
  kind: DepartmentKind;
  code: string;
  name: string;
};
export type DepartmentUpdate = {
  code: string;
  name: string;
  is_active: boolean;
};

export type LocationCreate = {
  office_id: string;
  department_id: string | null;
  name: string;
};
export type LocationUpdate = {
  department_id: string | null;
  name: string;
  is_default: boolean;
  is_active: boolean;
};

type Inputs = {
  regions: { create: RegionCreate; update: RegionUpdate };
  offices: { create: OfficeCreate; update: OfficeUpdate };
  departments: { create: DepartmentCreate; update: DepartmentUpdate };
  locations: { create: LocationCreate; update: LocationUpdate };
};

export function useSaveOrganization<R extends Resource>(resource: R) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id?: string;
      values: Inputs[R]['create'] | Inputs[R]['update'];
    }) =>
      input.id
        ? apiPatch<Records[R]>(`/${resource}/${input.id}/`, input.values)
        : apiPost<Records[R]>(`/${resource}/`, input.values),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: organizationKeys.all }),
  });
}
