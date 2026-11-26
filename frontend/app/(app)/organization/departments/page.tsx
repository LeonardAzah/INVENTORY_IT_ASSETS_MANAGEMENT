import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { DepartmentsPage } from '@/features/organization/components/departments-page';

export const metadata: Metadata = { title: 'Departments' };

export default function Page() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <DepartmentsPage />
    </Suspense>
  );
}
