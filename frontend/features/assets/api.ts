import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { PickerResult } from '@/components/shared/entity-picker';
import type { Location } from '@/features/organization/types';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  type QueryValue,
} from '@/lib/api/client';
import type { Paginated } from '@/lib/api/envelope';

import {
  holderOf,
  type Acquisition,
  type Asset,
  type AssetEvent,
  type AssetRef,
  type AssetStatus,
  type AssigneeType,
  type ComputerDetails,
  type PendingRow,
  type Relationship,
  type RelationshipKind,
} from './types';

type Query = Record<string, QueryValue>;

export const assetKeys = {
  all: ['assets'] as const,
  pending: (query: Query) => ['assets', 'pending', query] as const,
  acquisitions: (query: Query) =>
    ['assets', 'acquisitions', 'list', query] as const,
  acquisition: (id: string) =>
    ['assets', 'acquisitions', 'detail', id] as const,
  locationPicker: (regionId: string) =>
    ['assets', 'location-picker', regionId] as const,
  list: (query: Query) => ['assets', 'list', query] as const,
  detail: (id: string) => ['assets', 'detail', id] as const,
  history: (id: string, page: number) =>
    ['assets', 'detail', id, 'history', page] as const,
  relationships: (id: string) =>
    ['assets', 'detail', id, 'relationships'] as const,
  assetPicker: (regionId: string, assetClass: string) =>
    ['assets', 'asset-picker', regionId, assetClass] as const,
};

export function usePendingRegistration(query: Query, enabled = true) {
  return useQuery({
    queryKey: assetKeys.pending(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<PendingRow>>('/assets/pending-registration/', {
        query,
        signal,
      }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAcquisitionList(query: Query) {
  return useQuery({
    queryKey: assetKeys.acquisitions(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Acquisition>>('/assets/acquisitions/', {
        query,
        signal,
      }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useAcquisition(id: string) {
  return useQuery({
    queryKey: assetKeys.acquisition(id),
    queryFn: ({ signal }) =>
      apiGet<Acquisition>(`/assets/acquisitions/${id}/`, { signal }),
    select: (response) => response.data,
  });
}

function useReloadAssets() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: assetKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    ]);
}

export type AcquisitionInput = {
  client_request_id: string;
  region_id: string;
  item_id: string;
  quantity: number;
  acquisition_date: string;
  source: string;
  notes: string;
};

export function useRecordAcquisition() {
  const reload = useReloadAssets();
  return useMutation({
    mutationFn: (input: AcquisitionInput) =>
      apiPost<Acquisition>('/assets/acquisitions/', input),
    onSettled: reload,
  });
}

export type Placement = {
  assignee_type: AssigneeType;
  employee_id?: string;
  department_id?: string;
  location_id: string;
};

export type UnitInput = {
  serial_number?: string;
  lot_number?: string;
  computer_details?: Partial<ComputerDetails>;
};

export type RegisterInput = UnitInput & {
  receipt_line_id?: string;
  acquisition_id?: string;
  deployed?: Placement;
  confirm_cross_item_serial?: string;
  client_request_id: string;
};

export function useRegisterAsset() {
  const reload = useReloadAssets();
  return useMutation({
    mutationFn: (input: RegisterInput) => apiPost<Asset>('/assets/', input),
    onSettled: reload,
  });
}

export function useRegisterBulk() {
  const reload = useReloadAssets();
  return useMutation({
    mutationFn: (input: {
      receipt_line_id: string;
      units: UnitInput[];
      client_request_id: string;
    }) => apiPost<Asset[]>('/assets/bulk/', input),
    onSettled: reload,
  });
}

const PICKER_PAGE_SIZE = 20;

export async function searchLocations(
  regionId: string,
  term: string,
  signal: AbortSignal,
): Promise<PickerResult> {
  const response = await apiGet<Paginated<Location>>('/locations/', {
    query: {
      region: regionId,
      is_active: true,
      search: term,
      page_size: PICKER_PAGE_SIZE,
    },
    signal,
  });
  return {
    options: response.data.results.map((location) => ({
      value: location.id,
      label: location.name,
      description: location.department
        ? `${location.department.name}, ${location.office.name}`
        : location.office.name,
    })),
    total: response.data.pagination.count,
  };
}

export function useAssetList(query: Query) {
  return useQuery({
    queryKey: assetKeys.list(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Asset>>('/assets/', { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: assetKeys.detail(id),
    queryFn: ({ signal }) => apiGet<Asset>(`/assets/${id}/`, { signal }),
    select: (response) => response.data,
  });
}

export function useAssetHistory(id: string, page: number) {
  return useQuery({
    queryKey: assetKeys.history(id, page),
    queryFn: ({ signal }) =>
      apiGet<Paginated<AssetEvent>>(`/assets/${id}/history/`, {
        query: { page, page_size: 10 },
        signal,
      }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useRelationships(id: string) {
  return useQuery({
    queryKey: assetKeys.relationships(id),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Relationship>>(`/assets/${id}/relationships/`, {
        query: { active: true, page_size: 100 },
        signal,
      }),
    select: (response) => response.data.results,
  });
}

type Repeatable = { client_request_id: string };

export type AssignInput = Placement & { notes: string } & Repeatable;
export type StatusInput = {
  to_status: AssetStatus;
  reason: string;
  into_custody?: boolean;
} & Repeatable;
export type FoundInput = {
  found_at_location_id: string;
  into_custody: boolean;
  notes: string;
} & Repeatable;
export type AssetUpdateInput = {
  lot_number: string;
  critical_observations: string;
  computer_details?: Partial<ComputerDetails>;
};
export type DiscoverInput = UnitInput & {
  item_id: string;
  found_at_location_id: string;
  into_custody: boolean;
  notes: string;
  candidate_receipt_line_id?: string;
  candidate_acquisition_id?: string;
} & Repeatable;

export type Assigned = Asset & { linked_peripherals: AssetRef[] };

export function useAssetActions(id: string) {
  const reload = useReloadAssets();
  const settle = { onSettled: reload };
  const base = `/assets/${id}`;
  return {
    assign: useMutation({
      mutationFn: (input: AssignInput) =>
        apiPost<Assigned>(`${base}/assign/`, input),
      ...settle,
    }),
    giveBack: useMutation({
      mutationFn: (input: { condition_notes: string } & Repeatable) =>
        apiPost<Asset>(`${base}/return/`, input),
      ...settle,
    }),
    relocate: useMutation({
      mutationFn: (
        input: { location_id: string; reason: string } & Repeatable,
      ) => apiPost<Asset>(`${base}/location/`, input),
      ...settle,
    }),
    changeStatus: useMutation({
      mutationFn: (input: StatusInput) =>
        apiPost<Asset>(`${base}/status/`, input),
      ...settle,
    }),
    found: useMutation({
      mutationFn: (input: FoundInput) =>
        apiPost<Asset>(`${base}/found/`, input),
      ...settle,
    }),
    update: useMutation({
      mutationFn: (input: AssetUpdateInput) =>
        apiPatch<Asset>(`${base}/`, input),
      ...settle,
    }),
    link: useMutation({
      mutationFn: ({
        asset_id,
        ...input
      }: {
        asset_id: string;
        related_asset_id: string;
        kind: RelationshipKind;
      }) => apiPost<Relationship>(`/assets/${asset_id}/relationships/`, input),
      ...settle,
    }),
    unlink: useMutation({
      mutationFn: (relationshipId: string) =>
        apiDelete<null>(`${base}/relationships/${relationshipId}/`),
      ...settle,
    }),
  };
}

export function useDiscoverAsset() {
  const reload = useReloadAssets();
  return useMutation({
    mutationFn: (input: DiscoverInput) =>
      apiPost<Asset>('/assets/discover/', input),
    onSettled: reload,
  });
}

export async function searchAssets(
  regionId: string,
  assetClass: string,
  term: string,
  signal: AbortSignal,
): Promise<PickerResult> {
  const response = await apiGet<Paginated<Asset>>('/assets/', {
    query: {
      region: regionId,
      asset_class: assetClass,
      search: term,
      page_size: PICKER_PAGE_SIZE,
    },
    signal,
  });
  return {
    options: response.data.results.map((asset) => ({
      value: asset.id,
      label: `${asset.asset_tag} · ${asset.item.name}`,
      description: [asset.serial_number, holderOf(asset)]
        .filter(Boolean)
        .join(' · '),
    })),
    total: response.data.pagination.count,
  };
}
