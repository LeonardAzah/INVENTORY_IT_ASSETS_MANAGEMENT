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
import { officeSchema, type OfficeValues } from '../schemas';
import {
  ACTIVE_OPTIONS,
  OFFICE_KIND_LABELS,
  OFFICE_KIND_OPTIONS,
  refLabel,
  type Office,
  type OfficeKind,
} from '../types';
import {
  EditButton,
  NewButton,
  STRUCTURE,
  useOfficeChoices,
  useRegionChoices,
} from './shared';

const FILTERS = ['region', 'kind', 'is_active'] as const;

const COLUMNS: Column<Office>[] = [
  {
    id: 'code',
    header: 'Code',
    sortField: 'code',
    cell: (office) => office.code,
  },
  {
    id: 'name',
    header: 'Name',
    sortField: 'name',
    primary: true,
    cell: (office) => office.name,
  },
  {
    id: 'kind',
    header: 'Kind',
    cell: (office) => OFFICE_KIND_LABELS[office.kind] ?? office.kind,
  },
  { id: 'town', header: 'Town', cell: (office) => office.town },
  { id: 'region', header: 'Region', cell: (office) => office.region.name },
  {
    id: 'parent',
    header: 'Under',
    cell: (office) => office.parent?.name ?? '–',
  },
  {
    id: 'status',
    header: 'Status',
    cell: (office) => <ActiveBadge active={office.is_active} />,
  },
];

export function OfficesPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useOrganizationList(
    'offices',
    list.query,
  );
  const regions = useRegionChoices();
  const [editing, setEditing] = useState<Office | null | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Offices"
        description="Regional offices and the commercial centers under them. Several offices can share a town; the code tells them apart."
        actions={
          <NewButton
            label="New office"
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
            label="Search offices"
            placeholder="Search by code, name or town"
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
            onChange={(region) => list.update({ filters: { region } })}
            options={regions.options}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Kind"
            noneLabel="Any kind"
            value={list.state.filters.kind}
            onChange={(kind) => list.update({ filters: { kind } })}
            options={OFFICE_KIND_OPTIONS}
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
        caption="Offices"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(office) => office.id}
        actions={(office) => (
          <EditButton
            name={office.name}
            anyOf={STRUCTURE}
            onClick={() => setEditing(office)}
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
              title="No offices match"
              description="Try a different search or filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No offices yet"
              description="Add a region first, then its regional office."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="offices"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {editing !== undefined ? (
        <OfficeDialog
          key={editing?.id ?? 'new'}
          office={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  );
}

function OfficeDialog({
  office,
  onClose,
}: {
  office: Office | null;
  onClose: () => void;
}) {
  const save = useSaveOrganization('offices');
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<OfficeValues>({
    resolver: zodResolver(officeSchema),
    defaultValues: {
      region_id: office?.region.id ?? '',
      kind: office?.kind ?? '',
      parent_id: office?.parent?.id ?? '',
      code: office?.code ?? '',
      name: office?.name ?? '',
      town: office?.town ?? '',
      is_active: office?.is_active ?? true,
    },
  });
  const { errors } = form.formState;
  const isActive = useWatch({ control: form.control, name: 'is_active' });
  const regionId = useWatch({ control: form.control, name: 'region_id' });
  const regions = useRegionChoices(true);
  const parents = useOfficeChoices(
    { region: regionId, activeOnly: true },
    Boolean(regionId),
  );
  const parentOptions = parents.options.filter(
    (option) => option.value !== office?.id,
  );

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    const shared = {
      parent_id: values.parent_id || null,
      code: values.code,
      name: values.name,
      town: values.town,
    };
    save.mutate(
      office
        ? { id: office.id, values: { ...shared, is_active: values.is_active } }
        : {
            values: {
              ...shared,
              region_id: values.region_id,
              kind: values.kind as OfficeKind,
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
              'region_id',
              'kind',
              'parent_id',
              'code',
              'name',
              'town',
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
      title={office ? `Edit ${office.name}` : 'New office'}
      description={
        office
          ? undefined
          : 'The region and the kind cannot be changed after the office is created.'
      }
      onSubmit={submit}
      submitLabel={office ? 'Save changes' : 'Create office'}
      isSubmitting={save.isPending}
      error={formError}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Region"
          required={!office}
          description={
            office ? 'Fixed when the office was created.' : regions.note
          }
          error={errors.region_id?.message}
        >
          {(control) =>
            office ? (
              <Input
                disabled
                value={refLabel(office.region)}
                readOnly
                {...control}
              />
            ) : (
              <Controller
                control={form.control}
                name="region_id"
                render={({ field }) => (
                  <SelectField
                    {...control}
                    placeholder="Choose a region"
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      // The parent belongs to the region: a new region means choosing again.
                      form.setValue('parent_id', '');
                    }}
                    options={regions.options}
                  />
                )}
              />
            )
          }
        </Field>
        <Field
          label="Kind"
          required={!office}
          description={
            office ? 'Fixed when the office was created.' : undefined
          }
          error={errors.kind?.message}
        >
          {(control) =>
            office ? (
              <Input
                disabled
                value={OFFICE_KIND_LABELS[office.kind] ?? office.kind}
                readOnly
                {...control}
              />
            ) : (
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <SelectField
                    {...control}
                    placeholder="Choose a kind"
                    value={field.value}
                    onChange={field.onChange}
                    options={OFFICE_KIND_OPTIONS}
                  />
                )}
              />
            )
          }
        </Field>
      </div>
      <Field
        label="Under"
        description={
          parents.note ??
          'The office this one reports to, if any. It must be in the same region.'
        }
        error={errors.parent_id?.message}
      >
        {(control) => (
          <Controller
            control={form.control}
            name="parent_id"
            render={({ field }) => (
              <SelectField
                {...control}
                noneLabel="No parent office"
                value={field.value}
                onChange={field.onChange}
                options={parentOptions}
                disabled={!regionId}
              />
            )}
          />
        )}
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
        <Field label="Town" required error={errors.town?.message}>
          {(control) => <Input {...control} {...form.register('town')} />}
        </Field>
      </div>
      <Field label="Name" required error={errors.name?.message}>
        {(control) => <Input {...control} {...form.register('name')} />}
      </Field>
      {office ? (
        <SwitchField
          label="Active"
          description="An office with active child offices, departments or warehouses cannot be made inactive."
          checked={isActive}
          onChange={(checked) =>
            form.setValue('is_active', checked, { shouldDirty: true })
          }
        />
      ) : null}
    </FormDialog>
  );
}
