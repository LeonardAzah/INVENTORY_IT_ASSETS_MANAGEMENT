import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { UnitsPage } from '@/features/inventory/components/units-page';

export const metadata: Metadata = { title: 'Serial numbers' };

export default function Page() {
  return (
    <RequirePermission anyOf={['INVENTORY_VIEW']}>
      <Suspense fallback={<ListPageSkeleton />}>
        <UnitsPage />
      </Suspense>
    </RequirePermission>
  );
}
