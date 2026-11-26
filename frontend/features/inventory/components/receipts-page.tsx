'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';

import { Can } from '@/components/shared/can';
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
import { formatDate, formatDateTime, today } from '@/lib/format/date';
import { useListParams } from '@/lib/url/list-params';

import { useReceiptList, useWarehouseOptions } from '../api';
import type { Receipt } from '../types';
import { useRouter } from 'next/navigation';

const FILTERS = [
  'warehouse',
  'item',
  'receipt_date_from',
  'receipt_date_to',
] as const;

function contents(receipt: Receipt): string {
  const [first, ...others] = receipt.lines;
  if (!first) {
    return '–';
  }
  return others.length === 0
    ? first.item.name
    : `${first.item.name} and ${others.length} more`;
}

const COLUMNS: Column<Receipt>[] = [
  {
    id: 'reference',
    header: 'Reference',
    sortField: 'reference',
    primary: true,
    className: 'whitespace-nowrap',
    cell: (receipt) => (
      <Link href={`/inventory/receipts/${receipt.id}`} className={ROW_LINK}>
        {receipt.reference}
      </Link>
    ),
  },
  {
    id: 'date',
    header: 'Receipt date',
    sortField: 'receipt_date',
    className: 'whitespace-nowrap',
    cell: (receipt) => formatDate(receipt.receipt_date),
  },
  {
    id: 'warehouse',
    header: 'Warehouse',
    cell: (receipt) => receipt.warehouse.name,
  },
  { id: 'source', header: 'Received from', cell: (receipt) => receipt.source },
  { id: 'items', header: 'Items', cell: contents },
  { id: 'by', header: 'Recorded by', cell: (receipt) => receipt.created_by },
  {
    id: 'at',
    header: 'Recorded',
    className: 'whitespace-nowrap',
    cell: (receipt) => formatDateTime(receipt.created_at),
  },
];

export function ReceiptsPage() {
  const router = useRouter();
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useReceiptList(
    list.query,
  );
  const filters = list.state.filters;
  const warehouses = useWarehouseOptions();
  const latest = today();
  const create = (
    <Can anyOf={['INVENTORY_RECEIVE', 'IT_STOCK_RECEIVE']}>
      <Button onClick={() => router.push('/inventory/receipts/new')}>
        <Plus aria-hidden />
        New receipt
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Receipts"
        description="Goods that arrived in a warehouse, newest first. A receipt is never edited or deleted."
        actions={create}
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search receipts"
            placeholder="Search by reference or source"
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
        <DateFilter
          label="Received from"
          value={filters.receipt_date_from}
          max={filters.receipt_date_to || latest}
          onChange={(receipt_date_from) =>
            list.update({ filters: { receipt_date_from } })
          }
        />
        <DateFilter
          label="Received to"
          value={filters.receipt_date_to}
          min={filters.receipt_date_from || undefined}
          max={latest}
          onChange={(receipt_date_to) =>
            list.update({ filters: { receipt_date_to } })
          }
        />
        {filters.item ? (
          <Badge variant="outline" className="self-start sm:self-end">
            One item only
          </Badge>
        ) : null}
      </FilterBar>
      <DataTable
        caption="Receipts"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(receipt) => receipt.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No receipts match"
              description="Try a different search, warehouse or period."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No receipts yet"
              description="Nothing has been received in the warehouses you can see."
              action={create}
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="receipts"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
    </div>
  );
}
