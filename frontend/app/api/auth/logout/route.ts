import { envelope } from '@/lib/api/envelope';
import { backendPost } from '@/lib/server/backend';
import { crossOrigin, isSameOrigin } from '@/lib/server/http';
import { forgetSession } from '@/lib/server/refresh';
import { clearSession, readSession } from '@/lib/server/session';

const LOGOUT_TIMEOUT_MS = 5_000;

/**
 * Signs out. The refresh token is blacklisted on the backend when it can be reached; the
 * cookies are cleared either way, so signing out always works from the user's side.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return crossOrigin();
  }
  const { refresh } = await readSession();
  if (refresh) {
    forgetSession(refresh);
    await backendPost('/auth/logout/', { refresh }, LOGOUT_TIMEOUT_MS).catch(
      () => undefined,
    );
  }
  await clearSession();
  return Response.json(envelope(null, true, 'Logged out successfully.'));
}
