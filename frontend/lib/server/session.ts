import 'server-only';

import { cookies } from 'next/headers';

import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/cookie-names';

export type Tokens = {
  access: string;
  refresh: string;
};

const EXPIRY_MARGIN_SECONDS = 30;
const FALLBACK_MAX_AGE_SECONDS = 24 * 60 * 60;

export function tokenExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    if (typeof claims === 'object' && claims !== null && 'exp' in claims) {
      return typeof claims.exp === 'number' ? claims.exp : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function isExpiring(token: string, nowMs: number = Date.now()): boolean {
  const expiry = tokenExpiry(token);
  return expiry === null || expiry - EXPIRY_MARGIN_SECONDS <= nowMs / 1000;
}

function maxAge(token: string): number {
  const expiry = tokenExpiry(token);
  if (expiry === null) {
    return FALLBACK_MAX_AGE_SECONDS;
  }
  return Math.max(0, Math.floor(expiry - Date.now() / 1000));
}

function secure(): boolean {
  const override = process.env.SESSION_COOKIE_SECURE;
  if (override !== undefined && override !== '') {
    return override !== 'false';
  }
  return process.env.NODE_ENV === 'production';
}

export async function readSession(): Promise<Partial<Tokens>> {
  const store = await cookies();
  return {
    access: store.get(ACCESS_COOKIE)?.value || undefined,
    refresh: store.get(REFRESH_COOKIE)?.value || undefined,
  };
}

export async function writeSession(tokens: Tokens): Promise<void> {
  const store = await cookies();
  const base = {
    httpOnly: true,
    secure: secure(),
    sameSite: 'lax',
    path: '/',
  } as const;
  store.set(ACCESS_COOKIE, tokens.access, {
    ...base,
    maxAge: maxAge(tokens.access),
  });
  store.set(REFRESH_COOKIE, tokens.refresh, {
    ...base,
    maxAge: maxAge(tokens.refresh),
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function tokensFrom(data: unknown): Tokens | null {
  if (
    isRecord(data) &&
    typeof data.access === 'string' &&
    typeof data.refresh === 'string'
  ) {
    return { access: data.access, refresh: data.refresh };
  }
  return null;
}
