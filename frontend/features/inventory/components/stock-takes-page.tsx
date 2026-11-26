'use client';

import { Info, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { Can } from '@/components/shared/can';
import { DataTable, type Column } from '@/components/shared/data-table';
import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import {
  FilterBar,
  FilterSlot,
  Pagination,
  SearchInput,
} from '@/components/shared/list-controls';
import { PageHeader } from '@/components/shared/page-header';
import { SelectField } from '@/components/shared/select-field';
import { EmptyState, errorMessage } from '@/components/shared/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROW_LINK } from '@/features/accounts/components/shared';
import { formatDateTime } from '@/lib/format/date';
import { useListParams } from '@/lib/url/list-params';

import {
  useOperableWarehouses,
  useStartStockTake,
  useStockTakeList,
  useWarehouseOptions,
} from '../api';
import {
  STOCK_TAKE_STATUS_LABELS,
  STOCK_TAKE_STATUS_OPTIONS,
  type StockTake,
  type StockTakeStatus,
} from '../types';

const FILTERS = ['warehouse', 'status'] as const;

const STATUS_VARIANT = {
  DRAFT: 'outline',
  COMPLETED: 'default',
  CANCELLED: 'secondary',
} as const;

export function StockTakeStatusBadge({ status }: { status: StockTakeStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>
      {STOCK_TAKE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const COLUMNS: Column<StockTake>[] = [
  {
    id: 'reference',
    header: 'Reference',
    primary: true,
    className: 'whitespace-nowrap',
    cell: (stockTake) => (
      <Link
        href={`/inventory/stock-takes/${stockTake.id}`}
        className={ROW_LINK}
      >
        {stockTake.reference}
      </Link>
    ),
  },
  {
    id: 'warehouse',
    header: 'Warehouse',
    cell: (stockTake) => stockTake.warehouse.name,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (stockTake) => <StockTakeStatusBadge status={stockTake.status} />,
  },
  {
    id: 'lines',
    header: 'Items counted',
    className: 'text-right tabular-nums',
    cell: (stockTake) => stockTake.lines.length,
  },
  {
    id: 'adjusted',
    header: 'Adjusted',
    className: 'text-right tabular-nums',
    cell: (stockTake) =>
      stockTake.status === 'COMPLETED'
        ? stockTake.lines.filter((line) => line.adjustment).length
        : '–',
  },
  {
    id: 'started',
    header: 'Started',
    sortField: 'started_at',
    className: 'whitespace-nowrap',
    cell: (stockTake) => formatDateTime(stockTake.started_at),
  },
  { id: 'by', header: 'Started by', cell: (stockTake) => stockTake.started_by },
  {
    id: 'closed',
    header: 'Closed',
    className: 'whitespace-nowrap',
    cell: (stockTake) => formatDateTime(stockTake.completed_at),
  },
];

export function StockTakesPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useStockTakeList(
    list.query,
  );
  const filters = list.state.filters;
  const warehouses = useWarehouseOptions();
  const [starting, setStarting] = useState(false);
  const start = (
    <Can anyOf={['INVENTORY_STOCK_TAKE']}>
      <Button onClick={() => setStarting(true)}>
        <Plus aria-hidden />
        Start a stock-take
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Stock-takes"
        description="Counts of a general warehouse. Completing one adjusts the stock of every item whose count differs, each with its reason."
        actions={start}
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search stock-takes"
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
            aria-label="Status"
            noneLabel="Any status"
            value={filters.status}
            onChange={(status) => list.update({ filters: { status } })}
            options={STOCK_TAKE_STATUS_OPTIONS}
          />
        </FilterSlot>
      </FilterBar>
      <DataTable
        caption="Stock-takes"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(stockTake) => stockTake.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No stock-takes match"
              description="Try a different search or filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No stock-takes yet"
              description="The warehouses you can see have never been counted."
              action={start}
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="stock-takes"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {starting ? <StartDialog onClose={() => setStarting(false)} /> : null}
    </div>
  );
}

function StartDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const warehouses = useOperableWarehouses('stock-take');
  const start = useStartStockTake();
  const options = warehouses.data ?? [];
  const [chosen, setChosen] = useState('');
  const [missing, setMissing] = useState(false);
  const warehouseId = chosen || (options.length === 1 ? options[0].id : '');
  const open = useStockTakeList(
    { warehouse: warehouseId, status: 'DRAFT', page_size: 1 },
    Boolean(warehouseId),
  );
  const existing = warehouseId ? open.data?.results[0] : undefined;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!warehouseId) {
      setMissing(true);
      return;
    }
    if (existing) {
      onClose();
      router.push(`/inventory/stock-takes/${existing.id}`);
      return;
    }
    start.mutate(warehouseId, {
      onSuccess: (response) => {
        toast.success(response.message);
        onClose();
        router.push(`/inventory/stock-takes/${response.data.id}`);
      },
    });
  };

  return (
    <FormDialog
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title="Start a stock-take"
      description="The warehouse keeps working while it is counted. Nothing changes in the stock until the count is completed."
      onSubmit={submit}
      submitLabel={existing ? 'Open that count' : 'Start the count'}
      submittingLabel="Starting…"
      isSubmitting={start.isPending}
      error={
        start.error
          ? errorMessage(start.error)
          : warehouses.error
            ? errorMessage(warehouses.error)
            : null
      }
    >
      {!warehouses.isLoading && !warehouses.error && options.length === 0 ? (
        <p className="text-sm text-neutral-600">
          A general warehouse is counted by its Store Keeper. No active
          warehouse is yours to count.
        </p>
      ) : (
        <Field
          label="Warehouse"
          required
          error={missing && !warehouseId ? 'Choose the warehouse.' : undefined}
        >
          {(control) => (
            <SelectField
              {...control}
              placeholder={
                warehouses.isLoading ? 'Loading…' : 'Choose a warehouse'
              }
              disabled={warehouses.isLoading}
              value={warehouseId}
              onChange={setChosen}
              options={options.map((option) => ({
                value: option.id,
                label: `${option.name} (${option.code})`,
              }))}
            />
          )}
        </Field>
      )}
      {existing ? (
        <Alert variant="default">
          <Info aria-hidden />
          <AlertTitle>A count is already open</AlertTitle>
          <AlertDescription>
            {existing.reference} was started on{' '}
            {formatDateTime(existing.started_at)}. Complete or cancel it before
            starting another.
          </AlertDescription>
        </Alert>
      ) : null}
    </FormDialog>
  );
}
