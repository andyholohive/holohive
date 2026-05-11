-- Migration 058: Link telegram_chats to clients (parallels the existing
-- opportunity_id and master_kol_id FKs).
--
-- Use case: long-running client chats (e.g. "Acme Corp delivery group")
-- that aren't tied to a specific opportunity or KOL. They live in the
-- new "Clients" tab on /crm/telegram and surface alongside the
-- opportunity-linked and KOL-linked views.
--
-- ON DELETE SET NULL — match the FK behavior of the existing client_id
-- columns elsewhere (e.g. links.client_id) so deleting a client doesn't
-- nuke the chat row.

ALTER TABLE telegram_chats
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_chats_client_id
  ON telegram_chats (client_id) WHERE client_id IS NOT NULL;
