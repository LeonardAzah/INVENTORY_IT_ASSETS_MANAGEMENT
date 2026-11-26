import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { WarehouseDetail } from '@/features/warehouses/components/warehouse-detail';

export const metadata: Metadata = { title: 'Warehouse' };

export default function Page({ params }: PageProps<'/warehouses/[id]'>) {
  return (
    <RequirePermission anyOf={['WAREHOUSE_MANAGE', 'INVENTORY_VIEW']}>
      <Suspense fallback={<ListPageSkeleton />}>
        {params.then(({ id }) => (
          <WarehouseDetail id={id} />
        ))}
      </Suspense>
    </RequirePermission>
  );
}
