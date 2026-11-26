import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { ReportPage } from '@/features/reports/components/reports-page';

export const metadata: Metadata = { title: 'Report' };

export default function Page({ params }: PageProps<'/reports/[name]'>) {
  return (
    <RequirePermission
      anyOf={['REPORT_VIEW_INVENTORY', 'REPORT_VIEW_ASSETS', 'AUDIT_VIEW']}
    >
      <Suspense fallback={<ListPageSkeleton />}>
        {params.then(({ name }) => (
          <ReportPage name={name} />
        ))}
      </Suspense>
    </RequirePermission>
  );
}
