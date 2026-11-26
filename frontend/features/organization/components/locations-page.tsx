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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { applyServerErrors } from '@/lib/forms/server-errors';
import { useListParams } from '@/lib/url/list-params';

import { useOrganizationList, useSaveOrganization } from '../api';
import { locationSchema, type LocationValues } from '../schemas';
import { ACTIVE_OPTIONS, refLabel, type Location } from '../types';
import {
  EditButton,
  LOCATIONS,
  NewButton,
  useDepartmentChoices,
  useOfficeChoices,
  useRegionChoices,
} from './shared';

const FILTERS = ['region', 'office', 'is_active'] as const;

const COLUMNS: Column<Location>[] = [
  {
    id: 'name',
    header: 'Name',
    sortField: 'name',
    primary: true,
    cell: (location) => (
      <span className="inline-flex flex-wrap items-center gap-2">
        {location.name}
        {location.is_default ? <Badge variant="outline">Default</Badge> : null}
      </span>
    ),
  },
  { id: 'office', header: 'Office', cell: (location) => location.office.name },
  {
    id: 'department',
    header: 'Department',
    cell: (location) => location.department?.name ?? '–',
  },
  { id: 'region', header: 'Region', cell: (location) => location.region.name },
  {
    id: 'status',
    header: 'Status',
    cell: (location) => <ActiveBadge active={location.is_active} />,
  },
];

export function LocationsPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useOrganizationList(
    'locations',
    list.query,
  );
  const regions = useRegionChoices();
  const offices = useOfficeChoices({
    region: list.state.filters.region || undefined,
  });
  const [editing, setEditing] = useState<Location | null | undefined>(
    undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Locations"
        description="The places inside an office where people work and equipment is kept. Every office has a default one."
        actions={
          <NewButton
            label="New location"
            anyOf={LOCATIONS}
            onClick={() => setEditing(null)}
          />
        }
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search locations"
            placeholder="Search by name"
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
            aria-label="Status"
            noneLabel="Any status"
            value={list.state.filters.is_active}
            onChange={(is_active) => list.update({ filters: { is_active } })}
            options={ACTIVE_OPTIONS}
          />
        </FilterSlot>
      </FilterBar>
      <DataTable
        caption="Locations"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(location) => location.id}
        actions={(location) => (
          <EditButton
            name={location.name}
            anyOf={LOCATIONS}
            onClick={() => setEditing(location)}
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
              title="No locations match"
              description="Try a different search or filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No locations yet"
              description="Each new office gets a default location automatically."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="locations"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {editing !== undefined ? (
        <LocationDialog
          key={editing?.id ?? 'new'}
          location={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  );
}

function LocationDialog({
  location,
  onClose,
}: {
  location: Location | null;
  onClose: () => void;
}) {
  const save = useSaveOrganization('locations');
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LocationValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      office_id: location?.office.id ?? '',
      department_id: location?.department?.id ?? '',
      name: location?.name ?? '',
      is_default: location?.is_default ?? false,
      is_active: location?.is_active ?? true,
    },
  });
  const { errors } = form.formState;
  const isActive = useWatch({ control: form.control, name: 'is_active' });
  const officeId = useWatch({ control: form.control, name: 'office_id' });
  const isDefault = useWatch({ control: form.control, name: 'is_default' });
  const offices = useOfficeChoices({ activeOnly: true }, !location);
  const departments = useDepartmentChoices(
    { office: officeId, activeOnly: true },
    Boolean(officeId),
  );

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    const shared = {
      department_id: values.department_id || null,
      name: values.name,
    };
    save.mutate(
      location
        ? {
            id: location.id,
            values: {
              ...shared,
              is_default: values.is_default,
              is_active: values.is_active,
            },
          }
        : { values: { ...shared, office_id: values.office_id } },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          onClose();
        },
        onError: (error) =>
          setFormError(
            applyServerErrors(error, form.setError, [
              'office_id',
              'department_id',
              'name',
              'is_default',
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
      title={location ? `Edit ${location.name}` : 'New location'}
      onSubmit={submit}
      submitLabel={location ? 'Save changes' : 'Create location'}
      isSubmitting={save.isPending}
      error={formError}
    >
      <Field
        label="Office"
        required={!location}
        description={
          location ? 'A location stays in its office.' : offices.note
        }
        error={errors.office_id?.message}
      >
        {(control) =>
          location ? (
            <Input
              disabled
              readOnly
              value={refLabel(location.office)}
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
                    form.setValue('department_id', '');
                  }}
                  options={offices.options}
                />
              )}
            />
          )
        }
      </Field>
      <Field
        label="Department"
        description={
          departments.note ??
          'Optional. Only departments of this office can be chosen.'
        }
        error={errors.department_id?.message}
      >
        {(control) => (
          <Controller
            control={form.control}
            name="department_id"
            render={({ field }) => (
              <SelectField
                {...control}
                noneLabel="No department"
                value={field.value}
                onChange={field.onChange}
                options={departments.options}
                disabled={!officeId}
              />
            )}
          />
        )}
      </Field>
      <Field label="Name" required error={errors.name?.message}>
        {(control) => <Input {...control} {...form.register('name')} />}
      </Field>
      {location ? (
        <>
          <SwitchField
            label="Default location of the office"
            description={
              location.is_default
                ? 'To change the default, make another location of this office the default.'
                : 'The current default location of the office stops being the default.'
            }
            checked={isDefault}
            disabled={location.is_default}
            onChange={(checked) =>
              form.setValue('is_default', checked, { shouldDirty: true })
            }
          />
          <SwitchField
            label="Active"
            description={
              isDefault
                ? 'The default location of an office is always active.'
                : undefined
            }
            checked={isActive}
            disabled={isDefault}
            onChange={(checked) =>
              form.setValue('is_active', checked, { shouldDirty: true })
            }
          />
        </>
      ) : null}
    </FormDialog>
  );
}
