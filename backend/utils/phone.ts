// South Sudan mobile numbers: +211, then a 2-digit operator prefix, then 7 digits.
// Prefixes from the NCA numbering plan as notified to the ITU (Zain 91, MTN 92) and Digitel (98).
export const OPERATORS: Record<string, string> = { '91': 'Zain', '92': 'MTN', '98': 'Digitel' };

export const PHONE_FORMAT_ERROR = 'Enter a Zain (091), MTN (092) or Digitel (098) number, e.g. 0912 345 678';

// Accepts the ways people type a number (0912 345 678, 912345678, +211 912-345-678, 00211…)
// and returns the standard +211XXXXXXXXX form, or null if it isn't a Zain, MTN or Digitel number.
export function normalisePhone(input: unknown): string | null {
  let digits = String(input ?? '').replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('211')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^\d{9}$/.test(digits) || !OPERATORS[digits.slice(0, 2)]) return null;
  return `+211${digits}`;
}

// For optional contact fields: null when left blank, the standard form when valid, undefined when mistyped.
export function optionalPhone(input: unknown): string | null | undefined {
  if (!String(input ?? '').trim()) return null;
  return normalisePhone(input) ?? undefined;
}

// For looking up an existing account: the standard form when the number is valid, otherwise the
// number as typed (without spaces), so accounts created before the format check can still log in.
export function phoneForLookup(input: unknown): string {
  return normalisePhone(input) ?? String(input ?? '').replace(/[\s-]/g, '');
}
