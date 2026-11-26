'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';

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
import { ActiveBadge, EmptyState } from '@/components/shared/states';
import { SwitchField } from '@/components/shared/switch-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ACTIVE_OPTIONS } from '@/features/organization/types';
import { applyServerErrors } from '@/lib/forms/server-errors';
import { useListParams } from '@/lib/url/list-params';

import { useCatalogueList, useSaveCatalogue } from '../api';
import { precisionLabel, type Unit } from '../types';

const FILTERS = ['is_active'] as const;

const PRECISION_OPTIONS = [0, 1, 2, 3].map((places) => ({
  value: String(places),
  label: precisionLabel(places),
}));

const COLUMNS: Column<Unit>[] = [
  {
    id: 'code',
    header: 'Code',
    sortField: 'code',
    cell: (unit) => unit.code,
    className: 'w-32',
  },
  { id: 'name', header: 'Name', primary: true, cell: (unit) => unit.name },
  {
    id: 'precision',
    header: 'Counts in',
    cell: (unit) => precisionLabel(unit.decimal_places),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (unit) => <ActiveBadge active={unit.is_active} />,
  },
];

export function UnitsPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useCatalogueList(
    'units',
    list.query,
  );
  const [editing, setEditing] = useState<Unit | null | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Units of measure"
        description="How items are counted. A unit's precision decides whether a quantity like 2.5 is allowed."
        actions={
          <Can anyOf={['UOM_MANAGE']}>
            <Button onClick={() => setEditing(null)}>
              <Plus aria-hidden />
              New unit
            </Button>
          </Can>
        }
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search units"
            placeholder="Search by code or name"
            value={list.state.search}
            onChange={(search) => list.update({ search })}
          />
        }
      >
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
        caption="Units of measure"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(unit) => unit.id}
        actions={(unit) => (
          <Can anyOf={['UOM_MANAGE']}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(unit)}
              aria-label={`Edit ${unit.name}`}
            >
              <Pencil aria-hidden />
              Edit
            </Button>
          </Can>
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
              title="No units match"
              description="Try a different search or status."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No units yet"
              description="An administrator adds units before items can be created."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="units"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {editing !== undefined ? (
        <UnitDialog
          key={editing?.id ?? 'new'}
          unit={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  );
}

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,16}$/, 'Use 1 to 16 letters or digits.'),
  name: z
    .string()
    .trim()
    .min(1, 'Enter the name.')
    .max(100, 'Use at most 100 characters.'),
  decimal_places: z.string(),
  is_active: z.boolean(),
});
type Values = z.infer<typeof schema>;

function UnitDialog({
  unit,
  onClose,
}: {
  unit: Unit | null;
  onClose: () => void;
}) {
  const save = useSaveCatalogue('units');
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: unit?.code ?? '',
      name: unit?.name ?? '',
      decimal_places: String(unit?.decimal_places ?? 0),
      is_active: unit?.is_active ?? true,
    },
  });
  const { errors } = form.formState;
  const isActive = useWatch({ control: form.control, name: 'is_active' });

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    const decimal_places = Number(values.decimal_places);
    save.mutate(
      unit
        ? {
            id: unit.id,
            values: {
              name: values.name,
              decimal_places,
              is_active: values.is_active,
            },
          }
        : { values: { code: values.code, name: values.name, decimal_places } },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          onClose();
        },
        onError: (error) =>
          setFormError(
            applyServerErrors(error, form.setError, [
              'code',
              'name',
              'decimal_places',
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
      title={unit ? `Edit ${unit.name}` : 'New unit'}
      onSubmit={submit}
      submitLabel={unit ? 'Save changes' : 'Create unit'}
      isSubmitting={save.isPending}
      error={formError}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Code"
          required={!unit}
          description={
            unit
              ? 'The code of a unit is fixed.'
              : '1 to 16 letters or digits, e.g. EA or KG. Saved in capitals.'
          }
          error={errors.code?.message}
        >
          {(control) => (
            <Input
              autoCapitalize="characters"
              disabled={Boolean(unit)}
              {...control}
              {...form.register('code')}
            />
          )}
        </Field>
        <Field label="Name" required error={errors.name?.message}>
          {(control) => <Input {...control} {...form.register('name')} />}
        </Field>
      </div>
      <Field
        label="Counts in"
        required
        description="Whole units for things counted one by one. Serialized items need a whole unit. This cannot change once items use the unit."
        error={errors.decimal_places?.message}
      >
        {(control) => (
          <Controller
            control={form.control}
            name="decimal_places"
            render={({ field }) => (
              <SelectField
                {...control}
                value={field.value}
                onChange={field.onChange}
                options={PRECISION_OPTIONS}
              />
            )}
          />
        )}
      </Field>
      {unit ? (
        <SwitchField
          label="Active"
          description="An inactive unit cannot be chosen for new items."
          checked={isActive}
          onChange={(checked) =>
            form.setValue('is_active', checked, { shouldDirty: true })
          }
        />
      ) : null}
    </FormDialog>
  );
}
