import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { isApiError } from '@/lib/api/errors';
import { leaveForLogin } from '@/lib/auth/redirect';

const MAX_QUERY_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

/**
 * Queries are retried only when the failure is likely transient: no answer at all, or a
 * gateway error. A 4xx is the server's considered answer and is never retried.
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= MAX_QUERY_RETRIES || !isApiError(error)) {
    return false;
  }
  if (error.kind === 'network' || error.kind === 'timeout') {
    return true;
  }
  return error.status !== undefined && RETRYABLE_STATUSES.has(error.status);
}

type Meta = Record<string, unknown> | undefined;

/**
 * A 401 means the session is over (the proxy has already tried to renew it), so the user is
 * sent to sign in. Signing in itself opts out with `meta.publicRequest`: there a 401 is
 * a wrong password, to be shown on the form.
 */
function onError(error: unknown, meta: Meta) {
  if (
    isApiError(error) &&
    error.kind === 'unauthorized' &&
    !meta?.publicRequest
  ) {
    leaveForLogin();
  }
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => onError(error, query.meta),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        onError(error, mutation.meta),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetryQuery,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
