import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { OfficesPage } from '@/features/organization/components/offices-page';

export const metadata: Metadata = { title: 'Offices' };

export default function Page() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <OfficesPage />
    </Suspense>
  );
}
