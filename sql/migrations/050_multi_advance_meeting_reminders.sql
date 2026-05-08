-- Migration 050: Support multiple advance reminder times for Google Meeting Reminders
--
-- The previous schema (049) had reminder_kind TEXT CHECK IN ('before','start')
-- which limited each event to one advance + one start reminder. We want to
-- support arbitrary lists like [30, 10, 5, 0] minutes before. Replacing
-- reminder_kind with a numeric minutes_before column gives us that for free
-- (PK is (user_id, event_id, minutes_before) so each offset is deduped
-- independently).
--
-- 0 = sent at meeting start.
-- Any positive N = sent N minutes before meeting start.

ALTER TABLE google_meeting_reminders_sent
  DROP CONSTRAINT IF EXISTS google_meeting_reminders_sent_reminder_kind_check;

ALTER TABLE google_meeting_reminders_sent
  DROP CONSTRAINT IF EXISTS google_meeting_reminders_sent_pkey;

ALTER TABLE google_meeting_reminders_sent
  ADD COLUMN IF NOT EXISTS minutes_before INTEGER;

-- Migrate any existing rows from the old enum values. In dev there
-- shouldn't be any yet, but this keeps the migration idempotent if
-- someone tested locally before the upgrade.
UPDATE google_meeting_reminders_sent
   SET minutes_before = CASE
     WHEN reminder_kind = 'before' THEN 10  -- legacy default
     WHEN reminder_kind = 'start'  THEN 0
     ELSE NULL
   END
 WHERE minutes_before IS NULL
   AND reminder_kind IS NOT NULL;

ALTER TABLE google_meeting_reminders_sent
  ALTER COLUMN minutes_before SET NOT NULL;

ALTER TABLE google_meeting_reminders_sent
  DROP COLUMN IF EXISTS reminder_kind;

ALTER TABLE google_meeting_reminders_sent
  ADD PRIMARY KEY (user_id, google_event_id, minutes_before);

-- Update the seed rule's params to the new array shape so the UI lights
-- up correctly. If the user already customized params we keep their
-- values; we just upgrade `advance_minutes` from number → array.
UPDATE reminder_rules
   SET params = jsonb_set(
     COALESCE(params, '{}'::jsonb),
     '{advance_minutes}',
     CASE
       WHEN jsonb_typeof(params->'advance_minutes') = 'number'
         THEN jsonb_build_array(params->'advance_minutes')
       WHEN jsonb_typeof(params->'advance_minutes') = 'array'
         THEN params->'advance_minutes'
       ELSE '[10]'::jsonb
     END,
     true
   )
 WHERE rule_type = 'google_meeting_reminder';
