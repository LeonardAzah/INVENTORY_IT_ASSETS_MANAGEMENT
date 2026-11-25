import type { Metadata } from 'next';

import { BackendStatus } from '@/features/health/components/backend-status';

export const metadata: Metadata = { title: 'System status' };

export default function StatusPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">System status</h1>
        <p className="text-neutral-600">
          Whether this application can reach its backend and database.
        </p>
      </header>
      <BackendStatus />
    </main>
  );
}
