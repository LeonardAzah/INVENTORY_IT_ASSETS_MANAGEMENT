import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { isApiError } from '@/lib/api/errors';

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

function text(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const parts = value.filter(
      (part): part is string => typeof part === 'string',
    );
    return parts.length > 0 ? parts.join(' ') : null;
  }
  return null;
}

export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (!isApiError(error)) {
    return FALLBACK_MESSAGE;
  }
  if (error.kind !== 'validation' || !error.fieldErrors) {
    return error.message;
  }

  const known = new Set<string>(fields);
  const general: string[] = [];
  let placed = 0;
  for (const [key, value] of Object.entries(error.fieldErrors)) {
    const message = text(value);
    if (message === null) {
      continue;
    }
    if (known.has(key)) {
      setError(
        key as Path<T>,
        { type: 'server', message },
        { shouldFocus: placed === 0 },
      );
      placed += 1;
    } else {
      general.push(message);
    }
  }
  if (general.length > 0) {
    return general.join(' ');
  }
  return placed > 0 ? null : error.message;
}
