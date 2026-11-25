import { envelope, isEnvelope } from '@/lib/api/envelope';
import {
  BACKEND_MALFORMED_MESSAGE,
  BackendUnavailableError,
  backendPost,
} from '@/lib/server/backend';
import {
  backendUnavailable,
  crossOrigin,
  errorResponse,
  isSameOrigin,
} from '@/lib/server/http';
import { tokensFrom, writeSession } from '@/lib/server/session';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return crossOrigin();
  }
  const credentials: unknown = await request.json().catch(() => null);

  let upstream: Response;
  try {
    upstream = await backendPost('/auth/login/', credentials ?? {});
  } catch (error) {
    if (error instanceof BackendUnavailableError) {
      return backendUnavailable();
    }
    throw error;
  }

  const body: unknown = await upstream.json().catch(() => null);
  if (!isEnvelope(body)) {
    return errorResponse(502, BACKEND_MALFORMED_MESSAGE);
  }
  if (!upstream.ok) {
    return Response.json(body, { status: upstream.status });
  }
  const tokens = tokensFrom(body.data);
  if (!tokens) {
    return errorResponse(502, BACKEND_MALFORMED_MESSAGE);
  }
  await writeSession(tokens);
  return Response.json(envelope(null, true, body.message));
}
