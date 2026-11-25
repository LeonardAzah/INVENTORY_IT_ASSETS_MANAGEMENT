import 'server-only';

import { envelope } from '@/lib/api/envelope';

import { BACKEND_UNAVAILABLE_MESSAGE } from './backend';

export const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please sign in again.';
const CROSS_ORIGIN_MESSAGE = 'This request was not accepted.';
const NOT_FOUND_MESSAGE = 'Resource not found.';

/** An error answer in the backend's envelope, so the browser has one shape to parse. */
export function errorResponse(status: number, message: string): Response {
  return Response.json(envelope(null, false, message), { status });
}

export const backendUnavailable = () =>
  errorResponse(502, BACKEND_UNAVAILABLE_MESSAGE);
export const sessionExpired = () => errorResponse(401, SESSION_EXPIRED_MESSAGE);
export const notFound = () => errorResponse(404, NOT_FOUND_MESSAGE);
export const crossOrigin = () => errorResponse(403, CROSS_ORIGIN_MESSAGE);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for the cookie session, on top of SameSite=Lax: a request that changes
 * state must say which origin sent it, and that origin must be this application. Browsers
 * always send `Origin` on such requests, so one without it did not come from our pages.
 */
export function isSameOrigin(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) {
    return true;
  }
  const origin = request.headers.get('origin');
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
