import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { AcquisitionDetail } from '@/features/assets/components/acquisitions-page';

export const metadata: Metadata = { title: 'Acquisition' };

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function Page({ params }: Props) {
  return (
    <RequirePermission anyOf={['IT_ACQUISITION_RECORD']}>
      <Suspense fallback={<ListPageSkeleton />}>
        {params.then(({ id }) => (
          <AcquisitionDetail id={id} />
        ))}
      </Suspense>
    </RequirePermission>
  );
}
