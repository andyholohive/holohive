import { redirect } from 'next/navigation';

/**
 * Retired 2026-08-19. Jdot: "Fold it, retire /crm/telegram. Two Telegram
 * surfaces is the exact thing we were trying to kill."
 *
 * The chat surface now mounts as tabs on the Telegram page. This stays as a
 * redirect rather than a deletion because the URL is in bookmarks, in TG
 * message links, and in the sidebar's remembered-section state.
 */
export default function RetiredTelegramChatsPage() {
  redirect('/intelligence/telegram?tab=chats');
}
