import { connection } from 'next/server';

import { envelope, isEnvelope } from '@/lib/api/envelope';
import {
  BACKEND_MALFORMED_MESSAGE,
  BACKEND_UNAVAILABLE_MESSAGE,
  backendUrl,
} from '@/lib/server/backend';

const TIMEOUT_MS = 5_000;

function badGateway(message: string, requestId?: string | null) {
  const headers = requestId ? { 'X-Request-ID': requestId } : undefined;
  return Response.json(envelope(null, false, message), {
    status: 502,
    headers,
  });
}

export async function GET() {
  await connection();

  let upstream: Response;
  try {
    upstream = await fetch(backendUrl('/health/'), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    console.log('Upstream response status:', upstream.status);
  } catch {
    return badGateway(BACKEND_UNAVAILABLE_MESSAGE);
  }

  const requestId = upstream.headers.get('X-Request-ID');
  let body: unknown;
  try {
    body = await upstream.json();
  } catch {
    return badGateway(BACKEND_MALFORMED_MESSAGE, requestId);
  }
  if (!isEnvelope(body)) {
    return badGateway(BACKEND_MALFORMED_MESSAGE, requestId);
  }
  return Response.json(body, {
    status: upstream.status,
    headers: requestId ? { 'X-Request-ID': requestId } : undefined,
  });
}
