import type { Metadata } from 'next';
import { PublicShell } from '@/components/layout/public-shell';
import { SetPasswordForm } from '@/features/auth/components/set-password-form';

export const metadata: Metadata = {
  title: 'Choose a new password',
  referrer: 'no-referrer',
};

type ResetPasswordPageProps = {
  params: Promise<{
    uid: string;
    token: string;
  }>;
};

export default async function ResetPasswordPage({
  params,
}: ResetPasswordPageProps) {
  const { uid, token } = await params;

  return (
    <PublicShell title="Choose a new password">
      <SetPasswordForm mode="reset" uid={uid} token={token} />
    </PublicShell>
  );
}
