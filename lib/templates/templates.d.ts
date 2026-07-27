/**
 * Raw-string imports for the canonical render templates.
 *
 * Paired with the `asset/source` webpack rule in next.config.js, which is
 * scoped to this folder. Declared narrowly rather than as a global `*.html` so
 * an accidental HTML import elsewhere still fails loudly instead of silently
 * resolving to a string.
 */
declare module '@/lib/templates/coverage-leavebehind.template.html' {
  const content: string;
  export default content;
}
