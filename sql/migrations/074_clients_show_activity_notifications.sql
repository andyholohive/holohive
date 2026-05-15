-- Migration 074: Per-client toggle for the portal's activity notifications.
--
-- The public portal (/public/portal/[id]) renders a floating Bell
-- button + Recent Activity dropdown sourced from client_activity_log.
-- For most clients this is a feature; for some (e.g. Altura, who
-- doesn't want this surface) it's noise.
--
-- Rather than hardcoding client UUIDs into the React component, give
-- each client a boolean flag. Default true so existing behavior is
-- preserved. Set to false for the clients that have asked us to
-- silence the notifications surface.
--
-- This same flag can later gate other notification surfaces (e.g. if
-- we add web-push or email digests) — naming it broadly as
-- "show_activity_notifications" rather than "show_bell_button" keeps
-- that path open without another migration.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS show_activity_notifications BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN clients.show_activity_notifications IS
  'When false, the public portal hides the Bell button + Recent Activity dropdown for this client. Default true preserves existing behavior. Currently honored only by the portal page; safe to extend to other notification surfaces later.';

-- Per-request: silence Altura. Two duplicate client rows exist for
-- "Altura" (cleanup is a separate task); we flip both so whichever
-- portal route the client uses, the bell stays hidden.
UPDATE clients
SET show_activity_notifications = false
WHERE name = 'Altura';
