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

import { useIssueList, useWarehouseOptions } from '../api';
import { employeeName, type Issue } from '../types';
import { useRouter } from 'next/navigation';

const FILTERS = [
  'warehouse',
  'employee',
  'item',
  'issue_date_from',
  'issue_date_to',
] as const;

function contents(issue: Issue): string {
  const [first, ...others] = issue.lines;
  if (!first) {
    return '–';
  }
  return others.length === 0
    ? first.item.name
    : `${first.item.name} and ${others.length} more`;
}

const COLUMNS: Column<Issue>[] = [
  {
    id: 'reference',
    header: 'Reference',
    sortField: 'reference',
    primary: true,
    className: 'whitespace-nowrap',
    cell: (issue) => (
      <Link href={`/inventory/issues/${issue.id}`} className={ROW_LINK}>
        {issue.reference}
      </Link>
    ),
  },
  {
    id: 'date',
    header: 'Issue date',
    sortField: 'issue_date',
    className: 'whitespace-nowrap',
    cell: (issue) => formatDate(issue.issue_date),
  },
  {
    id: 'warehouse',
    header: 'Warehouse',
    cell: (issue) => issue.warehouse.name,
  },
  {
    id: 'employee',
    header: 'Issued to',
    cell: (issue) =>
      issue.employee ? (
        <span className="flex flex-col">
          {employeeName(issue.employee)}
          <span className="text-xs text-neutral-600">
            {issue.employee.matricule}
          </span>
        </span>
      ) : issue.recipient_store ? (
        <span className="flex flex-col">
          {issue.recipient_store.name}
          <span className="text-xs text-neutral-600">
            Store {issue.recipient_store.code}
          </span>
        </span>
      ) : null,
  },
  { id: 'items', header: 'Items', cell: contents },
  { id: 'by', header: 'Recorded by', cell: (issue) => issue.created_by },
  {
    id: 'at',
    header: 'Recorded',
    className: 'whitespace-nowrap',
    cell: (issue) => formatDateTime(issue.created_at),
  },
];

export function IssuesPage() {
  const router = useRouter();
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useIssueList(
    list.query,
  );
  const filters = list.state.filters;
  const warehouses = useWarehouseOptions();
  const latest = today();
  const create = (
    <Can anyOf={['INVENTORY_ISSUE']}>
      <Button onClick={() => router.push('/inventory/issues/new')}>
        <Plus aria-hidden />
        New issue
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Issues"
        description="Stock handed from a general warehouse to an employee, newest first. An issue is never edited or deleted."
        actions={create}
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search issues"
            placeholder="Search by reference, name or matricule"
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
          label="Issued from"
          value={filters.issue_date_from}
          max={filters.issue_date_to || latest}
          onChange={(issue_date_from) =>
            list.update({ filters: { issue_date_from } })
          }
        />
        <DateFilter
          label="Issued to"
          value={filters.issue_date_to}
          min={filters.issue_date_from || undefined}
          max={latest}
          onChange={(issue_date_to) =>
            list.update({ filters: { issue_date_to } })
          }
        />
        {filters.employee ? (
          <Badge variant="outline" className="self-start sm:self-end">
            One employee only
          </Badge>
        ) : null}
        {filters.item ? (
          <Badge variant="outline" className="self-start sm:self-end">
            One item only
          </Badge>
        ) : null}
      </FilterBar>
      <DataTable
        caption="Issues"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(issue) => issue.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No issues match"
              description="Try a different search, warehouse or period."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No issues yet"
              description="Nothing has been issued from the warehouses you can see."
              action={create}
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="issues"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
    </div>
  );
}
