import type { SupabaseClient } from '@supabase/supabase-js';
import { formatHandle, collapseHandleToken } from './telegramHandle';

/**
 * KOL announcements — bulk send from HHP to a set of KOL group chats.
 *
 * Design decisions (per Andy 2026-07-02):
 *   - Entry point is a multi-select on /kols, so the service takes the
 *     raw kol_ids array and resolves chat_ids server-side. This avoids
 *     the UI having to know how KOL→chat mapping works.
 *   - Message body is sent as PLAIN TEXT — no parse_mode [Andy 2026-07-30].
 *     It was Markdown, which cost 48 failed sends across three attempts:
 *     one underscore in "x.com/konnex_world" opened an italic span that
 *     never closed, and Telegram rejected the whole message with
 *     "can't parse entities". The same body also carried four `[` brackets
 *     (문단 headers like [프로젝트]), each a link-opener in Markdown and the
 *     next failure in line.
 *
 *     These messages are prose a human types in Korean — URLs, @handles
 *     and bracketed section headers occur naturally and none of them are
 *     meant as markup. Markdown bought formatting nobody used and charged
 *     for it in silent all-or-nothing failures. Telegram still auto-links
 *     bare URLs without a parse_mode, which was the only feature actually
 *     relied on.
 *   - {name} is substituted per KOL from master_kols.name. Any other
 *     brace token is left in-place (Telegram renders {foo} as-is).
 *   - Throttle: 1 send per 1.1s. Telegram bot limit is 30 msg/s global
 *     and 1 msg/s per chat; the fan-out is to distinct chats so the
 *     bottleneck is really the global limit, but the linear 1.1s pace
 *     is safe up to 100+ recipients without triggering rate-limit 429s.
 *   - Audit: one kol_announcements row + one kol_announcement_recipients
 *     row per KOL. Failure captures error_message for retry surfacing.
 */

export type SendAnnouncementInput = {
  bodyText: string;
  kolIds: string[];
  senderUserId: string | null;
};

export type SendAnnouncementResult = {
  announcementId: string;
  recipientCount: number;
  okCount: number;
  failedCount: number;
  failures: Array<{ kol_id: string; kol_name: string; error: string }>;
  skipped: Array<{ kol_id: string; kol_name: string; reason: string }>;
};

const SEND_INTERVAL_MS = 1100;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export class KolAnnouncementService {
  constructor(private supabase: SupabaseClient) {}

  async send(input: SendAnnouncementInput): Promise<SendAnnouncementResult> {
    const bodyText = input.bodyText.trim();
    if (!bodyText) throw new Error('Message body is required');
    if (!Array.isArray(input.kolIds) || input.kolIds.length === 0) {
      throw new Error('At least one recipient KOL is required');
    }
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN not configured');
    }

    // Resolve KOL→chat destination. telegram_chats.master_kol_id is the
    // canonical join (populated when the KOL joins their group chat with
    // the bot). Kols without a linked chat are skipped up-front and
    // reported in the return payload so the caller can surface them.
    const sb: any = this.supabase;
    const { data: kolRows, error: kolErr } = await sb
      .from('master_kols')
      .select('id, name')
      .in('id', input.kolIds);
    if (kolErr) throw kolErr;
    const kolNameById = new Map<string, string>();
    for (const k of (kolRows ?? []) as any[]) kolNameById.set(k.id, k.name || 'KOL');

    const { data: chatRows, error: chatErr } = await sb
      .from('telegram_chats')
      .select('master_kol_id, chat_id')
      .in('master_kol_id', input.kolIds);
    if (chatErr) throw chatErr;
    const chatIdByKol = new Map<string, string>();
    for (const c of (chatRows ?? []) as any[]) {
      if (c.master_kol_id && c.chat_id) chatIdByKol.set(c.master_kol_id, String(c.chat_id));
    }

    // Telegram handles, for {handle}.
    //
    // Derived from who actually speaks in each KOL's own linked chat, NOT from
    // master_kols.telegram_id: an audit on 2026-09-02 found 15 of those wrong
    // (ten carry @holo_hive_bot's id, two a team member's, nine hold a handle
    // typed into a numeric column). The chat is the reliable source — in a
    // "KOL <> Holo Hive" group the only non-team speaker is the KOL.
    //
    // Best-effort: any failure leaves the map empty and {handle} falls back to
    // the name. A personalisation token must never be able to stop a send.
    const handleByKol = new Map<string, string>();
    try {
      const { data: teamRows } = await sb.from('users').select('telegram_id').not('telegram_id', 'is', null);
      const notKol = new Set<string>([
        ...((teamRows ?? []) as any[]).map((r: any) => String(r.telegram_id)),
        '7996189688',   // @holo_hive_bot
        '7111416066',   // @jeremyin — team, but missing from users.telegram_id
      ]);
      const chatByKolId = new Map<string, string>();
      for (const [kolId, chatId] of chatIdByKol) chatByKolId.set(kolId, chatId);
      const chatIds = Array.from(chatByKolId.values());
      if (chatIds.length > 0) {
        const { data: msgs } = await sb
          .from('telegram_messages')
          .select('chat_id, from_user_id, from_username, message_date')
          .in('chat_id', chatIds)
          .not('from_username', 'is', null)
          .order('message_date', { ascending: false });
        const handleByChat = new Map<string, string>();
        for (const m of ((msgs ?? []) as any[])) {
          if (notKol.has(String(m.from_user_id))) continue;
          if (!handleByChat.has(String(m.chat_id))) handleByChat.set(String(m.chat_id), m.from_username);
        }
        for (const [kolId, chatId] of chatByKolId) {
          const h = handleByChat.get(chatId);
          if (h) handleByKol.set(kolId, h);
        }
      }
    } catch (err) {
      console.warn('[announcement] handle lookup failed; {handle} falls back to name', err);
    }

    // Look up sender name for the announcement audit row.
    let senderName: string | null = null;
    if (input.senderUserId) {
      const { data: u } = await sb
        .from('users')
        .select('name, email')
        .eq('id', input.senderUserId)
        .maybeSingle();
      senderName = (u as any)?.name || (u as any)?.email?.split('@')[0] || null;
    }

    const skipped: SendAnnouncementResult['skipped'] = [];
    const targets: Array<{ kolId: string; kolName: string; chatId: string }> = [];
    for (const kolId of input.kolIds) {
      const chatId = chatIdByKol.get(kolId);
      const kolName = kolNameById.get(kolId) || 'KOL';
      if (!chatId) {
        skipped.push({ kol_id: kolId, kol_name: kolName, reason: 'No linked group chat' });
        continue;
      }
      targets.push({ kolId, kolName, chatId });
    }

    // Create the announcement header row up-front so recipient rows can
    // FK it. Counts are stamped later after all sends complete.
    const { data: annRow, error: annErr } = await sb
      .from('kol_announcements')
      .insert({
        body_text: bodyText,
        sent_by_user_id: input.senderUserId,
        sender_name: senderName,
        recipient_count: targets.length,
      })
      .select('id')
      .single();
    if (annErr) throw annErr;
    const announcementId = (annRow as any).id as string;

    // Fan out with a linear throttle. Sequential is fine — 30 recipients
    // at 1.1s each = 33s, well within a Vercel function budget. If we
    // ever need >50 recipient blasts, split into a background job.
    const failures: SendAnnouncementResult['failures'] = [];
    let okCount = 0;
    let failedCount = 0;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const personalized = substituteTokens(bodyText, t.kolName, handleByKol.get(t.kolId) ?? null);
      const result = await sendPlainToChat(t.chatId, personalized);
      const sentAt = new Date().toISOString();
      await sb
        .from('kol_announcement_recipients')
        .insert({
          announcement_id: announcementId,
          kol_id: t.kolId,
          chat_id: t.chatId,
          sent_at: sentAt,
          ok: result.ok,
          error_message: result.ok ? null : result.error,
        });
      if (result.ok) {
        okCount++;
      } else {
        failedCount++;
        failures.push({ kol_id: t.kolId, kol_name: t.kolName, error: result.error ?? 'unknown' });
      }
      if (i < targets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, SEND_INTERVAL_MS));
      }
    }

    await sb
      .from('kol_announcements')
      .update({ ok_count: okCount, failed_count: failedCount })
      .eq('id', announcementId);

    return {
      announcementId,
      recipientCount: targets.length,
      okCount,
      failedCount,
      failures,
      skipped,
    };
  }
}

/** {name} → KOL name. Other {tokens} are left alone. */
function substituteTokens(
  text: string, kolName: string, handle: string | null,
): string {
  return collapseHandleToken(text)
    .replace(/\{name\}/gi, kolName)
    // No handle on record → the KOL's name, so the sentence still reads. An
    // empty substitution would send "hey , ..." to someone, which is worse
    // than being slightly less personal.
    .replace(/\{handle\}/gi, formatHandle(handle) ?? kolName);
}

/**
 * Send as plain text — deliberately NO parse_mode, so no character in the
 * body can be misread as markup. What the sender typed is what arrives.
 * Errors are still surfaced per-recipient (chat blocked, bot removed, etc.).
 */
async function sendPlainToChat(
  chatId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          // No parse_mode: bare URLs still auto-link, and nothing else is
          // interpreted. See the header note on the 48 failed sends.
          disable_web_page_preview: false,
        }),
      },
    );
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const description = (errBody as any)?.description || `HTTP ${response.status}`;
      return { ok: false, error: description.slice(0, 500) };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: (err?.message || 'network error').slice(0, 500) };
  }
}
