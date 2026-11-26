import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { PendingRegistrationPage } from '@/features/assets/components/pending-page';

export const metadata: Metadata = { title: 'Pending registration' };

export default function Page() {
  return (
    <RequirePermission anyOf={['IT_ASSET_REGISTER']}>
      <Suspense fallback={<ListPageSkeleton />}>
        <PendingRegistrationPage />
      </Suspense>
    </RequirePermission>
  );
}
