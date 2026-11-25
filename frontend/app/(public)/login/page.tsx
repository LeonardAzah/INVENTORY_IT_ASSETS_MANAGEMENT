import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PublicShell } from '@/components/layout/public-shell';
import { LoginForm } from '@/features/auth/components/login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <PublicShell
      title="Sign in"
      description="Use the email address your account was created with."
      footer="Accounts are created by an administrator. If you have none, ask yours for an invitation."
    >
      <Suspense fallback={<div className="h-64" aria-hidden />}>
        <LoginForm />
      </Suspense>
    </PublicShell>
  );
}
