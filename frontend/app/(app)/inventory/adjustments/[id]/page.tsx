import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { AdjustmentDetail } from '@/features/inventory/components/adjustments-page';
import { GENERAL_STOCK_DOCUMENTS } from '@/lib/permissions/navigation';

export const metadata: Metadata = { title: 'Adjustment' };

export default function Page({
  params,
}: PageProps<'/inventory/adjustments/[id]'>) {
  return (
    <RequirePermission anyOf={GENERAL_STOCK_DOCUMENTS}>
      <Suspense fallback={<ListPageSkeleton />}>
        {params.then(({ id }) => (
          <AdjustmentDetail id={id} />
        ))}
      </Suspense>
    </RequirePermission>
  );
}
