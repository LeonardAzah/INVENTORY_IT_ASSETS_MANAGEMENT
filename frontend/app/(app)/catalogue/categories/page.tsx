import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { CategoriesPage } from '@/features/catalogue/components/categories-page';

export const metadata: Metadata = { title: 'Categories' };

export default function Page() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <CategoriesPage />
    </Suspense>
  );
}
