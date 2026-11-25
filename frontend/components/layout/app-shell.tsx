'use client';

import { CircleAlert, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CurrentUserProvider,
  useCurrentUserQuery,
} from '@/features/auth/session';
import { isApiError } from '@/lib/api/errors';
import { navigationFor } from '@/lib/permissions/navigation';

import { Header } from './header';
import { DesktopSidebar, MobileSidebar } from './sidebar';

function ShellSkeleton() {
  return (
    <div
      className="flex min-h-dvh"
      role="status"
      aria-label="Loading your workspace"
    >
      <div className="bg-sidebar hidden w-64 shrink-0 flex-col gap-3 border-r p-4 lg:flex">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-4 h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="bg-card flex h-14 items-center justify-between border-b px-4">
          <Skeleton className="size-8" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}

function ShellError({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-12">
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertTitle>Your workspace could not be loaded</AlertTitle>
        <AlertDescription>
          {isApiError(error)
            ? error.message
            : 'Something went wrong. Please try again.'}
        </AlertDescription>
      </Alert>
      <div>
        <Button onClick={onRetry} disabled={retrying}>
          <RefreshCw
            className={
              retrying ? 'animate-spin motion-reduce:animate-none' : undefined
            }
            aria-hidden
          />
          Try again
        </Button>
      </div>
    </main>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    data: user,
    error,
    isPending,
    isFetching,
    refetch,
  } = useCurrentUserQuery();

  if (isPending || (isApiError(error) && error.kind === 'unauthorized')) {
    return <ShellSkeleton />;
  }
  if (!user) {
    return (
      <ShellError
        error={error}
        onRetry={() => refetch()}
        retrying={isFetching}
      />
    );
  }

  const groups = navigationFor(user);
  return (
    <CurrentUserProvider value={user}>
      <div className="flex min-h-dvh">
        <a
          href="#main"
          className="focus:bg-card focus:ring-ring sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2"
        >
          Skip to content
        </a>
        <DesktopSidebar groups={groups} />
        <MobileSidebar groups={groups} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl min-w-0 flex-1 p-4 focus:outline-none sm:p-6"
          >
            {children}
          </main>
        </div>
      </div>
    </CurrentUserProvider>
  );
}
