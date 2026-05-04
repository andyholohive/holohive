-- ─────────────────────────────────────────────────────────────────────
-- 043_create_list_access_tracking
-- ─────────────────────────────────────────────────────────────────────
--
-- Adds two new tables and one column to support:
--   1. Tracking views/clicks per email per list (analytics overview)
--   2. Per-email access expiration (auto-revoke after configurable period)
--
-- Architecture
-- ------------
-- list_views          : event log (append-only, grows fast). One row per
--                       view or per click. We can prune > 90 days later
--                       without touching access state.
-- list_access_grants  : state (mutated). One row per (list, email).
--                       Authoritative on WHEN access was granted and
--                       WHEN it expires. Auto-revoke cron flips
--                       revoked_at + removes the email from the parent
--                       list's approved_emails array.
-- lists.access_duration_days : list-level setting. When you add a NEW
--                       email to the list, the system computes the
--                       grant's expires_at = NOW() + duration. NULL =
--                       no auto-expire (the existing-list default).
--
-- approved_emails on the lists table stays as the read-time gate (the
-- public page's existing email check doesn't change). Grants just layer
-- on top to record/expire when access was given. The auto-revoke cron
-- mutates BOTH (revokes the grant + removes the email from the array).
--
-- Backfill
-- --------
-- Existing lists keep their behavior: every email currently in
-- approved_emails gets a grant row with granted_at = list.created_at
-- and expires_at = NULL (grandfathered, never expires). Andy can opt
-- in per-list later by setting access_duration_days and clicking
-- an "apply to existing" button (separate UI work).

-- ── Extend the existing list_email_views table ───────────────────────
-- The table was already created in an earlier migration to capture
-- per-email view events (used by the public list page on email gate
-- pass). We add two columns to support click-event tracking too:
--   event_type  - 'view' (existing rows) | 'click' (new)
--   click_target - KOL id or URL, only for click events
--
-- IMPORTANT: existing rows get event_type='view' via the DEFAULT.
-- The public page already inserts views without specifying this; the
-- default keeps the old code path working unchanged.
ALTER TABLE list_email_views
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'view'
    CHECK (event_type IN ('view', 'click')),
  ADD COLUMN IF NOT EXISTS click_target TEXT;

CREATE INDEX IF NOT EXISTS idx_list_email_views_list_time
  ON list_email_views (list_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_list_email_views_email_list
  ON list_email_views (email, list_id);

-- ── Table: list_access_grants ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS list_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,             -- NULL = never expires (grandfathered)
  revoked_at TIMESTAMPTZ,             -- set on auto-expire or manual revoke
  revoked_reason TEXT,                -- 'auto-expired' | 'manual'
  granted_by UUID,                    -- the admin who added them (optional, populated when API knows)
  UNIQUE(list_id, email)
);

CREATE INDEX IF NOT EXISTS idx_grants_list ON list_access_grants (list_id);
CREATE INDEX IF NOT EXISTS idx_grants_expires
  ON list_access_grants (expires_at)
  WHERE revoked_at IS NULL AND expires_at IS NOT NULL;

-- ── Lists table: access_duration_days column ─────────────────────────
ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS access_duration_days INTEGER
    CHECK (access_duration_days IS NULL OR access_duration_days BETWEEN 1 AND 365);

-- ── Backfill grants for every existing approved email ────────────────
-- Each (list, email) pair becomes a grant row with granted_at backfilled
-- to the list's created_at and expires_at NULL (grandfathered). The
-- ON CONFLICT DO NOTHING is defensive in case the migration runs twice.
INSERT INTO list_access_grants (list_id, email, granted_at, expires_at)
SELECT
  l.id AS list_id,
  TRIM(LOWER(email)) AS email,
  l.created_at AS granted_at,
  NULL AS expires_at
FROM lists l
CROSS JOIN LATERAL UNNEST(COALESCE(l.approved_emails, ARRAY[]::TEXT[])) AS email
WHERE TRIM(LOWER(email)) <> ''
ON CONFLICT (list_id, email) DO NOTHING;

-- ── RLS (defense in depth) ───────────────────────────────────────────
-- list_email_views already had RLS from a prior migration; the
-- access_grants table is new so enable explicitly.
ALTER TABLE list_access_grants ENABLE ROW LEVEL SECURITY;
-- No policies → service role only. The /api/lists/[id]/track endpoint
-- runs with the service role to insert view/click events; admin
-- endpoints also use service role. The public page's email gate is
-- enforced at the API boundary, NOT via RLS.
