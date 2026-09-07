/**
 * KR Signal — review gate for the Stage-1 client listing alert (spec §7.C).
 *
 * [2026-09-04] This was the last KR Signal message that went straight to a
 * client. The hourly cron detected the listing and posted into the client's
 * group in the same breath, so the first anyone here knew about it was seeing
 * it already sent. The weekly report and the Saturday digest both gate on a
 * human; per Andy this now does too.
 *
 * Differs from the digest gate in one way that matters: an alert is aimed at
 * ONE client, and Stage 2 edits the delivered message in place 24h later. So
 * the 24h clock starts when the alert is actually sent, not when the listing
 * was detected — otherwise an alert approved a day late would be recapped
 * immediately, or never.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadActiveClients } from './config';
import { sendMessage, editMessageAndClearButtons } from './telegram';
import { decidedCard } from './reviewCard';

const TABLE = 'kr_signal_alert_messages';

export interface AlertReviewRow {
  id: string;
  client_id: string;
  ticker: string;
  listed_on_key: string;
  status: 'pending_review' | 'sent' | 'skipped';
  alert_html: string | null;
  edited_html: string | null;
  chat_id: string | null;
  message_id: number | null;
  review_chat_id: string | null;
  review_message_id: number | null;
  preflight: any;
  stage: number;
}

/** What actually gets sent — the operator's edit when there is one. */
export function effectiveAlertHtml(row: Pick<AlertReviewRow, 'alert_html' | 'edited_html'>): string {
  return row.edited_html?.trim() ? row.edited_html : (row.alert_html ?? '');
}

export async function getAlertById(
  supabase: SupabaseClient, id: string,
): Promise<AlertReviewRow | null> {
  const { data } = await (supabase as any).from(TABLE).select('*').eq('id', id).maybeSingle();
  return (data as AlertReviewRow) ?? null;
}

/**
 * Queue a Stage-1 alert for review.
 *
 * Returns null when this client/ticker/listing already has a row — the unique
 * index makes that the dedup key, and a listing an operator already decided
 * on must not be resurrected by the next hourly run.
 */
export async function saveAlertForReview(
  supabase: SupabaseClient,
  input: {
    clientId: string;
    ticker: string;
    listedOn: string;
    alertHtml: string;
    preflight: any;
  },
): Promise<AlertReviewRow | null> {
  const { data: existing } = await (supabase as any)
    .from(TABLE).select('*')
    .eq('client_id', input.clientId).eq('ticker', input.ticker).eq('listed_on_key', input.listedOn)
    .maybeSingle();
  const row = existing as AlertReviewRow | null;

  if (row && row.status !== 'pending_review') return null;
  if (row) {
    // Still pending — refresh the copy (prices move) but keep any edit and
    // the existing card.
    const { data } = await (supabase as any).from(TABLE)
      .update({ alert_html: input.alertHtml, preflight: input.preflight })
      .eq('id', row.id).select('*').single();
    return data as AlertReviewRow;
  }

  const { data } = await (supabase as any).from(TABLE)
    .insert({
      client_id: input.clientId,
      ticker: input.ticker,
      listed_on_key: input.listedOn,
      status: 'pending_review',
      alert_html: input.alertHtml,
      preflight: input.preflight,
      stage: 1,
      chat_id: null,
      message_id: null,
      edit_due_at: null,
    })
    .select('*').single();
  return (data as AlertReviewRow) ?? null;
}

export async function attachAlertCard(
  supabase: SupabaseClient, id: string, chatId: string, messageId: number,
): Promise<void> {
  await (supabase as any).from(TABLE)
    .update({ review_chat_id: chatId, review_message_id: messageId })
    .eq('id', id);
}

export interface AlertApproveResult {
  ok: boolean;
  error?: string;
  alreadyDecided?: AlertReviewRow['status'];
  clientName?: string;
}

/**
 * Approve: send the alert to its client and start the 24h recap clock.
 *
 * The destination is re-resolved here rather than trusted from detection time,
 * so fixing a broken chat config and then approving actually works.
 */
export async function approveAndSendAlert(
  supabase: SupabaseClient,
  id: string,
  actor: { name: string | null; userId?: string | null },
): Promise<AlertApproveResult> {
  const row = await getAlertById(supabase, id);
  if (!row) return { ok: false, error: 'Alert not found.' };
  if (row.status !== 'pending_review') return { ok: false, alreadyDecided: row.status };

  const clients = await loadActiveClients(supabase);
  const client = clients.find((c) => c.id === row.client_id);
  if (!client) return { ok: false, error: 'Client is no longer active in Korea Signal.' };
  if (!client.resolved_chat_id) return { ok: false, error: `No chat resolved for ${client.name}.` };

  const html = effectiveAlertHtml(row);
  if (!html.trim()) return { ok: false, error: 'Alert body is empty.' };

  let msg: { message_id: number };
  try {
    msg = await sendMessage(client.resolved_chat_id, html, client.resolved_thread_id);
  } catch (e: any) {
    // Left pending on purpose: a failed send is a config problem to fix and
    // retry, not a decision.
    return { ok: false, error: String(e?.message || e) };
  }

  const now = new Date();
  await (supabase as any).from(TABLE).update({
    status: 'sent',
    chat_id: String(client.resolved_chat_id),
    message_id: msg.message_id,
    posted_at: now.toISOString(),
    sent_at: now.toISOString(),
    // Stage 2 is "24h after the client saw it", so the clock starts now.
    edit_due_at: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
    approved_at: now.toISOString(),
    approved_by: actor.userId ?? null,
    approved_by_name: actor.name,
  }).eq('id', id);

  if (row.review_chat_id && row.review_message_id) {
    await editMessageAndClearButtons(
      row.review_chat_id, row.review_message_id,
      decidedCard(html, 'sent', actor.name ?? 'someone', `sent to ${client.name}`),
    ).catch(() => {});
  }

  return { ok: true, clientName: client.name };
}

export async function skipAlert(
  supabase: SupabaseClient,
  id: string,
  actor: { name: string | null; userId?: string | null },
): Promise<{ ok: boolean; error?: string; alreadyDecided?: AlertReviewRow['status'] }> {
  const row = await getAlertById(supabase, id);
  if (!row) return { ok: false, error: 'Alert not found.' };
  if (row.status !== 'pending_review') return { ok: false, alreadyDecided: row.status };

  const now = new Date().toISOString();
  await (supabase as any).from(TABLE).update({
    status: 'skipped',
    skipped_at: now,
    approved_by: actor.userId ?? null,
    approved_by_name: actor.name,
  }).eq('id', id);

  if (row.review_chat_id && row.review_message_id) {
    await editMessageAndClearButtons(
      row.review_chat_id, row.review_message_id,
      decidedCard(effectiveAlertHtml(row), 'skipped', actor.name ?? 'someone'),
    ).catch(() => {});
  }
  return { ok: true };
}
