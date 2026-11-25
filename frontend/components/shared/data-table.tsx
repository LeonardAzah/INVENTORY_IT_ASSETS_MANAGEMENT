'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { ErrorState } from './states';

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortField?: string;
  primary?: boolean;
  className?: string;
};

type DataTableProps<T> = {
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowId: (row: T) => string;
  actions?: (row: T) => React.ReactNode;
  ordering: string;
  onOrderingChange: (ordering: string) => void;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
  empty: React.ReactNode;
};

const SKELETON_ROWS = 5;

function nextOrdering(current: string, field: string): string {
  if (current === field) return `-${field}`;
  if (current === `-${field}`) return '';
  return field;
}

function ariaSort(ordering: string, field: string | undefined) {
  if (!field) return undefined;
  if (ordering === field) return 'ascending' as const;
  if (ordering === `-${field}`) return 'descending' as const;
  return 'none' as const;
}

/**
 * A list of records from a paginated endpoint. Sorting is done by the backend: a header
 * only asks for a different order. From the `md` breakpoint it is a table that scrolls
 * sideways inside its own region when it is too wide; below that each record is a card,
 * so nothing has to be scrolled sideways on a phone.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowId,
  actions,
  ordering,
  onOrderingChange,
  isLoading,
  isFetching,
  error,
  onRetry,
  empty,
}: DataTableProps<T>) {
  if (error && !rows) {
    return (
      <div className="bg-card rounded-lg border">
        <ErrorState
          title={`${caption} could not be loaded`}
          error={error}
          onRetry={onRetry}
          retrying={isFetching}
        />
      </div>
    );
  }
  if (!isLoading && rows && rows.length === 0) {
    return <div className="bg-card rounded-lg border">{empty}</div>;
  }

  const primary = columns.find((column) => column.primary) ?? columns[0];
  const others = columns.filter((column) => column !== primary);
  const busy = isFetching && !isLoading;

  return (
    <div
      aria-busy={isLoading || isFetching}
      className={cn('transition-opacity', busy && 'opacity-60')}
    >
      <div
        role="region"
        aria-label={caption}
        tabIndex={0}

        className="bg-card focus-visible:ring-ring relative hidden overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none md:block"
      >
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b bg-neutral-50 text-neutral-600">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={ariaSort(ordering, column.sortField)}
                  className={cn(
                    'px-4 py-2.5 font-medium whitespace-nowrap',
                    column.className,
                  )}
                >
                  {column.sortField ? (
                    <SortButton
                      label={column.header}
                      state={ariaSort(ordering, column.sortField)}
                      onClick={() =>
                        onOrderingChange(
                          nextOrdering(ordering, column.sortField as string),
                        )
                      }
                    />
                  ) : (
                    column.header
                  )}
                </th>
              ))}
              {actions ? (
                <th scope="col" className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <tr key={index}>
                    {columns.map((column) => (
                      <td key={column.id} className="px-4 py-3">
                        <Skeleton className="h-4 w-24 max-w-full" />
                      </td>
                    ))}
                    {actions ? <td className="px-4 py-3" /> : null}
                  </tr>
                ))
              : rows?.map((row) => (
                  <tr key={rowId(row)} className="hover:bg-neutral-50">
                    {columns.map((column) =>
                      column === primary ? (
                        <th
                          key={column.id}
                          scope="row"
                          className={cn(
                            'px-4 py-3 font-medium',
                            column.className,
                          )}
                        >
                          {column.cell(row)}
                        </th>
                      ) : (
                        <td
                          key={column.id}
                          className={cn('px-4 py-3', column.className)}
                        >
                          {column.cell(row)}
                        </td>
                      ),
                    )}
                    {actions ? (
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {actions(row)}
                      </td>
                    ) : null}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Cards: phones. */}
      <ul aria-label={caption} className="flex flex-col gap-3 md:hidden">
        {isLoading
          ? Array.from({ length: 3 }, (_, index) => (
              <li
                key={index}
                className="bg-card flex flex-col gap-3 rounded-lg border p-4"
              >
                <Skeleton className="h-5 w-40 max-w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </li>
            ))
          : rows?.map((row) => (
              <li
                key={rowId(row)}
                className="bg-card flex flex-col gap-3 rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium wrap-break-word">
                    {primary.cell(row)}
                  </p>
                  {actions ? (
                    <div className="shrink-0">{actions(row)}</div>
                  ) : null}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {others.map((column) => (
                    <div key={column.id} className="contents">
                      <dt className="text-neutral-600">{column.header}</dt>
                      <dd className="min-w-0 wrap-break-word">
                        {column.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
      </ul>
    </div>
  );
}

function SortButton({
  label,
  state,
  onClick,
}: {
  label: string;
  state: 'ascending' | 'descending' | 'none' | undefined;
  onClick: () => void;
}) {
  const Icon =
    state === 'ascending'
      ? ArrowUp
      : state === 'descending'
        ? ArrowDown
        : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:text-foreground focus-visible:ring-ring -mx-1 inline-flex items-center gap-1 rounded-sm px-1 focus-visible:ring-2 focus-visible:outline-none pointer-coarse:min-h-11"
    >
      {label}
      <Icon
        className={cn('size-3.5', state === 'none' && 'opacity-50')}
        aria-hidden
      />
    </button>
  );
}
