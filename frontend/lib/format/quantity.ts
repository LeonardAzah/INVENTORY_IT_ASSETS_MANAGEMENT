import { EMPTY } from './date';

const QUANTITY = /^(-?)(\d+)(?:\.(\d+))?$/;

type FormatOptions = {
  decimalPlaces?: number;
  signed?: boolean;
  grouped?: boolean;
};

export function formatQuantity(
  value: string | null | undefined,
  options: FormatOptions = {},
): string {
  if (value === null || value === undefined || value === '') {
    return EMPTY;
  }
  const match = QUANTITY.exec(value.trim());
  if (!match) {
    return value;
  }
  const [, minus, whole, decimals = ''] = match;
  const significant = decimals.replace(/0+$/, '');
  const fraction =
    options.decimalPlaces === undefined
      ? significant
      : significant.padEnd(
          Math.max(options.decimalPlaces, significant.length),
          '0',
        );
  const digits = whole.replace(/^0+(?=\d)/, '');
  const grouped =
    options.grouped === false
      ? digits
      : digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const zero = /^0+$/.test(whole) && significant === '';
  const sign = zero ? '' : minus ? '-' : options.signed ? '+' : '';
  return `${sign}${grouped}${fraction ? `.${fraction}` : ''}`;
}

export function isZeroQuantity(value: string | null | undefined): boolean {
  return !value || /^-?0*(\.0*)?$/.test(value.trim());
}

export type ParsedQuantity =
  { ok: true; value: string } | { ok: false; message: string };

export function parseQuantity(
  text: string,
  decimalPlaces: number,
  options: { allowZero?: boolean; allowNegative?: boolean } = {},
): ParsedQuantity {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, message: 'Enter a quantity.' };
  }
  if (trimmed.includes(',')) {
    return {
      ok: false,
      message: 'Do not use commas. Use a point for decimals, such as 2.5.',
    };
  }
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(trimmed);
  if (!match) {
    return { ok: false, message: 'Enter a number, such as 12 or 2.5.' };
  }
  const [, minus, whole, decimals = ''] = match;
  if (decimals.replace(/0+$/, '').length > decimalPlaces) {
    return {
      ok: false,
      message:
        decimalPlaces === 0
          ? 'This item is counted in whole units.'
          : `Use at most ${decimalPlaces} decimal ${decimalPlaces === 1 ? 'place' : 'places'}.`,
    };
  }
  if (whole.replace(/^0+/, '').length > 11) {
    return { ok: false, message: 'This quantity is too large.' };
  }
  const value = `${whole.replace(/^0+(?=\d)/, '')}${decimals ? `.${decimals}` : ''}`;
  const zero = isZeroQuantity(value);
  if (zero && !options.allowZero) {
    return { ok: false, message: 'Enter a quantity greater than zero.' };
  }
  if (minus && !zero && !options.allowNegative) {
    return { ok: false, message: 'Enter a quantity that is not negative.' };
  }
  return { ok: true, value: minus && !zero ? `-${value}` : value };
}
