import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { IssuesPage } from '@/features/inventory/components/issues-page';
import { GENERAL_STOCK_DOCUMENTS } from '@/lib/permissions/navigation';

export const metadata: Metadata = { title: 'Issues' };

export default function Page() {
  return (
    <RequirePermission anyOf={GENERAL_STOCK_DOCUMENTS}>
      <Suspense fallback={<ListPageSkeleton />}>
        <IssuesPage />
      </Suspense>
    </RequirePermission>
  );
}
