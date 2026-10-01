/**
 * The public URL of a client's weekly Korea brief. One place, so the Telegram
 * button, the review card and the team page can't drift apart.
 *
 * Telegram only accepts https URL buttons on public hosts, so a localhost base
 * yields null and callers simply leave the button off.
 */
export function koreaBriefUrl(token: string | null | undefined): string | null {
  if (!token) return null;
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.holohive.io').replace(/\/$/, '');
  return `${base}/public/korea/${token}`;
}

export function telegramSafeUrl(url: string | null): string | null {
  if (!url) return null;
  return /^https:\/\/(?!localhost|127\.)/.test(url) ? url : null;
}

/** Same page, flagged so the visit isn't counted as a client read. */
export function koreaBriefPreviewUrl(token: string | null | undefined): string | null {
  const u = koreaBriefUrl(token);
  return u ? `${u}?preview=1` : null;
}
