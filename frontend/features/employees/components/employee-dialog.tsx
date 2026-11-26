'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';

import { FormDialog } from '@/components/shared/form-dialog';
import { Field } from '@/components/shared/form-field';
import { SelectField } from '@/components/shared/select-field';
import { Input } from '@/components/ui/input';
import {
  useDepartmentChoices,
  useLocationChoices,
} from '@/features/organization/components/shared';
import { applyServerErrors } from '@/lib/forms/server-errors';

import { useSaveEmployee } from '../api';
import { employeeSchema, type EmployeeValues } from '../schemas';
import { fullName, type Employee } from '../types';

const FIELDS = [
  'matricule',
  'first_name',
  'last_name',
  'email',
  'telephone',
  'department_id',
  'work_location_id',
] as const;

type EmployeeDialogProps = {
  employee: Employee | null;
  onClose: () => void;
};

export function EmployeeDialog({ employee, onClose }: EmployeeDialogProps) {
  const save = useSaveEmployee();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<EmployeeValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      matricule: employee?.matricule ?? '',
      first_name: employee?.first_name ?? '',
      last_name: employee?.last_name ?? '',
      email: employee?.email ?? '',
      telephone: employee?.telephone ?? '',
      department_id: employee?.department.id ?? '',
      work_location_id: employee?.work_location?.id ?? '',
    },
  });
  const { errors } = form.formState;
  const departmentId = useWatch({
    control: form.control,
    name: 'department_id',
  });
  const departments = useDepartmentChoices({
    activeOnly: true,
    withOffice: true,
  });
  const department = departments.records.find(
    (record) => record.id === departmentId,
  );
  const regionId =
    department?.region.id ??
    (departmentId === employee?.department.id
      ? employee?.region.id
      : undefined);
  const locations = useLocationChoices(
    { region: regionId, activeOnly: true },
    Boolean(regionId),
  );

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    save.mutate(
      {
        id: employee?.id,
        values: {
          matricule: values.matricule,
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email || null,
          telephone: values.telephone,
          department_id: values.department_id,
          work_location_id: values.work_location_id || null,
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

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={employee ? `Edit ${fullName(employee)}` : 'New employee'}
      description={
        employee
          ? undefined
          : 'An employee record is not a user account. An account can be created for the employee afterwards.'
      }
      onSubmit={submit}
      submitLabel={employee ? 'Save changes' : 'Create employee'}
      isSubmitting={save.isPending}
      error={formError}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required error={errors.first_name?.message}>
          {(control) => (
            <Input
              autoComplete="off"
              {...control}
              {...form.register('first_name')}
            />
          )}
        </Field>
        <Field label="Last name" required error={errors.last_name?.message}>
          {(control) => (
            <Input
              autoComplete="off"
              {...control}
              {...form.register('last_name')}
            />
          )}
        </Field>
        <Field
          label="Matricule"
          required
          description="Saved in capitals."
          error={errors.matricule?.message}
        >
          {(control) => (
            <Input
              autoComplete="off"
              autoCapitalize="characters"
              {...control}
              {...form.register('matricule')}
            />
          )}
        </Field>
        <Field label="Telephone" required error={errors.telephone?.message}>
          {(control) => (
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              {...control}
              {...form.register('telephone')}
            />
          )}
        </Field>
      </div>
      <Field
        label="Email address"
        description="Optional. Used to tell the employee about equipment assigned to them."
        error={errors.email?.message}
      >
        {(control) => (
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            {...control}
            {...form.register('email')}
          />
        )}
      </Field>
      <Field
        label="Department"
        required
        description={
          departments.note ??
          "The employee's office and region follow from the department."
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
                placeholder="Choose a department"
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  // The locations on offer depend on the department's region: choose again.
                  form.setValue('work_location_id', '');
                }}
                options={departments.options}
              />
            )}
          />
        )}
      </Field>
      <Field
        label="Work location"
        description={
          locations.note ?? "Optional. Any location in the employee's region."
        }
        error={errors.work_location_id?.message}
      >
        {(control) => (
          <Controller
            control={form.control}
            name="work_location_id"
            render={({ field }) => (
              <SelectField
                {...control}
                noneLabel="No work location"
                value={field.value}
                onChange={field.onChange}
                options={locations.options}
                disabled={!regionId}
              />
            )}
          />
        )}
      </Field>
    </FormDialog>
  );
}
