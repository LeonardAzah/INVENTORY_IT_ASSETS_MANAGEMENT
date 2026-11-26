'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';

import { Can } from '@/components/shared/can';
import { DataTable, type Column } from '@/components/shared/data-table';
import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import { PageHeader } from '@/components/shared/page-header';
import { SelectField } from '@/components/shared/select-field';
import {
  ActiveBadge,
  EmptyState,
  ErrorState,
} from '@/components/shared/states';
import { SwitchField } from '@/components/shared/switch-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api/errors';
import { applyServerErrors } from '@/lib/forms/server-errors';

import { useSaveField, useTemplate, type FieldRules } from '../api';
import { describeField, trimDecimal } from '../specifications';
import {
  SPEC_TYPE_LABELS,
  SPEC_TYPE_OPTIONS,
  type SpecDataType,
  type SpecificationField,
  type SpecificationTemplate,
} from '../types';
import { TemplateDialog } from './templates-page';

const BACK_LINK =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

function BackLink() {
  return (
    <Link href="/catalogue/specifications" className={BACK_LINK}>
      <ArrowLeft className="size-4" aria-hidden />
      Specification templates
    </Link>
  );
}

const CHOICE_TYPES: SpecDataType[] = ['CHOICE', 'MULTI_CHOICE'];
const NUMBER_TYPES: SpecDataType[] = ['INTEGER', 'DECIMAL', 'MEASURE'];
const DECIMAL_TYPES: SpecDataType[] = ['DECIMAL', 'MEASURE'];

function rulesOf(field: SpecificationField): string {
  if (CHOICE_TYPES.includes(field.data_type)) return field.choices.join(', ');
  const parts: string[] = [];
  if (DECIMAL_TYPES.includes(field.data_type)) {
    parts.push(
      field.decimal_places === 0
        ? 'Whole numbers'
        : `Up to ${field.decimal_places} decimal places`,
    );
  }
  const range = NUMBER_TYPES.includes(field.data_type)
    ? describeField({ ...field, help_text: '' })
    : undefined;
  if (range) parts.push(range);
  return parts.join('. ') || '–';
}

const COLUMNS: Column<SpecificationField>[] = [
  {
    id: 'label',
    header: 'Specification',
    primary: true,
    cell: (field) => (
      <span className="inline-flex flex-wrap items-center gap-2">
        {field.label}
        {field.required ? <Badge variant="outline">Required</Badge> : null}
      </span>
    ),
  },
  {
    id: 'key',
    header: 'Key',
    cell: (field) => <code className="text-sm">{field.key}</code>,
  },
  {
    id: 'kind',
    header: 'Kind',
    cell: (field) =>
      `${SPEC_TYPE_LABELS[field.data_type] ?? field.data_type}${field.unit_label ? ` (${field.unit_label})` : ''}`,
  },
  { id: 'rules', header: 'Rules', cell: rulesOf },
  {
    id: 'status',
    header: 'Status',
    cell: (field) => <ActiveBadge active={field.is_active} />,
  },
];

export function TemplateDetail({ id }: { id: string }) {
  const {
    data: template,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useTemplate(id);

  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="Loading template"
      >
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!template) {
    const missing = isApiError(error) && error.kind === 'not_found';
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <div className="bg-card rounded-lg border">
          {missing ? (
            <EmptyState
              title="Template not found"
              description="This specification template does not exist."
            />
          ) : (
            <ErrorState
              title="The template could not be loaded"
              error={error}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          )}
        </div>
      </div>
    );
  }
  return <Loaded template={template} isFetching={isFetching} />;
}

function Loaded({
  template,
  isFetching,
}: {
  template: SpecificationTemplate;
  isFetching: boolean;
}) {
  const [editingTemplate, setEditingTemplate] = useState(false);
  // undefined: no dialog; null: a new field.
  const [editingField, setEditingField] = useState<
    SpecificationField | null | undefined
  >(undefined);

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={template.name}
        description={`Template ${template.code}`}
        actions={
          <Can anyOf={['SPEC_TEMPLATE_MANAGE']}>
            <Button variant="outline" onClick={() => setEditingTemplate(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
          </Can>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Specifications
            <ActiveBadge active={template.is_active} />
          </CardTitle>
          <CardDescription>
            {template.description ||
              "What the items of the categories using this template describe. A field's key and kind never change; a field can be deactivated, and items keep the values they hold for it."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Can anyOf={['SPEC_TEMPLATE_MANAGE']}>
            <Button
              className="self-start"
              onClick={() => setEditingField(null)}
            >
              <Plus aria-hidden />
              Add a specification
            </Button>
          </Can>
          <DataTable
            caption={`Specifications of ${template.name}`}
            columns={COLUMNS}
            rows={template.fields}
            rowId={(field) => field.id}
            actions={(field) => (
              <Can anyOf={['SPEC_TEMPLATE_MANAGE']}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingField(field)}
                  aria-label={`Edit ${field.label}`}
                >
                  <Pencil aria-hidden />
                  Edit
                </Button>
              </Can>
            )}
            // The fields come in display order with the template; there is nothing to sort.
            ordering=""
            onOrderingChange={() => undefined}
            isLoading={false}
            isFetching={isFetching}
            error={null}
            onRetry={() => undefined}
            empty={
              <EmptyState
                title="No specifications yet"
                description="Add the first one to describe this kind of item."
              />
            }
          />
        </CardContent>
      </Card>
      {editingTemplate ? (
        <TemplateDialog
          template={template}
          onClose={() => setEditingTemplate(false)}
        />
      ) : null}
      {editingField !== undefined ? (
        <FieldDialog
          key={editingField?.id ?? 'new'}
          templateId={template.id}
          field={editingField}
          onClose={() => setEditingField(undefined)}
        />
      ) : null}
    </div>
  );
}

const LIMIT = /^-?\d+(\.\d{1,6})?$/;
const LIMIT_MESSAGE =
  'Enter a number with at most 6 decimals, or leave it empty.';

/** The same shapes the backend checks (items/serializers.py); the backend checks the rest. */
const schema = z
  .object({
    creating: z.boolean(),
    key: z.string().trim(),
    label: z
      .string()
      .trim()
      .min(1, 'Enter the label.')
      .max(100, 'Use at most 100 characters.'),
    data_type: z.string().min(1, 'Choose a kind.'),
    required: z.boolean(),
    choices: z.string(),
    min_value: z
      .string()
      .trim()
      .refine((value) => value === '' || LIMIT.test(value), LIMIT_MESSAGE),
    max_value: z
      .string()
      .trim()
      .refine((value) => value === '' || LIMIT.test(value), LIMIT_MESSAGE),
    decimal_places: z.string(),
    unit_label: z.string().trim().max(20, 'Use at most 20 characters.'),
    help_text: z.string().trim().max(255, 'Use at most 255 characters.'),
    sort_order: z
      .string()
      .trim()
      .regex(/^\d{1,5}$/, 'Enter a whole number from 0.'),
    is_active: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.creating && !/^[a-z][a-z0-9_]{0,49}$/.test(values.key)) {
      context.addIssue({
        code: 'custom',
        path: ['key'],
        message:
          "Use up to 50 lower-case letters, digits or '_', starting with a letter.",
      });
    }
    if (
      CHOICE_TYPES.includes(values.data_type as SpecDataType) &&
      lines(values.choices).length === 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['choices'],
        message: 'List at least one choice.',
      });
    }
    if (values.data_type === 'MEASURE' && values.unit_label === '') {
      context.addIssue({
        code: 'custom',
        path: ['unit_label'],
        message: 'A measure needs a unit, e.g. m or GB.',
      });
    }
  });
type Values = z.infer<typeof schema>;

const FIELDS = [
  'key',
  'label',
  'data_type',
  'required',
  'choices',
  'min_value',
  'max_value',
  'decimal_places',
  'unit_label',
  'help_text',
  'sort_order',
  'is_active',
] as const;

const PLACES_OPTIONS = [0, 1, 2, 3, 4, 5, 6].map((places) => ({
  value: String(places),
  label:
    places === 0
      ? 'Whole numbers'
      : `${places} decimal place${places === 1 ? '' : 's'}`,
}));

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

type FieldDialogProps = {
  templateId: string;
  /** The field to edit, or null to add one. */
  field: SpecificationField | null;
  onClose: () => void;
};

function FieldDialog({ templateId, field, onClose }: FieldDialogProps) {
  const save = useSaveField(templateId);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      creating: field === null,
      key: field?.key ?? '',
      label: field?.label ?? '',
      data_type: field?.data_type ?? '',
      required: field?.required ?? false,
      choices: (field?.choices ?? []).join('\n'),
      min_value: field?.min_value ? trimDecimal(field.min_value) : '',
      max_value: field?.max_value ? trimDecimal(field.max_value) : '',
      decimal_places: String(field?.decimal_places ?? 0),
      unit_label: field?.unit_label ?? '',
      help_text: field?.help_text ?? '',
      sort_order: String(field?.sort_order ?? 0),
      is_active: field?.is_active ?? true,
    },
  });
  const { errors } = form.formState;
  const dataType = useWatch({ control: form.control, name: 'data_type' }) as
    SpecDataType | '';
  const required = useWatch({ control: form.control, name: 'required' });
  const isActive = useWatch({ control: form.control, name: 'is_active' });
  const hasChoices = dataType !== '' && CHOICE_TYPES.includes(dataType);
  const isNumber = dataType !== '' && NUMBER_TYPES.includes(dataType);
  const hasDecimals = dataType !== '' && DECIMAL_TYPES.includes(dataType);

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    // Rules that do not suit the kind are sent empty, as the backend requires.
    const rules: FieldRules = {
      label: values.label,
      required: values.required,
      choices: hasChoices ? lines(values.choices) : [],
      min_value: isNumber && values.min_value !== '' ? values.min_value : null,
      max_value: isNumber && values.max_value !== '' ? values.max_value : null,
      decimal_places: hasDecimals ? Number(values.decimal_places) : 0,
      unit_label: isNumber ? values.unit_label : '',
      help_text: values.help_text,
      sort_order: Number(values.sort_order),
    };
    save.mutate(
      field
        ? { id: field.id, values: { ...rules, is_active: values.is_active } }
        : {
            values: {
              ...rules,
              key: values.key,
              data_type: values.data_type as SpecDataType,
            },
          },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          onClose();
        },
        onError: (error) => {
          // SPEC_FIELD_INVALID and SPEC_FIELD_IN_USE name the rule they concern.
          const target = isApiError(error) ? error.context?.field : undefined;
          if (
            typeof target === 'string' &&
            (FIELDS as readonly string[]).includes(target)
          ) {
            form.setError(target as (typeof FIELDS)[number], {
              type: 'server',
              message: (error as Error).message,
            });
            setFormError(null);
            return;
          }
          setFormError(applyServerErrors(error, form.setError, FIELDS));
        },
      },
    );
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={field ? `Edit ${field.label}` : 'Add a specification'}
      description={
        field ? 'The key and the kind of value are fixed.' : undefined
      }
      onSubmit={submit}
      submitLabel={field ? 'Save changes' : 'Add specification'}
      isSubmitting={save.isPending}
      error={formError}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Label"
          required
          description="What people read, e.g. Port count."
          error={errors.label?.message}
        >
          {(control) => <Input {...control} {...form.register('label')} />}
        </Field>
        <Field
          label="Key"
          required={!field}
          description={
            field
              ? 'Fixed.'
              : 'Lower-case, e.g. port_count. Fixed once created.'
          }
          error={errors.key?.message}
        >
          {(control) => (
            <Input
              autoComplete="off"
              disabled={Boolean(field)}
              {...control}
              {...form.register('key')}
            />
          )}
        </Field>
      </div>
      <Field
        label="Kind of value"
        required={!field}
        error={errors.data_type?.message}
      >
        {(control) =>
          field ? (
            <Input
              disabled
              readOnly
              value={SPEC_TYPE_LABELS[field.data_type] ?? field.data_type}
              {...control}
            />
          ) : (
            <Controller
              control={form.control}
              name="data_type"
              render={({ field: input }) => (
                <SelectField
                  {...control}
                  placeholder="Choose a kind"
                  value={input.value}
                  onChange={input.onChange}
                  options={SPEC_TYPE_OPTIONS}
                />
              )}
            />
          )
        }
      </Field>
      {hasChoices ? (
        <Field
          label="Choices"
          required
          description="One per line, in the order they are offered. A choice that items use cannot be removed."
          error={errors.choices?.message}
        >
          {(control) => (
            <textarea
              rows={4}
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:border-destructive w-full min-w-0 rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-2 md:text-sm"
              {...control}
              {...form.register('choices')}
            />
          )}
        </Field>
      ) : null}
      {isNumber ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Minimum" error={errors.min_value?.message}>
              {(control) => (
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  {...control}
                  {...form.register('min_value')}
                />
              )}
            </Field>
            <Field label="Maximum" error={errors.max_value?.message}>
              {(control) => (
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  {...control}
                  {...form.register('max_value')}
                />
              )}
            </Field>
            <Field
              label="Unit"
              required={dataType === 'MEASURE'}
              description="e.g. m, GB, Gbps."
              error={errors.unit_label?.message}
            >
              {(control) => (
                <Input
                  autoComplete="off"
                  {...control}
                  {...form.register('unit_label')}
                />
              )}
            </Field>
          </div>
          {hasDecimals ? (
            <Field
              label="Precision"
              description="Fixed once items hold a value for this specification."
              error={errors.decimal_places?.message}
            >
              {(control) => (
                <Controller
                  control={form.control}
                  name="decimal_places"
                  render={({ field: input }) => (
                    <SelectField
                      {...control}
                      value={input.value}
                      onChange={input.onChange}
                      options={PLACES_OPTIONS}
                    />
                  )}
                />
              )}
            </Field>
          ) : null}
        </>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field
          label="Help"
          description="Shown under the control in the item form."
          error={errors.help_text?.message}
        >
          {(control) => <Input {...control} {...form.register('help_text')} />}
        </Field>
        <Field
          label="Order"
          description="Lower comes first."
          error={errors.sort_order?.message}
        >
          {(control) => (
            <Input
              inputMode="numeric"
              autoComplete="off"
              {...control}
              {...form.register('sort_order')}
            />
          )}
        </Field>
      </div>
      <SwitchField
        label="Required"
        description="Items must give a value. Items that already exist are asked for it the next time their specifications change."
        checked={required}
        onChange={(checked) =>
          form.setValue('required', checked, { shouldDirty: true })
        }
      />
      {field ? (
        <SwitchField
          label="Active"
          description="An inactive specification is no longer offered. Items keep the values they hold for it."
          checked={isActive}
          onChange={(checked) =>
            form.setValue('is_active', checked, { shouldDirty: true })
          }
        />
      ) : null}
    </FormDialog>
  );
}
