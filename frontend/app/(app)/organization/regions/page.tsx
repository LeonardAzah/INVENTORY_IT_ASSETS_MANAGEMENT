import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { RegionsPage } from '@/features/organization/components/regions-page';

export const metadata: Metadata = { title: 'Regions' };

export default function Page() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <RegionsPage />
    </Suspense>
  );
}
