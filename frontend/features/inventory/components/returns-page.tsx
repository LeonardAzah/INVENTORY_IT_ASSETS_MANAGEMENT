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

import { useReturnList, useWarehouseOptions } from '../api';
import {
  CONDITION_OPTIONS,
  employeeName,
  LINKED_OPTIONS,
  type StockReturn,
} from '../types';
import { useRouter } from 'next/navigation';

const FILTERS = [
  'warehouse',
  'employee',
  'condition',
  'linked',
  'return_date_from',
  'return_date_to',
] as const;

function contents(stockReturn: StockReturn): string {
  const [first, ...others] = stockReturn.lines;
  if (!first) {
    return '–';
  }
  return others.length === 0
    ? first.item.name
    : `${first.item.name} and ${others.length} more`;
}

const COLUMNS: Column<StockReturn>[] = [
  {
    id: 'reference',
    header: 'Reference',
    primary: true,
    className: 'whitespace-nowrap',
    cell: (stockReturn) => (
      <Link href={`/inventory/returns/${stockReturn.id}`} className={ROW_LINK}>
        {stockReturn.reference}
      </Link>
    ),
  },
  {
    id: 'date',
    header: 'Return date',
    sortField: 'return_date',
    className: 'whitespace-nowrap',
    cell: (stockReturn) => formatDate(stockReturn.return_date),
  },
  {
    id: 'warehouse',
    header: 'Warehouse',
    cell: (stockReturn) => stockReturn.warehouse.name,
  },
  {
    id: 'employee',
    header: 'Returned by',
    cell: (stockReturn) => (
      <span className="flex flex-col">
        {employeeName(stockReturn.employee)}
        <span className="text-xs text-neutral-600">
          {stockReturn.employee.matricule}
        </span>
      </span>
    ),
  },
  {
    id: 'issue',
    header: 'Against issue',
    className: 'whitespace-nowrap',
    cell: (stockReturn) =>
      stockReturn.issue ? (
        <Link
          href={`/inventory/issues/${stockReturn.issue.id}`}
          className={ROW_LINK}
        >
          {stockReturn.issue.reference}
        </Link>
      ) : (
        <span className="text-neutral-600">None</span>
      ),
  },
  {
    id: 'items',
    header: 'Items',
    cell: (stockReturn) => (
      <span className="inline-flex flex-wrap items-center gap-2">
        {contents(stockReturn)}
        {stockReturn.lines.some((line) => line.condition === 'DAMAGED') ? (
          <Badge variant="outline">Damaged</Badge>
        ) : null}
      </span>
    ),
  },
  {
    id: 'at',
    header: 'Recorded',
    className: 'whitespace-nowrap',
    cell: (stockReturn) => formatDateTime(stockReturn.created_at),
  },
];

export function ReturnsPage() {
  const router = useRouter();
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useReturnList(
    list.query,
  );
  const filters = list.state.filters;
  const warehouses = useWarehouseOptions();
  const latest = today();
  const create = (
    <Can anyOf={['INVENTORY_RETURN']}>
      <Button onClick={() => router.push('/inventory/returns/new')}>
        <Plus aria-hidden />
        New return
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Returns"
        description="Stock taken back from employees, newest first. To return what was issued, open the issue. A return is never edited or deleted."
        actions={create}
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search returns"
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
            aria-label="Condition"
            noneLabel="Any condition"
            value={filters.condition}
            onChange={(condition) => list.update({ filters: { condition } })}
            options={CONDITION_OPTIONS.map((option) => ({
              ...option,
              label: `With ${option.label.toLowerCase()} units`,
            }))}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Link to an issue"
            noneLabel="Linked or not"
            value={filters.linked}
            onChange={(linked) => list.update({ filters: { linked } })}
            options={LINKED_OPTIONS}
          />
        </FilterSlot>
        <DateFilter
          label="Returned from"
          value={filters.return_date_from}
          max={filters.return_date_to || latest}
          onChange={(return_date_from) =>
            list.update({ filters: { return_date_from } })
          }
        />
        <DateFilter
          label="Returned to"
          value={filters.return_date_to}
          min={filters.return_date_from || undefined}
          max={latest}
          onChange={(return_date_to) =>
            list.update({ filters: { return_date_to } })
          }
        />
        {filters.employee ? (
          <Badge variant="outline" className="self-start sm:self-end">
            One employee only
          </Badge>
        ) : null}
      </FilterBar>
      <DataTable
        caption="Returns"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(stockReturn) => stockReturn.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No returns match"
              description="Try a different search, filter or period."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No returns yet"
              description="Nothing has been returned to the warehouses you can see."
              action={create}
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="returns"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
    </div>
  );
}
