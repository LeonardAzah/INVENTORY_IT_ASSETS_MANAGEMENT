import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { EmployeeDetail } from '@/features/employees/components/employee-detail';

export const metadata: Metadata = { title: 'Employee' };

export default function Page({ params }: PageProps<'/employees/[id]'>) {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      {params.then(({ id }) => (
        <EmployeeDetail id={id} />
      ))}
    </Suspense>
  );
}
