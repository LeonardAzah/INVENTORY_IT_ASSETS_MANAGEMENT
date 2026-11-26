'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { regionSchema, type RegionValues } from '../schemas';
import { ACTIVE_OPTIONS, type Region } from '../types';
import { EditButton, NewButton, STRUCTURE } from './shared';

const FILTERS = ['is_active'] as const;

const ROW_LINK =
  'rounded-sm text-primary underline-offset-4 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

const COLUMNS: Column<Region>[] = [
  {
    id: 'code',
    header: 'Code',
    sortField: 'code',
    cell: (region) => region.code,
    className: 'w-32',
  },
  {
    id: 'name',
    header: 'Name',
    sortField: 'name',
    primary: true,
    cell: (region) => (
      <Link href={`/organization/regions/${region.id}`} className={ROW_LINK}>
        {region.name}
      </Link>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (region) => <ActiveBadge active={region.is_active} />,
  },
];

export function RegionsPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useOrganizationList(
    'regions',
    list.query,
  );
  const [editing, setEditing] = useState<Region | null | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Regions"
        description="The regions the organization is divided into. Offices, warehouses and IT teams belong to one."
        actions={
          <NewButton
            label="New region"
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
            label="Search regions"
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
        caption="Regions"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(region) => region.id}
        actions={(region) => (
          <EditButton
            name={region.name}
            anyOf={STRUCTURE}
            onClick={() => setEditing(region)}
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
              title="No regions match"
              description="Try a different search or status."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No regions yet"
              description="An administrator adds the first region."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="regions"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {editing !== undefined ? (
        <RegionDialog
          key={editing?.id ?? 'new'}
          region={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  );
}

function RegionDialog({
  region,
  onClose,
}: {
  region: Region | null;
  onClose: () => void;
}) {
  const save = useSaveOrganization('regions');
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RegionValues>({
    resolver: zodResolver(regionSchema),
    defaultValues: {
      code: region?.code ?? '',
      name: region?.name ?? '',
      is_active: region?.is_active ?? true,
    },
  });
  const { errors } = form.formState;
  const isActive = useWatch({ control: form.control, name: 'is_active' });

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    save.mutate(
      region
        ? {
            id: region.id,
            values: { name: values.name, is_active: values.is_active },
          }
        : { values: { code: values.code, name: values.name } },
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
      title={region ? `Edit ${region.name}` : 'New region'}
      description={
        region
          ? undefined
          : 'The code identifies the region everywhere and cannot be changed later.'
      }
      onSubmit={submit}
      submitLabel={region ? 'Save changes' : 'Create region'}
      isSubmitting={save.isPending}
      error={formError}
    >
      <Field
        label="Code"
        required={!region}
        description={
          region
            ? 'The code of a region is permanent.'
            : '2 to 8 letters or digits. Saved in capitals.'
        }
        error={errors.code?.message}
      >
        {(control) => (
          <Input
            autoCapitalize="characters"
            disabled={Boolean(region)}
            {...control}
            {...form.register('code')}
          />
        )}
      </Field>
      <Field label="Name" required error={errors.name?.message}>
        {(control) => <Input {...control} {...form.register('name')} />}
      </Field>
      {region ? (
        <SwitchField
          label="Active"
          description="A region with active offices cannot be made inactive."
          checked={isActive}
          onChange={(checked) =>
            form.setValue('is_active', checked, { shouldDirty: true })
          }
        />
      ) : null}
    </FormDialog>
  );
}
