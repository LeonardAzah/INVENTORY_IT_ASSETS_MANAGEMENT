'use client';

import Link from 'next/link';
import { useState } from 'react';

import { DataTable, type Column } from '@/components/shared/data-table';
import {
  DateFilter,
  FilterBar,
  Pagination,
  SearchInput,
} from '@/components/shared/list-controls';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ROW_LINK } from '@/features/accounts/components/shared';
import { formatDateTime, today } from '@/lib/format/date';
import { useListParams } from '@/lib/url/list-params';

import { useAuditLog, type AuditEntry } from '../api';

const FILTERS = [
  'occurred_at_from',
  'occurred_at_to',
  'actor',
  'action',
  'object_type',
  'object_id',
] as const;
const LINKED = ['actor', 'action', 'object_type', 'object_id'] as const;

export function actionLabel(action: string): string {
  const words = action.split('.').slice(1).join(' ').replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
}

/** "organization.Region" → "Region"; "assets.ITAsset" → "IT Asset". */
const typeLabel = (type: string) =>
  (type.split('.').pop() ?? type)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

const COLUMNS: Column<AuditEntry>[] = [
  {
    id: 'when',
    header: 'When',
    sortField: 'occurred_at',
    className: 'whitespace-nowrap',
    cell: (entry) => formatDateTime(entry.occurred_at),
  },
  {
    id: 'action',
    header: 'Action',
    primary: true,
    cell: (entry) => actionLabel(entry.action),
  },
  {
    id: 'object',
    header: 'On',
    cell: (entry) => (
      <span className="flex flex-col">
        <span className="wrap-break-word">{entry.object_repr || '–'}</span>
        <span className="text-xs font-normal text-neutral-600">
          {typeLabel(entry.object_type)}
        </span>
      </span>
    ),
  },
  { id: 'actor', header: 'By', cell: (entry) => entry.actor.name || 'System' },
];

export function AuditPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useAuditLog(
    list.query,
  );
  const filters = list.state.filters;
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const latest = today();
  const narrowed = LINKED.filter((key) => filters[key]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Audit log"
        description="Who did what, and when, newest first. Every change the system makes is recorded here, and no entry can be changed or removed."
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search the audit log"
            placeholder="Search by what was acted on"
            value={list.state.search}
            onChange={(search) => list.update({ search })}
          />
        }
      >
        <DateFilter
          label="From"
          value={filters.occurred_at_from}
          max={filters.occurred_at_to || latest}
          onChange={(occurred_at_from) =>
            list.update({ filters: { occurred_at_from } })
          }
        />
        <DateFilter
          label="To"
          value={filters.occurred_at_to}
          min={filters.occurred_at_from || undefined}
          max={latest}
          onChange={(occurred_at_to) =>
            list.update({ filters: { occurred_at_to } })
          }
        />
        {narrowed.length > 0 ? (
          <Badge variant="outline" className="self-start sm:self-end">
            {filters.object_id
              ? 'One record only'
              : filters.actor
                ? 'One person only'
                : filters.action
                  ? 'One action only'
                  : 'One kind of record only'}
          </Badge>
        ) : null}
      </FilterBar>
      <DataTable
        caption="Audit log"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(entry) => entry.id}
        actions={(entry) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(entry)}
            aria-label={`Details of ${actionLabel(entry.action)} on ${entry.object_repr}, ${formatDateTime(entry.occurred_at)}`}
          >
            Details
          </Button>
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
              title="No entries match"
              description="Try a different search or period."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="The audit log is empty"
              description="Nothing has been recorded yet."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="entries"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {open ? <EntryDialog entry={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

const display = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '–';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

function EntryDialog({
  entry,
  onClose,
}: {
  entry: AuditEntry;
  onClose: () => void;
}) {
  const fields = [
    ...new Set([
      ...Object.keys(entry.before ?? {}),
      ...Object.keys(entry.after ?? {}),
    ]),
  ];
  const both = entry.before !== null && entry.after !== null;

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{actionLabel(entry.action)}</DialogTitle>
          <DialogDescription>
            {entry.object_repr || typeLabel(entry.object_type)} ·{' '}
            {formatDateTime(entry.occurred_at)} · by{' '}
            {entry.actor.name || 'the system'}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-neutral-600">Action code</dt>
            <dd className="wrap-anywhere">{entry.action}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-neutral-600">Kind of record</dt>
            <dd className="wrap-anywhere">{entry.object_type}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-neutral-600">From address</dt>
            <dd>{entry.ip ?? '–'}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-neutral-600">Request</dt>
            <dd className="wrap-anywhere">{entry.request_id ?? '–'}</dd>
          </div>
        </dl>
        {fields.length === 0 ? (
          <p className="text-sm text-neutral-600">
            This action recorded no field values.
          </p>
        ) : (
          <div
            role="region"
            aria-label="Recorded values"
            tabIndex={0}
            className="focus-visible:ring-ring overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:outline-none"
          >
            <table className="w-full text-sm">
              <caption className="sr-only">Recorded values</caption>
              <thead>
                <tr className="border-b text-left text-neutral-600">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Field
                  </th>
                  {entry.before !== null ? (
                    <th scope="col" className="px-3 py-2 font-medium">
                      Before
                    </th>
                  ) : null}
                  {entry.after !== null ? (
                    <th scope="col" className="px-3 py-2 font-medium">
                      {both ? 'After' : 'Value'}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field} className="border-b last:border-b-0">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      {field.replace(/_/g, ' ')}
                    </th>
                    {entry.before !== null ? (
                      <td className="px-3 py-2 wrap-anywhere">
                        {display(entry.before[field])}
                      </td>
                    ) : null}
                    {entry.after !== null ? (
                      <td className="px-3 py-2 wrap-anywhere">
                        {display(entry.after[field])}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <Link
              href={`/admin/audit?object_type=${encodeURIComponent(entry.object_type)}&object_id=${encodeURIComponent(entry.object_id)}`}
              className={ROW_LINK}
              onClick={onClose}
            >
              Everything recorded about this record
            </Link>
          </li>
          {entry.actor.id ? (
            <li>
              <Link
                href={`/admin/audit?actor=${entry.actor.id}`}
                className={ROW_LINK}
                onClick={onClose}
              >
                Everything {entry.actor.name} did
              </Link>
            </li>
          ) : null}
          <li>
            <Link
              href={`/admin/audit?action=${encodeURIComponent(entry.action)}`}
              className={ROW_LINK}
              onClick={onClose}
            >
              Every “{actionLabel(entry.action)}”
            </Link>
          </li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
