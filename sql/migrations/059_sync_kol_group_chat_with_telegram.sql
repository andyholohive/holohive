-- Migration 059: Auto-sync master_kols.group_chat with telegram_chats links.
--
-- Bidirectional rule: master_kols.group_chat = TRUE iff at least one
-- row in telegram_chats has master_kol_id = this kol's id.
--
-- Implemented as a trigger on telegram_chats so the sync is atomic
-- with the link change, regardless of which UI/code path made it
-- (current /crm/telegram link dialog, future bulk imports, manual
-- SQL fixes, etc). One-shot backfill at the end aligns existing data.
--
-- "Other way around" (manual flip of group_chat → unlink chats) is
-- intentionally NOT implemented — it'd be destructive (the user
-- might just want to toggle the badge for accounting reasons without
-- losing the chat link). The field stays computed-from-truth.

-- ── Helper: recompute group_chat for one KOL ────────────────────────
CREATE OR REPLACE FUNCTION refresh_kol_group_chat(p_kol_id UUID)
RETURNS VOID AS $$
BEGIN
  IF p_kol_id IS NULL THEN RETURN; END IF;
  UPDATE master_kols
     SET group_chat = EXISTS (
           SELECT 1 FROM telegram_chats WHERE master_kol_id = p_kol_id
         ),
         updated_at = now()
   WHERE id = p_kol_id;
END;
$$ LANGUAGE plpgsql;

-- ── Trigger function: recompute on relevant changes ─────────────────
CREATE OR REPLACE FUNCTION sync_kol_group_chat_on_telegram_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM refresh_kol_group_chat(NEW.master_kol_id);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only react when master_kol_id actually changed; recompute both
    -- the old and new kol so each ends up with the right value.
    IF OLD.master_kol_id IS DISTINCT FROM NEW.master_kol_id THEN
      PERFORM refresh_kol_group_chat(OLD.master_kol_id);
      PERFORM refresh_kol_group_chat(NEW.master_kol_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM refresh_kol_group_chat(OLD.master_kol_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ── Trigger: fires AFTER each row change on telegram_chats ──────────
DROP TRIGGER IF EXISTS trg_sync_kol_group_chat ON telegram_chats;
CREATE TRIGGER trg_sync_kol_group_chat
  AFTER INSERT OR UPDATE OF master_kol_id OR DELETE ON telegram_chats
  FOR EACH ROW EXECUTE FUNCTION sync_kol_group_chat_on_telegram_change();

-- ── Backfill: align existing data with the new rule ─────────────────
-- Anyone with a chat → group_chat=true; anyone without → false.
-- Single statement using EXISTS so we touch every row exactly once.
UPDATE master_kols mk
   SET group_chat = EXISTS (
         SELECT 1 FROM telegram_chats tc WHERE tc.master_kol_id = mk.id
       ),
       updated_at = now()
 WHERE COALESCE(mk.group_chat, false) <> EXISTS (
         SELECT 1 FROM telegram_chats tc WHERE tc.master_kol_id = mk.id
       );
