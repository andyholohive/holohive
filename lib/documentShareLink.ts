import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Per-document share links (2026-08-05).
 *
 * Before this, a document was only reachable inside its client's portal. The
 * only link you could send was the portal link, and the internal preview route
 * (/documents/[id]) is session-gated, so pasting that to a client showed them a
 * sign-in wall.
 *
 * A share link adds a direct URL WITHOUT weakening the gate. The token says
 * *which document*; the portal email gate still says *who may open it*. That
 * split is the whole design:
 *
 *   token   → unguessable, revocable, independently expirable  (addressing)
 *   email   → the same rule the portal uses                    (authorization)
 *
 * So a forwarded link is not a leak: the next person still has to be on the
 * client's approved email/domain list. Revoking a link kills that URL only —
 * the document's own `shared` / `expires_at` state is untouched.
 */

/** 32-char URL-safe token. 192 bits — not brute-forceable, no encoding to escape. */
export function mintShareToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** Why a token can't be used. Distinct so the page can say something true. */
export type ShareLinkRejection = 'not_found' | 'revoked' | 'expired';

export interface ResolvedShareLink {
  linkId: string;
  documentId: string;
}

/**
 * Resolve a raw token to a live link, or say why not.
 *
 * Deliberately checks only the LINK here — document state (shared/published/
 * expired) is the caller's job, because those failures deserve their own
 * messages and shouldn't be flattened into "bad link".
 */
export async function resolveShareToken(
  admin: SupabaseClient,
  token: string,
): Promise<{ ok: true; link: ResolvedShareLink } | { ok: false; reason: ShareLinkRejection }> {
  if (!token || token.length < 16) return { ok: false, reason: 'not_found' };

  const { data: link } = await (admin as any)
    .from('document_share_links')
    .select('id, document_id, revoked_at, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!link) return { ok: false, reason: 'not_found' };
  if (link.revoked_at) return { ok: false, reason: 'revoked' };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, link: { linkId: link.id as string, documentId: link.document_id as string } };
}

/**
 * Stamp usage after a SUCCESSFUL open. Fire-and-forget: a failed counter must
 * never block someone from reading their document.
 */
export async function recordShareLinkAccess(admin: SupabaseClient, linkId: string): Promise<void> {
  try {
    await (admin as any).rpc('bump_share_link_access', { p_link_id: linkId });
  } catch {
    /* counters are advisory — swallow */
  }
}
