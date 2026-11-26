import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { EmailLogPage } from '@/features/oversight/components/email-log-page';

export const metadata: Metadata = { title: 'Email log' };

export default function Page() {
  return (
    <RequirePermission anyOf={['AUDIT_VIEW']}>
      <Suspense fallback={<ListPageSkeleton />}>
        <EmailLogPage />
      </Suspense>
    </RequirePermission>
  );
}
