import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { RegionDetail } from '@/features/accounts/components/region-detail';

export const metadata: Metadata = { title: 'Region' };

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      {params.then(({ id }) => (
        <RegionDetail id={id} />
      ))}
    </Suspense>
  );
}
