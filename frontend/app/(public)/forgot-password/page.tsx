import type { Metadata } from 'next';

import { PublicShell } from '@/components/layout/public-shell';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <PublicShell
      title="Forgot your password?"
      description="Enter your email address and we will send you a link to choose a new one."
    >
      <ForgotPasswordForm />
    </PublicShell>
  );
}
