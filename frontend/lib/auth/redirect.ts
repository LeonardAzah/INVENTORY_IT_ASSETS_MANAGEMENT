const DEFAULT_DESTINATION = '/dashboard';

/**
 * Where to go after signing in. Only a path inside this application is accepted, so a
 * crafted `next` cannot send someone to another site.
 */
export function safeNext(next: string | null | undefined): string {
  if (
    !next ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    next.startsWith('/\\')
  ) {
    return DEFAULT_DESTINATION;
  }
  if (next === '/login' || next.startsWith('/login?')) {
    return DEFAULT_DESTINATION;
  }
  return next;
}

export function loginUrl(reason?: 'expired', next?: string): string {
  const params = new URLSearchParams();
  if (reason) {
    params.set('reason', reason);
  }
  if (next && safeNext(next) === next && next !== DEFAULT_DESTINATION) {
    params.set('next', next);
  }
  const search = params.toString();
  return search ? `/login?${search}` : '/login';
}

let leaving = false;

export function leaveForLogin() {
  if (leaving || typeof window === 'undefined') {
    return;
  }
  if (window.location.pathname === '/login') {
    return;
  }
  leaving = true;
  window.location.assign(
    loginUrl('expired', `${window.location.pathname}${window.location.search}`),
  );
}
