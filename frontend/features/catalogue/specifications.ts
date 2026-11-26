import type {
  SpecificationField,
  SpecificationTemplate,
  SpecValue,
} from './types';

export type SpecFormValue = string | string[];
export type SpecFormValues = Record<string, SpecFormValue>;

const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;
const TEXT_MAX_LENGTH = 255;

export function activeFields(
  template: SpecificationTemplate | null | undefined,
): SpecificationField[] {
  return (template?.fields ?? []).filter((field) => field.is_active);
}

function isNumeric(field: SpecificationField): boolean {
  return (
    field.data_type === 'INTEGER' ||
    field.data_type === 'DECIMAL' ||
    field.data_type === 'MEASURE'
  );
}

export function toFormValues(
  template: SpecificationTemplate | null | undefined,
  stored: Record<string, SpecValue> = {},
): SpecFormValues {
  const values: SpecFormValues = {};
  for (const field of activeFields(template)) {
    const value = stored[field.key];
    if (field.data_type === 'MULTI_CHOICE') {
      values[field.key] = Array.isArray(value) ? value : [];
    } else if (value === undefined || value === null || Array.isArray(value)) {
      values[field.key] = '';
    } else {
      values[field.key] = String(value);
    }
  }
  return values;
}

function isEmpty(value: SpecFormValue | undefined): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) ? value.length === 0 : value.trim() === '')
  );
}

export function compareDecimal(a: string, b: string): number {
  const scale = (text: string) => {
    const negative = text.trim().startsWith('-');
    const [whole, fraction = ''] = text.trim().replace(/^[-+]/, '').split('.');
    const digits = BigInt(
      `${whole || '0'}${fraction.padEnd(6, '0').slice(0, 6)}`,
    );
    return negative ? -digits : digits;
  };
  const left = scale(a);
  const right = scale(b);
  return left === right ? 0 : left < right ? -1 : 1;
}

export function trimDecimal(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

function numberError(field: SpecificationField, text: string): string | null {
  const whole = field.data_type === 'INTEGER' || field.decimal_places === 0;
  if (text.includes(',')) {
    return 'Use a point for decimals, and no thousands separator.';
  }
  if (!(whole ? INTEGER : DECIMAL).test(text)) {
    return whole ? 'Enter a whole number.' : 'Enter a number, e.g. 2.5.';
  }
  const decimals = text.split('.')[1] ?? '';
  if (!whole && decimals.length > field.decimal_places) {
    return `Use at most ${field.decimal_places} decimal place${field.decimal_places === 1 ? '' : 's'}.`;
  }
  if (field.min_value !== null && compareDecimal(text, field.min_value) < 0) {
    return `The minimum is ${trimDecimal(field.min_value)}.`;
  }
  if (field.max_value !== null && compareDecimal(text, field.max_value) > 0) {
    return `The maximum is ${trimDecimal(field.max_value)}.`;
  }
  return null;
}

export function checkSpecs(
  template: SpecificationTemplate | null | undefined,
  values: SpecFormValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of activeFields(template)) {
    const value = values[field.key];
    if (isEmpty(value)) {
      if (field.required) errors[field.key] = 'This specification is required.';
      continue;
    }
    if (isNumeric(field) && typeof value === 'string') {
      const message = numberError(field, value.trim());
      if (message) errors[field.key] = message;
    } else if (
      field.data_type === 'TEXT' &&
      typeof value === 'string' &&
      value.trim().length > TEXT_MAX_LENGTH
    ) {
      errors[field.key] = `Use at most ${TEXT_MAX_LENGTH} characters.`;
    }
  }
  return errors;
}

export function toPayload(
  template: SpecificationTemplate | null | undefined,
  values: SpecFormValues,
): Record<string, SpecValue> {
  const payload: Record<string, SpecValue> = {};
  for (const field of activeFields(template)) {
    const value = values[field.key];
    if (isEmpty(value)) continue;
    if (field.data_type === 'MULTI_CHOICE') {
      // In the order of the choices, as the backend keeps them.
      payload[field.key] = field.choices.filter((choice) =>
        (value as string[]).includes(choice),
      );
    } else if (field.data_type === 'BOOLEAN') {
      payload[field.key] = value === 'true';
    } else {
      payload[field.key] = (value as string).trim();
    }
  }
  return payload;
}

export function sameSpecs(
  a: Record<string, SpecValue>,
  b: Record<string, SpecValue>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function withUnit(field: SpecificationField, text: string): string {
  return field.unit_label ? `${text} ${field.unit_label}` : text;
}

export function formatSpecValue(
  field: SpecificationField,
  value: SpecValue,
): string {
  if (field.data_type === 'BOOLEAN') return value === true ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (isNumeric(field)) return withUnit(field, String(value));
  return String(value);
}

export function missingRequired(
  template: SpecificationTemplate | null | undefined,
  stored: Record<string, SpecValue>,
): string[] {
  return activeFields(template)
    .filter(
      (field) =>
        field.required &&
        (stored[field.key] === undefined || stored[field.key] === ''),
    )
    .map((field) => field.label);
}

export function describeField(field: SpecificationField): string | undefined {
  const parts: string[] = [];
  if (field.help_text) parts.push(field.help_text);
  if (isNumeric(field)) {
    const unit = field.unit_label ? ` (${field.unit_label})` : '';
    const { min_value: min, max_value: max } = field;
    if (min !== null && max !== null)
      parts.push(`From ${trimDecimal(min)} to ${trimDecimal(max)}${unit}.`);
    else if (min !== null) parts.push(`At least ${trimDecimal(min)}${unit}.`);
    else if (max !== null) parts.push(`At most ${trimDecimal(max)}${unit}.`);
    else if (field.unit_label) parts.push(`In ${field.unit_label}.`);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}
