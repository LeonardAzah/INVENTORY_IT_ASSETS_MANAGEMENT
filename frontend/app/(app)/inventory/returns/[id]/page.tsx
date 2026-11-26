import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { ReturnDetail } from '@/features/inventory/components/document-detail';
import { GENERAL_STOCK_DOCUMENTS } from '@/lib/permissions/navigation';

export const metadata: Metadata = { title: 'Return' };

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
          <ReturnDetail id={id} />
        ))}
      </Suspense>
    </RequirePermission>
  );
}
