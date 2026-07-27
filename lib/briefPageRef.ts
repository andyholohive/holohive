/**
 * page_ref host allowlist — KOL Brief Delivery (spec §6/§9).
 *
 * [2026-07-27] page_ref was accepted as "anything `new URL()` parses" and then
 * iframed with no CSP, no frame-src allowlist and no sandbox. Two consequences,
 * neither of which needed a hostile actor to bite:
 *
 *   1. Whoever can call POST /api/mcp/kol-brief/page-ref (or whoever later
 *      mistypes a value into it) could point a client-facing page at an
 *      arbitrary origin, which would then run script in a page carrying the
 *      HoloHive name.
 *   2. The spec makes page_ref per-ANGLE on purpose — the per-KOL part is the
 *      token and its open tracking, not the page content — so every KOL on an
 *      angle sees the same iframe src. A KOL who opens devtools and lifts that
 *      URL has a link that HHP's expires_at gate can no longer revoke, because
 *      the gate lives on our wrapper and the content lives on someone else's
 *      origin.
 *
 * (2) is inherent to the per-angle design and cannot be fully closed from this
 * side — the generator would have to gate its own pages. What we CAN do, and
 * now do, is refuse to point at anything outside a known publishing host, so
 * the blast radius is bounded to the generator's own Vercel deployments.
 *
 * Configure with BRIEF_PAGE_REF_ALLOWED_HOSTS (comma-separated). A leading dot
 * means "this domain and its subdomains". Default covers the generator's Vercel
 * deployments, which is what the spec describes ("Published Vercel page for
 * that angle").
 */

const DEFAULT_ALLOWED_HOSTS = ['.vercel.app', '.holohive.io'];

export function allowedBriefHosts(): string[] {
  const raw = process.env.BRIEF_PAGE_REF_ALLOWED_HOSTS;
  if (!raw) return DEFAULT_ALLOWED_HOSTS;
  const parsed = raw.split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_HOSTS;
}

/**
 * True when `url` is https and its host matches the allowlist. http is rejected
 * outright: the brief page is https, so an http iframe would be blocked as
 * mixed content anyway — better to fail loudly at write time than to store a
 * value that silently renders blank.
 */
export function isAllowedBriefPageRef(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  return allowedBriefHosts().some(entry =>
    entry.startsWith('.')
      // ".example.com" matches example.com and any subdomain, but NOT
      // "notexample.com" — the leading dot is load-bearing.
      ? host === entry.slice(1) || host.endsWith(entry)
      : host === entry,
  );
}

/** CSP frame-src value for the brief page, derived from the same allowlist. */
export function briefFrameSrc(): string {
  return allowedBriefHosts()
    .map(h => (h.startsWith('.') ? `https://*${h}` : `https://${h}`))
    .join(' ');
}
