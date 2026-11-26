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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ROW_LINK } from '@/features/accounts/components/shared';
import { formatDateTime, today } from '@/lib/format/date';
import { formatQuantity, isZeroQuantity } from '@/lib/format/quantity';
import { useListParams } from '@/lib/url/list-params';
import { useRouter } from 'next/navigation';

import { useAdjustment, useAdjustmentList, useWarehouseOptions } from '../api';
import {
  ADJUSTMENT_KIND_LABELS,
  ADJUSTMENT_KIND_OPTIONS,
  type Adjustment,
} from '../types';
import { SerialLinks } from './unit-fields';
import { BackLink, Detail, DocumentShell, Movements } from './document-detail';

const FILTERS = [
  'warehouse',
  'item',
  'kind',
  'created_at_from',
  'created_at_to',
] as const;

const NUMBER = 'text-right tabular-nums whitespace-nowrap';

const signed = (value: string, adjustment: Adjustment) =>
  formatQuantity(value, {
    decimalPlaces: adjustment.item.decimal_places,
    signed: true,
  });
const plain = (value: string, adjustment: Adjustment) =>
  formatQuantity(value, { decimalPlaces: adjustment.item.decimal_places });

const COLUMNS: Column<Adjustment>[] = [
  {
    id: 'reference',
    header: 'Reference',
    primary: true,
    className: 'whitespace-nowrap',
    cell: (adjustment) => (
      <Link
        href={`/inventory/adjustments/${adjustment.id}`}
        className={ROW_LINK}
      >
        {adjustment.reference}
      </Link>
    ),
  },
  {
    id: 'at',
    header: 'Recorded',
    sortField: 'created_at',
    className: 'whitespace-nowrap',
    cell: (adjustment) => formatDateTime(adjustment.created_at),
  },
  {
    id: 'warehouse',
    header: 'Warehouse',
    cell: (adjustment) => adjustment.warehouse.code,
  },
  {
    id: 'item',
    header: 'Item',
    cell: (adjustment) => (
      <span className="flex flex-col">
        {adjustment.item.name}
        <span className="text-xs text-neutral-600">{adjustment.item.code}</span>
      </span>
    ),
  },
  {
    id: 'kind',
    header: 'Kind',
    cell: (adjustment) => (
      <span className="inline-flex flex-wrap items-center gap-2">
        {ADJUSTMENT_KIND_LABELS[adjustment.kind] ?? adjustment.kind}
        {adjustment.stock_take_line ? (
          <Badge variant="outline">Stock-take</Badge>
        ) : null}
      </span>
    ),
  },
  {
    id: 'change',
    header: 'On hand',
    className: NUMBER,
    cell: (adjustment) => (
      <span className="font-medium">{`${signed(adjustment.quantity_delta, adjustment)} ${adjustment.item.unit}`}</span>
    ),
  },
  {
    id: 'unavailable',
    header: 'Unavailable',
    className: NUMBER,
    cell: (adjustment) =>
      isZeroQuantity(adjustment.unavailable_delta)
        ? '–'
        : signed(adjustment.unavailable_delta, adjustment),
  },
  {
    id: 'after',
    header: 'On hand after',
    className: NUMBER,
    cell: (adjustment) => plain(adjustment.resulting_on_hand, adjustment),
  },
  {
    id: 'reason',
    header: 'Reason',
    className: 'max-w-64 wrap-break-word',
    cell: (adjustment) => adjustment.reason,
  },
];

export function AdjustmentsPage() {
  const router = useRouter();
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useAdjustmentList(
    list.query,
  );
  const filters = list.state.filters;
  const warehouses = useWarehouseOptions();
  const latest = today();
  const create = (
    <Can anyOf={['INVENTORY_ADJUST']}>
      <Button onClick={() => router.push('/inventory/adjustments/new')}>
        <Plus aria-hidden />
        New adjustment
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Adjustments"
        description="Corrections of general stock, each with its reason, newest first. An adjustment is never edited or deleted: it is corrected by another one."
        actions={create}
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search adjustments"
            placeholder="Search by reference or reason"
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
            aria-label="Kind"
            noneLabel="Any kind"
            value={filters.kind}
            onChange={(kind) => list.update({ filters: { kind } })}
            options={ADJUSTMENT_KIND_OPTIONS}
          />
        </FilterSlot>
        <DateFilter
          label="Recorded from"
          value={filters.created_at_from}
          max={filters.created_at_to || latest}
          onChange={(created_at_from) =>
            list.update({ filters: { created_at_from } })
          }
        />
        <DateFilter
          label="Recorded to"
          value={filters.created_at_to}
          min={filters.created_at_from || undefined}
          max={latest}
          onChange={(created_at_to) =>
            list.update({ filters: { created_at_to } })
          }
        />
        {filters.item ? (
          <Badge variant="outline" className="self-start sm:self-end">
            One item only
          </Badge>
        ) : null}
      </FilterBar>
      <DataTable
        caption="Adjustments"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(adjustment) => adjustment.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No adjustments match"
              description="Try a different search, kind or period."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No adjustments yet"
              description="The stock of the warehouses you can see has never been corrected."
              action={create}
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="adjustments"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
    </div>
  );
}

export function AdjustmentDetail({ id }: { id: string }) {
  const query = useAdjustment(id);
  const adjustment = query.data;
  return (
    <DocumentShell
      query={query}
      found={Boolean(adjustment)}
      noun="adjustment"
      back={{ href: '/inventory/adjustments', label: 'Adjustments' }}
    >
      {adjustment ? (
        <>
          <BackLink href="/inventory/adjustments" label="Adjustments" />
          <PageHeader
            title={adjustment.reference}
            description="A recorded adjustment. It cannot be changed or deleted: a mistake is corrected by another adjustment."
            actions={<Movements reference={adjustment.reference} />}
          />
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {ADJUSTMENT_KIND_LABELS[adjustment.kind] ?? adjustment.kind}
                {adjustment.stock_take_line ? (
                  <Badge variant="outline">Made by a stock-take</Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail term="Warehouse">
                  <Link
                    href={`/warehouses/${adjustment.warehouse.id}`}
                    className={`${ROW_LINK} underline`}
                  >
                    {adjustment.warehouse.name}
                  </Link>{' '}
                  ({adjustment.warehouse.code})
                </Detail>
                <Detail term="Item">
                  <Link
                    href={`/catalogue/items/${adjustment.item.id}`}
                    className={`${ROW_LINK} underline`}
                  >
                    {adjustment.item.name}
                  </Link>{' '}
                  ({adjustment.item.code})
                </Detail>
                <Detail term="Recorded">
                  {formatDateTime(adjustment.created_at)}
                </Detail>
                <Detail term="Change on hand">
                  <span className="font-medium tabular-nums">
                    {signed(adjustment.quantity_delta, adjustment)}{' '}
                    {adjustment.item.unit}
                  </span>
                </Detail>
                <Detail term="Change in unavailable stock">
                  <span className="tabular-nums">
                    {isZeroQuantity(adjustment.unavailable_delta)
                      ? 'None'
                      : signed(adjustment.unavailable_delta, adjustment)}
                  </span>
                </Detail>
                <Detail term="On hand, before and after">
                  <span className="tabular-nums">
                    {plain(adjustment.previous_on_hand, adjustment)} →{' '}
                    {plain(adjustment.resulting_on_hand, adjustment)}{' '}
                    {adjustment.item.unit}
                  </span>
                </Detail>
                <Detail term="Recorded by">{adjustment.created_by}</Detail>
                {adjustment.units.length > 0 ? (
                  <Detail term="Units" className="sm:col-span-2 lg:col-span-3">
                    <SerialLinks units={adjustment.units} />
                  </Detail>
                ) : null}
                <Detail term="Reason" className="sm:col-span-2">
                  <span className="whitespace-pre-line">
                    {adjustment.reason}
                  </span>
                </Detail>
              </dl>
            </CardContent>
          </Card>
        </>
      ) : null}
    </DocumentShell>
  );
}
