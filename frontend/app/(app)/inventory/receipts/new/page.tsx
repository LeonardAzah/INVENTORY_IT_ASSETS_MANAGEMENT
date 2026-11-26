import type { Metadata } from 'next';

import { RequirePermission } from '@/components/shared/can';
import { NewReceipt } from '@/features/inventory/components/document-form';

export const metadata: Metadata = { title: 'New receipt' };

export default function Page() {
  return (
    <RequirePermission anyOf={['INVENTORY_RECEIVE', 'IT_STOCK_RECEIVE']}>
      <NewReceipt />
    </RequirePermission>
  );
}
