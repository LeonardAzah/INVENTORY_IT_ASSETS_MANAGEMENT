import type { Metadata } from 'next';

import { RequirePermission } from '@/components/shared/can';
import { NewIssue } from '@/features/inventory/components/document-form';

export const metadata: Metadata = { title: 'New issue' };

export default function Page() {
  return (
    <RequirePermission anyOf={['INVENTORY_ISSUE']}>
      <NewIssue />
    </RequirePermission>
  );
}
