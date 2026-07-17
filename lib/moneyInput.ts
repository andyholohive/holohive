/**
 * Money-input helpers (audit H2).
 *
 * Several currency inputs sanitized keystrokes/paste with `replace(/[^0-9]/g,'')`,
 * which deletes the decimal point too. Pasting a value copied from any
 * comma-formatted source — "12,500.00" or "100.50" — collapsed to "1250000" /
 * "10050", silently storing ~100× the real amount. These helpers keep the
 * decimal (and strip grouping commas) so pasted and typed amounts survive.
 *
 * `sanitizeMoneyInput` returns the raw numeric string the field should STORE
 * (digits + at most one dot + at most 2 decimals; preserves a trailing dot so
 * the controlled input still lets you type "100." on the way to "100.50").
 * `formatMoneyDisplay` comma-groups that raw string for display without
 * round-tripping through Number() (which would drop a trailing dot mid-type).
 */

/** Clean a money field's input to a storable numeric string: digits, one dot, ≤2 decimals. */
export function sanitizeMoneyInput(input: string): string {
  let s = (input || '').replace(/[^0-9.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    // Collapse any later dots, cap the fraction at 2 digits.
    const intPart = s.slice(0, firstDot);
    const decPart = s.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
    s = `${intPart}.${decPart}`;
  }
  return s;
}

/** Comma-group a sanitized money string for display, preserving decimals/trailing dot. */
export function formatMoneyDisplay(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '';
  const str = typeof raw === 'number' ? String(raw) : raw;
  const clean = sanitizeMoneyInput(str);
  if (!clean) return '';
  const [intPart, decPart] = clean.split('.');
  const intFmt = intPart ? Number(intPart).toLocaleString('en-US') : '0';
  return clean.includes('.') ? `${intFmt}.${decPart ?? ''}` : intFmt;
}
