import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { ItemsPage } from '@/features/catalogue/components/items-page';

export const metadata: Metadata = { title: 'Items' };

export default function Page() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <ItemsPage />
    </Suspense>
  );
}
