import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { LocationsPage } from '@/features/organization/components/locations-page';

export const metadata: Metadata = { title: 'Locations' };

export default function Page() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <LocationsPage />
    </Suspense>
  );
}
