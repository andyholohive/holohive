/**
 * KR Signal — review gate for the Saturday listings digest (spec §7.B).
 *
 * Mirrors the weekly-report gate, with one structural difference: the digest
 * is client-independent. The same message goes to every client with
 * korea_listings_digest enabled, so it is reviewed ONCE per week and the
 * fan-out happens on approval, rather than one card per client.
 *
 * The fan-out records a per-client result. The previous code sent inside a
 * `catch (e) { }` that swallowed everything, so a digest that stopped going
 * out left no trace at all — which is exactly what happened after
 * 2026-08-08 and went unnoticed for two weeks.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadActiveClients } from './config';
import { sendMessage, editMessageAndClearButtons } from './telegram';
import { decidedCard } from './reviewCard';

export interface ListingDigestRow {
  id: string;
  week_ending: string;
  digest_html: string;
  edited_html: string | null;
  status: 'pending_review' | 'sent' | 'skipped';
  preflight: any;
  deliveries: any;
  review_chat_id: string | null;
  review_message_id: number | null;
}

const TABLE = 'kr_signal_listing_digests';

/** What actually gets sent — the operator's edit when there is one. */
export function effectiveDigestHtml(row: Pick<ListingDigestRow, 'digest_html' | 'edited_html'>): string {
  return row.edited_html?.trim() ? row.edited_html : row.digest_html;
}

export async function getDigestById(
  supabase: SupabaseClient, id: string,
): Promise<ListingDigestRow | null> {
  const { data } = await (supabase as any).from(TABLE).select('*').eq('id', id).maybeSingle();
  return (data as ListingDigestRow) ?? null;
}

/**
 * Persist this week's digest for review. Returns null when the week has
 * already been decided — re-running the cron must not resurrect a digest an
 * operator deliberately skipped, nor queue a second copy of one already sent.
 */
export async function saveDigestForReview(
  supabase: SupabaseClient,
  weekEnding: string,
  digestHtml: string,
  preflight: any,
): Promise<ListingDigestRow | null> {
  const existing = await (supabase as any)
    .from(TABLE).select('*').eq('week_ending', weekEnding).maybeSingle();
  const row = existing.data as ListingDigestRow | null;
  if (row && row.status !== 'pending_review') return null;

  if (row) {
    // Still pending — refresh the copy so a re-run reflects later listings,
    // but keep any operator edit and the existing review card.
    const { data } = await (supabase as any).from(TABLE)
      .update({ digest_html: digestHtml, preflight, updated_at: new Date().toISOString() })
      .eq('id', row.id).select('*').single();
    return data as ListingDigestRow;
  }

  const { data } = await (supabase as any).from(TABLE)
    .insert({ week_ending: weekEnding, digest_html: digestHtml, preflight })
    .select('*').single();
  return (data as ListingDigestRow) ?? null;
}

export async function attachDigestCard(
  supabase: SupabaseClient, id: string, chatId: string, messageId: number,
): Promise<void> {
  await (supabase as any).from(TABLE)
    .update({ review_chat_id: chatId, review_message_id: messageId })
    .eq('id', id);
}

export interface DigestApproveResult {
  ok: boolean;
  error?: string;
  alreadyDecided?: ListingDigestRow['status'];
  delivered?: number;
  failed?: number;
}

/**
 * Approve: fan the digest out to every client that has it enabled.
 *
 * Destinations are re-resolved here rather than trusted from generation time —
 * the point of a gate is that someone can fix a broken chat config and then
 * approve, and a cached destination would send to the old one.
 */
export async function approveAndSendDigest(
  supabase: SupabaseClient,
  id: string,
  actor: { name: string | null; userId?: string | null },
): Promise<DigestApproveResult> {
  const row = await getDigestById(supabase, id);
  if (!row) return { ok: false, error: 'Digest not found.' };
  if (row.status !== 'pending_review') return { ok: false, alreadyDecided: row.status };

  const clients = await loadActiveClients(supabase);
  const targets = clients.filter(c => c.features?.korea_listings_digest && c.resolved_chat_id);
  if (targets.length === 0) {
    return { ok: false, error: 'No active client has the listings digest enabled with a reachable chat.' };
  }

  const html = effectiveDigestHtml(row);
  const deliveries: any[] = [];
  for (const c of targets) {
    try {
      const msg = await sendMessage(c.resolved_chat_id!, html, c.resolved_thread_id);
      deliveries.push({
        client_id: c.id, name: c.name, chat_id: String(c.resolved_chat_id),
        ok: true, message_id: (msg as any)?.message_id ?? null,
      });
    } catch (e: any) {
      // Recorded, not swallowed — a partial fan-out has to be visible.
      deliveries.push({
        client_id: c.id, name: c.name, chat_id: String(c.resolved_chat_id),
        ok: false, error: String(e?.message || e),
      });
    }
  }

  const delivered = deliveries.filter(d => d.ok).length;
  const failed = deliveries.length - delivered;
  const now = new Date().toISOString();

  // 'sent' only when something actually landed. A fan-out where every send
  // failed stays pending so it can be retried after the chats are fixed —
  // stamping it sent is how the old code lost two weeks of digests.
  await (supabase as any).from(TABLE).update({
    status: delivered > 0 ? 'sent' : 'pending_review',
    deliveries,
    sent_at: delivered > 0 ? now : null,
    approved_at: now,
    approved_by: actor.userId ?? null,
    approved_by_name: actor.name,
    updated_at: now,
  }).eq('id', id);

  if (delivered > 0 && row.review_chat_id && row.review_message_id) {
    const note = failed > 0
      ? `sent to ${delivered} of ${deliveries.length} — ${failed} failed`
      : `sent to ${delivered} client${delivered === 1 ? '' : 's'}`;
    await editMessageAndClearButtons(
      row.review_chat_id, row.review_message_id,
      decidedCard(html, 'sent', actor.name ?? 'someone', note),
    ).catch(() => {});
  }

  return delivered > 0
    ? { ok: true, delivered, failed }
    : { ok: false, error: `Every send failed (${failed}). Digest left pending.`, delivered, failed };
}

export async function skipDigest(
  supabase: SupabaseClient,
  id: string,
  actor: { name: string | null; userId?: string | null },
): Promise<{ ok: boolean; error?: string; alreadyDecided?: ListingDigestRow['status'] }> {
  const row = await getDigestById(supabase, id);
  if (!row) return { ok: false, error: 'Digest not found.' };
  if (row.status !== 'pending_review') return { ok: false, alreadyDecided: row.status };

  const now = new Date().toISOString();
  await (supabase as any).from(TABLE).update({
    status: 'skipped', skipped_at: now,
    approved_by: actor.userId ?? null, approved_by_name: actor.name, updated_at: now,
  }).eq('id', id);

  if (row.review_chat_id && row.review_message_id) {
    await editMessageAndClearButtons(
      row.review_chat_id, row.review_message_id,
      decidedCard(effectiveDigestHtml(row), 'skipped', actor.name ?? 'someone'),
    ).catch(() => {});
  }
  return { ok: true };
}
