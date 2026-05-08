-- ─────────────────────────────────────────────────────────────────────
-- 045_create_external_costs
-- ─────────────────────────────────────────────────────────────────────
--
-- Stores monthly spend snapshots for the third-party SaaS the team uses.
-- Drives the "Infrastructure Spend" panel on /analytics so the manager
-- can see Anthropic + Vercel + xAI Grok in one place without logging
-- into three separate dashboards.
--
-- Why a table instead of fetching from each provider on every render:
--   1. Anthropic's admin API doesn't expose monthly spend cleanly —
--      easier to enter manually each month or scrape the credit balance
--      via cron.
--   2. Vercel + xAI APIs work but each has its own auth/format. Caching
--      monthly snapshots means /analytics stays fast and we control the
--      shape consumed by the UI.
--   3. Lets us track trends ourselves (this month vs last month) without
--      depending on each provider exposing that history.
--
-- One row per (service, period_start). Re-running an insert for the same
-- month UPSERTs (replaces the row) so the cron job or a manual update
-- can refresh today's snapshot without producing dupes.

CREATE TABLE IF NOT EXISTS external_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Service key. Free-text rather than enum so adding a 4th provider
  -- (e.g. 'openai', 'supabase', 'telegram') doesn't need a migration.
  -- The /analytics panel renders whatever services it finds; unknown
  -- ones get a generic icon.
  service TEXT NOT NULL CHECK (length(service) > 0),

  -- Billing period. We store first-of-month as the canonical key so
  -- "April 2026" = '2026-04-01'. period_end is computed/displayed in
  -- the UI from period_start.
  period_start DATE NOT NULL,

  -- Total spend for this period in USD. Numeric, not money type, so we
  -- can do arithmetic in Postgres without dollar-sign formatting noise.
  amount_usd NUMERIC(10, 2) NOT NULL DEFAULT 0
    CHECK (amount_usd >= 0),

  -- Remaining prepaid balance, where applicable. Anthropic uses a
  -- credit-grant model — useful to surface so we don't get caught when
  -- the balance hits zero mid-week. Null for post-paid services
  -- (Vercel, xAI invoiced monthly).
  balance_usd NUMERIC(10, 2)
    CHECK (balance_usd IS NULL OR balance_usd >= 0),

  -- Free-text notes. The manual-entry UI exposes this so the operator
  -- can record context like "extra credits purchased for migration"
  -- or "Vercel bumped Pro tier".
  notes TEXT,

  -- 'manual' = entered via the admin dialog. 'api' = filled by a future
  -- cron job. We surface this in the UI as a small badge so the team
  -- knows which numbers are live vs typed-in.
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'api')),

  -- When this row was last refreshed. The UI shows "updated 3d ago" so
  -- the operator knows when the manual entries went stale and need a
  -- refresh.
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One snapshot per (service, month) — UPSERT-safe.
  UNIQUE (service, period_start)
);

-- Index for the panel's main read pattern: "last 6 months for all services".
CREATE INDEX IF NOT EXISTS idx_external_costs_period
  ON external_costs (period_start DESC, service);

COMMENT ON TABLE external_costs IS
  'Monthly spend snapshots for third-party SaaS (Anthropic, Vercel, xAI). One row per (service, month). Read by /analytics Infrastructure Spend panel. Filled manually via the dialog or by future cron.';
