import type { Metadata } from 'next';
import { PublicShell } from '@/components/layout/public-shell';
import { SetPasswordForm } from '@/features/auth/components/set-password-form';

export const metadata: Metadata = {
  title: 'Activate your account',
  referrer: 'no-referrer',
};

type ActivatePageProps = {
  params: Promise<{
    uid: string;
    token: string;
  }>;
};

export default async function ActivatePage({ params }: ActivatePageProps) {
  const { uid, token } = await params;

  return (
    <PublicShell
      title="Activate your account"
      description="Choose the password you will sign in with. The link in your invitation works once."
    >
      <SetPasswordForm mode="activate" uid={uid} token={token} />
    </PublicShell>
  );
}
