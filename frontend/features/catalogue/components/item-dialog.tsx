'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch, type Path } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';

import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import { SelectField } from '@/components/shared/select-field';
import { SwitchField } from '@/components/shared/switch-field';
import { Input } from '@/components/ui/input';
import { TYPE_OPTIONS, type WarehouseType } from '@/features/warehouses/types';
import { isApiError } from '@/lib/api/errors';
import { applyServerErrors } from '@/lib/forms/server-errors';

import { useCatalogueOptions, useSaveCatalogue, useTemplate } from '../api';
import {
  checkSpecs,
  sameSpecs,
  toFormValues,
  toPayload,
  type SpecFormValue,
  type SpecFormValues,
} from '../specifications';
import {
  ASSET_CLASS_OPTIONS,
  GENERAL_TRACKING_OPTIONS,
  precisionLabel,
  trackingFor,
  typeLabel,
  type AssetClass,
  type Item,
} from '../types';
import { SpecInputs } from './spec-inputs';

const schema = z
  .object({
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
      .max(150, 'Use at most 150 characters.'),
    description: z.string().trim(),
    warehouse_type: z.string().min(1, 'Choose a type.'),
    tracking: z.string(),
    category_id: z.string().min(1, 'Choose a category.'),
    unit_id: z.string().min(1, 'Choose a unit.'),
    asset_class: z.string(),
    brand: z.string().trim().max(100, 'Use at most 100 characters.'),
    model: z.string().trim().max(100, 'Use at most 100 characters.'),
    is_active: z.boolean(),
  })
  .refine(
    (values) => values.warehouse_type !== 'IT' || values.asset_class !== '',
    {
      path: ['asset_class'],
      message: 'Choose an asset class.',
    },
  );
type Values = z.infer<typeof schema>;

const FIELDS = [
  'code',
  'name',
  'description',
  'warehouse_type',
  'tracking',
  'category_id',
  'unit_id',
  'asset_class',
  'brand',
  'model',
  'is_active',
] as const;

const LOCKED_FIELD: Record<string, Path<Values>> = {
  code: 'code',
  unit: 'unit_id',
  tracking: 'tracking',
  warehouse_type: 'warehouse_type',
  asset_class: 'asset_class',
};

type ItemDialogProps = {
  item: Item | null;
  types: WarehouseType[];
  onClose: () => void;
};

export function ItemDialog({ item, types, onClose }: ItemDialogProps) {
  const save = useSaveCatalogue('items');
  const [formError, setFormError] = useState<string | null>(null);
  const [specEdits, setSpecEdits] = useState<SpecFormValues | null>(null);
  const [specErrors, setSpecErrors] = useState<Record<string, string>>({});
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: item?.code ?? '',
      name: item?.name ?? '',
      description: item?.description ?? '',
      warehouse_type:
        item?.warehouse_type ?? (types.length === 1 ? types[0] : ''),
      tracking: item?.tracking ?? 'QUANTITY',
      category_id: item?.category.id ?? '',
      unit_id: item?.unit.id ?? '',
      asset_class: item?.asset_class ?? '',
      brand: item?.brand ?? '',
      model: item?.model ?? '',
      is_active: item?.is_active ?? true,
    },
  });
  const { errors } = form.formState;
  const type = useWatch({ control: form.control, name: 'warehouse_type' });
  const isActive = useWatch({ control: form.control, name: 'is_active' });
  const categoryId = useWatch({ control: form.control, name: 'category_id' });
  const tracking = useWatch({ control: form.control, name: 'tracking' });
  const isIT = type === 'IT';
  const serialized = isIT || tracking === 'SERIALIZED';
  const categories = useCatalogueOptions(
    'categories',
    { warehouse_type: type, is_active: true },
    Boolean(type),
  );
  const units = useCatalogueOptions('units', { is_active: true });
  const categoryOptions = (categories.data?.records ?? []).map((category) => ({
    value: category.id,
    label: category.name,
  }));
  const chosenCategory = categories.data?.records.find(
    (category) => category.id === categoryId,
  );
  const templateId =
    chosenCategory?.specification_template?.id ??
    (item && categoryId === item.category.id
      ? item.category.specification_template_id
      : null);
  const template = useTemplate(templateId);
  const specValues =
    specEdits ?? toFormValues(template.data, item?.specifications);
  const changeSpec = (key: string, value: SpecFormValue) => {
    setSpecEdits({ ...specValues, [key]: value });
    setSpecErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([name]) => name !== key),
      ),
    );
  };
  const unitOptions = (units.data?.records ?? [])
    .filter((unit) => !serialized || unit.decimal_places === 0)
    .map((unit) => ({
      value: unit.id,
      label: `${unit.name} (${unit.code}) · ${precisionLabel(unit.decimal_places).toLowerCase()}`,
    }));

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    if (templateId && !template.data) {
      setFormError(
        'The specifications of this category are still loading. Try again in a moment.',
      );
      return;
    }
    const problems = checkSpecs(template.data, specValues);
    setSpecErrors(problems);
    if (Object.keys(problems).length > 0) {
      setFormError('Some specifications need attention.');
      return;
    }
    const specifications = toPayload(template.data, specValues);
    const original = item
      ? toPayload(
          template.data,
          toFormValues(template.data, item.specifications),
        )
      : {};
    const sendSpecs = !item
      ? Boolean(templateId)
      : values.category_id !== item.category.id ||
        !sameSpecs(specifications, original);
    const warehouseType = values.warehouse_type as WarehouseType;
    save.mutate(
      {
        id: item?.id,
        values: {
          code: values.code,
          name: values.name,
          description: values.description,
          category_id: values.category_id,
          unit_id: values.unit_id,
          warehouse_type: warehouseType,
          tracking: trackingFor(warehouseType, values.tracking),
          asset_class:
            warehouseType === 'IT' ? (values.asset_class as AssetClass) : null,
          brand: values.brand,
          model: values.model,
          ...(sendSpecs ? { specifications } : {}),
          ...(item ? { is_active: values.is_active } : {}),
        },
      },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          for (const warning of response.data.warnings) {
            toast(warning, { duration: 10_000, icon: '⚠️' });
          }
          onClose();
        },
        onError: (error) => {
          if (
            isApiError(error) &&
            error.errorCode === 'ITEM_IN_USE' &&
            Array.isArray(error.context?.fields)
          ) {
            for (const field of error.context.fields) {
              const target = LOCKED_FIELD[String(field)];
              if (target) {
                form.setError(target, {
                  type: 'server',
                  message: 'This can no longer change: the item is in use.',
                });
              }
            }
            setFormError(error.message);
            return;
          }
          if (isApiError(error) && error.errorCode === 'SPEC_INVALID') {
            setFormError(
              specRefusal(
                error.message,
                error.context?.fields,
                template.data?.fields ?? [],
                setSpecErrors,
              ),
            );
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
      title={item ? `Edit ${item.name}` : 'New item'}
      description={
        item
          ? 'Once an item has stock or assets, its code, type, tracking, unit and asset class can no longer change.'
          : 'A catalogue entry describes a kind of thing. Stock quantities and individual IT assets are recorded against it later.'
      }
      onSubmit={submit}
      submitLabel={item ? 'Save changes' : 'Create item'}
      isSubmitting={save.isPending}
      error={formError}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Code"
          required
          description="Up to 32 characters. Saved in capitals."
          error={errors.code?.message}
        >
          {(control) => (
            <Input
              autoCapitalize="characters"
              autoComplete="off"
              {...control}
              {...form.register('code')}
            />
          )}
        </Field>
        <Field
          label="Type"
          required
          description={
            isIT
              ? 'Serialized: every unit is registered as its own IT asset.'
              : type === 'GENERAL'
                ? 'Stock of general warehouses. It never becomes an IT asset.'
                : undefined
          }
          error={errors.warehouse_type?.message}
        >
          {(control) =>
            types.length === 1 && types[0] === type ? (
              <Input
                disabled
                readOnly
                value={typeLabel(types[0])}
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
                    onChange={(value) => {
                      field.onChange(value);
                      setSpecEdits({});
                      setSpecErrors({});
                      form.setValue('tracking', 'QUANTITY');
                      form.setValue('category_id', '');
                      form.setValue('unit_id', '');
                      form.setValue('asset_class', '');
                    }}
                    options={TYPE_OPTIONS.filter((option) =>
                      types.includes(option.value as WarehouseType),
                    )}
                  />
                )}
              />
            )
          }
        </Field>
      </div>
      {type === 'GENERAL' ? (
        <Field
          label="Tracking"
          required
          description={
            tracking === 'SERIALIZED'
              ? 'Each unit is received with its serial number and followed through issues and returns. Needs a unit that counts whole things.'
              : 'Counted as a quantity, like paper or cable by the metre.'
          }
          error={errors.tracking?.message}
        >
          {(control) => (
            <Controller
              control={form.control}
              name="tracking"
              render={({ field }) => (
                <SelectField
                  {...control}
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    form.setValue('unit_id', '');
                  }}
                  options={GENERAL_TRACKING_OPTIONS}
                />
              )}
            />
          )}
        </Field>
      ) : null}
      <Field label="Name" required error={errors.name?.message}>
        {(control) => <Input {...control} {...form.register('name')} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Category"
          required
          description={
            categories.data?.truncated
              ? 'Only the first 100 are listed.'
              : undefined
          }
          error={errors.category_id?.message}
        >
          {(control) => (
            <Controller
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <SelectField
                  {...control}
                  placeholder={
                    type ? 'Choose a category' : 'Choose a type first'
                  }
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    // Another category may describe other specifications.
                    setSpecEdits({});
                    setSpecErrors({});
                  }}
                  options={categoryOptions}
                  disabled={!type}
                />
              )}
            />
          )}
        </Field>
        <Field
          label="Unit"
          required
          description={
            serialized ? 'Only units that count whole things.' : undefined
          }
          error={errors.unit_id?.message}
        >
          {(control) => (
            <Controller
              control={form.control}
              name="unit_id"
              render={({ field }) => (
                <SelectField
                  {...control}
                  placeholder={type ? 'Choose a unit' : 'Choose a type first'}
                  value={field.value}
                  onChange={field.onChange}
                  options={unitOptions}
                  disabled={!type}
                />
              )}
            />
          )}
        </Field>
      </div>
      <div
        className={
          isIT ? 'grid gap-4 sm:grid-cols-3' : 'grid gap-4 sm:grid-cols-2'
        }
      >
        {isIT ? (
          <Field
            label="Asset class"
            required
            description="Decides what can be recorded about each asset."
            error={errors.asset_class?.message}
          >
            {(control) => (
              <Controller
                control={form.control}
                name="asset_class"
                render={({ field }) => (
                  <SelectField
                    {...control}
                    placeholder="Choose a class"
                    value={field.value}
                    onChange={field.onChange}
                    options={ASSET_CLASS_OPTIONS}
                  />
                )}
              />
            )}
          </Field>
        ) : null}
        <Field label="Brand" error={errors.brand?.message}>
          {(control) => <Input {...control} {...form.register('brand')} />}
        </Field>
        <Field label="Model" error={errors.model?.message}>
          {(control) => <Input {...control} {...form.register('model')} />}
        </Field>
      </div>
      {templateId ? (
        <section
          aria-labelledby="item-specifications"
          className="flex flex-col gap-3 rounded-md border p-3"
        >
          <h3 id="item-specifications" className="text-sm font-semibold">
            Specifications{template.data ? ` · ${template.data.name}` : ''}
          </h3>
          {template.data ? (
            <SpecInputs
              template={template.data}
              values={specValues}
              errors={specErrors}
              onChange={changeSpec}
            />
          ) : template.isError ? (
            <p role="alert" className="text-destructive text-sm">
              The specifications of this category could not be loaded.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm" role="status">
              Loading the specifications…
            </p>
          )}
        </section>
      ) : null}
      <Field label="Description" error={errors.description?.message}>
        {(control) => (
          <textarea
            rows={2}
            className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:border-destructive w-full min-w-0 rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-2 md:text-sm"
            {...control}
            {...form.register('description')}
          />
        )}
      </Field>
      {item ? (
        <SwitchField
          label="Active"
          description="An inactive item cannot be received or issued, but its history stays."
          checked={isActive}
          onChange={(checked) =>
            form.setValue('is_active', checked, { shouldDirty: true })
          }
        />
      ) : null}
    </FormDialog>
  );
}

function specRefusal(
  message: string,
  fields: unknown,
  definitions: { key: string; label: string; is_active: boolean }[],
  setSpecErrors: (errors: Record<string, string>) => void,
): string {
  const offered = new Set(
    definitions.filter((field) => field.is_active).map((field) => field.key),
  );
  const placed: Record<string, string> = {};
  const others: string[] = [];
  if (fields && typeof fields === 'object') {
    for (const [key, text] of Object.entries(
      fields as Record<string, unknown>,
    )) {
      if (offered.has(key)) {
        placed[key] = String(text);
      } else {
        const label =
          definitions.find((field) => field.key === key)?.label ?? key;
        others.push(`${label}: ${String(text)}`);
      }
    }
  }
  setSpecErrors(placed);
  return [message, ...others].join(' ');
}
