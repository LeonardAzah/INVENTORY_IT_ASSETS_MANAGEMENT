import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { NewReturn } from '@/features/inventory/components/document-form';

export const metadata: Metadata = { title: 'New return' };

export default function Page() {
  return (
    <RequirePermission anyOf={['INVENTORY_RETURN']}>
      <Suspense fallback={<ListPageSkeleton />}>
        <NewReturn />
      </Suspense>
    </RequirePermission>
  );
}
