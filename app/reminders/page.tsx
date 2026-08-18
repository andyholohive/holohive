'use client';

/**
 * Reminders no longer has a sidebar entry — the rules live on the
 * Telegram page's Reminders tab, next to the event-driven routes they're
 * a scheduled variant of. This route stays live so existing links and
 * bookmarks resolve; the manager itself is a component now.
 */
import { RemindersManager } from '@/components/telegram/RemindersManager';

export default function RemindersPage() {
  return <RemindersManager />;
}
