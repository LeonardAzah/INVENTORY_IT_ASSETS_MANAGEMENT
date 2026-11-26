import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { BalancesPage } from '@/features/inventory/components/balances-page';

export const metadata: Metadata = { title: 'Stock balances' };

export default function Page() {
  return (
    <RequirePermission anyOf={['INVENTORY_VIEW']}>
      <Suspense fallback={<ListPageSkeleton />}>
        <BalancesPage />
      </Suspense>
    </RequirePermission>
  );
}
