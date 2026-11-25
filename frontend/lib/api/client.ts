import { readEnvelope, type Envelope } from './envelope';
import {
  ApiError,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from './errors';

/** Same-origin prefix of the Next.js route handlers that talk to the backend. */
export const PROXY_PREFIX = '/api/proxy';

const DEFAULT_TIMEOUT_MS = 15_000;

export type QueryValue = string | number | boolean | null | undefined;

type RequestOptions = {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function proxyUrl(
  path: string,
  query?: Record<string, QueryValue>,
): string {
  const url = `${PROXY_PREFIX}${path.replace(/\/+$/, '')}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

export async function request<T>(
  method: string,
  url: string,
  options: RequestOptions = {},
): Promise<Envelope<T>> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    if (timeout.aborted) {
      throw new ApiError('timeout', TIMEOUT_ERROR_MESSAGE);
    }
    throw new ApiError('network', NETWORK_ERROR_MESSAGE);
  }
  return readEnvelope<T>(response);
}

/** GET a backend path (e.g. "/health/") through the proxy. */
export function apiGet<T>(
  path: string,
  options: Omit<RequestOptions, 'body'> = {},
) {
  return request<T>('GET', proxyUrl(path, options.query), options);
}

/** PATCH a backend path through the proxy with the fields to change. */
export function apiPatch<T>(
  path: string,
  body: unknown,
  options: Omit<RequestOptions, 'body'> = {},
) {
  return request<T>('PATCH', proxyUrl(path, options.query), {
    ...options,
    body,
  });
}

/** PUT JSON to a backend path through the proxy. */
export function apiPut<T>(
  path: string,
  body: unknown,
  options: Omit<RequestOptions, 'body'> = {},
) {
  return request<T>('PUT', proxyUrl(path, options.query), { ...options, body });
}

/** DELETE a backend path through the proxy. Some of the backend's deletes take a body, such as a reason. */
export function apiDelete<T>(
  path: string,
  body?: unknown,
  options: Omit<RequestOptions, 'body'> = {},
) {
  return request<T>('DELETE', proxyUrl(path, options.query), {
    ...options,
    body,
  });
}

/** POST JSON to a backend path through the proxy. */
export function apiPost<T>(
  path: string,
  body: unknown,
  options: Omit<RequestOptions, 'body'> = {},
) {
  return request<T>('POST', proxyUrl(path, options.query), {
    ...options,
    body,
  });
}
