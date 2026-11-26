import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequirePermission } from '@/components/shared/can';
import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { UsersPage } from '@/features/accounts/components/users-page';

export const metadata: Metadata = { title: 'Users' };

export default function Page() {
  return (
    <RequirePermission anyOf={['USER_MANAGE', 'USER_VIEW']}>
      <Suspense fallback={<ListPageSkeleton />}>
        <UsersPage />
      </Suspense>
    </RequirePermission>
  );
}
