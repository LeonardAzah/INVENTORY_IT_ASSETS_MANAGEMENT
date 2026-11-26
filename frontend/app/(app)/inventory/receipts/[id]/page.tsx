import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { ReceiptDetail } from '@/features/inventory/components/receipt-detail';

export const metadata: Metadata = { title: 'Receipt' };

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function Page({ params }: Props) {
  return (
    <RequirePermission anyOf={['INVENTORY_VIEW']}>
      <Suspense fallback={<ListPageSkeleton />}>
        {params.then(({ id }) => (
          <ReceiptDetail id={id} />
        ))}
      </Suspense>
    </RequirePermission>
  );
}
