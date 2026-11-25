'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Field, PasswordInput } from '@/components/shared/form-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/errors';
import { applyServerErrors } from '@/lib/forms/server-errors';

import { activateAccount, confirmPasswordReset, logout } from '../api';
import {
  newPasswordSchema,
  PASSWORD_MIN_LENGTH,
  type NewPasswordValues,
} from '../schemas';
import { useRouter } from 'next/navigation';

type Mode = 'reset' | 'activate';

type SetPasswordFormProps = {
  mode: Mode;
  uid: string;
  token: string;
};

type LinkProblem = 'invalid' | 'expired';

const TEXT = {
  reset: {
    submit: 'Set new password',
    submitting: 'Saving…',
    failed: 'The password was not changed',
    done: 'Your password has been changed. Sign in with the new one.',
    problem: {
      invalid: 'This reset link is not valid, or it has already been used.',
      expired: 'This reset link has expired.',
    },
    recover: { label: 'Request a new link', href: '/forgot-password' },
  },
  activate: {
    submit: 'Activate account',
    submitting: 'Activating…',
    failed: 'The account was not activated',
    done: 'Your account is active. Sign in with the password you just chose.',
    problem: {
      invalid:
        'This activation link is not valid, or it has already been used.',
      expired: 'This activation link has expired.',
    },
    recover: null,
  },
} as const;

function linkProblem(error: unknown): LinkProblem | null {
  if (!isApiError(error)) {
    return null;
  }
  if (error.errorCode === 'INVITATION_EXPIRED') {
    return 'expired';
  }
  if (error.errorCode === 'INVALID_INVITATION') {
    return 'invalid';
  }
  if (
    error.kind === 'validation' &&
    error.fieldErrors &&
    ('uid' in error.fieldErrors || 'token' in error.fieldErrors)
  ) {
    return 'invalid';
  }
  return null;
}

export function SetPasswordForm({ mode, uid, token }: SetPasswordFormProps) {
  const router = useRouter();
  const text = TEXT[mode];
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [problem, setProblem] = useState<LinkProblem | null>(null);
  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { new_password: '', re_new_password: '' },
  });

  const mutation = useMutation({
    mutationFn: async (values: NewPasswordValues) => {
      const response = await (
        mode === 'reset' ? confirmPasswordReset : activateAccount
      )({ uid, token, ...values });

      await logout().catch(() => undefined);
      queryClient.clear();
      return response;
    },
    meta: { publicRequest: true },
    onError: (error) => {
      const found = linkProblem(error);
      if (found) {
        setProblem(found);
        return;
      }
      setFormError(
        applyServerErrors(error, form.setError, [
          'new_password',
          're_new_password',
        ]),
      );
    },
  });

  if (mutation.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="default">
          <CircleCheck aria-hidden />
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{text.done}</AlertDescription>
        </Alert>
        <Button className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (problem) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="default">
          <TriangleAlert aria-hidden />
          <AlertTitle>This link cannot be used</AlertTitle>
          <AlertDescription>
            <p>{text.problem[problem]}</p>
            {mode === 'activate' ? (
              <p>Ask your administrator to send you a new invitation.</p>
            ) : null}
          </AlertDescription>
        </Alert>
        {text.recover ? (
          <Button
            className="w-full"
            onClick={() => router.push(text.recover.href)}
          >
            {text.recover.label}
          </Button>
        ) : null}
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
      {formError ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>{text.failed}</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <Field
        label="New password"
        description={`At least ${PASSWORD_MIN_LENGTH} characters. Not a common password, and not only digits.`}
        error={errors.new_password?.message}
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
      >
        {(control) => (
          <PasswordInput
            autoComplete="new-password"
            {...control}
            {...form.register('re_new_password')}
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
        {mutation.isPending ? text.submitting : text.submit}
      </Button>
    </form>
  );
}
