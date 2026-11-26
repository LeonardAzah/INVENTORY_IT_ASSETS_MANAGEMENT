import { TZDate } from '@date-fns/tz';
import { format, isValid } from 'date-fns';

export const TIME_ZONE = 'Africa/Douala';

export const EMPTY = '–';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDate(value: string | null | undefined): string {
  const match = value ? DATE_ONLY.exec(value) : null;
  if (!match) {
    return EMPTY;
  }
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return EMPTY;
  }
  const moment = new TZDate(value, TIME_ZONE);
  return isValid(moment) ? format(moment, 'dd/MM/yyyy HH:mm') : EMPTY;
}

export function today(now: Date = new Date()): string {
  return format(new TZDate(now, TIME_ZONE), 'yyyy-MM-dd');
}
