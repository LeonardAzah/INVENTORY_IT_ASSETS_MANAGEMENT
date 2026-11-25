'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { isApiError } from '@/lib/api/errors';

import { getHealth, healthKeys } from '../api';

const FALLBACK_ERROR = 'The backend status could not be checked.';

export function BackendStatus() {
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: healthKeys.all,
    queryFn: ({ signal }) => getHealth(signal),
    // Show the outcome straight away; the Check again button is the retry.
    retry: false,
  });

  console.log('BackendStatus data:', data);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Backend connection</CardTitle>
        <CardDescription>
          Browser → Next.js → Django API → database.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div aria-live="polite">
          {isPending ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <LoaderCircle
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
              Checking the backend…
            </p>
          ) : error ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden />
              <AlertTitle>Backend unavailable</AlertTitle>
              <AlertDescription>
                {isApiError(error) ? error.message : FALLBACK_ERROR}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="default">
              <CircleCheck aria-hidden />
              <AlertTitle>{data.message}</AlertTitle>
              <AlertDescription>
                <dl className="flex flex-wrap gap-x-6 gap-y-2">
                  <div className="flex items-center gap-2">
                    <dt>API</dt>
                    <dd>
                      <Badge variant="default">{data.data.status}</Badge>
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt>Database</dt>
                    <dd>
                      <Badge variant="default">{data.data.database}</Badge>
                    </dd>
                  </div>
                </dl>
              </AlertDescription>
            </Alert>
          )}
        </div>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={
                isFetching
                  ? 'animate-spin motion-reduce:animate-none'
                  : undefined
              }
              aria-hidden
            />
            Check again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
