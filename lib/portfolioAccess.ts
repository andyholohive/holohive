/**
 * Who can see the Client Portfolio.
 *
 * [2026-09-12, Andy] Restricted to Andy alone rather than to super_admins,
 * because super_admin covers four people and the request was one. Defined once
 * here so the page gate and the two sidebar registrations cannot drift — a
 * hidden nav item over an un-gated page is worse than no gate at all, since it
 * looks restricted while being open.
 *
 * SCOPE, honestly: this hides the page, it does not secure the data. The
 * portfolio reads its numbers client-side with the viewer's own Supabase
 * session, so what anyone can actually fetch is decided by RLS, not by this
 * check — and every table it reads is already readable by other admins through
 * the pages they use daily. Anyone signed in who typed the URL before this
 * change could still assemble the same figures by hand.
 *
 * If it needs to be a real boundary rather than a private surface, the fetch
 * has to move behind an API route with a server-side guard. Worth doing only if
 * the strategy notes ever carry something the rest of the team should not read.
 */

const OWNER_EMAIL = 'andy@holohive.io';

/** The single account owner-only surfaces are for. */
export function isOwner(profile?: { email?: string | null } | null): boolean {
  return (profile?.email ?? '').trim().toLowerCase() === OWNER_EMAIL;
}

/** Reads better at the portfolio's own call sites; same check. */
export const canViewPortfolio = isOwner;
