-- Migration 075: Add the two "comp" columns from the spec —
-- engagement_rate (single-row) + follower_growth_pct (cross-row).
--
-- Background: the May 2026 KOL overhaul spec lists these two
-- columns on kol_channel_snapshots with Req='comp' (computed).
-- They were previously implemented as runtime computations inside
-- lib/kolScoringEngine.ts — functionally identical for scoring,
-- but not directly queryable via SQL or exposed via the MCP tools.
-- This migration makes them stored columns so any consumer can
-- `SELECT engagement_rate, follower_growth_pct FROM ...` without
-- re-deriving from raw fields.
--
-- Approach per column:
--
--   engagement_rate
--     Single-row derivation: avg_views_per_post / follower_count.
--     Use a Postgres GENERATED STORED column — no trigger needed,
--     value is auto-recomputed on any update to the source fields.
--     CASE guard handles follower_count=0 and NULL avg_views.
--
--   follower_growth_pct
--     Cross-row derivation: requires the PREVIOUS month's snapshot
--     for the same KOL. GENERATED columns can't see other rows, so
--     this needs a BEFORE INSERT/UPDATE trigger that looks up the
--     prior row and fills the value.
--
-- Edge case (out-of-order inserts): if someone backfills an OLDER
-- snapshot for a KOL that already has newer ones, the newer rows'
-- follower_growth_pct values are now stale (computed against the
-- wrong "previous"). For monthly snapshots this is rare; if it
-- becomes an issue, the recompute_kol_growth_pct(kol_id) function
-- below can be called manually to re-derive every row for that KOL.

-- ── engagement_rate ─────────────────────────────────────────────
ALTER TABLE kol_channel_snapshots
  ADD COLUMN engagement_rate NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN follower_count > 0 AND avg_views_per_post IS NOT NULL
        THEN avg_views_per_post::numeric / follower_count
      ELSE NULL
    END
  ) STORED;

COMMENT ON COLUMN kol_channel_snapshots.engagement_rate IS
  'avg_views_per_post / follower_count. GENERATED column — auto-computed by Postgres on insert/update of the source fields. NULL when follower_count=0 or avg_views_per_post is NULL.';

-- ── follower_growth_pct + trigger ───────────────────────────────
ALTER TABLE kol_channel_snapshots
  ADD COLUMN follower_growth_pct NUMERIC;

COMMENT ON COLUMN kol_channel_snapshots.follower_growth_pct IS
  'Month-over-month follower growth as a percentage. Computed by trg_kol_snapshot_growth_pct on insert/update. NULL when no prior snapshot exists for the KOL or the prior follower_count was 0.';

-- Trigger function: find the most recent snapshot for the same KOL
-- with snapshot_date < NEW.snapshot_date, compute the delta as a
-- percentage of the previous count. NULLs when no prior or prior=0.
CREATE OR REPLACE FUNCTION compute_kol_snapshot_growth_pct()
RETURNS TRIGGER AS $$
DECLARE
  prev_count INTEGER;
BEGIN
  SELECT follower_count INTO prev_count
  FROM kol_channel_snapshots
  WHERE kol_id = NEW.kol_id
    AND snapshot_date < NEW.snapshot_date
  ORDER BY snapshot_date DESC
  LIMIT 1;

  IF prev_count IS NOT NULL AND prev_count > 0 THEN
    NEW.follower_growth_pct := ((NEW.follower_count - prev_count)::numeric / prev_count) * 100;
  ELSE
    NEW.follower_growth_pct := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kol_snapshot_growth_pct
  BEFORE INSERT OR UPDATE OF follower_count, snapshot_date, kol_id
  ON kol_channel_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION compute_kol_snapshot_growth_pct();

-- ── Manual recompute helper for out-of-order backfills ──────────
-- Re-derives follower_growth_pct for every row of a given KOL in
-- snapshot_date order. Use after backfilling old snapshots if the
-- automatic trigger's per-row pass might have left stale values
-- in newer rows. Idempotent — safe to call any time.
CREATE OR REPLACE FUNCTION recompute_kol_growth_pct(target_kol_id UUID)
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER := 0;
BEGIN
  WITH ordered AS (
    SELECT
      id,
      follower_count,
      LAG(follower_count) OVER (ORDER BY snapshot_date ASC) AS prev_count
    FROM kol_channel_snapshots
    WHERE kol_id = target_kol_id
  )
  UPDATE kol_channel_snapshots s
  SET follower_growth_pct = CASE
    WHEN o.prev_count IS NOT NULL AND o.prev_count > 0
      THEN ((s.follower_count - o.prev_count)::numeric / o.prev_count) * 100
    ELSE NULL
  END
  FROM ordered o
  WHERE s.id = o.id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- ── Backfill existing rows ──────────────────────────────────────
-- engagement_rate auto-fills via GENERATED clause.
-- follower_growth_pct needs an explicit backfill since the trigger
-- only fires on future writes.
DO $$
DECLARE
  k UUID;
BEGIN
  FOR k IN SELECT DISTINCT kol_id FROM kol_channel_snapshots LOOP
    PERFORM recompute_kol_growth_pct(k);
  END LOOP;
END;
$$;
