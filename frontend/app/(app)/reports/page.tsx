import type { Metadata } from 'next';

import { RequirePermission } from '@/components/shared/can';
import { ReportsIndex } from '@/features/reports/components/reports-page';

export const metadata: Metadata = { title: 'Reports' };

export default function Page() {
  return (
    <RequirePermission
      anyOf={['REPORT_VIEW_INVENTORY', 'REPORT_VIEW_ASSETS', 'AUDIT_VIEW']}
    >
      <ReportsIndex />
    </RequirePermission>
  );
}
