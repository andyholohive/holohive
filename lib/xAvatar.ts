/**
 * X (Twitter) avatar resolution via unavatar.io.
 *
 * Single home for two things that used to live privately inside
 * kolAvatarService: pulling a handle out of an X URL, and turning that handle
 * into an avatar URL. Clients now need the same thing for company logos, and a
 * second copy of the regex is how the two drift apart.
 *
 * unavatar is free and unauthenticated. We persist its URL rather than
 * downloading the image — their CDN redirects to whatever the current avatar
 * is, so the logo stays current without a refresh job.
 *
 * [2026-08-05] The important detail, learned the hard way: unavatar answers
 * 200 with a GENERIC PLACEHOLDER for handles that do not exist. A nonsense
 * handle, a renamed account and a deleted account all return the same
 * 1506-byte grey avatar — byte-identical, same md5. Without `fallback=false`
 * you cannot tell "got the logo" from "got a placeholder", and you happily
 * store the placeholder. `fallback=false` makes a miss a real 404.
 */

/** Pull the handle out of an x.com / twitter.com URL (or a bare @handle). */
export function extractXHandle(link: string | null | undefined): string | null {
  if (!link) return null;
  const trimmed = link.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/(?:twitter|x)\.com\/(@?[\w_]+)/i);
  if (urlMatch) {
    const handle = urlMatch[1].replace('@', '').replace(/\/$/, '');
    // x.com/home, /explore etc. are app routes, not profiles. Cheap guard
    // against pasting the URL you happen to be sitting on.
    const RESERVED = new Set(['home', 'explore', 'notifications', 'messages', 'i', 'search', 'settings', 'compose']);
    return RESERVED.has(handle.toLowerCase()) ? null : handle;
  }

  // Bare handle — "@fogochain" or "fogochain".
  const bare = trimmed.match(/^@?([\w_]{1,15})$/);
  return bare ? bare[1] : null;
}

/** The unavatar URL we persist. Always built with fallback disabled. */
export function xAvatarUrl(handle: string): string {
  return `https://unavatar.io/twitter/${encodeURIComponent(handle)}?fallback=false`;
}

export interface XAvatarResolution {
  ok: boolean;
  handle: string | null;
  url: string | null;
  /** Set when ok is false — safe to show to the user as-is. */
  error?: string;
}

/**
 * Resolve and VERIFY an avatar for an X link. Server-side only — the check is
 * a real request, and reading the status from the browser would be blocked by
 * CORS anyway.
 *
 * Returns ok:false rather than throwing on a miss; a handle that doesn't
 * resolve is an ordinary outcome of pasting a link, not an exception.
 */
export async function resolveXAvatar(link: string | null | undefined): Promise<XAvatarResolution> {
  const handle = extractXHandle(link);
  if (!handle) {
    return { ok: false, handle: null, url: null, error: 'That doesn\'t look like an X profile link.' };
  }

  const url = xAvatarUrl(handle);
  try {
    // GET, not HEAD — unavatar's 404 path is not reliable for HEAD. The
    // response body is a small image and we discard it.
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (res.status === 404) {
      return { ok: false, handle, url: null, error: `No X account found for @${handle}.` };
    }
    if (!res.ok) {
      return { ok: false, handle, url: null, error: `Couldn't reach unavatar (HTTP ${res.status}). Try again shortly.` };
    }
    return { ok: true, handle, url };
  } catch (err: any) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return {
      ok: false,
      handle,
      url: null,
      error: timedOut ? 'Avatar lookup timed out. Try again.' : 'Avatar lookup failed. Try again.',
    };
  }
}
