import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { WarehouseType } from '@/features/warehouses/types';
import { apiGet, apiPatch, apiPost, type QueryValue } from '@/lib/api/client';
import type { Paginated } from '@/lib/api/envelope';

import type {
  AssetClass,
  Category,
  Item,
  SpecDataType,
  SpecificationField,
  SpecificationTemplate,
  SpecValue,
  Tracking,
  Unit,
} from './types';

type Query = Record<string, QueryValue>;
type Resource = 'units' | 'categories' | 'items' | 'specification-templates';
type Records = {
  units: Unit;
  categories: Category;
  items: Item;
  'specification-templates': SpecificationTemplate;
};

const REFERENCE_STALE_MS = 5 * 60_000;
const OPTIONS_PAGE_SIZE = 100;

export const catalogueKeys = {
  all: ['catalogue'] as const,
  list: (resource: Resource, query: Query) =>
    ['catalogue', resource, 'list', query] as const,
  options: (resource: Resource, query: Query) =>
    ['catalogue', resource, 'options', query] as const,
  item: (id: string) => ['catalogue', 'items', 'detail', id] as const,
  template: (id: string) =>
    ['catalogue', 'specification-templates', 'detail', id] as const,
};

/** One page of units, categories or items. The catalogue is the same for everyone. */
export function useCatalogueList<R extends Resource>(
  resource: R,
  query: Query,
) {
  return useQuery({
    queryKey: catalogueKeys.list(resource, query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Records[R]>>(`/${resource}/`, { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

/** Up to 100 units or categories for a dropdown; `truncated` when there are more. */
export function useCatalogueOptions<
  R extends 'units' | 'categories' | 'specification-templates',
>(resource: R, query: Query = {}, enabled = true) {
  const full = { ...query, page_size: OPTIONS_PAGE_SIZE };
  return useQuery({
    queryKey: catalogueKeys.options(resource, full),
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

export function useItem(id: string) {
  return useQuery({
    queryKey: catalogueKeys.item(id),
    queryFn: ({ signal }) => apiGet<Item>(`/items/${id}/`, { signal }),
    select: (response) => response.data,
  });
}

/** A template with its fields. Everyone reads templates: the item form needs them. */
export function useTemplate(id: string | null | undefined) {
  return useQuery({
    queryKey: catalogueKeys.template(id ?? ''),
    queryFn: ({ signal }) =>
      apiGet<SpecificationTemplate>(`/specification-templates/${id}/`, {
        signal,
      }),
    select: (response) => response.data,
    staleTime: REFERENCE_STALE_MS,
    enabled: Boolean(id),
  });
}

export type FieldRules = {
  label: string;
  required: boolean;
  choices: string[];
  min_value: string | null;
  max_value: string | null;
  decimal_places: number;
  unit_label: string;
  help_text: string;
  sort_order: number;
};
export type FieldCreate = FieldRules & { key: string; data_type: SpecDataType };
export type FieldUpdate = FieldRules & { is_active: boolean };

/** Adds a field to a template (no id) or changes one. The whole catalogue is then reloaded. */
export function useSaveField(templateId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; values: FieldCreate | FieldUpdate }) =>
      input.id
        ? apiPatch<SpecificationField>(
            `/specification-templates/${templateId}/fields/${input.id}/`,
            input.values,
          )
        : apiPost<SpecificationField>(
            `/specification-templates/${templateId}/fields/`,
            input.values,
          ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: catalogueKeys.all }),
  });
}

export type UnitCreate = { code: string; name: string; decimal_places: number };
export type UnitUpdate = {
  name: string;
  decimal_places: number;
  is_active: boolean;
};
export type CategoryCreate = {
  name: string;
  warehouse_type: WarehouseType;
  is_predefined?: boolean;
  specification_template_id?: string | null;
};
export type CategoryUpdate = {
  name: string;
  is_active: boolean;
  is_predefined?: boolean;
  specification_template_id?: string | null;
};
export type TemplateCreate = {
  code: string;
  name: string;
  description: string;
};
export type TemplateUpdate = {
  name: string;
  description: string;
  is_active: boolean;
};
export type ItemValues = {
  code: string;
  name: string;
  description: string;
  category_id: string;
  unit_id: string;
  warehouse_type: WarehouseType;
  tracking: Tracking;
  asset_class: AssetClass | null;
  brand: string;
  model: string;
  /** Sent only when they, or the category, changed: the backend checks them again then. */
  specifications?: Record<string, SpecValue>;
  is_active?: boolean;
};

type Inputs = {
  units: UnitCreate | UnitUpdate;
  categories: CategoryCreate | CategoryUpdate;
  items: ItemValues;
  'specification-templates': TemplateCreate | TemplateUpdate;
};

/** Creates an entry (no id) or changes one. The whole catalogue is then reloaded. */
export function useSaveCatalogue<R extends Resource>(resource: R) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; values: Inputs[R] }) =>
      input.id
        ? apiPatch<Records[R]>(`/${resource}/${input.id}/`, input.values)
        : apiPost<Records[R]>(`/${resource}/`, input.values),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: catalogueKeys.all }),
  });
}
