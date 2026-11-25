import type { NextRequest } from 'next/server';

import { BackendUnavailableError, backendFetch } from '@/lib/server/backend';
import {
  backendUnavailable,
  crossOrigin,
  isSameOrigin,
  notFound,
  sessionExpired,
} from '@/lib/server/http';
import { refreshTokens } from '@/lib/server/refresh';
import {
  clearSession,
  isExpiring,
  readSession,
  writeSession,
} from '@/lib/server/session';

type Context = {
  params: Promise<{ path: string[] }>;
};

const BLOCKED = /^auth\/(logout)(\/|$)/;

const PUBLIC = /^(auth\/users\/reset_password(_confirm)?|accounts\/activate)$/;

const PASSED_RESPONSE_HEADERS = [
  'Content-Type',
  'Content-Disposition',
  'X-Request-ID',
  'Retry-After',
];

function passThrough(upstream: Response): Response {
  const headers = new Headers();
  for (const name of PASSED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function handle(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const backendPath = path.join('/');
  if (BLOCKED.test(backendPath)) {
    return notFound();
  }
  if (!isSameOrigin(request)) {
    return crossOrigin();
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.arrayBuffer() : null;
  const contentType = request.headers.get('content-type');
  const target = `/${backendPath}/${request.nextUrl.search}`;

  const send = (access: string | undefined) => {
    const headers: Record<string, string> = {
      Accept: request.headers.get('accept') ?? 'application/json',
    };
    if (access) {
      headers.Authorization = `Bearer ${access}`;
    }
    if (body && body.byteLength > 0 && contentType) {
      headers['Content-Type'] = contentType;
    }
    return backendFetch(target, {
      method: request.method,
      headers,
      body: body && body.byteLength > 0 ? body : null,
    });
  };

  try {
    if (PUBLIC.test(backendPath)) {
      return passThrough(await send(undefined));
    }
    const session = await readSession();
    const refresh = session.refresh;
    let access = session.access;
    let renewed = false;

    const renew = async (): Promise<boolean> => {
      if (!refresh) {
        return false;
      }
      const tokens = await refreshTokens(refresh);
      if (!tokens) {
        return false;
      }
      await writeSession(tokens);
      access = tokens.access;
      renewed = true;
      return true;
    };

    if (refresh && (!access || isExpiring(access)) && !(await renew())) {
      await clearSession();
      return sessionExpired();
    }

    let upstream = await send(access);
    if (upstream.status === 401 && refresh) {
      // The token looked valid here but the backend refused it. Renew once and try again;
      // if that fails too (for instance the account was deactivated), the session is over.
      if (renewed || !(await renew())) {
        await clearSession();
        return sessionExpired();
      }
      upstream = await send(access);
      if (upstream.status === 401) {
        await clearSession();
        return sessionExpired();
      }
    }
    return passThrough(upstream);
  } catch (error) {
    if (error instanceof BackendUnavailableError) {
      return backendUnavailable();
    }
    throw error;
  }
}

export {
  handle as DELETE,
  handle as GET,
  handle as PATCH,
  handle as POST,
  handle as PUT,
};
