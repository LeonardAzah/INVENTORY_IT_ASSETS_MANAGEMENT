import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <p className="text-sm font-medium text-neutral-600">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-neutral-600">
        The page does not exist, or you do not have access to it.
      </p>
      <Button>
        <Link href="/dashboard">Back to the dashboard</Link>
      </Button>
    </main>
  );
}
