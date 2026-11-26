'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';

import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import { SelectField } from '@/components/shared/select-field';
import { Input } from '@/components/ui/input';
import type { Role } from '@/features/auth/types';
import {
  useDepartmentChoices,
  useOfficeChoices,
  useRegionChoices,
} from '@/features/organization/components/shared';
import { applyServerErrors } from '@/lib/forms/server-errors';

import {
  useGrantableRoles,
  useGrantJurisdiction,
  useSetRole,
  type JurisdictionInput,
} from '../api';
import { accountName, type AccountDetail } from '../types';
import {
  levelOf,
  RoleFields,
  scopeOf,
  toJurisdiction,
  type RoleScope,
} from './role-fields';

const roleSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Give a reason.')
    .max(255, 'Use at most 255 characters.'),
});
type RoleValues = z.infer<typeof roleSchema>;

export function RoleDialog({
  account,
  onClose,
}: {
  account: AccountDetail;
  onClose: () => void;
}) {
  const grantable = useGrantableRoles();
  const setRole = useSetRole(account.id);
  const [scope, setScope] = useState<RoleScope>(scopeOf(account.role));
  const [scopeErrors, setScopeErrors] = useState<
    Partial<Record<keyof RoleScope, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RoleValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: { reason: '' },
  });
  const { errors } = form.formState;
  const roles = grantable.data ?? [];

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    const { jurisdiction, missing } = toJurisdiction(
      levelOf(roles, scope.role),
      scope,
    );
    if (missing) {
      setScopeErrors({ [missing]: 'This role needs it.' });
      return;
    }
    setScopeErrors({});
    setRole.mutate(
      {
        role: scope.role as Role,
        reason: values.reason,
        ...(jurisdiction ? { jurisdiction } : {}),
      },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          onClose();
        },
        onError: (error) =>
          setFormError(applyServerErrors(error, form.setError, ['reason'])),
      },
    );
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Change the role of ${accountName(account)}`}
      description="The role decides which actions the person can take; the jurisdiction that comes with it decides where. The new jurisdiction replaces the current ones."
      onSubmit={submit}
      submitLabel="Change role"
      isSubmitting={setRole.isPending}
      error={formError}
    >
      <RoleFields
        roles={roles}
        value={scope}
        onChange={setScope}
        errors={scopeErrors}
      />
      <Field
        label="Reason"
        required
        description="Recorded in the audit log."
        error={errors.reason?.message}
      >
        {(control) => (
          <Input autoComplete="off" {...control} {...form.register('reason')} />
        )}
      </Field>
    </FormDialog>
  );
}

const jurisdictionSchema = z.object({
  region_id: z.string().min(1, 'Choose a region.'),
  office_id: z.string(),
  department_id: z.string(),
});
type JurisdictionValues = z.infer<typeof jurisdictionSchema>;

/**
 * Gives an account a management scope: a whole region, one office with what is under it,
 * or one department. The most specific level chosen is what is granted.
 */
export function JurisdictionDialog({
  account,
  onClose,
}: {
  account: AccountDetail;
  onClose: () => void;
}) {
  const grant = useGrantJurisdiction(account.id);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<JurisdictionValues>({
    resolver: zodResolver(jurisdictionSchema),
    defaultValues: { region_id: '', office_id: '', department_id: '' },
  });
  const { errors } = form.formState;
  const regionId = useWatch({ control: form.control, name: 'region_id' });
  const officeId = useWatch({ control: form.control, name: 'office_id' });
  const regions = useRegionChoices(true);
  const offices = useOfficeChoices(
    { region: regionId, activeOnly: true },
    Boolean(regionId),
  );
  const departments = useDepartmentChoices(
    { office: officeId, activeOnly: true },
    Boolean(officeId),
  );

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    const input: JurisdictionInput = values.department_id
      ? { department_id: values.department_id }
      : values.office_id
        ? { office_id: values.office_id }
        : { region_id: values.region_id };
    grant.mutate(input, {
      onSuccess: (response) => {
        toast.success(response.message);
        onClose();
      },
      onError: (error) =>
        setFormError(
          applyServerErrors(error, form.setError, [
            'region_id',
            'office_id',
            'department_id',
          ]),
        ),
    });
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Management scope for ${accountName(account)}`}
      description="Where this person's management actions apply. It gives no right to operate a warehouse or handle IT assets."
      onSubmit={submit}
      submitLabel="Grant scope"
      isSubmitting={grant.isPending}
      error={formError}
    >
      <Field
        label="Region"
        required
        description={regions.note}
        error={errors.region_id?.message}
      >
        {(control) => (
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
                  form.setValue('office_id', '');
                  form.setValue('department_id', '');
                }}
                options={regions.options}
              />
            )}
          />
        )}
      </Field>
      <Field
        label="Office"
        description={
          offices.note ?? 'Optional. An office includes the offices under it.'
        }
        error={errors.office_id?.message}
      >
        {(control) => (
          <Controller
            control={form.control}
            name="office_id"
            render={({ field }) => (
              <SelectField
                {...control}
                noneLabel="The whole region"
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  form.setValue('department_id', '');
                }}
                options={offices.options}
                disabled={!regionId}
              />
            )}
          />
        )}
      </Field>
      <Field
        label="Department"
        description={departments.note ?? 'Optional.'}
        error={errors.department_id?.message}
      >
        {(control) => (
          <Controller
            control={form.control}
            name="department_id"
            render={({ field }) => (
              <SelectField
                {...control}
                noneLabel="The whole office"
                value={field.value}
                onChange={field.onChange}
                options={departments.options}
                disabled={!officeId}
              />
            )}
          />
        )}
      </Field>
    </FormDialog>
  );
}
