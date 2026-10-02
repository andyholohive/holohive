/**
 * Korea Scan ↔ Telegram MCP helpers (kol-telegram-mcp coverage-scan).
 */

/** The term most likely to find Korean posts: the first Hangul spelling, else the first usable spelling. */
export function pickQuery(aliases: string[]): string | null {
  const clean = aliases.map((a) => a.trim()).filter((a) => a.replace(/[^가-힣A-Za-z0-9]/g, '').length >= 2);
  return clean.find((a) => /[가-힣]/.test(a)) ?? clean[0] ?? null;
}
