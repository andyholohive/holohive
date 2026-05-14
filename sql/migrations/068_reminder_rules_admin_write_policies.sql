-- Migration 068: Admin write policies for reminder_rules.
--
-- Migration 063 enabled RLS on reminder_rules + reminder_logs and added
-- a SELECT policy (admin_read_reminder_rules) but never added the write
-- policies. Result: every UPDATE / INSERT / DELETE from /reminders
-- silently affected zero rows because no policy matched. The API used
-- .single() on the returned row, which then 500'd with PGRST116
-- ("Cannot coerce 0 rows to single object"). The save button looked
-- broken; the table was actually unwritable.
--
-- Mirror the SELECT policy for the three write commands so admins can
-- edit chat IDs, toggle is_active, etc. Service-role clients (the cron
-- + notify endpoints) bypass RLS entirely so they're unaffected.
--
-- reminder_logs only needs the existing admin_read policy — logs are
-- inserted by the engine running with service-role, never from the UI.

CREATE POLICY admin_insert_reminder_rules ON reminder_rules
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY admin_update_reminder_rules ON reminder_rules
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY admin_delete_reminder_rules ON reminder_rules
  FOR DELETE
  USING (is_admin());
