'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

import { Field, PasswordInput } from '@/components/shared/form-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { applyServerErrors } from '@/lib/forms/server-errors';

import { changePassword } from '../api';
import {
  changePasswordSchema,
  PASSWORD_MIN_LENGTH,
  type ChangePasswordValues,
} from '../schemas';

const EMPTY: ChangePasswordValues = {
  current_password: '',
  new_password: '',
  re_new_password: '',
};

export function ChangePasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY,
  });

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: (response) => {
      form.reset(EMPTY);
      toast.success(response.message);
    },
    onError: (error) => {
      setFormError(
        applyServerErrors(error, form.setError, [
          'current_password',
          'new_password',
          're_new_password',
        ]),
      );
    },
  });

  const { errors, isDirty } = form.formState;

  return (
    <form
      noValidate
      className="flex max-w-md flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        setFormError(null);
        mutation.mutate(values);
      })}
    >
      {formError ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>The password was not changed</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Field
        label="Current password"
        error={errors.current_password?.message}
        required
      >
        {(control) => (
          <PasswordInput
            autoComplete="current-password"
            {...control}
            {...form.register('current_password')}
          />
        )}
      </Field>
      <Field
        label="New password"
        description={`At least ${PASSWORD_MIN_LENGTH} characters. Not a common password, and not only digits.`}
        error={errors.new_password?.message}
        required
      >
        {(control) => (
          <PasswordInput
            autoComplete="new-password"
            {...control}
            {...form.register('new_password')}
          />
        )}
      </Field>
      <Field
        label="Confirm new password"
        error={errors.re_new_password?.message}
        required
      >
        {(control) => (
          <PasswordInput
            autoComplete="new-password"
            {...control}
            {...form.register('re_new_password')}
          />
        )}
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <LoaderCircle
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : null}
          {mutation.isPending ? 'Saving…' : 'Change password'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending || !isDirty}
          onClick={() => {
            form.reset(EMPTY);
            setFormError(null);
          }}
        >
          Clear
        </Button>
      </div>
    </form>
  );
}
