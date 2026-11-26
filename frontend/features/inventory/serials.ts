export function parseSerials(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((serial) => serial.trim())
    .filter(Boolean);
}

export function normalizeSerial(serial: string): string {
  return serial.replace(/\s+/g, '').toUpperCase();
}

export function repeatedSerials(serials: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const serial of serials) {
    const normalized = normalizeSerial(serial);
    if (seen.has(normalized)) repeated.add(normalized);
    seen.add(normalized);
  }
  return [...repeated];
}

export function serialsProblem(serials: readonly string[]): string | null {
  if (serials.length === 0) {
    return 'Enter the serial number of every unit, one per line.';
  }
  const tooLong = serials.find((serial) => serial.length > 100);
  if (tooLong) {
    return `A serial number has at most 100 characters: ${tooLong.slice(0, 20)}…`;
  }
  const repeated = repeatedSerials(serials);
  return repeated.length > 0
    ? `Entered more than once: ${repeated.join(', ')}.`
    : null;
}

export function unitCount(count: number): string {
  return count === 1 ? '1 unit' : `${count} units`;
}
