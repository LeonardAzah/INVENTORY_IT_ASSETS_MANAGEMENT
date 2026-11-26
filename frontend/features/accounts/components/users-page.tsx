'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Can } from '@/components/shared/can';
import { DataTable, type Column } from '@/components/shared/data-table';
import {
  FilterBar,
  FilterSlot,
  Pagination,
  SearchInput,
} from '@/components/shared/list-controls';
import { PageHeader } from '@/components/shared/page-header';
import { SelectField } from '@/components/shared/select-field';
import { EmptyState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS } from '@/features/auth/types';
import { useRegionChoices } from '@/features/organization/components/shared';
import { formatDateTime } from '@/lib/format/date';
import { useListParams } from '@/lib/url/list-params';

import { useAccountList } from '../api';
import {
  accountName,
  RESPONSIBILITY_OPTIONS,
  ROLE_OPTIONS,
  STATUS_OPTIONS,
  type Account,
} from '../types';
import { ProvisionDialog } from './provision-dialog';
import { AccountStatusBadge, ROW_LINK } from './shared';

const FILTERS = ['role', 'status', 'region', 'responsibility'] as const;

const COLUMNS: Column<Account>[] = [
  {
    id: 'name',
    header: 'Name',
    primary: true,
    cell: (account) => (
      <Link href={`/users/${account.id}`} className={ROW_LINK}>
        {accountName(account)}
      </Link>
    ),
  },
  {
    id: 'email',
    header: 'Login email',
    sortField: 'email',
    cell: (account) => account.email,
  },
  {
    id: 'role',
    header: 'Role',
    cell: (account) => ROLE_LABELS[account.role] ?? account.role,
  },
  {
    id: 'region',
    header: 'Region',
    cell: (account) => account.employee.region.name,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (account) => <AccountStatusBadge status={account.status} />,
  },
  {
    id: 'created',
    header: 'Created',
    sortField: 'date_joined',
    cell: (account) => formatDateTime(account.created_at),
    className: 'whitespace-nowrap',
  },
];

export function UsersPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useAccountList(
    list.query,
  );
  const filters = list.state.filters;
  const regions = useRegionChoices();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Users"
        description="The accounts people sign in with. You see the accounts of employees inside your management scope."
        actions={
          <Can anyOf={['USER_PROVISION']}>
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New account
            </Button>
          </Can>
        }
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search users"
            placeholder="Search by name, email or matricule"
            value={list.state.search}
            onChange={(search) => list.update({ search })}
          />
        }
      >
        <FilterSlot>
          <SelectField
            aria-label="Role"
            noneLabel="Any role"
            value={filters.role}
            onChange={(role) => list.update({ filters: { role } })}
            options={ROLE_OPTIONS}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Status"
            noneLabel="Any status"
            value={filters.status}
            onChange={(status) => list.update({ filters: { status } })}
            options={STATUS_OPTIONS}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Region"
            noneLabel="All regions"
            value={filters.region}
            onChange={(region) => list.update({ filters: { region } })}
            options={regions.options}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Responsibility"
            noneLabel="Any responsibility"
            value={filters.responsibility}
            onChange={(responsibility) =>
              list.update({ filters: { responsibility } })
            }
            options={RESPONSIBILITY_OPTIONS}
          />
        </FilterSlot>
      </FilterBar>
      <DataTable
        caption="Users"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(account) => account.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No users match"
              description="Try a different search or filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No users to show"
              description="There are no accounts inside your management scope. An administrator sets that scope."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="users"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {creating ? <ProvisionDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
