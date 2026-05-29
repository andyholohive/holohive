/**
 * Required-field marker — the standard "*" used inside <Label>
 * elements to indicate a field is required.
 *
 * Use instead of writing `Name *` literally inside a Label — the
 * literal version inherits the label's gray/black color which
 * fails the "required marker should be visually distinct" UX
 * convention. This component renders the asterisk in red-500
 * with a tiny left margin.
 *
 * Usage:
 *   <Label>Name <RequiredAsterisk /></Label>
 *   <Label htmlFor="email">Your Email <RequiredAsterisk /></Label>
 *
 * Per CLAUDE.md design conventions (2026-05-29).
 */
export function RequiredAsterisk() {
  return (
    <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>
  );
}
