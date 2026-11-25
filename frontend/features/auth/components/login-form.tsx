'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Info, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { TEXT_LINK } from '@/components/layout/public-shell';
import { Field, PasswordInput } from '@/components/shared/form-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { safeNext } from '@/lib/auth/redirect';
import { applyServerErrors } from '@/lib/forms/server-errors';

import { login } from '../api';
import { loginSchema, type LoginValues } from '../schemas';

export function LoginForm() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const expired = searchParams.get('reason') === 'expired';

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: login,
    meta: { publicRequest: true },
    onSuccess: () => {
      queryClient.clear();
      window.location.assign(safeNext(searchParams.get('next')));
    },
    onError: (error) => {
      setFormError(
        applyServerErrors(error, form.setError, ['email', 'password']),
      );
    },
  });

  const busy = mutation.isPending || mutation.isSuccess;
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        setFormError(null);
        mutation.mutate(values);
      })}
    >
      {expired && !formError ? (
        <Alert variant="default">
          <Info aria-hidden />
          <AlertTitle>Your session has expired</AlertTitle>
          <AlertDescription>
            Sign in again to continue where you left off.
          </AlertDescription>
        </Alert>
      ) : null}
      {formError ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Field label="Email address" error={errors.email?.message}>
        {(control) => (
          <Input
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            {...control}
            {...form.register('email')}
          />
        )}
      </Field>
      <Field label="Password" error={errors.password?.message}>
        {(control) => (
          <PasswordInput
            autoComplete="current-password"
            {...control}
            {...form.register('password')}
          />
        )}
      </Field>

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? (
          <LoaderCircle
            className="animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        ) : null}
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className={TEXT_LINK}>
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
