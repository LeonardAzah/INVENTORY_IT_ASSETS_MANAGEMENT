import type { Metadata } from 'next';

import { AccessDenied } from '@/components/shared/access-denied';

export const metadata: Metadata = { title: 'Access denied' };

export default function ForbiddenPage() {
  return <AccessDenied />;
}
