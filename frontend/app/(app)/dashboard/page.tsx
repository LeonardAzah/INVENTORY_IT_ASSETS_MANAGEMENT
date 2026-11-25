// import { DashboardPage } from '@/features/reports/components/dashboard';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Dashboard' };

export default function Page() {
  return <div className="flex flex-col gap-6">Dashboard</div>;
  // return <DashboardPage />;
}
