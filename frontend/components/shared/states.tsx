import { CircleAlert, Inbox, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/errors';

const FALLBACK_ERROR = 'Something went wrong. Please try again.';

export function errorMessage(error: unknown): string {
  return isApiError(error) ? error.message : FALLBACK_ERROR;
}

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
        <Inbox className="size-5" aria-hidden />
      </span>
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-neutral-600">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

type ErrorStateProps = {
  title: string;
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
};

export function ErrorState({
  title,
  error,
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{errorMessage(error)}</AlertDescription>
      </Alert>
      {onRetry ? (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={retrying}
          >
            <RefreshCw
              className={
                retrying ? 'animate-spin motion-reduce:animate-none' : undefined
              }
              aria-hidden
            />
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? 'default' : 'secondary'}>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}
