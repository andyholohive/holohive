-- Migration 066: Short-IDs for tasks (T-042 style).
--
-- Tasks have UUID primary keys, which are unworkable for human-typed
-- references — `/done T-042` in a Telegram chat beats
-- `/done a3f9c8e1-7b2d-4f5a-9c1e-8d4b3a7f6e9c` by a country mile.
-- Add a short_id column populated by a sequence so every task has a
-- compact, typeable ID for chat-bot use.
--
-- Backfill: every existing row gets one assigned in created_at order
-- so older tasks have lower numbers (intuitive when scanning).

CREATE SEQUENCE IF NOT EXISTS tasks_short_id_seq START WITH 1;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS short_id TEXT;

-- Backfill existing rows. order-by-created so T-001 is the oldest.
UPDATE tasks
SET short_id = 'T-' || LPAD(seq::text, 3, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at NULLS LAST, id) AS seq
  FROM tasks
  WHERE short_id IS NULL
) AS ordered
WHERE tasks.id = ordered.id;

-- Bump the sequence past the highest backfilled value so new inserts
-- continue from there. setval() takes the next value to RETURN, hence
-- the + 1 — without it the next nextval() would re-issue the max.
SELECT setval(
  'tasks_short_id_seq',
  GREATEST(
    1,
    (SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(short_id, '[^0-9]', '', 'g'), '')::int), 0) FROM tasks)
  )
);

-- Trigger: auto-assign short_id on INSERT when missing. Padded to 3
-- digits while we have <1000 tasks (visually consistent T-001 through
-- T-999); 4+ digit overflow falls through naturally because LPAD
-- doesn't truncate.
CREATE OR REPLACE FUNCTION tasks_assign_short_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.short_id IS NULL THEN
    NEW.short_id := 'T-' || LPAD(nextval('tasks_short_id_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_assign_short_id ON tasks;
CREATE TRIGGER trg_tasks_assign_short_id
  BEFORE INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION tasks_assign_short_id();

-- Unique index AFTER backfill so the migration doesn't fight existing
-- duplicate NULLs. Partial index (WHERE NOT NULL) keeps the unique
-- constraint useful without rejecting future NULL rows during the brief
-- window between INSERT default-firing and the trigger landing.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tasks_short_id
  ON tasks (short_id)
  WHERE short_id IS NOT NULL;

COMMENT ON COLUMN tasks.short_id IS
  'Human-typeable task ID (T-001, T-002, ...). Used by the Telegram bot for /done <id>. Auto-assigned on insert by tasks_assign_short_id trigger; do not set manually.';
