export type ApiErrorKind =
  | 'validation'
  | 'rule'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'server'
  | 'unexpected'
  | 'malformed'
  | 'network'
  | 'timeout';

export type FieldErrors = Record<string, unknown>;

type ApiErrorOptions = {
  status?: number;
  fieldErrors?: FieldErrors;
  errorCode?: string;
  context?: Record<string, unknown>;
  requestId?: string;
};

export const NETWORK_ERROR_MESSAGE =
  'Could not reach the server. Check your connection and try again.';
export const TIMEOUT_ERROR_MESSAGE =
  'The server took too long to respond. Please try again.';
export const MALFORMED_ERROR_MESSAGE =
  'The server returned an unexpected response.';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly fieldErrors?: FieldErrors;
  readonly errorCode?: string;
  readonly context?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: ApiErrorOptions = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status;
    this.fieldErrors = options.fieldErrors;
    this.errorCode = options.errorCode;
    this.context = options.context;
    this.requestId = options.requestId;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
