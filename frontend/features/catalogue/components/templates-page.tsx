'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { ROW_LINK } from '@/features/accounts/components/shared';
import { ACTIVE_OPTIONS } from '@/features/organization/types';
import { applyServerErrors } from '@/lib/forms/server-errors';
import { useListParams } from '@/lib/url/list-params';

import { useCatalogueList, useSaveCatalogue } from '../api';
import type { SpecificationTemplate } from '../types';

const FILTERS = ['is_active'] as const;

const COLUMNS: Column<SpecificationTemplate>[] = [
  {
    id: 'code',
    header: 'Code',
    sortField: 'code',
    cell: (template) => template.code,
    className: 'whitespace-nowrap',
  },
  {
    id: 'name',
    header: 'Name',
    sortField: 'name',
    primary: true,
    cell: (template) => (
      <Link
        href={`/catalogue/specifications/${template.id}`}
        className={ROW_LINK}
      >
        {template.name}
      </Link>
    ),
  },
  {
    id: 'fields',
    header: 'Specifications',
    cell: (template) => {
      const active = template.fields.filter((field) => field.is_active).length;
      return active === 1 ? '1 specification' : `${active} specifications`;
    },
  },
  {
    id: 'status',
    header: 'Status',
    cell: (template) => <ActiveBadge active={template.is_active} />,
  },
];

export function TemplatesPage() {
  const list = useListParams(FILTERS);
  const { data, error, isLoading, isFetching, refetch } = useCatalogueList(
    'specification-templates',
    list.query,
  );
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Specification templates"
        description="The technical details the items of a category describe, such as a router's ports or a jumper's length and connectors. A category points to one template."
        actions={
          <Can anyOf={['SPEC_TEMPLATE_MANAGE']}>
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New template
            </Button>
          </Can>
        }
      />
      <FilterBar
        hasFilters={list.hasFilters}
        onClear={list.clear}
        search={
          <SearchInput
            label="Search templates"
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
        caption="Specification templates"
        columns={COLUMNS}
        rows={data?.results}
        rowId={(template) => template.id}
        ordering={list.state.ordering}
        onOrderingChange={(ordering) => list.update({ ordering })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        empty={
          list.hasFilters ? (
            <EmptyState
              title="No templates match"
              description="Try a different search or status."
              action={
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No templates yet"
              description="An administrator adds a template, then gives it to the categories whose items it describes."
            />
          )
        }
      />
      <Pagination
        pagination={data?.pagination}
        noun="templates"
        onPageChange={(page) => list.update({ page })}
        onPageSizeChange={(pageSize) => list.update({ pageSize })}
      />
      {creating ? (
        <TemplateDialog template={null} onClose={() => setCreating(false)} />
      ) : null}
    </div>
  );
}

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/,
      "Use up to 32 letters, digits, '-', '_' or '.'.",
    ),
  name: z
    .string()
    .trim()
    .min(1, 'Enter the name.')
    .max(100, 'Use at most 100 characters.'),
  description: z.string().trim(),
  is_active: z.boolean(),
});
type Values = z.infer<typeof schema>;

type TemplateDialogProps = {
  template: SpecificationTemplate | null;
  onClose: () => void;
};

export function TemplateDialog({ template, onClose }: TemplateDialogProps) {
  const save = useSaveCatalogue('specification-templates');
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: template?.code ?? '',
      name: template?.name ?? '',
      description: template?.description ?? '',
      is_active: template?.is_active ?? true,
    },
  });
  const { errors } = form.formState;
  const isActive = useWatch({ control: form.control, name: 'is_active' });

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    save.mutate(
      template
        ? {
            id: template.id,
            values: {
              name: values.name,
              description: values.description,
              is_active: values.is_active,
            },
          }
        : {
            values: {
              code: values.code,
              name: values.name,
              description: values.description,
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
              'code',
              'name',
              'description',
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
      title={template ? `Edit ${template.name}` : 'New template'}
      description={
        template
          ? undefined
          : "Add its specifications on the template's page once it exists."
      }
      onSubmit={submit}
      submitLabel={template ? 'Save changes' : 'Create template'}
      isSubmitting={save.isPending}
      error={formError}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Code"
          required={!template}
          description={
            template
              ? 'The code of a template is fixed.'
              : 'Up to 32 characters. Saved in capitals.'
          }
          error={errors.code?.message}
        >
          {(control) => (
            <Input
              autoCapitalize="characters"
              autoComplete="off"
              disabled={Boolean(template)}
              {...control}
              {...form.register('code')}
            />
          )}
        </Field>
        <Field label="Name" required error={errors.name?.message}>
          {(control) => <Input {...control} {...form.register('name')} />}
        </Field>
      </div>
      <Field label="Description" error={errors.description?.message}>
        {(control) => <Input {...control} {...form.register('description')} />}
      </Field>
      {template ? (
        <SwitchField
          label="Active"
          description="An inactive template can no longer be given to a category. Categories that use it keep it."
          checked={isActive}
          onChange={(checked) =>
            form.setValue('is_active', checked, { shouldDirty: true })
          }
        />
      ) : null}
    </FormDialog>
  );
}
