'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';

import {
  EntityPicker,
  type PickerOption,
} from '@/components/shared/entity-picker';
import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import type { Role } from '@/features/auth/types';
import { applyServerErrors } from '@/lib/forms/server-errors';

import {
  accountKeys,
  searchEmployees,
  useGrantableRoles,
  useProvisionAccount,
} from '../api';
import {
  EMPTY_SCOPE,
  levelOf,
  RoleFields,
  toJurisdiction,
  type RoleScope,
} from './role-fields';

const schema = z.object({
  employee_id: z.string().min(1, 'Choose an employee.'),
  email: z
    .string()
    .trim()
    .min(1, 'Enter the login email.')
    .pipe(z.email('Enter a valid email address.')),
});
type Values = z.infer<typeof schema>;
type ScopeErrors = Partial<Record<keyof RoleScope, string>>;

export function ProvisionDialog({ onClose }: { onClose: () => void }) {
  const grantable = useGrantableRoles();
  const provision = useProvisionAccount();
  const [employee, setEmployee] = useState<PickerOption | null>(null);
  const [scope, setScope] = useState<RoleScope>({
    role: 'EMPLOYEE',
    ...EMPTY_SCOPE,
  });
  const [scopeErrors, setScopeErrors] = useState<ScopeErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { employee_id: '', email: '' },
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
    provision.mutate(
      {
        employee_id: values.employee_id,
        email: values.email,
        role: scope.role as Role,
        ...(jurisdiction ? { jurisdiction } : {}),
      },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          onClose();
        },
        onError: (error) =>
          setFormError(
            applyServerErrors(error, form.setError, ['employee_id', 'email']),
          ),
      },
    );
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="New account"
      description="The account belongs to an employee who already exists. They receive an email with a link to choose their password; the link works once and expires after 72 hours."
      onSubmit={submit}
      submitLabel="Create account"
      submittingLabel="Creating…"
      isSubmitting={provision.isPending}
      error={formError}
    >
      <Field
        label="Employee"
        required
        description="Only employees you can see are listed. An employee can have one account."
        error={errors.employee_id?.message}
      >
        {(control) => (
          <EntityPicker
            {...control}
            value={employee}
            onChange={(option) => {
              setEmployee(option);
              form.setValue('employee_id', option?.value ?? '', {
                shouldValidate: true,
              });
            }}
            queryKey={accountKeys.employeePicker}
            search={searchEmployees}
            placeholder="Choose an employee"
            searchPlaceholder="Search by name or matricule"
          />
        )}
      </Field>
      <Field
        label="Login email"
        required
        description="If the employee's record has an email address, this must be the same one."
        error={errors.email?.message}
      >
        {(control) => (
          <Input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="off"
            {...control}
            {...form.register('email')}
          />
        )}
      </Field>
      {roles.length > 0 ? (
        <RoleFields
          roles={roles}
          value={scope}
          onChange={setScope}
          errors={scopeErrors}
        />
      ) : null}
    </FormDialog>
  );
}
