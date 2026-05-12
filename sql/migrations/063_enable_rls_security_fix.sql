-- Migration 063: Enable RLS on tables that were missing it.
--
-- Supabase's row-level security is the only thing protecting these
-- tables from the public anon key (which ships in every page bundle
-- because of NEXT_PUBLIC_*). Without RLS, anyone could:
--
--   • google_oauth_tokens    — read every team member's refresh
--     token, then impersonate them against Google APIs.
--   • reminder_rules         — inject malicious TG notifications by
--     pointing rules at attacker-controlled chats.
--   • mindshare_*            — read competitive intel and pollute
--     the leaderboard with junk data.
--
-- All server code in this app uses the service-role key, which
-- bypasses RLS entirely, so enabling RLS won't break the API
-- routes. The only callers blocked are anonymous browsers hitting
-- /rest/v1/* directly with the anon key.
--
-- Policy design — minimum-viable, default-deny:
--   • If a table is meant for server-side eyes only, no policy is
--     added (default = block).
--   • If a table has user-scoped rows (google_oauth_tokens), the
--     policy gates by auth.uid() = user_id.
--   • If a table has org-wide read but admin-only write, we add a
--     SELECT-only policy for authenticated users.
--
-- Helper function `is_admin()` — created once here, reused per
-- policy. Lives in public schema so the SECURITY DEFINER setting
-- can lift it past RLS on the users table itself (otherwise the
-- recursion goes nowhere good).

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
COMMENT ON FUNCTION public.is_admin() IS
  'Returns true when the calling auth.uid() is an admin or super_admin. Used by RLS policies — kept as SECURITY DEFINER so policy evaluation can read public.users without itself being blocked by users-table RLS.';

-- ─── google_oauth_tokens ─────────────────────────────────────────
-- Each row is the OAuth token bundle for one user. The owning user
-- can read their own row (used by /api/google/status to show
-- connection state). Writes happen exclusively from the server-side
-- callback handler with service-role — no client-side writes ever.
ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_can_read_own_oauth" ON public.google_oauth_tokens;
CREATE POLICY "user_can_read_own_oauth"
  ON public.google_oauth_tokens
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies — service-role bypasses RLS, and
-- no other writer should exist. Default-deny.

-- ─── reminder_rules ──────────────────────────────────────────────
-- Contains telegram_chat_id and thread_id for every reminder type.
-- Admin-only by design. No writes from client. Reads gated to admins
-- so the page that lists rules (HQ admin surface) can still work
-- without service-role.
ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_reminder_rules" ON public.reminder_rules;
CREATE POLICY "admin_read_reminder_rules"
  ON public.reminder_rules
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ─── reminder_logs ───────────────────────────────────────────────
-- Run-history table. Admin-only read. Writes via service-role
-- (cron-fired evaluator).
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_reminder_logs" ON public.reminder_logs;
CREATE POLICY "admin_read_reminder_logs"
  ON public.reminder_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ─── mindshare_projects ──────────────────────────────────────────
-- Competitive intel — fine for any signed-in teammate to see, but
-- writes go through the admin-gated /api/mindshare/projects route
-- (service-role).
ALTER TABLE public.mindshare_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_mindshare_projects" ON public.mindshare_projects;
CREATE POLICY "auth_read_mindshare_projects"
  ON public.mindshare_projects
  FOR SELECT TO authenticated
  USING (true);

-- ─── mindshare_daily ─────────────────────────────────────────────
-- Derived rollup. Same rule: any authenticated user can SELECT;
-- writes via service-role only.
ALTER TABLE public.mindshare_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_mindshare_daily" ON public.mindshare_daily;
CREATE POLICY "auth_read_mindshare_daily"
  ON public.mindshare_daily
  FOR SELECT TO authenticated
  USING (true);

-- ─── mindshare_scan_state ────────────────────────────────────────
-- Singleton watermark row. Admins should be able to inspect it
-- (e.g. last-run-at timestamp); writes via service-role only.
ALTER TABLE public.mindshare_scan_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_mindshare_scan_state" ON public.mindshare_scan_state;
CREATE POLICY "admin_read_mindshare_scan_state"
  ON public.mindshare_scan_state
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ─── google_meeting_reminders_sent ───────────────────────────────
-- Cron-managed dedup table. No client should ever touch this.
-- Enabling RLS without any policies = default-deny for all
-- non-service-role callers, which is exactly what we want.
ALTER TABLE public.google_meeting_reminders_sent ENABLE ROW LEVEL SECURITY;
