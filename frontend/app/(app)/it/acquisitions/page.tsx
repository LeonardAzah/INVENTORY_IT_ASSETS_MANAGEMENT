import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { AcquisitionsPage } from '@/features/assets/components/acquisitions-page';

export const metadata: Metadata = { title: 'Acquisitions' };

export default function Page() {
  return (
    <RequirePermission anyOf={['IT_ACQUISITION_RECORD']}>
      <Suspense fallback={<ListPageSkeleton />}>
        <AcquisitionsPage />
      </Suspense>
    </RequirePermission>
  );
}
