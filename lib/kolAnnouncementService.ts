import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * KOL announcements — bulk send from HHP to a set of KOL group chats.
 *
 * Design decisions (per Andy 2026-07-02):
 *   - Entry point is a multi-select on /kols, so the service takes the
 *     raw kol_ids array and resolves chat_ids server-side. This avoids
 *     the UI having to know how KOL→chat mapping works.
 *   - Message body is Markdown per Andy's pick: auto-linkified URLs +
 *     standard bold / italic markers + [link](url). We send with
 *     parse_mode Markdown so failures on stray asterisk or underscore
 *     characters are caught server-side and reported per-recipient.
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
      const personalized = substituteName(bodyText, t.kolName);
      const result = await sendMarkdownToChat(t.chatId, personalized);
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
function substituteName(text: string, kolName: string): string {
  return text.replace(/\{name\}/gi, kolName);
}

/**
 * Send with parse_mode=Markdown, returning both the outcome and the
 * server-side error text on failure. Telegram's Markdown mode returns
 * 400s on unescaped * or _ characters so surfacing the error string
 * makes the failure recoverable by the sender.
 */
async function sendMarkdownToChat(
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
          parse_mode: 'Markdown',
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
