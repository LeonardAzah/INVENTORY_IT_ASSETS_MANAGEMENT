import { DashboardPage } from '@/features/reports/components/dashboard';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Dashboard' };

export default function Page() {
  return <DashboardPage />;
}
