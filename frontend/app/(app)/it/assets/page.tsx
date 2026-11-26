import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { AssetsPage } from '@/features/assets/components/assets-page';

export const metadata: Metadata = { title: 'Asset register' };

export default function Page() {
  return (
    <RequirePermission anyOf={['IT_ASSET_VIEW']}>
      <Suspense fallback={<ListPageSkeleton />}>
        <AssetsPage />
      </Suspense>
    </RequirePermission>
  );
}
