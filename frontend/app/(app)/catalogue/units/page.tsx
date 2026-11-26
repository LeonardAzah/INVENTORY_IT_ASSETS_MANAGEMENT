import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { UnitsPage } from '@/features/catalogue/components/units-page';

export const metadata: Metadata = { title: 'Units of measure' };

export default function Page() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <UnitsPage />
    </Suspense>
  );
}
