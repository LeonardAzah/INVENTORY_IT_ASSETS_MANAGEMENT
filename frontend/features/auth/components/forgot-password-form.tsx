'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CircleAlert, LoaderCircle, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { TEXT_LINK } from '@/components/layout/public-shell';
import { Field } from '@/components/shared/form-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { applyServerErrors } from '@/lib/forms/server-errors';

import { requestPasswordReset } from '../api';
import { forgotPasswordSchema, type ForgotPasswordValues } from '../schemas';
import { useRouter } from 'next/navigation';

export function ForgotPasswordForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordValues) =>
      requestPasswordReset(values.email),
    meta: { publicRequest: true },
    onError: (error) =>
      setFormError(applyServerErrors(error, form.setError, ['email'])),
  });

  if (mutation.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        {/* The backend's own wording: it is the same whether or not the address has an account. */}
        <Alert variant="default">
          <MailCheck aria-hidden />
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>{mutation.data.message}</AlertDescription>
        </Alert>
        <p className="text-sm text-neutral-600">
          The message can take a few minutes to arrive. Look in your spam folder
          too.
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => router.push('/login')}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        setFormError(null);
        mutation.mutate(values);
      })}
    >
      {formError ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>The request could not be sent</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <Field label="Email address" error={form.formState.errors.email?.message}>
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
      <Button type="submit" disabled={mutation.isPending} className="w-full">
        {mutation.isPending ? (
          <LoaderCircle
            className="animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        ) : null}
        {mutation.isPending ? 'Sending…' : 'Send reset link'}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className={TEXT_LINK}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
