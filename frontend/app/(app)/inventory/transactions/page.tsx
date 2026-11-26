import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { TransactionsPage } from '@/features/inventory/components/transactions-page';

export const metadata: Metadata = { title: 'Ledger' };

export default function Page() {
  return (
    <RequirePermission anyOf={['INVENTORY_VIEW']}>
      <Suspense fallback={<ListPageSkeleton />}>
        <TransactionsPage />
      </Suspense>
    </RequirePermission>
  );
}
