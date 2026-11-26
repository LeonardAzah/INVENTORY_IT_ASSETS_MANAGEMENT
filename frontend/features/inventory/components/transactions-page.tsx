'use client';

import Link from 'next/link';

import { DataTable, type Column } from '@/components/shared/data-table';
import {
  DateFilter,
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
import { formatDateTime, today } from '@/lib/format/date';
import { formatQuantity, isZeroQuantity } from '@/lib/format/quantity';
import { useListParams } from '@/lib/url/list-params';

import { useTransactionList, useWarehouseOptions } from '../api';
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_OPTIONS,
  type Transaction,
} from '../types';

const FILTERS = [
  'warehouse',
  'item',
  'type',
  'occurred_at_from',
  'occurred_at_to',
] as const;

const NUMBER = 'text-right tabular-nums whitespace-nowrap';

const DOCUMENT_PAGES: Record<string, string> = {
  RECEIPT: '/inventory/receipts',
  ISSUE: '/inventory/issues',
  RETURN: '/inventory/returns',
  ADJUSTMENT: '/inventory/adjustments',
};

const change = (value: string, entry: Transaction) =>
  formatQuantity(value, {
    decimalPlaces: entry.item.decimal_places,
    signed: true,
  });

const COLUMNS: Column<Transaction>[] = [
  {
    id: 'when',
    header: 'Recorded',
    sortField: 'occurred_at',
    className: 'whitespace-nowrap',
    cell: (entry) => formatDateTime(entry.occurred_at),
  },
  {
    id: 'reference',
    header: 'Reference',
    primary: true,
    className: 'whitespace-nowrap',
    cell: (entry) =>
      entry.source_id && DOCUMENT_PAGES[entry.source_type] ? (
        <Link
          href={`${DOCUMENT_PAGES[entry.source_type]}/${entry.source_id}`}
          className={ROW_LINK}
        >
          {entry.reference}
        </Link>
      ) : (
        entry.reference
      ),
  },
  {
    id: 'type',
    header: 'Type',
    cell: (entry) => TRANSACTION_TYPE_LABELS[entry.type] ?? entry.type,
  },
  {
    id: 'warehouse',
    header: 'Warehouse',
    cell: (entry) => entry.warehouse.code,
  },
  {
    id: 'item',
    header: 'Item',
    cell: (entry) => (
      <span className="flex flex-col">
        {entry.item.name}
        <span className="text-xs text-neutral-600">{entry.item.code}</span>
      </span>
    ),
  },
  {
    id: 'change',
    header: 'Change',
    className: NUMBER,
    cell: (entry) => (
      <span className="font-medium">{`${change(entry.quantity_delta, entry)} ${entry.item.unit}`}</span>
    ),
  },
  {
    id: 'unavailable',
    header: 'Unavailable',
    className: NUMBER,
    cell: (entry) =>
      isZeroQuantity(entry.unavailable_delta)
        ? '–'
        : change(entry.unavailable_delta, entry),
  },
  {
    id: 'after',
    header: 'On hand after',
    className: NUMBER,
    cell: (entry) =>
      formatQuantity(entry.on_hand_after, {
        decimalPlaces: entry.item.decimal_places,
      }),
  },
  { id: 'by', header: 'By', cell: (entry) => entry.actor },
];

export function TransactionsPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useTransactionList(
    list.query,
  );
  const filters = list.state.filters;
  const warehouses = useWarehouseOptions();
  const latest = today();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Ledger"
        description="Every movement of stock, newest first. A movement is never edited or deleted: a mistake is corrected by a new adjustment, which appears here as its own line."
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search the ledger"
            placeholder="Search by reference"
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
            aria-label="Type"
            noneLabel="Any type"
            value={filters.type}
            onChange={(type) => list.update({ filters: { type } })}
            options={TRANSACTION_TYPE_OPTIONS}
          />
        </FilterSlot>
        <DateFilter
          label="Recorded from"
          value={filters.occurred_at_from}
          max={filters.occurred_at_to || latest}
          onChange={(occurred_at_from) =>
            list.update({ filters: { occurred_at_from } })
          }
        />
        <DateFilter
          label="Recorded to"
          value={filters.occurred_at_to}
          min={filters.occurred_at_from || undefined}
          max={latest}
          onChange={(occurred_at_to) =>
            list.update({ filters: { occurred_at_to } })
          }
        />
        {filters.item ? (
          <Badge variant="outline" className="self-start sm:self-end">
            One item only
          </Badge>
        ) : null}
      </FilterBar>
      <DataTable
        caption="Ledger"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(entry) => entry.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No movements match"
              description="Try a different search, type or period."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No movements yet"
              description="Nothing has been received in the warehouses you can see."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="movements"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
    </div>
  );
}
