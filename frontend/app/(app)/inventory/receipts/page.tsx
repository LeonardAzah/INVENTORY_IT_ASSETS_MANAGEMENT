import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { ReceiptsPage } from '@/features/inventory/components/receipts-page';

export const metadata: Metadata = { title: 'Receipts' };

export default function Page() {
  return (
    <RequirePermission anyOf={['INVENTORY_VIEW']}>
      <Suspense fallback={<ListPageSkeleton />}>
        <ReceiptsPage />
      </Suspense>
    </RequirePermission>
  );
}
