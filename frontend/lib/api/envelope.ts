import { ApiError, MALFORMED_ERROR_MESSAGE, type ApiErrorKind } from './errors';

export type Envelope<T> = {
  data: T;
  success: boolean;
  message: string;
};

export type Pagination = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  next: string | null;
  previous: string | null;
};

export type Paginated<T> = {
  results: T[];
  pagination: Pagination;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isEnvelope(value: unknown): value is Envelope<unknown> {
  return (
    isRecord(value) &&
    'data' in value &&
    typeof value.success === 'boolean' &&
    typeof value.message === 'string'
  );
}

export function envelope<T>(
  data: T,
  success: boolean,
  message: string,
): Envelope<T> {
  return { data, success, message };
}

function kindFor(status: number): ApiErrorKind {
  if (status === 400) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status >= 500) return 'server';
  return 'unexpected';
}

function errorFrom(
  status: number,
  body: Envelope<unknown>,
  requestId?: string,
): ApiError {
  const { data, message } = body;
  if (isRecord(data) && typeof data.error_code === 'string') {
    return new ApiError('rule', message, {
      status,
      errorCode: data.error_code,
      context: isRecord(data.context) ? data.context : {},
      requestId,
    });
  }
  const kind = kindFor(status);
  if (kind === 'validation' && isRecord(data)) {
    return new ApiError(kind, message, {
      status,
      fieldErrors: data,
      requestId,
    });
  }
  return new ApiError(kind, message, { status, requestId });
}

export async function readEnvelope<T>(
  response: Response,
): Promise<Envelope<T>> {
  const requestId = response.headers.get('X-Request-ID') ?? undefined;
  const malformed = () =>
    new ApiError('malformed', MALFORMED_ERROR_MESSAGE, {
      status: response.status,
      requestId,
    });

  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    throw malformed();
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw malformed();
  }
  if (!isEnvelope(body) || body.success !== response.ok) {
    throw malformed();
  }
  if (!response.ok) {
    throw errorFrom(response.status, body, requestId);
  }
  return body as Envelope<T>;
}
