import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Repost Deal Bot — the §6 message flow.
 *
 * Telegram calls live here rather than in the webhook so the launch route and
 * the callback handler send and edit through exactly one implementation. The
 * close path in particular has to retire every still-open message (§6.5), and
 * a second copy of that formatting would drift.
 */

const TG_API = 'https://api.telegram.org';

function token(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** §6: "Currency is always shown as a flat dollar figure ($XXX)." */
export function money(n: number | string): string {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
}

/** Countdown for the offer message — coarse on purpose; a live-ticking
 *  clock would need edits we are not going to spend API calls on. */
function closesLabel(closesAt: string | null): string {
  if (!closesAt) return 'when slots are full';
  const ms = Date.parse(closesAt) - Date.now();
  if (ms <= 0) return 'now';
  const h = Math.floor(ms / 3600_000);
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1) return `in ${h}h`;
  return `in ${Math.max(1, Math.floor(ms / 60_000))}m`;
}

export function offerText(deal: any, offer: any): string {
  return [
    'New repost deal from Holo Hive.',
    '',
    `Share this post to your channel: ${escapeHtml(deal.source_post_link)}`,
    `Your fee: <b>${money(offer.locked_price)}</b>`,
    `Closes: ${closesLabel(deal.closes_at)}`,
    '',
    '<i>First come, first served. Tap Accept to lock your slot.</i>',
  ].join('\n');
}

export const ACCEPTED_TEXT = (price: number | string) =>
  `Locked in. Your slot is confirmed at <b>${money(price)}</b>.\nShare the post to your channel.`;

export const REJECTED_TEXT =
  "No problem, marked as a pass. We'll send the next deal your way.";

export const CLOSED_TEXT =
  'This deal is now closed. Thanks for looking.\nNext repost deal coming soon.';

async function tg(method: string, payload: any): Promise<any | null> {
  const t = token();
  if (!t) return null;
  try {
    const res = await fetch(`${TG_API}/bot${t}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json?.ok ? json.result : null;
  } catch {
    return null;
  }
}

/** §6.1 — post the offer into one KOL's group chat and remember the
 *  message id so it can be edited on accept, reject or close. */
export async function sendRepostOffer(
  supabase: SupabaseClient<any>,
  deal: any,
  offer: any,
): Promise<boolean> {
  const result = await tg('sendMessage', {
    chat_id: offer.chat_id,
    text: offerText(deal, offer),
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Accept', callback_data: `rd:accept:${offer.id}` },
        { text: '❌ Reject', callback_data: `rd:reject:${offer.id}` },
      ]],
    },
  });
  if (!result?.message_id) return false;
  await (supabase as any).from('repost_deal_offers')
    .update({ message_id: result.message_id }).eq('id', offer.id);
  return true;
}

/** Replace a message's body and drop its buttons — the shape every
 *  terminal state in §6 takes. */
export async function retireOfferMessage(chatId: string, messageId: number, text: string) {
  await tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  });
}

export async function answerCallback(callbackId: string, text?: string) {
  await tg('answerCallbackQuery', { callback_query_id: callbackId, text, show_alert: false });
}

/**
 * §6.5 — close every still-open offer on a deal.
 *
 * Runs for all four close reasons and for a late tap that lands after the
 * caps are gone, which is why the copy is shared: from the creator's side
 * "full" and "expired" are the same event.
 */
export async function retireOpenOffers(supabase: SupabaseClient<any>, dealId: string) {
  const { data: open } = await (supabase as any)
    .from('repost_deal_offers')
    .select('id, chat_id, message_id')
    .eq('deal_id', dealId)
    .eq('status', 'pending');

  const rows = (open ?? []) as Array<{ id: string; chat_id: string; message_id: number | null }>;
  for (const o of rows) {
    if (o.message_id) await retireOfferMessage(o.chat_id, o.message_id, CLOSED_TEXT);
  }
  // §6.4: an unactioned offer is expired. It never held a slot or budget, so
  // this is bookkeeping, not a release.
  if (rows.length > 0) {
    await (supabase as any).from('repost_deal_offers')
      .update({ status: 'expired' })
      .eq('deal_id', dealId)
      .eq('status', 'pending');
  }
  return rows.length;
}
