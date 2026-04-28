/**
 * Intelligence-page alert dispatcher.
 *
 * Two event types fire alerts to the configured Telegram chat:
 *   - 'hot_tier'  — when Discovery scan inserts a new prospect tagged
 *                   REACH_OUT_NOW or PRE_TOKEN_PRIORITY
 *   - 'grok_hot'  — when a Deep Dive returns korea_interest_score >= 70
 *
 * Both are fire-and-forget from the caller's perspective: any failure
 * here logs to console and returns false; it never throws back into
 * the scan / deep-dive paths. Alerts are a side-channel — they should
 * never break the primary work.
 *
 * Configuration lives in the `notification_channels` table, row with
 * channel_key='intelligence_alerts'. Editable via the settings dialog
 * on the Intelligence page.
 */

import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';

export type IntelligenceAlertEvent = 'hot_tier' | 'grok_hot' | 'korea_listing' | 'cron_failed';

interface NotificationChannel {
  channel_key: string;
  telegram_chat_id: string | null;
  is_enabled: boolean;
  templates: Record<string, string>;
}

/** Variables available to BOTH templates. The ones unique to each event
 *  are typed in the per-event payload below. Keeping this loose (record)
 *  so user-customized templates can reference any field without us
 *  needing to update typescript every time. */
export type TemplateVars = Record<string, string | number | null | undefined>;

interface HotTierPayload {
  project_name: string;
  tier: string;                  // e.g. REACH_OUT_NOW
  score: number;                 // 0-100
  prospect_id: string;           // uuid
  funding_round?: string | null;
  funding_amount_usd?: number | null;
}

interface GrokHotPayload {
  project_name: string;
  prospect_id: string;
  poc_handle: string;
  poc_name?: string | null;
  korea_score: number;           // 0-100
  signal_count: number;
}

interface KoreaListingPayload {
  project_name: string;
  prospect_id: string;
  exchange: string;              // 'upbit' | 'bithumb'
  market_pair: string;           // e.g. KRW-PHAR
  symbol: string;                // e.g. PHAR
}

interface CronFailedPayload {
  run_type: string;              // human-friendly, e.g. 'Auto Discovery scan'
  error_message: string;         // raw error from the cron
  triggered_at?: string;         // ISO timestamp; defaults to now if omitted
}

const CHANNEL_KEY = 'intelligence_alerts';

/** Resolve the production base URL once, used in {prospect_url} substitution.
 *  In dev this falls back to localhost so local fires render usable links. */
function getBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) {
    return explicit.startsWith('http') ? explicit : `https://${explicit}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

/** HTML-escape a value for safe substitution into a parse_mode='HTML' Telegram
 *  message. Telegram rejects messages with malformed HTML (returns 400), so
 *  any user-data substitution that happens to contain `&`, `<`, or `>` would
 *  silently fail without this. We escape only the substituted *value*, never
 *  the template — template authors put intentional `<b>`, `<a href>` etc. in
 *  the template body. */
function escapeHtmlValue(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Render a template by replacing {var} placeholders with values from `vars`.
 *  Missing vars render as empty string so a partial payload doesn't blow up
 *  the message. Substituted values are HTML-escaped (template HTML is not),
 *  so a project name like "AT&T" or an error message containing `<` won't
 *  break the Telegram send. Curly-brace vars only — no nested objects, no
 *  helpers. */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    if (v === undefined || v === null) return '';
    return escapeHtmlValue(String(v));
  });
}

/** Pretty-format a USD raise amount for messages: $1.5M, $20M, $250K, etc. */
function formatMoney(n: number | null | undefined): string {
  if (n == null) return '';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/** Load the alert channel config. Returns null on any failure (treat as
 *  "not configured / not enabled"). */
async function getChannel(): Promise<NotificationChannel | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return null;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await (supabase as any)
    .from('notification_channels')
    .select('channel_key, telegram_chat_id, is_enabled, templates')
    .eq('channel_key', CHANNEL_KEY)
    .single();

  if (error) {
    console.error('[IntelligenceAlerts] getChannel error:', error.message);
    return null;
  }
  return data as NotificationChannel;
}

/** Fire a single alert. Returns true if a message was sent. Returns false
 *  if alerts are disabled, no chat is configured, the template is missing,
 *  or the Telegram send fails. Never throws. */
export async function fireIntelligenceAlert(
  event: IntelligenceAlertEvent,
  payload: HotTierPayload | GrokHotPayload | KoreaListingPayload | CronFailedPayload,
): Promise<boolean> {
  try {
    const channel = await getChannel();
    if (!channel) return false;
    if (!channel.is_enabled) return false;
    if (!channel.telegram_chat_id) return false;

    const template = channel.templates?.[event];
    if (!template || typeof template !== 'string') {
      console.warn('[IntelligenceAlerts] no template for event:', event);
      return false;
    }

    const baseUrl = getBaseUrl();
    // prospect_url is only meaningful when the payload has a prospect_id.
    // cron_failed alerts use intelligence_url (the page itself) instead.
    const prospectUrl = (payload as any).prospect_id
      ? `${baseUrl}/intelligence/discovery/${(payload as any).prospect_id}`
      : '';
    const intelligenceUrl = `${baseUrl}/intelligence`;

    let vars: TemplateVars;
    if (event === 'hot_tier') {
      const p = payload as HotTierPayload;
      const moneyStr = formatMoney(p.funding_amount_usd);
      const fundingPieces: string[] = [];
      if (p.funding_round) fundingPieces.push(p.funding_round);
      if (moneyStr) fundingPieces.push(moneyStr);
      vars = {
        project_name: p.project_name,
        tier: p.tier.replace(/_/g, ' '),
        score: p.score,
        funding_round: p.funding_round ?? '',
        funding_amount: moneyStr,
        // funding_line is a convenience: " · $20M Series A" or "" depending
        // on what data we have. Keeps the default template clean.
        funding_line: fundingPieces.length > 0 ? ` · ${fundingPieces.join(' ')}` : '',
        prospect_url: prospectUrl,
      };
    } else if (event === 'grok_hot') {
      const g = payload as GrokHotPayload;
      vars = {
        project_name: g.project_name,
        poc_handle: g.poc_handle,
        poc_name: g.poc_name ?? '',
        korea_score: g.korea_score,
        signal_count: g.signal_count,
        signal_plural: g.signal_count === 1 ? '' : 's',
        prospect_url: prospectUrl,
      };
    } else if (event === 'korea_listing') {
      const k = payload as KoreaListingPayload;
      const exchangeLabel = k.exchange === 'upbit' ? 'Upbit' : k.exchange === 'bithumb' ? 'Bithumb' : k.exchange;
      vars = {
        project_name: k.project_name,
        exchange: exchangeLabel,
        exchange_raw: k.exchange,
        market_pair: k.market_pair,
        symbol: k.symbol,
        prospect_url: prospectUrl,
      };
    } else {
      // event === 'cron_failed' — operational alert when a scheduled
      // background job fails. No prospect involved, so we link to the
      // Intelligence page itself where the user can open the relevant
      // settings dialog and inspect last_run_summary.
      const c = payload as CronFailedPayload;
      const ts = c.triggered_at || new Date().toISOString();
      vars = {
        run_type: c.run_type,
        error_message: c.error_message,
        // Pretty timestamp for the message body. Fallback to raw ISO if
        // anything goes wrong with locale formatting.
        triggered_at: (() => {
          try { return new Date(ts).toLocaleString(); } catch { return ts; }
        })(),
        triggered_at_iso: ts,
        intelligence_url: intelligenceUrl,
      };
    }

    let text = renderTemplate(template, vars);
    // Telegram caps a single message at 4096 chars and rejects oversized
    // sends with a 400. Our default templates run ~250-400 chars, so this
    // only kicks in for pathological payloads (huge error_message strings,
    // very long project names, etc.). Truncate before dispatch so an alert
    // surfaces at all rather than silently failing.
    if (text.length > 4000) {
      text = text.slice(0, 3990) + '\n…[truncated]';
    }
    const ok = await TelegramService.sendToChat(channel.telegram_chat_id, text, 'HTML');
    if (!ok) {
      console.error('[IntelligenceAlerts] sendToChat returned false', { event, chatId: channel.telegram_chat_id });
    }
    return ok;
  } catch (err: any) {
    console.error('[IntelligenceAlerts] fire failed:', err?.message ?? err);
    return false;
  }
}
