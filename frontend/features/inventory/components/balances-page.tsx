'use client';

import {
  BellRing,
  History,
  ScanBarcode,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Can } from '@/components/shared/can';
import { DataTable, type Column } from '@/components/shared/data-table';
import {
  FilterBar,
  FilterSlot,
  Pagination,
  SearchInput,
} from '@/components/shared/list-controls';
import { PageHeader } from '@/components/shared/page-header';
import { SelectField } from '@/components/shared/select-field';
import { EmptyState } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROW_LINK } from '@/features/accounts/components/shared';
import { useCurrentUser } from '@/features/auth/session';
import { useCatalogueOptions } from '@/features/catalogue/api';
import { typeLabel } from '@/features/catalogue/types';
import { formatDateTime } from '@/lib/format/date';
import { formatQuantity, isZeroQuantity } from '@/lib/format/quantity';
import { can } from '@/lib/permissions/codes';
import { useListParams } from '@/lib/url/list-params';

import { useBalanceList, useWarehouseOptions } from '../api';
import { LOW_STOCK_OPTIONS, UNAVAILABLE_OPTIONS, type Balance } from '../types';
import { ThresholdDialog } from './threshold-dialog';

const FILTERS = [
  'warehouse',
  'item',
  'category',
  'below_threshold',
  'has_unavailable',
] as const;

const NUMBER = 'text-right tabular-nums whitespace-nowrap';

const quantity = (value: string | null, balance: Balance) =>
  formatQuantity(value, { decimalPlaces: balance.item.decimal_places });

const COLUMNS: Column<Balance>[] = [
  {
    id: 'item',
    header: 'Item',
    sortField: 'item__code',
    primary: true,
    cell: (balance) => (
      <span className="flex flex-col">
        <Link href={`/catalogue/items/${balance.item.id}`} className={ROW_LINK}>
          {balance.item.name}
        </Link>
        <span className="text-xs font-normal text-neutral-600">
          {balance.item.code}
        </span>
      </span>
    ),
  },
  {
    id: 'warehouse',
    header: 'Warehouse',
    cell: (balance) => balance.warehouse.name,
  },
  {
    id: 'on_hand',
    header: 'On hand',
    sortField: 'quantity_on_hand',
    className: NUMBER,
    cell: (balance) =>
      `${quantity(balance.on_hand, balance)} ${balance.item.unit}`,
  },
  {
    id: 'unavailable',
    header: 'Unavailable',
    className: NUMBER,
    cell: (balance) =>
      isZeroQuantity(balance.unavailable)
        ? '–'
        : quantity(balance.unavailable, balance),
  },
  {
    id: 'available',
    header: 'Available',
    className: NUMBER,
    cell: (balance) => (
      <span className="inline-flex items-center justify-end gap-2">
        {balance.below_threshold ? (
          <Badge variant="outline">Low stock</Badge>
        ) : null}
        <span className="font-medium">
          {quantity(balance.available, balance)}
        </span>
      </span>
    ),
  },
  {
    id: 'threshold',
    header: 'Threshold',
    className: NUMBER,
    cell: (balance) =>
      balance.threshold === null ? (
        <span className="text-neutral-600">Not set</span>
      ) : (
        quantity(balance.threshold, balance)
      ),
  },
  {
    id: 'last',
    header: 'Last movement',
    sortField: 'last_movement_at',
    className: 'whitespace-nowrap',
    cell: (balance) => formatDateTime(balance.last_movement_at),
  },
];

export function BalancesPage() {
  const router = useRouter();
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useBalanceList(
    list.query,
  );
  const filters = list.state.filters;
  const warehouses = useWarehouseOptions();
  const categories = useCatalogueOptions('categories');
  const [editing, setEditing] = useState<Balance | null>(null);
  const me = useCurrentUser();
  const mayAdjust = (balance: Balance) =>
    can(me, 'INVENTORY_ADJUST') &&
    me.warehouse_ids.includes(balance.warehouse.id);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Stock balances"
        description="What each warehouse holds, as recorded by the backend. Available is what can be issued: on hand less what is unavailable. In an IT warehouse, available counts the registered assets ready to assign."
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search stock"
            placeholder="Search by item code or name"
            value={list.state.search}
            onChange={(search) => list.update({ search })}
          />
        }
      >
        <FilterSlot>
          <SelectField
            aria-label="Warehouse"
            noneLabel="All warehouses"
            value={filters.warehouse}
            onChange={(warehouse) => list.update({ filters: { warehouse } })}
            options={warehouses.data?.options ?? []}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Category"
            noneLabel="All categories"
            value={filters.category}
            onChange={(category) => list.update({ filters: { category } })}
            options={(categories.data?.records ?? []).map((category) => ({
              value: category.id,
              label: `${category.name} · ${typeLabel(category.warehouse_type)}`,
            }))}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Stock level"
            noneLabel="Any stock level"
            value={filters.below_threshold}
            onChange={(below_threshold) =>
              list.update({ filters: { below_threshold } })
            }
            options={LOW_STOCK_OPTIONS}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Unavailable stock"
            noneLabel="With or without unavailable"
            value={filters.has_unavailable}
            onChange={(has_unavailable) =>
              list.update({ filters: { has_unavailable } })
            }
            options={UNAVAILABLE_OPTIONS}
          />
        </FilterSlot>
        {filters.item ? (
          <Badge variant="outline" className="self-start sm:self-auto">
            One item only
          </Badge>
        ) : null}
      </FilterBar>
      <DataTable
        caption="Stock balances"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(balance) => balance.id}
        actions={(balance) => (
          <span className="inline-flex flex-wrap justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                router.push(
                  `/inventory/transactions?warehouse=${balance.warehouse.id}&item=${balance.item.id}`,
                )
              }
            >
              <History aria-hidden />
              Movements
            </Button>
            {balance.item.tracks_units ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  router.push(
                    `/inventory/units?warehouse=${balance.warehouse.id}&item=${balance.item.id}`,
                  )
                }
                aria-label={`Serial numbers of ${balance.item.name} in ${balance.warehouse.name}`}
              >
                <ScanBarcode aria-hidden />
                Serial numbers
              </Button>
            ) : null}
            <Can anyOf={['INVENTORY_THRESHOLD_SET']}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(balance)}
                aria-label={`Set the threshold of ${balance.item.name} in ${balance.warehouse.name}`}
              >
                <BellRing aria-hidden />
                Threshold
              </Button>
            </Can>
            {mayAdjust(balance) ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  router.push(
                    `/inventory/adjustments/new?warehouse=${balance.warehouse.id}&item=${balance.item.id}`,
                  )
                }
                aria-label={`Adjust ${balance.item.name} in ${balance.warehouse.name}`}
              >
                <SlidersHorizontal aria-hidden />
                Adjust
              </Button>
            ) : null}
          </span>
        )}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No stock matches"
              description="Try a different search or filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No stock to show"
              description="The warehouses you can see have never held any stock. A balance appears with an item's first receipt."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="balances"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {editing ? (
        <ThresholdDialog
          key={editing.id}
          balance={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
