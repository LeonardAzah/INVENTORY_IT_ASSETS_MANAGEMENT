'use client';

import { ListPlus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { DataTable, type Column } from '@/components/shared/data-table';
import {
  FilterBar,
  FilterSlot,
  Pagination,
} from '@/components/shared/list-controls';
import { PageHeader } from '@/components/shared/page-header';
import { SelectField } from '@/components/shared/select-field';
import { EmptyState } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROW_LINK } from '@/features/accounts/components/shared';
import { useCurrentUser } from '@/features/auth/session';
import { formatDate } from '@/lib/format/date';
import { can } from '@/lib/permissions/codes';
import { useListParams } from '@/lib/url/list-params';

import { usePendingRegistration } from '../api';
import { PENDING_SOURCE_OPTIONS, type PendingRow } from '../types';
import {
  BulkRegisterDialog,
  RegisterDialog,
  type RegisterSource,
} from './register-dialog';

const FILTERS = ['region', 'item', 'source_type'] as const;

const NUMBER = 'text-right tabular-nums whitespace-nowrap';

const rowId = (row: PendingRow) =>
  row.receipt_line_id ?? row.acquisition_id ?? row.reference;

const toSource = (row: PendingRow): RegisterSource => ({
  kind: row.source_type,
  id: rowId(row),
  reference: row.reference,
  item: row.item,
  region: row.region,
  remaining: row.remaining,
});

const COLUMNS: Column<PendingRow>[] = [
  {
    id: 'item',
    header: 'Item',
    primary: true,
    cell: (row) => (
      <span className="flex flex-col">
        <Link href={`/catalogue/items/${row.item.id}`} className={ROW_LINK}>
          {row.item.name}
        </Link>
        <span className="text-xs font-normal text-neutral-600">
          {row.item.code}
        </span>
      </span>
    ),
  },
  {
    id: 'source',
    header: 'Came in by',
    cell: (row) => (
      <span className="flex flex-col">
        {row.source_type === 'ALTERNATIVE_ACQUISITION' && row.acquisition_id ? (
          <Link
            href={`/it/acquisitions/${row.acquisition_id}`}
            className={ROW_LINK}
          >
            {row.reference}
          </Link>
        ) : (
          row.reference
        )}
        <span className="text-xs text-neutral-600">
          {row.source_type === 'RECEIPT' ? 'Receipt' : 'Acquisition'}
        </span>
      </span>
    ),
  },
  {
    id: 'date',
    header: 'Date',
    className: 'whitespace-nowrap',
    cell: (row) => formatDate(row.date),
  },
  { id: 'region', header: 'Region', cell: (row) => row.region.name },
  {
    id: 'quantity',
    header: 'Units',
    className: NUMBER,
    cell: (row) => row.quantity,
  },
  {
    id: 'registered',
    header: 'Registered',
    className: NUMBER,
    cell: (row) => row.registered,
  },
  {
    id: 'remaining',
    header: 'Still to register',
    className: NUMBER,
    cell: (row) => <span className="font-medium">{row.remaining}</span>,
  },
];

export function PendingRegistrationPage() {
  const me = useCurrentUser();
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } =
    usePendingRegistration(list.query);
  const filters = list.state.filters;
  const [dialog, setDialog] = useState<{
    mode: 'one' | 'several';
    source: RegisterSource;
  } | null>(null);
  const mayRegister = (row: PendingRow) =>
    can(me, 'IT_ASSET_REGISTER') && me.it_regions.includes(row.region.id);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Pending registration"
        description="IT equipment that has arrived but is not yet registered. Each unit becomes an asset with its own tag; until then it cannot be assigned to anyone."
      />
      <FilterBar
        search={null}
        hasFilters={list.hasFilters}
        onClear={list.clear}
      >
        <FilterSlot>
          <SelectField
            aria-label="Came in by"
            noneLabel="Receipts and acquisitions"
            value={filters.source_type}
            onChange={(source_type) =>
              list.update({ filters: { source_type } })
            }
            options={PENDING_SOURCE_OPTIONS}
          />
        </FilterSlot>
        {filters.item ? (
          <Badge variant="outline" className="self-start sm:self-auto">
            One item only
          </Badge>
        ) : null}
      </FilterBar>
      <DataTable
        caption="Pending registration"
        columns={COLUMNS}
        rows={data?.results}
        rowId={rowId}
        actions={(row) =>
          mayRegister(row) ? (
            <span className="inline-flex flex-wrap justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDialog({ mode: 'one', source: toSource(row) })
                }
                aria-label={`Register a unit of ${row.item.name} from ${row.reference}`}
              >
                <Plus aria-hidden />
                Register
              </Button>
              {row.source_type === 'RECEIPT' && row.remaining > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDialog({ mode: 'several', source: toSource(row) })
                  }
                  aria-label={`Register several units of ${row.item.name} from ${row.reference}`}
                >
                  <ListPlus aria-hidden />
                  Several
                </Button>
              ) : null}
            </span>
          ) : null
        }
        ordering=""
        onOrderingChange={() => undefined}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="Nothing matches"
              description="Try without the filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Nothing is waiting"
              description="Every unit received or acquired in your region is registered. New ones appear here after an IT receipt or an acquisition."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="sources"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {dialog?.mode === 'one' ? (
        <RegisterDialog
          source={dialog.source}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.mode === 'several' ? (
        <BulkRegisterDialog
          source={dialog.source}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
