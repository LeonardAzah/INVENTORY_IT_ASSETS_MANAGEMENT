import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { EmployeesPage } from '@/features/employees/components/employees-page';

export const metadata: Metadata = { title: 'Employees' };

export default function Page() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <EmployeesPage />
    </Suspense>
  );
}
