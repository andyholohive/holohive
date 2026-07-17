/**
 * Client-side helper for the server-side portal email gate (audit C1 Phase 2).
 *
 * Public client-facing pages (portal, campaign tracker, report, list) call this
 * instead of reading clients.email / approved_emails / approved_domains via the
 * anon key. The server endpoint runs the authorization and returns only a
 * yes/no + the matched rule, so the authorization lists never reach the browser.
 */
export type GateReason = 'exact' | 'approved_email' | 'same_domain' | 'approved_domain' | null;

export interface GateResult {
  ok: boolean;
  clientId: string | null;
  clientName: string | null;
  reason: GateReason;
}

/**
 * Authorize an email against a client's portal rules, server-side.
 * `idOrSlug` is the client's id or slug (portal) or a resolved client UUID
 * (campaign / report / list pages resolve their own client_id first).
 * Returns { ok:false } on any network/parse error — fail closed.
 */
export async function authorizePortalGate(idOrSlug: string, email: string): Promise<GateResult> {
  const fail: GateResult = { ok: false, clientId: null, clientName: null, reason: null };
  if (!idOrSlug || !email) return fail;
  try {
    const res = await fetch('/api/public/portal-gate/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idOrSlug, email }),
      cache: 'no-store',
    });
    if (!res.ok) return fail;
    const json = await res.json();
    return {
      ok: !!json.ok,
      clientId: json.clientId ?? null,
      clientName: json.clientName ?? null,
      reason: (json.reason ?? null) as GateReason,
    };
  } catch {
    return fail;
  }
}
