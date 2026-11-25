import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Shown in place of a page the signed-in user's permissions do not cover. It explains
 * what happened and offers a way on. The backend refuses the page's data regardless.
 */
export function AccessDenied() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center">
      <span className="bg-warning-50 text-warning-800 flex size-12 items-center justify-center rounded-full">
        <ShieldAlert className="size-6" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">
        You do not have access to this page
      </h1>
      <p className="text-neutral-600">
        Your role and responsibilities do not include it. If you think they
        should, ask your administrator.
      </p>
      <Button>
        <Link href="/dashboard">Back to the dashboard</Link>
      </Button>
    </div>
  );
}
