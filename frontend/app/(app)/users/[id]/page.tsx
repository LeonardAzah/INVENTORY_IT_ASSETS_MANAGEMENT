import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { UserDetail } from '@/features/accounts/components/user-detail';

export const metadata: Metadata = { title: 'User' };

export default function Page({ params }: PageProps<'/users/[id]'>) {
  return (
    <RequirePermission anyOf={['USER_MANAGE', 'USER_VIEW']}>
      <Suspense fallback={<ListPageSkeleton />}>
        {params.then(({ id }) => (
          <UserDetail id={id} />
        ))}
      </Suspense>
    </RequirePermission>
  );
}
