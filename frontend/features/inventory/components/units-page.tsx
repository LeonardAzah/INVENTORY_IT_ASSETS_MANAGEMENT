'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { DataTable, type Column } from '@/components/shared/data-table';
import {
  FilterBar,
  FilterSlot,
  Pagination,
  SearchInput,
} from '@/components/shared/list-controls';
import { PageHeader } from '@/components/shared/page-header';
import { SelectField } from '@/components/shared/select-field';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROW_LINK } from '@/features/accounts/components/shared';
import { isApiError } from '@/lib/api/errors';
import { EMPTY, formatDateTime } from '@/lib/format/date';
import { useListParams } from '@/lib/url/list-params';

import { useUnit, useUnitList, useWarehouseOptions } from '../api';
import {
  employeeName,
  TRANSACTION_TYPE_LABELS,
  UNIT_STATUS_LABELS,
  UNIT_STATUS_OPTIONS,
  type StockUnit,
  type StockUnitDetail,
  type UnitMovement,
  type UnitStatus,
} from '../types';
import { Detail } from './document-detail';

const FILTERS = ['warehouse', 'item', 'status', 'employee', 'issue'] as const;

const STATUS_VARIANT: Record<
  UnitStatus,
  'default' | 'outline' | 'secondary' | 'destructive'
> = {
  IN_STOCK: 'default',
  UNAVAILABLE: 'outline',
  ISSUED: 'secondary',
  WRITTEN_OFF: 'destructive',
};

function StatusBadge({ status }: { status: UnitStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>
      {UNIT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

function holder(unit: StockUnit): string {
  if (unit.issued_to_employee) {
    return `${employeeName(unit.issued_to_employee)} (${unit.issued_to_employee.matricule})`;
  }
  return unit.issued_to_store ? `${unit.issued_to_store.name}, a store` : EMPTY;
}

const COLUMNS: Column<StockUnit>[] = [
  {
    id: 'serial',
    header: 'Serial number',
    sortField: 'serial_normalized',
    primary: true,
    cell: (unit) => (
      <Link
        href={`/inventory/units/${unit.id}`}
        className={`${ROW_LINK} font-mono`}
      >
        {unit.serial_number}
      </Link>
    ),
  },
  {
    id: 'item',
    header: 'Item',
    cell: (unit) => (
      <span className="flex flex-col">
        {unit.item.name}
        <span className="text-xs text-neutral-600">{unit.item.code}</span>
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (unit) => <StatusBadge status={unit.status} />,
  },
  { id: 'warehouse', header: 'Warehouse', cell: (unit) => unit.warehouse.name },
  { id: 'holder', header: 'Issued to', cell: holder },
  {
    id: 'updated',
    header: 'Last change',
    sortField: 'updated_at',
    className: 'whitespace-nowrap',
    cell: (unit) => formatDateTime(unit.updated_at),
  },
];

export function UnitsPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useUnitList(
    list.query,
  );
  const filters = list.state.filters;
  const warehouses = useWarehouseOptions();
  const narrowed = Boolean(filters.item || filters.employee || filters.issue);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Serial numbers"
        description="Each unit of a serialized general item, by its serial number: where it is, and who it was issued to. These are stock, not IT assets."
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search units"
            placeholder="Search by serial number or item"
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
            aria-label="Status"
            noneLabel="Any status"
            value={filters.status}
            onChange={(status) => list.update({ filters: { status } })}
            options={UNIT_STATUS_OPTIONS}
          />
        </FilterSlot>
        {narrowed ? (
          <Badge variant="outline" className="self-start sm:self-auto">
            {filters.issue
              ? 'One issue only'
              : filters.employee
                ? 'One employee only'
                : 'One item only'}
          </Badge>
        ) : null}
      </FilterBar>
      <DataTable
        caption="Serial numbers"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(unit) => unit.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No unit matches"
              description="Try a different search or filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No serialized stock"
              description="Units appear here when a serialized general item is received, with the serial number of each one."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="units"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
    </div>
  );
}

const BACK_LINK =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

function BackLink() {
  return (
    <Link href="/inventory/units" className={BACK_LINK}>
      <ArrowLeft className="size-4" aria-hidden />
      Serial numbers
    </Link>
  );
}

/** The page of the document behind a movement, when this app has one. */
const DOCUMENT_PAGE: Record<string, string> = {
  RECEIPT: '/inventory/receipts/',
  ISSUE: '/inventory/issues/',
  RETURN: '/inventory/returns/',
  ADJUSTMENT: '/inventory/adjustments/',
};

const HISTORY_COLUMNS: Column<UnitMovement>[] = [
  {
    id: 'when',
    header: 'When',
    primary: true,
    className: 'whitespace-nowrap',
    cell: (step) => formatDateTime(step.occurred_at),
  },
  {
    id: 'type',
    header: 'Movement',
    cell: (step) => TRANSACTION_TYPE_LABELS[step.type] ?? step.type,
  },
  {
    id: 'reference',
    header: 'Document',
    cell: (step) =>
      DOCUMENT_PAGE[step.source_type] ? (
        <Link
          href={`${DOCUMENT_PAGE[step.source_type]}${step.source_id}`}
          className={ROW_LINK}
        >
          {step.reference}
        </Link>
      ) : (
        step.reference
      ),
  },
  { id: 'warehouse', header: 'Warehouse', cell: (step) => step.warehouse.name },
  {
    id: 'change',
    header: 'Status',
    cell: (step) =>
      `${step.from_status ? UNIT_STATUS_LABELS[step.from_status] : 'New'} → ${UNIT_STATUS_LABELS[step.to_status] ?? step.to_status}`,
  },
  { id: 'actor', header: 'Recorded by', cell: (step) => step.actor },
];

export function UnitDetail({ id }: { id: string }) {
  const { data: unit, error, isLoading, isFetching, refetch } = useUnit(id);

  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="Loading unit"
      >
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!unit) {
    const missing = isApiError(error) && error.kind === 'not_found';
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <div className="bg-card rounded-lg border">
          {missing ? (
            <EmptyState
              title="Unit not found"
              description="This unit does not exist, or it belongs to a warehouse you cannot see."
            />
          ) : (
            <ErrorState
              title="The unit could not be loaded"
              error={error}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          )}
        </div>
      </div>
    );
  }
  return <LoadedUnit unit={unit} isFetching={isFetching} />;
}

function LoadedUnit({
  unit,
  isFetching,
}: {
  unit: StockUnitDetail;
  isFetching: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={unit.serial_number}
        description={`A unit of ${unit.item.name} (${unit.item.code})`}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Unit
            <StatusBadge status={unit.status} />
          </CardTitle>
          <CardDescription>
            Stock of a general warehouse, identified by its serial number. It is
            not an IT asset.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail term="Item">
              <Link
                href={`/catalogue/items/${unit.item.id}`}
                className={`${ROW_LINK} underline`}
              >
                {unit.item.name}
              </Link>{' '}
              ({unit.item.code})
            </Detail>
            <Detail
              term={
                unit.status === 'ISSUED' || unit.status === 'WRITTEN_OFF'
                  ? 'Last warehouse'
                  : 'Warehouse'
              }
            >
              <Link
                href={`/warehouses/${unit.warehouse.id}`}
                className={`${ROW_LINK} underline`}
              >
                {unit.warehouse.name}
              </Link>{' '}
              ({unit.warehouse.code})
            </Detail>
            <Detail term="Issued to">{holder(unit)}</Detail>
            <Detail term="On issue">
              {unit.issue ? (
                <Link
                  href={`/inventory/issues/${unit.issue.id}`}
                  className={ROW_LINK}
                >
                  {unit.issue.reference}
                </Link>
              ) : (
                EMPTY
              )}
            </Detail>
            <Detail term="First recorded">
              {formatDateTime(unit.created_at)}
            </Detail>
            <Detail term="Last change">
              {formatDateTime(unit.updated_at)}
            </Detail>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>
            Every movement of this unit, oldest first. Each one is a line of the
            ledger.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            caption={`History of ${unit.serial_number}`}
            columns={HISTORY_COLUMNS}
            rows={unit.history}
            rowId={(step) => step.id}
            // The history comes in order with the unit; there is nothing to sort.
            ordering=""
            onOrderingChange={() => undefined}
            isLoading={false}
            isFetching={isFetching}
            error={null}
            onRetry={() => undefined}
            empty={
              <EmptyState
                title="No movement"
                description="This unit has not moved."
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
