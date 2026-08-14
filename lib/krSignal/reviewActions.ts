/**
 * KR Signal — the two decisions a reviewer can make, in one place.
 *
 * Approve/skip arrive from three surfaces: an inline button in the ops chat,
 * the Sunday "didn't send" nudge, and the in-app editor on /clients. All three
 * call these functions rather than re-implementing the transition, so the
 * status machine, the audit stamp and the review-card cleanup can't drift
 * apart between entry points.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadClientById } from './config';
import { effectiveHtml } from './reportEdit';
import { decidedCard } from './reviewCard';
import {
  getWeeklyReviewById, markWeeklySent, markWeeklySkipped, type WeeklyReviewRow,
} from './store';
import { sendMessage, editMessageAndClearButtons } from './telegram';

export interface Actor {
  /** Display name for the audit line — a Telegram name or an HHP user name. */
  name: string | null;
  /** users.id when the actor maps to an HHP account; null when they don't. */
  userId?: string | null;
}

export interface ApproveResult {
  ok: boolean;
  messageId?: number;
  chatId?: string;
  error?: string;
  /** Set when the row was already decided — the caller should say so rather
   *  than report a failure. Two people tapping Approve is normal, not an error. */
  alreadyDecided?: WeeklyReviewRow['status'];
}

/**
 * Send an approved report to the client and record the delivery.
 *
 * Re-resolves the destination at approval time rather than trusting whatever
 * the generate step probed: the whole point of a review gate is that someone
 * can fix a broken chat config and then approve, and a cached destination
 * would send to the old one (or refuse) after the fix.
 */
export async function approveAndSend(
  supabase: SupabaseClient,
  rowId: string,
  actor: Actor
): Promise<ApproveResult> {
  const row = await getWeeklyReviewById(supabase, rowId);
  if (!row) return { ok: false, error: 'Report not found.' };
  if (row.status === 'sent' || row.status === 'skipped') {
    return { ok: false, alreadyDecided: row.status };
  }

  const cfg = await loadClientById(supabase, row.client_id);
  if (!cfg) return { ok: false, error: 'Korea Signal config not found for this client.' };
  if (!cfg.resolved_chat_id) {
    return { ok: false, error: 'No destination chat is set. Pick one in Korea Signal settings first.' };
  }

  const html = effectiveHtml(row);
  if (!html) return { ok: false, error: 'This report has no content to send.' };

  let messageId: number;
  try {
    const sent = await sendMessage(cfg.resolved_chat_id, html, cfg.resolved_thread_id);
    messageId = sent.message_id;
  } catch (e: any) {
    const error = String(e?.message || e);
    // Leave the row pending: a failed send is not a decision, and the
    // reviewer should be able to fix the destination and approve again.
    if (row.review_chat_id && row.review_message_id) {
      await editMessageAndClearButtons(
        row.review_chat_id,
        row.review_message_id,
        decidedCard(html, 'failed', actor.name, error),
      );
    }
    return { ok: false, error };
  }

  await markWeeklySent(supabase, row.id, {
    messageId,
    byName: actor.name,
    byUserId: actor.userId ?? null,
  });

  if (row.review_chat_id && row.review_message_id) {
    await editMessageAndClearButtons(
      row.review_chat_id,
      row.review_message_id,
      decidedCard(html, 'sent', actor.name),
    );
  }

  return { ok: true, messageId, chatId: String(cfg.resolved_chat_id) };
}

/** Decline this week's report. Deliberately terminal — a skipped week is a
 *  decision, and re-generating over it is refused by saveWeeklyForReview. */
export async function skipReport(
  supabase: SupabaseClient,
  rowId: string,
  actor: Actor
): Promise<{ ok: boolean; error?: string; alreadyDecided?: WeeklyReviewRow['status'] }> {
  const row = await getWeeklyReviewById(supabase, rowId);
  if (!row) return { ok: false, error: 'Report not found.' };
  if (row.status === 'sent' || row.status === 'skipped') {
    return { ok: false, alreadyDecided: row.status };
  }

  await markWeeklySkipped(supabase, row.id, actor.name);

  if (row.review_chat_id && row.review_message_id) {
    await editMessageAndClearButtons(
      row.review_chat_id,
      row.review_message_id,
      decidedCard(effectiveHtml(row), 'skipped', actor.name),
    );
  }
  return { ok: true };
}
