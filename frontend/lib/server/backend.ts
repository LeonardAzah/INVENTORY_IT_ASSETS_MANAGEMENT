import 'server-only';

export function backendUrl(path: string): string {
  const base = process.env.BACKEND_API_URL;
  console.log('backendUrl called with path:', path, 'base URL:', base);
  if (!base) {
    throw new Error(
      'BACKEND_API_URL is not set. Copy .env.example to .env.local.',
    );
  }
  return `${base.replace(/\/+$/, '')}${path}`;
}

export const BACKEND_UNAVAILABLE_MESSAGE =
  'The backend service is unavailable.';
export const BACKEND_MALFORMED_MESSAGE =
  'The backend returned an unexpected response.';

const DEFAULT_TIMEOUT_MS = 30_000;

/** The backend gave no answer at all: it is down, unreachable or too slow. */
export class BackendUnavailableError extends Error {
  constructor() {
    super(BACKEND_UNAVAILABLE_MESSAGE);
    this.name = 'BackendUnavailableError';
  }
}

type BackendInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  timeoutMs?: number;
};

/** Calls the backend. `path` is a backend path with its trailing slash, e.g. "/health/". */
export async function backendFetch(
  path: string,
  init: BackendInit = {},
): Promise<Response> {
  try {
    return await fetch(backendUrl(path), {
      method: init.method ?? 'GET',
      headers: { Accept: 'application/json', ...init.headers },
      body: init.body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch {
    throw new BackendUnavailableError();
  }
}

export function backendPost(
  path: string,
  body: unknown,
  timeoutMs?: number,
): Promise<Response> {
  return backendFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs,
  });
}
