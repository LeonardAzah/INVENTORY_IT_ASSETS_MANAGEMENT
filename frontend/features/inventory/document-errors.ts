import { isApiError } from '@/lib/api/errors';

/** What is wrong with one line of a stock document. `serials` is about the units it names. */
export type LineErrors = { item?: string; quantity?: string; serials?: string };

export type DocumentErrors = {
  /** Messages for the fields above the lines, under the backend's field names. */
  fields: Record<string, string>;
  /** One entry per line, in the order the lines were sent. */
  lines: LineErrors[];
  /** What belongs to no field: shown above the form. */
  general: string | null;
};

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/** Business rules that concern one field of the form (inventory/services/{issues,returns}.py). */
const RULE_FIELDS: Record<string, string> = {
  EMPLOYEE_INACTIVE: 'employee_id',
  EMPLOYEE_NOT_IN_REGION: 'employee_id',
  ISSUE_TO_OTHER_EMPLOYEE: 'employee_id',
  RECIPIENT_STORE_IS_ISSUER: 'recipient_store_id',
  RECIPIENT_STORE_NOT_GENERAL: 'recipient_store_id',
  RECIPIENT_STORE_INACTIVE: 'recipient_store_id',
  RECIPIENT_STORE_NOT_IN_REGION: 'recipient_store_id',
  NOTE_REQUIRED: 'notes',
  REASON_REQUIRED: 'reason',
  OPENING_BALANCE_NOT_ALLOWED: 'kind',
};

/** Business rules about how much of an item was asked for. */
const QUANTITY_RULES = new Set([
  'INSUFFICIENT_STOCK',
  'RETURN_EXCEEDS_ISSUE',
  'INVALID_QUANTITY',
  'INVALID_QUANTITY_PRECISION',
]);

/** Business rules about the units a line names (inventory/services/units.py). */
const SERIAL_RULES = new Set([
  'SERIALS_REQUIRED',
  'SERIALS_NOT_ALLOWED',
  'SERIAL_COUNT_MISMATCH',
  'SERIAL_REPEATED',
  'UNIT_REPEATED',
  'DUPLICATE_SERIAL',
  'SERIAL_ON_OTHER_ITEM',
  'UNIT_NOT_AVAILABLE',
  'UNIT_NOT_ON_ISSUE',
  'UNIT_HELD_ELSEWHERE',
]);

/** The fields of a line that name its units. */
const SERIAL_FIELDS = new Set([
  'serials',
  'unit_ids',
  'cross_item_serial_reason',
]);

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * True when a failed request may still have reached the backend: the answer was lost, late
 * or broken, so the document may or may not exist. Sending the same request id again is
 * then the only safe way to find out.
 */
export function isUncertainOutcome(error: unknown): boolean {
  return (
    !isApiError(error) ||
    ['network', 'timeout', 'server', 'malformed'].includes(error.kind)
  );
}

/**
 * Sorts the backend's refusal of a stock document onto the fields and lines it concerns.
 * `itemIds` are the items of the lines as they were sent (the backend names an item, not
 * a line number, when a business rule fails), and `fields` the form's other fields.
 */
export function readDocumentErrors(
  error: unknown,
  itemIds: readonly string[],
  fields: readonly string[],
): DocumentErrors {
  const result: DocumentErrors = {
    fields: {},
    lines: itemIds.map(() => ({})),
    general: null,
  };
  if (!isApiError(error)) {
    result.general = FALLBACK_MESSAGE;
    return result;
  }

  if (error.kind === 'rule') {
    const itemId = error.context?.item_id;
    const index = typeof itemId === 'string' ? itemIds.indexOf(itemId) : -1;
    const field =
      error.errorCode === 'FUTURE_DATE'
        ? fields.find((candidate) => candidate.endsWith('_date'))
        : RULE_FIELDS[error.errorCode ?? ''];
    if (index >= 0) {
      // Too much asked of an item is a problem with the quantity; the wrong units, with the
      // units; anything else, with the item.
      const code = error.errorCode ?? '';
      result.lines[index][
        QUANTITY_RULES.has(code)
          ? 'quantity'
          : SERIAL_RULES.has(code)
            ? 'serials'
            : 'item'
      ] = error.message;
    } else if (field && fields.includes(field)) {
      result.fields[field] = error.message;
    } else {
      result.general = error.message;
    }
    return result;
  }

  if (error.kind !== 'validation' || !error.fieldErrors) {
    result.general = error.message;
    return result;
  }

  const general: string[] = [];
  let placed = 0;
  for (const [key, value] of Object.entries(error.fieldErrors)) {
    if (key === 'lines' && Array.isArray(value) && value.some(isRecord)) {
      // One object per line, empty for the lines that are fine.
      value.forEach((entry, index) => {
        if (!isRecord(entry) || index >= result.lines.length) {
          return;
        }
        for (const [field, problem] of Object.entries(entry)) {
          const message = text(problem);
          if (message === null) {
            continue;
          }
          if (field === 'item_id') {
            result.lines[index].item = message;
            placed += 1;
          } else if (field === 'quantity') {
            result.lines[index].quantity = message;
            placed += 1;
          } else if (SERIAL_FIELDS.has(field)) {
            result.lines[index].serials = message;
            placed += 1;
          } else {
            general.push(message);
          }
        }
      });
      continue;
    }
    const message = text(value);
    if (message === null) {
      continue;
    }
    if (fields.includes(key)) {
      result.fields[key] = message;
      placed += 1;
    } else {
      general.push(message);
    }
  }
  result.general =
    general.length > 0 ? general.join(' ') : placed > 0 ? null : error.message;
  return result;
}
