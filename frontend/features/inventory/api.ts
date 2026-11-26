import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { PickerResult } from '@/components/shared/entity-picker';
import { useCurrentUser } from '@/features/auth/session';
import type { Item } from '@/features/catalogue/types';
import type { Employee } from '@/features/employees/types';
import type { Ref } from '@/features/auth/types';
import type { Warehouse, WarehouseType } from '@/features/warehouses/types';
import {
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  type QueryValue,
} from '@/lib/api/client';
import type { Paginated } from '@/lib/api/envelope';
import { formatQuantity } from '@/lib/format/quantity';
import { can, type PermissionCode } from '@/lib/permissions/codes';

import type {
  Adjustment,
  AdjustmentKind,
  Balance,
  Issue,
  ItemRef,
  Receipt,
  ReturnCondition,
  StockReturn,
  StockTake,
  StockUnit,
  StockUnitDetail,
  Transaction,
} from './types';

type Query = Record<string, QueryValue>;

const OPTIONS_PAGE_SIZE = 100;

export const inventoryKeys = {
  all: ['inventory'] as const,
  balances: (query: Query) => ['inventory', 'balances', query] as const,
  transactions: (query: Query) => ['inventory', 'transactions', query] as const,
  warehouses: ['inventory', 'warehouse-options'] as const,
  operable: ['inventory', 'operable-warehouses'] as const,
  receipts: (query: Query) => ['inventory', 'receipts', 'list', query] as const,
  receipt: (id: string) => ['inventory', 'receipts', 'detail', id] as const,
  issues: (query: Query) => ['inventory', 'issues', 'list', query] as const,
  issue: (id: string) => ['inventory', 'issues', 'detail', id] as const,
  returns: (query: Query) => ['inventory', 'returns', 'list', query] as const,
  return: (id: string) => ['inventory', 'returns', 'detail', id] as const,
  adjustments: (query: Query) =>
    ['inventory', 'adjustments', 'list', query] as const,
  adjustment: (id: string) =>
    ['inventory', 'adjustments', 'detail', id] as const,
  stockTakes: (query: Query) =>
    ['inventory', 'stock-takes', 'list', query] as const,
  stockTake: (id: string) =>
    ['inventory', 'stock-takes', 'detail', id] as const,
  itemPicker: (type: WarehouseType, all = false) =>
    ['inventory', 'item-picker', type, all] as const,
  stockPicker: (warehouseId: string) =>
    ['inventory', 'stock-picker', warehouseId] as const,
  recipientPicker: (regionId: string, all = false) =>
    ['inventory', 'recipient-picker', regionId, all] as const,
  units: (query: Query) => ['inventory', 'units', 'list', query] as const,
  unit: (id: string) => ['inventory', 'units', 'detail', id] as const,
};

export function useBalanceList(query: Query, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.balances(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Balance>>('/inventory/', { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useTransactionList(query: Query) {
  return useQuery({
    queryKey: inventoryKeys.transactions(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Transaction>>('/inventory/transactions/', {
        query,
        signal,
      }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useWarehouseOptions() {
  return useQuery({
    queryKey: inventoryKeys.warehouses,
    queryFn: ({ signal }) =>
      apiGet<Paginated<Warehouse>>('/warehouses/', {
        query: { page_size: OPTIONS_PAGE_SIZE },
        signal,
      }),
    select: (response) => ({
      options: response.data.results.map((warehouse) => ({
        value: warehouse.id,
        label: `${warehouse.name} (${warehouse.code})`,
      })),
      truncated: response.data.pagination.count > response.data.results.length,
    }),
    staleTime: 5 * 60_000,
  });
}

export type ThresholdInput = {
  warehouse_id: string;
  item_id: string;
  threshold: string | null;
};

export function useSetThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ThresholdInput) =>
      apiPut<Balance>('/inventory/thresholds/', input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export type DocumentKind = 'receipt' | 'issue' | 'return';

const DOCUMENT_PATH: Record<DocumentKind, string> = {
  receipt: '/inventory/receipts/',
  issue: '/inventory/issues/',
  return: '/inventory/returns/',
};

export function useReceiptList(query: Query) {
  return useQuery({
    queryKey: inventoryKeys.receipts(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Receipt>>('/inventory/receipts/', { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useReceipt(id: string) {
  return useQuery({
    queryKey: inventoryKeys.receipt(id),
    queryFn: ({ signal }) =>
      apiGet<Receipt>(`/inventory/receipts/${id}/`, { signal }),
    select: (response) => response.data,
  });
}

export function useIssueList(query: Query) {
  return useQuery({
    queryKey: inventoryKeys.issues(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Issue>>('/inventory/issues/', { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useIssue(id: string, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.issue(id),
    queryFn: ({ signal }) =>
      apiGet<Issue>(`/inventory/issues/${id}/`, { signal }),
    select: (response) => response.data,
    enabled,
  });
}

export function useReturnList(query: Query) {
  return useQuery({
    queryKey: inventoryKeys.returns(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<StockReturn>>('/inventory/returns/', { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useReturn(id: string) {
  return useQuery({
    queryKey: inventoryKeys.return(id),
    queryFn: ({ signal }) =>
      apiGet<StockReturn>(`/inventory/returns/${id}/`, { signal }),
    select: (response) => response.data,
  });
}

export type Operation = DocumentKind | 'adjustment' | 'stock-take';

const OPERATION: Record<Operation, PermissionCode> = {
  receipt: 'INVENTORY_RECEIVE',
  issue: 'INVENTORY_ISSUE',
  return: 'INVENTORY_RETURN',
  adjustment: 'INVENTORY_ADJUST',
  'stock-take': 'INVENTORY_STOCK_TAKE',
};

export function useOperableWarehouses(kind: Operation) {
  const me = useCurrentUser();
  const general = can(me, OPERATION[kind]);
  const it = kind === 'receipt' && can(me, 'IT_STOCK_RECEIVE');
  return useQuery({
    queryKey: inventoryKeys.operable,
    queryFn: ({ signal }) =>
      apiGet<Paginated<Warehouse>>('/warehouses/', {
        query: { is_active: true, page_size: OPTIONS_PAGE_SIZE },
        signal,
      }),
    select: (response) =>
      response.data.results.filter((warehouse) =>
        warehouse.type === 'IT'
          ? it && me.it_regions.includes(warehouse.region.id)
          : general && me.warehouse_ids.includes(warehouse.id),
      ),
    enabled: general || it,
  });
}

const PICKER_PAGE_SIZE = 20;

const itemRef = (item: Item): ItemRef => ({
  id: item.id,
  code: item.code,
  name: item.name,
  unit: item.unit.code,
  decimal_places: item.unit.decimal_places,
  tracks_units:
    item.tracking === 'SERIALIZED' && item.warehouse_type === 'GENERAL',
});

export async function searchItems(
  type: WarehouseType,
  term: string,
  signal: AbortSignal,
  remember: (item: ItemRef) => void,
  options: { includeInactive?: boolean } = {},
): Promise<PickerResult> {
  const response = await apiGet<Paginated<Item>>('/items/', {
    query: {
      warehouse_type: type,
      is_active: options.includeInactive ? undefined : true,
      search: term,
      page_size: PICKER_PAGE_SIZE,
    },
    signal,
  });
  return {
    options: response.data.results.map((item) => {
      remember(itemRef(item));
      return {
        value: item.id,
        label: item.name,
        description: `${item.code} · counted in ${item.unit.code}`,
      };
    }),
    total: response.data.pagination.count,
  };
}

export async function searchStock(
  warehouseId: string,
  term: string,
  signal: AbortSignal,
  remember: (balance: Balance) => void,
): Promise<PickerResult> {
  const response = await apiGet<Paginated<Balance>>('/inventory/', {
    query: {
      warehouse: warehouseId,
      search: term,
      page_size: PICKER_PAGE_SIZE,
    },
    signal,
  });
  return {
    options: response.data.results.map((balance) => {
      remember(balance);
      const available = formatQuantity(balance.available, {
        decimalPlaces: balance.item.decimal_places,
      });
      return {
        value: balance.item.id,
        label: balance.item.name,
        description: `${balance.item.code} · ${available} ${balance.item.unit} available`,
      };
    }),
    total: response.data.pagination.count,
  };
}

export async function searchRecipients(
  regionId: string,
  term: string,
  signal: AbortSignal,
  options: { includeInactive?: boolean } = {},
): Promise<PickerResult> {
  const response = await apiGet<Paginated<Employee>>('/employees/', {
    query: {
      region: regionId,
      is_active: options.includeInactive ? undefined : true,
      search: term,
      page_size: PICKER_PAGE_SIZE,
    },
    signal,
  });
  return {
    options: response.data.results.map((employee) => ({
      value: employee.id,
      label: `${employee.first_name} ${employee.last_name}`,
      description: `${employee.matricule} · ${employee.department.name}, ${employee.office.name}${employee.is_active ? '' : ' · inactive'}`,
    })),
    total: response.data.pagination.count,
  };
}

type DocumentBase = {
  warehouse_id: string;
  notes: string;
  client_request_id: string;
};

export type LineUnits = {
  serials?: string[];
  unit_ids?: string[];
  cross_item_serial_reason?: string;
};

export type ReceiptInput = DocumentBase & {
  receipt_date: string;
  source: string;
  lines: ({ item_id: string; quantity: string } & LineUnits)[];
};

export type IssueInput = DocumentBase & {
  issue_date: string;
  employee_id?: string;
  recipient_store_id?: string;
  lines: ({ item_id: string; quantity: string } & LineUnits)[];
};

export type ReturnInput = DocumentBase & {
  return_date: string;
  employee_id: string;
  issue_id: string | null;
  lines: ({
    item_id: string;
    quantity: string;
    condition: ReturnCondition;
  } & LineUnits)[];
};

export type DocumentInput = ReceiptInput | IssueInput | ReturnInput;

export function useRecipientStores(warehouseId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['inventory', 'recipient-stores', warehouseId] as const,
    queryFn: ({ signal }) =>
      apiGet<Ref[]>('/inventory/issues/recipient-stores/', {
        query: { warehouse: warehouseId },
        signal,
      }),
    select: (response) => response.data,
    enabled: enabled && warehouseId !== '',
  });
}

export function useCreateDocument(kind: DocumentKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentInput) =>
      apiPost<{ id: string; reference: string }>(DOCUMENT_PATH[kind], input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export function useAdjustmentList(query: Query) {
  return useQuery({
    queryKey: inventoryKeys.adjustments(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<Adjustment>>('/inventory/adjustments/', {
        query,
        signal,
      }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useAdjustment(id: string) {
  return useQuery({
    queryKey: inventoryKeys.adjustment(id),
    queryFn: ({ signal }) =>
      apiGet<Adjustment>(`/inventory/adjustments/${id}/`, { signal }),
    select: (response) => response.data,
  });
}

export type AdjustmentInput = {
  warehouse_id: string;
  item_id: string;
  kind: AdjustmentKind;
  quantity: string;
  reason: string;
  client_request_id: string;
} & LineUnits;

export function useCreateAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdjustmentInput) =>
      apiPost<Adjustment>('/inventory/adjustments/', input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export function useStockTakeList(query: Query, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.stockTakes(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<StockTake>>('/inventory/stock-takes/', {
        query,
        signal,
      }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useStockTake(id: string) {
  return useQuery({
    queryKey: inventoryKeys.stockTake(id),
    queryFn: ({ signal }) =>
      apiGet<StockTake>(`/inventory/stock-takes/${id}/`, { signal }),
    select: (response) => response.data,
  });
}

export function useStartStockTake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (warehouseId: string) =>
      apiPost<StockTake>('/inventory/stock-takes/', {
        warehouse_id: warehouseId,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export type CountInput =
  | { item_id: string; counted_quantity: string }
  | { item_id: string; serials: string[] };

export function useStockTakeActions(id: string) {
  const queryClient = useQueryClient();
  const settle = {
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  };
  return {
    saveCounts: useMutation({
      mutationFn: (lines: CountInput[]) =>
        apiPatch<StockTake>(`/inventory/stock-takes/${id}/lines/`, { lines }),
      ...settle,
    }),
    complete: useMutation({
      mutationFn: (reasons: Record<string, string>) =>
        apiPost<StockTake>(`/inventory/stock-takes/${id}/complete/`, {
          reasons,
        }),
      ...settle,
    }),
    cancel: useMutation({
      mutationFn: () =>
        apiPost<StockTake>(`/inventory/stock-takes/${id}/cancel/`, {}),
      ...settle,
    }),
  };
}

export function useUnitList(query: Query, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.units(query),
    queryFn: ({ signal }) =>
      apiGet<Paginated<StockUnit>>('/inventory/units/', { query, signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useUnit(id: string) {
  return useQuery({
    queryKey: inventoryKeys.unit(id),
    queryFn: ({ signal }) =>
      apiGet<StockUnitDetail>(`/inventory/units/${id}/`, { signal }),
    select: (response) => response.data,
  });
}
