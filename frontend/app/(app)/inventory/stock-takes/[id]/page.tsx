import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { StockTakeDetail } from '@/features/inventory/components/stock-take-detail';
import { GENERAL_STOCK_DOCUMENTS } from '@/lib/permissions/navigation';

export const metadata: Metadata = { title: 'Stock-take' };

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function Page({ params }: Props) {
  return (
    <RequirePermission anyOf={GENERAL_STOCK_DOCUMENTS}>
      <Suspense fallback={<ListPageSkeleton />}>
        {params.then(({ id }) => (
          <StockTakeDetail id={id} />
        ))}
      </Suspense>
    </RequirePermission>
  );
}
