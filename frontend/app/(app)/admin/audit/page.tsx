import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { AuditPage } from '@/features/oversight/components/audit-page';

export const metadata: Metadata = { title: 'Audit log' };

export default function Page() {
  return (
    <RequirePermission anyOf={['AUDIT_VIEW']}>
      <Suspense fallback={<ListPageSkeleton />}>
        <AuditPage />
      </Suspense>
    </RequirePermission>
  );
}
