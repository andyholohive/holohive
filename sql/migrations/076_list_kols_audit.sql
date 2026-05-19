-- Migration 076: Audit trail for list_kols.
--
-- Context: the list-edit handler in /lists silently wiped per-KOL
-- notes and reset statuses for ~10 months (delete-all + reinsert
-- pattern) before being caught (commit f09e64d). Without an audit
-- table, there's no way to tell which lists were affected or recover
-- the lost data.
--
-- This migration adds a `list_kols_history` table + a trigger that
-- mirrors every UPDATE/DELETE on `list_kols` so any future regression
-- of the same kind is recoverable from the audit row, not just from
-- Supabase PITR. Captures the row state BEFORE the change.
--
-- Doesn't backfill — the bug already destroyed prior notes/statuses,
-- so the history table starts empty. From this migration forward,
-- every notes/status change leaves a trail.

CREATE TABLE IF NOT EXISTS list_kols_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The list_kols row that changed. NOT a foreign key — if the row
  -- has been deleted (the most common case we want to capture!) the
  -- FK would prevent the history row from existing. Plain UUID.
  original_id UUID NOT NULL,

  -- Mirror the changed row's identity for queryability without
  -- joining back to a row that may not exist anymore.
  list_id UUID NOT NULL,
  master_kol_id UUID NOT NULL,

  -- The state BEFORE the change. Nullable to mirror the live table.
  status TEXT,
  notes TEXT,

  -- 'UPDATE' or 'DELETE' — never 'INSERT' (inserts are by definition
  -- not destructive). Constraint enforces this so noise can't sneak in.
  change_type TEXT NOT NULL CHECK (change_type IN ('UPDATE', 'DELETE')),

  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- auth.uid() when the change came from a user session. NULL when
  -- the change came from a service-role context (e.g. a cron, the
  -- webhook, or a direct SQL call). Useful for attribution but not
  -- enforced.
  changed_by UUID
);

-- Query patterns:
--   - "what changed on this list" — by list_id, recent first
--   - "what was this KOL's note before it got wiped" — by master_kol_id
CREATE INDEX IF NOT EXISTS idx_list_kols_history_list
  ON list_kols_history (list_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_list_kols_history_kol
  ON list_kols_history (master_kol_id, changed_at DESC);

COMMENT ON TABLE list_kols_history IS
  'Append-only audit log of UPDATE/DELETE on list_kols. Trigger-populated. Use to recover lost notes/statuses or attribute who changed what when.';

-- Trigger function. SECURITY DEFINER so it can write even when the
-- caller's RLS context wouldn't allow it (the trigger needs to fire
-- universally). Only archives when status or notes actually changed
-- for UPDATE — avoids noise from updated_at-only writes.
CREATE OR REPLACE FUNCTION archive_list_kols_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- IS NOT DISTINCT FROM treats NULL as equal-to-NULL (regular =
    -- would say NULL != NULL). Skip if nothing meaningful changed.
    IF OLD.status IS NOT DISTINCT FROM NEW.status
       AND OLD.notes IS NOT DISTINCT FROM NEW.notes THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO list_kols_history (
    original_id, list_id, master_kol_id, status, notes, change_type, changed_by
  ) VALUES (
    OLD.id, OLD.list_id, OLD.master_kol_id, OLD.status, OLD.notes,
    TG_OP, auth.uid()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_list_kols_archive
  AFTER UPDATE OR DELETE ON list_kols
  FOR EACH ROW
  EXECUTE FUNCTION archive_list_kols_change();

-- RLS: append-only from the app's perspective. Reads allowed for any
-- authenticated user (so admins can investigate via UI later if we
-- build a "list change history" view). Writes only by the trigger,
-- which is SECURITY DEFINER so it bypasses RLS naturally.
ALTER TABLE list_kols_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_read_list_kols_history ON list_kols_history
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
