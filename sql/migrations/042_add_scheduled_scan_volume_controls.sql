-- ─────────────────────────────────────────────────────────────────────
-- 042_add_scheduled_scan_volume_controls
-- ─────────────────────────────────────────────────────────────────────
--
-- Two new knobs on scheduled_scans for tuning Discovery scan VOLUME from
-- the Intelligence Schedule dialog (no redeploy required):
--
--   runs_per_day  How many times per cadence-matching day the scan
--                 fires. 1 = current behavior (00:00 UTC only).
--                 2 = also fires at 12:00 UTC (= 09:00 ET / 21:00 KST,
--                 catching US-hours funding announcements).
--
--   cooldown_days How many days a prospect must NOT be re-scanned. Used
--                 by the scan endpoint's skip-list builder. Lower =
--                 more aggressive re-scanning of borderline prospects.
--                 Default 14 matches the previous hardcoded value so
--                 existing scans don't change behavior.
--
-- The cron handler reads runs_per_day on each fire and skips the 12:00
-- UTC run if the user has runs_per_day=1. The vercel.json change
-- (separate from this migration) adds the second cron entry.

ALTER TABLE scheduled_scans
  ADD COLUMN IF NOT EXISTS runs_per_day SMALLINT NOT NULL DEFAULT 1
    CHECK (runs_per_day IN (1, 2)),
  ADD COLUMN IF NOT EXISTS cooldown_days SMALLINT NOT NULL DEFAULT 14
    CHECK (cooldown_days BETWEEN 1 AND 60);

-- Backfill the existing default row explicitly so the dialog UI shows
-- the right values on first load (even though the column defaults
-- already cover this).
UPDATE scheduled_scans
SET runs_per_day = 1, cooldown_days = 14
WHERE schedule_key = 'discovery_default'
  AND (runs_per_day IS NULL OR cooldown_days IS NULL);
