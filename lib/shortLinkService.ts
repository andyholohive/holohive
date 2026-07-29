/**
 * Branded short links — `tria.holohive.io/fitcheck`.
 *
 * DNS answers "what address is this hostname"; the path arrives later,
 * inside the HTTP request, so no DNS record can route on it. The hop
 * therefore runs through our own app: a host-scoped rewrite in
 * next.config.js sends `<sub>.holohive.io/<slug>` to
 * `app/l/[sub]/[slug]/route.ts`, which resolves the pair here.
 *
 * Pure functions live here so the URL-merging rules are testable and the
 * route handler stays a thin shell.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Hosts on this Vercel project that are the app itself, never a link. */
export const RESERVED_SUBDOMAINS = ['app', 'www', 'portal', 'api'] as const;

/** Query param carrying the per-recipient tag we mint (e.g. `?k=<kol id>`). */
export const VISITOR_TAG_PARAM = 'k';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShortLink = {
  id: string;
  subdomain: string;
  slug: string;
  destination_url: string;
  is_active: boolean;
};

/**
 * Splits the leading label off a host: `tria.holohive.io` → `tria`.
 * Returns null for apex/unknown shapes and for reserved app hosts, so a
 * misconfigured domain can never shadow the application itself.
 */
export function subdomainFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const bare = host.split(':')[0].trim().toLowerCase();
  const parts = bare.split('.');
  if (parts.length < 3) return null; // apex or a bare hostname — not a link host
  const sub = parts[0];
  if (!sub || (RESERVED_SUBDOMAINS as readonly string[]).includes(sub)) return null;
  return sub;
}

/**
 * Builds the final destination.
 *
 * The stored destination keeps its own query (`?lang=ko` is the whole
 * point of the Tria link), so its params win. Params the visitor arrived
 * with are carried over only where they don't collide — that keeps
 * campaign `utm_*` tags working without letting a hand-edited inbound URL
 * silently override the language the brief was written for.
 *
 * Our own `?k=` tag is stripped: it identifies the recipient to us and has
 * no business being forwarded to a third-party site.
 */
export function buildDestination(destinationUrl: string, incoming: URLSearchParams): string {
  let dest: URL;
  try {
    dest = new URL(destinationUrl);
  } catch {
    return destinationUrl; // stored value already passed a scheme CHECK; don't mangle
  }
  incoming.forEach((value, key) => {
    if (key === VISITOR_TAG_PARAM) return;
    if (dest.searchParams.has(key)) return;
    dest.searchParams.append(key, value);
  });
  return dest.toString();
}

/** Looks up an active, non-deleted link. Case-insensitive on both halves. */
export async function resolveShortLink(
  supabase: SupabaseClient,
  subdomain: string,
  slug: string,
): Promise<ShortLink | null> {
  const { data, error } = await (supabase as any)
    .from('short_links')
    .select('id, subdomain, slug, destination_url, is_active')
    .eq('subdomain', subdomain.toLowerCase())
    .eq('slug', slug.toLowerCase())
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return null;
  return data as ShortLink;
}

/**
 * Records the click. Best-effort by design — a logging failure must never
 * cost the KOL their redirect, which is the entire point of the link.
 */
export async function logShortLinkClick(
  supabase: SupabaseClient,
  opts: {
    shortLinkId: string;
    visitorRef?: string | null;
    referrer?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  try {
    const ref = opts.visitorRef?.trim() || null;
    await (supabase as any).from('short_link_clicks').insert({
      short_link_id: opts.shortLinkId,
      visitor_ref: ref,
      // Only a well-formed uuid is trusted as a KOL id; anything else stays
      // in visitor_ref as an untyped tag rather than failing the insert.
      kol_id: ref && UUID_RE.test(ref) ? ref : null,
      referrer: opts.referrer?.slice(0, 500) || null,
      user_agent: opts.userAgent?.slice(0, 500) || null,
    });
  } catch (err) {
    console.warn('[shortLink] click log failed:', err);
  }
}
