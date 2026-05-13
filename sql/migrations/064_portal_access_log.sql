-- Migration 064: Portal access log.
--
-- Records every successful authentication into a client portal, plus
-- cache-hit re-visits, so admins can see who's actually engaging with
-- their portal and when.
--
-- Why we need this:
--   • Engagement signal: "Has Acme opened their portal this month?"
--   • Allowlist audit: "We added Bob to approved_emails last week —
--     did he ever use the link?"
--   • Churn early-warning: clients that stop logging in are usually
--     about to ghost.
--
-- Write path: the public portal page cannot reach an authoritative IP
-- address (it's running in the browser with the anon key). The
-- frontend hits POST /api/portal/log-access which stamps the IP and
-- user_agent server-side using the service-role client. That means we
-- intentionally do NOT add an INSERT policy here — the only writer is
-- service-role, which bypasses RLS regardless.
--
-- Read path: admins/super_admins only. Mirrors the pattern from
-- migration 063 (uses the same public.is_admin() helper).

CREATE TABLE IF NOT EXISTS portal_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- The email the visitor typed (or the cached email on cache hits).
  -- Lowercased before insert; not validated to exist on the allowlist
  -- at the time of read — the access list can shift over time and the
  -- log should remain immutable as an audit trail.
  email TEXT NOT NULL,
  -- Which allowlist rule let them through, so admins can tell who got
  -- in by domain ("anyone @partner.com") vs by an exact email match.
  -- 'cache' means a returning visitor whose 24h localStorage token
  -- was still valid — we count it as a portal visit, not a fresh auth.
  authorized_via TEXT NOT NULL CHECK (authorized_via IN (
    'exact', 'approved_email', 'same_domain', 'approved_domain', 'cache'
  )),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  ip_address INET
);

CREATE INDEX IF NOT EXISTS idx_portal_access_log_client_time
  ON portal_access_log (client_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_access_log_email
  ON portal_access_log (email);

ALTER TABLE portal_access_log ENABLE ROW LEVEL SECURITY;

-- Admins (and super_admins) can read every log row. Members + clients
-- + anon get nothing — no INSERT policy means clients can't write
-- either, which is what we want: writes only flow through the server
-- route that runs with service-role.
DROP POLICY IF EXISTS "admin_read_portal_access_log" ON portal_access_log;
CREATE POLICY "admin_read_portal_access_log"
  ON portal_access_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE portal_access_log IS
  'Audit log of public client portal visits. Writes happen via /api/portal/log-access using service-role (anon cannot write directly).';
