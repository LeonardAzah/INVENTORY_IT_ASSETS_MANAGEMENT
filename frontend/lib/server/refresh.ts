import 'server-only';

import { createHash } from 'node:crypto';

import { isEnvelope } from '@/lib/api/envelope';

import { backendPost } from './backend';
import { tokensFrom, type Tokens } from './session';

/**
 * The backend rotates refresh tokens and blacklists the old one, so a refresh token works
 * exactly once. A page fires several requests at a time, and each would try to refresh
 * with the same token: the first would win and the rest would log the user out.
 */
const RECENT_TTL_MS = 30_000;

const inFlight = new Map<string, Promise<Tokens | null>>();
const recent = new Map<string, { tokens: Tokens; expiresAt: number }>();

function keyFor(refresh: string): string {
  return createHash('sha256').update(refresh).digest('hex');
}

function forgetExpired(now: number) {
  for (const [key, entry] of recent) {
    if (entry.expiresAt <= now) {
      recent.delete(key);
    }
  }
}

async function exchange(refresh: string): Promise<Tokens | null> {
  const response = await backendPost('/auth/jwt/refresh/', { refresh });
  if (!response.ok) {
    return null;
  }
  const body: unknown = await response.json().catch(() => null);
  return isEnvelope(body) ? tokensFrom(body.data) : null;
}

/**
 * Exchanges a refresh token for a new pair. Resolves to null when the backend rejects the
 * token (expired, blacklisted, account deactivated): the session is over. Rejects with
 * `BackendUnavailableError` when the backend gave no answer, in which case the session
 * may still be good and must not be cleared.
 */
export function refreshTokens(refresh: string): Promise<Tokens | null> {
  const key = keyFor(refresh);
  const now = Date.now();
  forgetExpired(now);

  const cached = recent.get(key);
  if (cached) {
    return Promise.resolve(cached.tokens);
  }
  const running = inFlight.get(key);
  if (running) {
    return running;
  }

  const attempt = exchange(refresh)
    .then((tokens) => {
      if (tokens) {
        recent.set(key, { tokens, expiresAt: Date.now() + RECENT_TTL_MS });
      }
      return tokens;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, attempt);
  return attempt;
}

export function forgetSession(refresh: string) {
  for (const [key, entry] of recent) {
    if (entry.tokens.refresh === refresh) {
      recent.delete(key);
    }
  }
}
