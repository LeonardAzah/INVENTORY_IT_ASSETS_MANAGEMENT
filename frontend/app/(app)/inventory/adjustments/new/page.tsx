import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { NewAdjustment } from '@/features/inventory/components/adjustment-form';

export const metadata: Metadata = { title: 'New adjustment' };

export default function Page() {
  return (
    <RequirePermission anyOf={['INVENTORY_ADJUST']}>
      <Suspense fallback={<ListPageSkeleton />}>
        <NewAdjustment />
      </Suspense>
    </RequirePermission>
  );
}
