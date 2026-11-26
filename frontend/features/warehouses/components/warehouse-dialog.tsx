'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';

import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import { SelectField } from '@/components/shared/select-field';
import { SwitchField } from '@/components/shared/switch-field';
import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/features/auth/session';
import {
  useDepartmentChoices,
  useOfficeChoices,
} from '@/features/organization/components/shared';
import { refLabel } from '@/features/organization/types';
import { applyServerErrors } from '@/lib/forms/server-errors';
import { isAdministrator } from '@/lib/permissions/codes';

import { useSaveWarehouse } from '../api';
import {
  TYPE_LABELS,
  TYPE_OPTIONS,
  type Warehouse,
  type WarehouseType,
} from '../types';

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,12}$/, 'Use 2 to 12 letters or digits.'),
  name: z
    .string()
    .trim()
    .min(1, 'Enter the name.')
    .max(150, 'Use at most 150 characters.'),
  type: z.string().min(1, 'Choose a type.'),
  office_id: z.string().min(1, 'Choose an office.'),
  department_id: z.string(),
  is_active: z.boolean(),
  is_regional_store: z.boolean(),
});
type Values = z.infer<typeof schema>;

const FIELDS = [
  'code',
  'name',
  'type',
  'office_id',
  'department_id',
  'is_active',
  'is_regional_store',
] as const;

type WarehouseDialogProps = {
  warehouse: Warehouse | null;
  onClose: () => void;
};

export function WarehouseDialog({ warehouse, onClose }: WarehouseDialogProps) {
  const me = useCurrentUser();
  const mayChooseIt = isAdministrator(me) || me.is_computing_chief;
  const marksRegionalStore = isAdministrator(me);
  const save = useSaveWarehouse();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: warehouse?.code ?? '',
      name: warehouse?.name ?? '',
      type: warehouse?.type ?? 'GENERAL',
      office_id: warehouse?.office.id ?? '',
      department_id: warehouse?.department?.id ?? '',
      is_active: warehouse?.is_active ?? true,
      is_regional_store: warehouse?.is_regional_store ?? false,
    },
  });
  const { errors } = form.formState;
  const type = useWatch({ control: form.control, name: 'type' });
  const officeId = useWatch({ control: form.control, name: 'office_id' });
  const isActive = useWatch({ control: form.control, name: 'is_active' });
  const isRegionalStore = useWatch({
    control: form.control,
    name: 'is_regional_store',
  });
  const offices = useOfficeChoices({ activeOnly: true }, !warehouse);
  const departments = useDepartmentChoices(
    { office: officeId, activeOnly: true },
    Boolean(officeId) && !warehouse,
  );
  const departmentOptions = departments.records
    .filter(
      (department) => (department.kind === 'REGIONAL_IT') === (type === 'IT'),
    )
    .map((department) => ({
      value: department.id,
      label: refLabel(department),
    }));

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    save.mutate(
      warehouse
        ? {
            id: warehouse.id,
            values: {
              name: values.name,
              is_active: values.is_active,
              ...(marksRegionalStore
                ? { is_regional_store: values.is_regional_store }
                : {}),
            },
          }
        : {
            values: {
              code: values.code,
              name: values.name,
              type: values.type as WarehouseType,
              office_id: values.office_id,
              department_id: values.department_id || null,
              ...(marksRegionalStore && values.type === 'GENERAL'
                ? { is_regional_store: values.is_regional_store }
                : {}),
            },
          },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          onClose();
        },
        onError: (error) =>
          setFormError(applyServerErrors(error, form.setError, FIELDS)),
      },
    );
  });

  if (warehouse) {
    return (
      <FormDialog
        open
        onOpenChange={(open) => (open ? undefined : onClose())}
        title={`Edit ${warehouse.name}`}
        description="The code, the type and the place of a warehouse are fixed."
        onSubmit={submit}
        submitLabel="Save changes"
        isSubmitting={save.isPending}
        error={formError}
      >
        <Field label="Name" required error={errors.name?.message}>
          {(control) => <Input {...control} {...form.register('name')} />}
        </Field>
        <SwitchField
          label="Active"
          description="A warehouse can be made inactive only when it has no Store Keeper and holds no stock."
          checked={isActive}
          onChange={(checked) =>
            form.setValue('is_active', checked, { shouldDirty: true })
          }
        />
        {marksRegionalStore && warehouse.type === 'GENERAL' ? (
          <RegionalStoreSwitch
            checked={isRegionalStore}
            onChange={(checked) =>
              form.setValue('is_regional_store', checked, { shouldDirty: true })
            }
          />
        ) : null}
      </FormDialog>
    );
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="New warehouse"
      description="Each warehouse keeps its own stock. The code, the type and the place cannot be changed later."
      onSubmit={submit}
      submitLabel="Create warehouse"
      isSubmitting={save.isPending}
      error={formError}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Code"
          required
          description="2 to 12 letters or digits. Saved in capitals; it appears in document references."
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
            mayChooseIt
              ? "General: quantities, run by a Store Keeper. IT: serialized equipment, one per region, run by the region's IT staff."
              : `${TYPE_LABELS.GENERAL}: quantities, run by a Store Keeper.`
          }
          error={errors.type?.message}
        >
          {(control) =>
            mayChooseIt ? (
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <SelectField
                    {...control}
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      // The departments on offer depend on the type: choose again.
                      form.setValue('department_id', '');
                    }}
                    options={TYPE_OPTIONS}
                  />
                )}
              />
            ) : (
              <Input
                disabled
                readOnly
                value={TYPE_LABELS.GENERAL}
                {...control}
              />
            )
          }
        </Field>
      </div>
      <Field label="Name" required error={errors.name?.message}>
        {(control) => <Input {...control} {...form.register('name')} />}
      </Field>
      <Field
        label="Office"
        required
        description={offices.note}
        error={errors.office_id?.message}
      >
        {(control) => (
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
        )}
      </Field>
      <Field
        label="Department"
        required={type === 'IT'}
        description={
          type === 'IT'
            ? "An IT warehouse belongs to the region's Regional IT department."
            : 'Optional. The Regional IT department holds only the IT warehouse, so it is not offered.'
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
                noneLabel={type === 'IT' ? undefined : 'No department'}
                placeholder={
                  officeId ? 'Choose a department' : 'Choose an office first'
                }
                value={field.value}
                onChange={field.onChange}
                options={departmentOptions}
                disabled={!officeId}
              />
            )}
          />
        )}
      </Field>
      {marksRegionalStore && type === 'GENERAL' ? (
        <RegionalStoreSwitch
          checked={isRegionalStore}
          onChange={(checked) =>
            form.setValue('is_regional_store', checked, { shouldDirty: true })
          }
        />
      ) : null}
    </FormDialog>
  );
}

function RegionalStoreSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <SwitchField
      label="Regional store"
      description="The store that supplies the region. A region has one; its Store Keeper is appointed by the Regional Representative."
      checked={checked}
      onChange={onChange}
    />
  );
}
