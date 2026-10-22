import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { escapeHtml } from '@/lib/telegramHtml';
import { getDigestDestination } from '@/lib/dailyPulse';
import { loadAttention, loadMomentumAlerts, type AttentionItem } from '@/lib/attention';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/attention-digest
 *
 * Weekday morning post of the Needs Attention list (/attention) to the ops
 * chat: urgent items, then this week's, each with the client and a link to
 * where it gets fixed. Nothing on a quiet day.
 *
 * OFF until app_settings.attention_digest_enabled = 'true' [Andy's call —
 * it is an outward send]. Until then every run builds the message and logs
 * it to agent_runs as a preview, so the format can be checked before the
 * first real post. Destination: attention_digest_chat_id / _thread_id if
 * set, else the Daily Pulse digest chat (HH Ops – terminal).
 *
 * Auth: Bearer ${CRON_SECRET}.
 */

const APP = 'https://app.holohive.io';
const MAX_PER_SECTION = 8;

async function setting(sb: any, key: string): Promise<string | null> {
  const { data } = await sb.from('app_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

function line(it: AttentionItem): string {
  return `• <b>${escapeHtml(it.clientName)}</b> — ${escapeHtml(it.title)} <a href="${APP}${it.href}">↗</a>`;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if ((request.headers.get('authorization') || '') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any;
  const runStart = Date.now();
  const log = async (status: 'success' | 'failed', summary: string) => {
    try {
      await sb.from('agent_runs').insert({
        agent_name: 'ATTENTION_DIGEST', run_type: 'cron',
        started_at: new Date(runStart).toISOString(), completed_at: new Date().toISOString(),
        status, output_summary: summary, error_message: status === 'failed' ? summary : null,
      });
    } catch { /* never fail the cron on its own log */ }
  };

  try {
    const [items, momentum, enabledRaw, chatOverride, threadOverride, pulseDest] = await Promise.all([
      loadAttention(sb), loadMomentumAlerts(sb).catch(() => [] as AttentionItem[]),
      setting(sb, 'attention_digest_enabled'), setting(sb, 'attention_digest_chat_id'), setting(sb, 'attention_digest_thread_id'),
      getDigestDestination(sb),
    ]);
    const all = [...items, ...momentum];
    const urgent = all.filter((i) => i.severity === 'urgent');
    const soon = all.filter((i) => i.severity === 'soon');
    const enabled = enabledRaw === 'true';
    const chatId = chatOverride || pulseDest.chatId;
    const threadId = threadOverride ? parseInt(threadOverride, 10) : pulseDest.threadId;

    if (!urgent.length && !soon.length) {
      await log('success', `quiet day — nothing urgent or due this week${enabled ? '' : ' (digest disabled)'}.`);
      return NextResponse.json({ posted: false, reason: 'nothing to report' });
    }

    const lines: string[] = [`⚠️ <b>Needs attention</b> — ${urgent.length} urgent · ${soon.length} this week`];
    if (urgent.length) {
      lines.push('', '🔴 <b>Urgent</b>', ...urgent.slice(0, MAX_PER_SECTION).map(line));
      if (urgent.length > MAX_PER_SECTION) lines.push(`  …and ${urgent.length - MAX_PER_SECTION} more`);
    }
    if (soon.length) {
      lines.push('', '🟠 <b>This week</b>', ...soon.slice(0, MAX_PER_SECTION).map(line));
      if (soon.length > MAX_PER_SECTION) lines.push(`  …and ${soon.length - MAX_PER_SECTION} more`);
    }
    lines.push('', `<a href="${APP}/attention">Open the full list</a>`);
    const message = lines.join('\n');

    if (!enabled) {
      await log('success', `PREVIEW (disabled): ${urgent.length} urgent, ${soon.length} this week.\n\n${message}`);
      return NextResponse.json({ posted: false, reason: 'attention_digest_enabled is not true', preview: message });
    }
    if (!chatId) {
      await log('failed', 'enabled but no destination: set attention_digest_chat_id or the Daily Pulse digest chat.');
      return NextResponse.json({ posted: false, reason: 'no destination' }, { status: 500 });
    }
    let posted = false; let sendError: string | null = null;
    try { posted = await TelegramService.sendToChat(chatId, message, 'HTML', threadId ?? undefined); }
    catch (e: any) { sendError = e?.message ?? 'send threw'; }
    await log(posted ? 'success' : 'failed', posted
      ? `${urgent.length} urgent, ${soon.length} this week — posted to ${chatId}${threadId ? `/${threadId}` : ''}.`
      : `${urgent.length} urgent, ${soon.length} this week — Telegram post FAILED${sendError ? `: ${sendError}` : ''}.`);
    return NextResponse.json({ posted, counts: { urgent: urgent.length, soon: soon.length } });
  } catch (err: any) {
    await log('failed', err?.message ?? 'attention-digest crashed');
    return NextResponse.json({ error: 'attention-digest failed', detail: err?.message }, { status: 500 });
  }
}
