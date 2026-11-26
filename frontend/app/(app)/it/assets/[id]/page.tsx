import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { AssetDetail } from '@/features/assets/components/asset-detail';

export const metadata: Metadata = { title: 'Asset' };

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function Page({ params }: Props) {
  return (
    <RequirePermission anyOf={['IT_ASSET_VIEW']}>
      <Suspense fallback={<ListPageSkeleton />}>
        {params.then(({ id }) => (
          <AssetDetail id={id} />
        ))}
      </Suspense>
    </RequirePermission>
  );
}
