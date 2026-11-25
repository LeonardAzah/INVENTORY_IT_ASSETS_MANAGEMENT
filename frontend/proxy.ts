import { NextResponse, type NextRequest } from 'next/server';

import { REFRESH_COOKIE } from '@/lib/auth/cookie-names';

const PUBLIC_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/activate',
  '/styleguide',
  '/status',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(REFRESH_COOKIE)?.value);

  if (!hasSession && !isPublic(pathname)) {
    const login = new URL('/login', request.url);
    if (pathname !== '/') {
      login.searchParams.set('next', `${pathname}${search}`);
    }
    return NextResponse.redirect(login);
  }
  if (hasSession && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/|_next/|favicon.ico|.*\\.[a-z0-9]+$).*)'],
};
