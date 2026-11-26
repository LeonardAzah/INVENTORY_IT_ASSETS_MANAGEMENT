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
import { ActiveBadge, EmptyState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import {
  useDepartmentChoices,
  useOfficeChoices,
  useRegionChoices,
} from '@/features/organization/components/shared';
import { ACTIVE_OPTIONS } from '@/features/organization/types';
import type { PermissionCode } from '@/lib/permissions/codes';
import { useListParams } from '@/lib/url/list-params';

import { useEmployeeList } from '../api';
import { fullName, type Employee } from '../types';
import { EmployeeDialog } from './employee-dialog';

export const MANAGE: readonly PermissionCode[] = ['EMPLOYEE_MANAGE'];

const FILTERS = ['region', 'office', 'department', 'is_active'] as const;

const ROW_LINK =
  'rounded-sm text-primary underline-offset-4 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

const COLUMNS: Column<Employee>[] = [
  {
    id: 'name',
    header: 'Name',
    sortField: 'last_name',
    primary: true,
    cell: (employee) => (
      <Link href={`/employees/${employee.id}`} className={ROW_LINK}>
        {fullName(employee)}
      </Link>
    ),
  },
  {
    id: 'matricule',
    header: 'Matricule',
    sortField: 'matricule',
    cell: (employee) => employee.matricule,
  },
  {
    id: 'department',
    header: 'Department',
    cell: (employee) => employee.department.name,
  },
  { id: 'office', header: 'Office', cell: (employee) => employee.office.name },
  { id: 'region', header: 'Region', cell: (employee) => employee.region.name },
  {
    id: 'telephone',
    header: 'Telephone',
    cell: (employee) => employee.telephone,
    className: 'whitespace-nowrap',
  },
  {
    id: 'status',
    header: 'Status',
    cell: (employee) => <ActiveBadge active={employee.is_active} />,
  },
];

export function EmployeesPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useEmployeeList(
    list.query,
  );
  const filters = list.state.filters;
  const regions = useRegionChoices();
  const offices = useOfficeChoices({ region: filters.region || undefined });
  const departments = useDepartmentChoices({
    office: filters.office || undefined,
    withOffice: !filters.office,
  });
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Employees"
        description="The people stock is issued to and equipment is assigned to. You see the employees inside your own scope."
        actions={
          <Can anyOf={MANAGE}>
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New employee
            </Button>
          </Can>
        }
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search employees"
            placeholder="Search by name, matricule or email"
            value={list.state.search}
            onChange={(search) => list.update({ search })}
          />
        }
      >
        <FilterSlot>
          <SelectField
            aria-label="Region"
            noneLabel="All regions"
            value={filters.region}
            // Offices and departments are listed for the region: a new region clears them.
            onChange={(region) =>
              list.update({ filters: { region, office: '', department: '' } })
            }
            options={regions.options}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Office"
            noneLabel="All offices"
            value={filters.office}
            onChange={(office) =>
              list.update({ filters: { office, department: '' } })
            }
            options={offices.options}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Department"
            noneLabel="All departments"
            value={filters.department}
            onChange={(department) => list.update({ filters: { department } })}
            options={departments.options}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Status"
            noneLabel="Any status"
            value={filters.is_active}
            onChange={(is_active) => list.update({ filters: { is_active } })}
            options={ACTIVE_OPTIONS}
          />
        </FilterSlot>
      </FilterBar>
      <DataTable
        caption="Employees"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(employee) => employee.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No employees match"
              description="Try a different search or filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No employees to show"
              description="There are none inside your scope. An administrator adds employees and decides what each person can see."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="employees"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {creating ? (
        <EmployeeDialog employee={null} onClose={() => setCreating(false)} />
      ) : null}
    </div>
  );
}
