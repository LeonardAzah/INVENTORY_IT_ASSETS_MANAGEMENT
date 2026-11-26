'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';

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
import { ActiveBadge, EmptyState } from '@/components/shared/states';
import { SwitchField } from '@/components/shared/switch-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { applyServerErrors } from '@/lib/forms/server-errors';
import { useListParams } from '@/lib/url/list-params';

import { useOrganizationList, useSaveOrganization } from '../api';
import { departmentSchema, type DepartmentValues } from '../schemas';
import {
  ACTIVE_OPTIONS,
  DEPARTMENT_KIND_LABELS,
  DEPARTMENT_KIND_OPTIONS,
  DEPARTMENT_KINDS_BY_OFFICE_KIND,
  refLabel,
  type Department,
  type DepartmentKind,
} from '../types';
import {
  EditButton,
  NewButton,
  STRUCTURE,
  useOfficeChoices,
  useRegionChoices,
} from './shared';

const FILTERS = ['region', 'office', 'kind', 'is_active'] as const;

const COLUMNS: Column<Department>[] = [
  {
    id: 'code',
    header: 'Code',
    sortField: 'code',
    cell: (department) => department.code,
  },
  {
    id: 'name',
    header: 'Name',
    sortField: 'name',
    primary: true,
    cell: (department) => department.name,
  },
  {
    id: 'kind',
    header: 'Kind',
    cell: (department) =>
      DEPARTMENT_KIND_LABELS[department.kind] ?? department.kind,
  },
  {
    id: 'office',
    header: 'Office',
    cell: (department) => department.office.name,
  },
  {
    id: 'region',
    header: 'Region',
    cell: (department) => department.region.name,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (department) => <ActiveBadge active={department.is_active} />,
  },
];

export function DepartmentsPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useOrganizationList(
    'departments',
    list.query,
  );
  const regions = useRegionChoices();
  const offices = useOfficeChoices({
    region: list.state.filters.region || undefined,
  });
  const [editing, setEditing] = useState<Department | null | undefined>(
    undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Departments"
        description="The departments of regional offices, each region's IT department, and the units of commercial centers."
        actions={
          <NewButton
            label="New department"
            anyOf={STRUCTURE}
            onClick={() => setEditing(null)}
          />
        }
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search departments"
            placeholder="Search by code or name"
            value={list.state.search}
            onChange={(search) => list.update({ search })}
          />
        }
      >
        <FilterSlot>
          <SelectField
            aria-label="Region"
            noneLabel="All regions"
            value={list.state.filters.region}
            onChange={(region) =>
              list.update({ filters: { region, office: '' } })
            }
            options={regions.options}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Office"
            noneLabel="All offices"
            value={list.state.filters.office}
            onChange={(office) => list.update({ filters: { office } })}
            options={offices.options}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Kind"
            noneLabel="Any kind"
            value={list.state.filters.kind}
            onChange={(kind) => list.update({ filters: { kind } })}
            options={DEPARTMENT_KIND_OPTIONS}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Status"
            noneLabel="Any status"
            value={list.state.filters.is_active}
            onChange={(is_active) => list.update({ filters: { is_active } })}
            options={ACTIVE_OPTIONS}
          />
        </FilterSlot>
      </FilterBar>
      <DataTable
        caption="Departments"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(department) => department.id}
        actions={(department) => (
          <EditButton
            name={department.name}
            anyOf={STRUCTURE}
            onClick={() => setEditing(department)}
          />
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
              title="No departments match"
              description="Try a different search or filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No departments yet"
              description="Add an office first, then its departments."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="departments"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {editing !== undefined ? (
        <DepartmentDialog
          key={editing?.id ?? 'new'}
          department={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  );
}

function DepartmentDialog({
  department,
  onClose,
}: {
  department: Department | null;
  onClose: () => void;
}) {
  const save = useSaveOrganization('departments');
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<DepartmentValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      office_id: department?.office.id ?? '',
      kind: department?.kind ?? '',
      code: department?.code ?? '',
      name: department?.name ?? '',
      is_active: department?.is_active ?? true,
    },
  });
  const { errors } = form.formState;
  const isActive = useWatch({ control: form.control, name: 'is_active' });
  const offices = useOfficeChoices({ activeOnly: true }, !department);
  const officeId = useWatch({ control: form.control, name: 'office_id' });
  const office = offices.records.find((record) => record.id === officeId);
  const kinds = office
    ? DEPARTMENT_KIND_OPTIONS.filter((option) =>
        DEPARTMENT_KINDS_BY_OFFICE_KIND[office.kind]?.includes(
          option.value as DepartmentKind,
        ),
      )
    : [];

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    save.mutate(
      department
        ? {
            id: department.id,
            values: {
              code: values.code,
              name: values.name,
              is_active: values.is_active,
            },
          }
        : {
            values: {
              office_id: values.office_id,
              kind: values.kind as DepartmentKind,
              code: values.code,
              name: values.name,
            },
          },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          onClose();
        },
        onError: (error) =>
          setFormError(
            applyServerErrors(error, form.setError, [
              'office_id',
              'kind',
              'code',
              'name',
              'is_active',
            ]),
          ),
      },
    );
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={department ? `Edit ${department.name}` : 'New department'}
      description={
        department
          ? undefined
          : 'The office and the kind cannot be changed after the department is created.'
      }
      onSubmit={submit}
      submitLabel={department ? 'Save changes' : 'Create department'}
      isSubmitting={save.isPending}
      error={formError}
    >
      <Field
        label="Office"
        required={!department}
        description={
          department ? 'Fixed when the department was created.' : offices.note
        }
        error={errors.office_id?.message}
      >
        {(control) =>
          department ? (
            <Input
              disabled
              readOnly
              value={refLabel(department.office)}
              {...control}
            />
          ) : (
            <Controller
              control={form.control}
              name="office_id"
              render={({ field }) => (
                <SelectField
                  {...control}
                  placeholder="Choose an office"
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    form.setValue('kind', '');
                  }}
                  options={offices.options}
                />
              )}
            />
          )
        }
      </Field>
      <Field
        label="Kind"
        required={!department}
        description={
          department
            ? 'Fixed when the department was created.'
            : "A regional office holds departments and the region's IT department. A commercial center holds units."
        }
        error={errors.kind?.message}
      >
        {(control) =>
          department ? (
            <Input
              disabled
              readOnly
              value={DEPARTMENT_KIND_LABELS[department.kind] ?? department.kind}
              {...control}
            />
          ) : (
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <SelectField
                  {...control}
                  placeholder={
                    office ? 'Choose a kind' : 'Choose an office first'
                  }
                  value={field.value}
                  onChange={field.onChange}
                  options={kinds}
                  disabled={!office}
                />
              )}
            />
          )
        }
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Code"
          required
          description="2 to 16 letters, digits, - or _. Saved in capitals."
          error={errors.code?.message}
        >
          {(control) => (
            <Input
              autoCapitalize="characters"
              {...control}
              {...form.register('code')}
            />
          )}
        </Field>
        <Field label="Name" required error={errors.name?.message}>
          {(control) => <Input {...control} {...form.register('name')} />}
        </Field>
      </div>
      {department ? (
        <SwitchField
          label="Active"
          checked={isActive}
          onChange={(checked) =>
            form.setValue('is_active', checked, { shouldDirty: true })
          }
        />
      ) : null}
    </FormDialog>
  );
}
