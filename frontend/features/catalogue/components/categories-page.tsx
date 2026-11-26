'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';

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
import { useCurrentUser } from '@/features/auth/session';
import { ACTIVE_OPTIONS } from '@/features/organization/types';
import { TYPE_OPTIONS, type WarehouseType } from '@/features/warehouses/types';
import { applyServerErrors } from '@/lib/forms/server-errors';
import { manageableTypes } from '@/lib/permissions/catalogue';
import { isAdministrator } from '@/lib/permissions/codes';
import { useListParams } from '@/lib/url/list-params';

import {
  useCatalogueList,
  useCatalogueOptions,
  useSaveCatalogue,
} from '../api';
import { PREDEFINED_OPTIONS, typeLabel, type Category } from '../types';

const FILTERS = ['warehouse_type', 'is_predefined', 'is_active'] as const;

const COLUMNS: Column<Category>[] = [
  {
    id: 'name',
    header: 'Name',
    sortField: 'name',
    primary: true,
    cell: (category) => (
      <span className="inline-flex flex-wrap items-center gap-2">
        {category.name}
        {category.is_predefined ? (
          <Badge variant="outline">Predefined</Badge>
        ) : null}
      </span>
    ),
  },
  {
    id: 'type',
    header: 'For',
    cell: (category) => `${typeLabel(category.warehouse_type)} items`,
  },
  {
    id: 'specifications',
    header: 'Specifications',
    cell: (category) => category.specification_template?.name ?? '–',
  },
  {
    id: 'status',
    header: 'Status',
    cell: (category) => <ActiveBadge active={category.is_active} />,
  },
];

export function CategoriesPage() {
  const me = useCurrentUser();
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useCatalogueList(
    'categories',
    list.query,
  );
  const [editing, setEditing] = useState<Category | null | undefined>(
    undefined,
  );
  const types = manageableTypes(me, 'CATEGORY_MANAGE');
  const admin = isAdministrator(me);
  // Predefined categories are for administrators (items/services/categories.py).
  const mayEdit = (category: Category) =>
    types.includes(category.warehouse_type) &&
    (admin || !category.is_predefined);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Categories"
        description="Groups of items. General and IT items have separate categories."
        actions={
          types.length > 0 ? (
            <Button onClick={() => setEditing(null)}>
              <Plus aria-hidden />
              New category
            </Button>
          ) : null
        }
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search categories"
            placeholder="Search by name"
            value={list.state.search}
            onChange={(search) => list.update({ search })}
          />
        }
      >
        <FilterSlot>
          <SelectField
            aria-label="Type"
            noneLabel="General and IT"
            value={list.state.filters.warehouse_type}
            onChange={(warehouse_type) =>
              list.update({ filters: { warehouse_type } })
            }
            options={TYPE_OPTIONS}
          />
        </FilterSlot>
        <FilterSlot>
          <SelectField
            aria-label="Origin"
            noneLabel="Any origin"
            value={list.state.filters.is_predefined}
            onChange={(is_predefined) =>
              list.update({ filters: { is_predefined } })
            }
            options={PREDEFINED_OPTIONS}
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
        caption="Categories"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(category) => category.id}
        actions={(category) =>
          mayEdit(category) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(category)}
              aria-label={`Edit ${category.name}`}
            >
              <Pencil aria-hidden />
              Edit
            </Button>
          ) : null
        }
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No categories match"
              description="Try a different search or filter."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No categories yet"
              description="Items need a category before they can be created."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="categories"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {editing !== undefined ? (
        <CategoryDialog
          key={editing?.id ?? 'new'}
          category={editing}
          types={types}
          admin={admin}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  );
}

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter the name.')
    .max(100, 'Use at most 100 characters.'),
  warehouse_type: z.string().min(1, 'Choose a type.'),
  is_predefined: z.boolean(),
  is_active: z.boolean(),
  specification_template_id: z.string(),
});
type Values = z.infer<typeof schema>;

type CategoryDialogProps = {
  category: Category | null;
  /** The types this user may create categories for. */
  types: WarehouseType[];
  admin: boolean;
  onClose: () => void;
};

function CategoryDialog({
  category,
  types,
  admin,
  onClose,
}: CategoryDialogProps) {
  const save = useSaveCatalogue('categories');
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: category?.name ?? '',
      warehouse_type:
        category?.warehouse_type ?? (types.length === 1 ? types[0] : ''),
      is_predefined: category?.is_predefined ?? false,
      is_active: category?.is_active ?? true,
      specification_template_id: category?.specification_template?.id ?? '',
    },
  });
  // Active templates only: an inactive one can no longer be given to a category.
  const templates = useCatalogueOptions('specification-templates', {
    is_active: true,
  });
  const current = category?.specification_template;
  const templateOptions = [
    ...(current &&
    !templates.data?.records.some((template) => template.id === current.id)
      ? [{ value: current.id, label: current.name }]
      : []),
    ...(templates.data?.records ?? []).map((template) => ({
      value: template.id,
      label: template.name,
    })),
  ];
  const { errors } = form.formState;
  const isActive = useWatch({ control: form.control, name: 'is_active' });
  const isPredefined = useWatch({
    control: form.control,
    name: 'is_predefined',
  });

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    // Only an administrator may send the predefined flag at all; for others it is left out.
    const predefined = admin ? { is_predefined: values.is_predefined } : {};
    // Sent only when chosen or changed: the backend refuses a change while items hold specifications.
    const chosen = values.specification_template_id || null;
    const template =
      chosen !== (current?.id ?? null)
        ? { specification_template_id: chosen }
        : {};
    save.mutate(
      category
        ? {
            id: category.id,
            values: {
              name: values.name,
              is_active: values.is_active,
              ...predefined,
              ...template,
            },
          }
        : {
            values: {
              name: values.name,
              warehouse_type: values.warehouse_type as WarehouseType,
              ...predefined,
              ...template,
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
              'name',
              'warehouse_type',
              'is_predefined',
              'is_active',
              'specification_template_id',
            ]),
          ),
      },
    );
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={category ? `Edit ${category.name}` : 'New category'}
      onSubmit={submit}
      submitLabel={category ? 'Save changes' : 'Create category'}
      isSubmitting={save.isPending}
      error={formError}
    >
      <Field
        label="Name"
        required
        description="Unique among the categories of its type."
        error={errors.name?.message}
      >
        {(control) => <Input {...control} {...form.register('name')} />}
      </Field>
      <Field
        label="For"
        required={!category}
        description={
          category
            ? 'The type of a category is fixed.'
            : 'Whether it groups general items or IT items.'
        }
        error={errors.warehouse_type?.message}
      >
        {(control) =>
          category || types.length === 1 ? (
            <Input
              disabled
              readOnly
              value={`${typeLabel((category?.warehouse_type ?? types[0]) as WarehouseType)} items`}
              {...control}
            />
          ) : (
            <Controller
              control={form.control}
              name="warehouse_type"
              render={({ field }) => (
                <SelectField
                  {...control}
                  placeholder="Choose a type"
                  value={field.value}
                  onChange={field.onChange}
                  options={TYPE_OPTIONS.filter((option) =>
                    types.includes(option.value as WarehouseType),
                  )}
                />
              )}
            />
          )
        }
      </Field>
      <Field
        label="Specifications"
        description={
          templates.data?.truncated
            ? 'The technical details its items describe. Only the first 100 templates are listed.'
            : 'The technical details its items describe. It cannot change while items of the category hold specifications.'
        }
        error={errors.specification_template_id?.message}
      >
        {(control) => (
          <Controller
            control={form.control}
            name="specification_template_id"
            render={({ field }) => (
              <SelectField
                {...control}
                noneLabel="No specifications"
                value={field.value}
                onChange={field.onChange}
                options={templateOptions}
              />
            )}
          />
        )}
      </Field>
      {admin ? (
        <SwitchField
          label="Predefined"
          description="A predefined category can only be changed by an administrator."
          checked={isPredefined}
          onChange={(checked) =>
            form.setValue('is_predefined', checked, { shouldDirty: true })
          }
        />
      ) : null}
      {category ? (
        <SwitchField
          label="Active"
          description="An inactive category cannot be chosen for new items."
          checked={isActive}
          onChange={(checked) =>
            form.setValue('is_active', checked, { shouldDirty: true })
          }
        />
      ) : null}
    </FormDialog>
  );
}
