import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { TemplatesPage } from '@/features/catalogue/components/templates-page';

export const metadata: Metadata = { title: 'Specification templates' };

export default function Page() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <TemplatesPage />
    </Suspense>
  );
}
