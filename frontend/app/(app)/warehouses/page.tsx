import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { WarehousesPage } from '@/features/warehouses/components/warehouses-page';

export const metadata: Metadata = { title: 'Warehouses' };

export default function Page() {
  return (
    <RequirePermission anyOf={['WAREHOUSE_MANAGE', 'INVENTORY_VIEW']}>
      {/* The list reads its filters from the address bar, which is only known in the browser. */}
      <Suspense fallback={<ListPageSkeleton />}>
        <WarehousesPage />
      </Suspense>
    </RequirePermission>
  );
}
