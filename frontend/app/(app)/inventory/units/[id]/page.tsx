import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { UnitDetail } from '@/features/inventory/components/units-page';

export const metadata: Metadata = { title: 'Unit' };

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function Page({ params }: Props) {
  return (
    <RequirePermission anyOf={['INVENTORY_VIEW']}>
      {/* The id is only known when the page is requested. */}
      <Suspense fallback={<ListPageSkeleton />}>
        {params.then(({ id }) => (
          <UnitDetail id={id} />
        ))}
      </Suspense>
    </RequirePermission>
  );
}
