import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAppSetting } from '@/lib/appSettings';
import { formatDate } from '@/lib/dateFormat';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/backlog-weekly-summary
 *
 * Phase 5 of the HHP Backlog Tab spec (Jdot, 2026-06-08). Posts a
 * weekly digest of open backlog items to the tech support Telegram
 * channel so the team sees what's still outstanding without anyone
 * compiling it manually.
 *
 * Format mirrors Quazo's view from the UI:
 *   • Open items only (status != live)
 *   • Sorted oldest first within each group
 *   • Grouped by Type → Area
 *   • Total + link back to the saved view
 *
 * Vercel cron schedule: Monday 00:00 UTC (~Monday 9am KST). Once a
 * week aligns with how the team rolls weekly summaries everywhere
 * else.
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Config: the target chat ID is read from `app_settings` (key
 * `backlog_channel_id`) so an operator can change it from the
 * Backlog settings dialog without a Vercel redeploy. If unset, the
 * route still runs (and logs to agent_runs) but skips the Telegram
 * send and reports the skip in the response. The dialog also has a
 * "Send test message" button to confirm a chat ID before saving.
 *
 * Skips the post entirely (with a benign log line) when there are
 * zero open items — the team doesn't need a "nothing to do" ping
 * cluttering the channel.
 */
export async function GET(request: Request) {
  // Auth
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const start = Date.now();
  const startedAtIso = new Date().toISOString();

  try {
    // ─── 1. Pull open items ──────────────────────────────────────
    const { data: items, error: itemsErr } = await (supabase as any)
      .from('backlog_items')
      .select('id, type, area, title, status, created_at')
      .neq('status', 'live')
      .order('created_at', { ascending: true });
    if (itemsErr) throw itemsErr;

    const rows = (items || []) as Array<{
      id: string; type: 'bug' | 'request'; area: string;
      title: string; status: string; created_at: string;
    }>;

    // ─── 2. Group by Type → Area ─────────────────────────────────
    // Bugs before Requests (matches how Quazo wrote the summary in
    // chat — bugs are the urgent bucket). Within each, area-alpha.
    type Group = {
      type: 'bug' | 'request';
      area: string;
      items: typeof rows;
    };
    const groupMap = new Map<string, Group>();
    for (const r of rows) {
      const key = `${r.type}::${r.area}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { type: r.type, area: r.area, items: [] });
      }
      groupMap.get(key)!.items.push(r);
    }
    const AREA_LABELS: Record<string, string> = {
      content_dashboard: 'Content Dashboard',
      kol_mastersheet: 'KOL Mastersheet',
      budget_dashboard: 'Budget Dashboard',
      priority_dashboard: 'Priority Dashboard',
      kol_cards: 'KOL Cards',
      client_success: 'Client Success',
      other: 'Other',
    };
    const groups = Array.from(groupMap.values()).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'bug' ? -1 : 1;
      const al = AREA_LABELS[a.area] || a.area;
      const bl = AREA_LABELS[b.area] || b.area;
      return al.localeCompare(bl);
    });

    // ─── 3. Render the Telegram message (HTML) ────────────────────
    const appBase = process.env.NEXT_PUBLIC_APP_URL
      || process.env.NEXT_PUBLIC_APP_BASE_URL
      || 'https://app.holohive.io';
    const quazoUrl = `${appBase}/initiatives?tab=backlog&status=open&sort=age_asc&group=type_area`;
    const todayLabel = formatDate(new Date());

    let message: string;
    if (rows.length === 0) {
      message = '';
    } else {
      const lines: string[] = [];
      lines.push(`📋 <b>HHP Backlog — Weekly Digest</b>`);
      lines.push(`<i>Week of ${todayLabel}</i>`);
      lines.push('');

      // Per-type total counts up top so the digest reads like a
      // headline before the breakdown.
      const bugTotal = rows.filter(r => r.type === 'bug').length;
      const reqTotal = rows.filter(r => r.type === 'request').length;
      if (bugTotal > 0) lines.push(`🐛 <b>${bugTotal} open bug${bugTotal === 1 ? '' : 's'}</b>`);
      if (reqTotal > 0) lines.push(`✨ <b>${reqTotal} open request${reqTotal === 1 ? '' : 's'}</b>`);
      lines.push('');

      // Per-group breakdown. Cap at ~3 items per group so the message
      // stays under Telegram's 4096-char ceiling on big weeks; the
      // overflow link below still drives traffic to the saved view.
      const PER_GROUP_CAP = 3;
      let lastType: string | null = null;
      for (const g of groups) {
        if (g.type !== lastType) {
          lines.push(g.type === 'bug' ? '<b>🐛 Bugs</b>' : '<b>✨ Requests</b>');
          lastType = g.type;
        }
        const areaLabel = AREA_LABELS[g.area] || g.area;
        lines.push(`  <b>${escapeHtml(areaLabel)}</b> (${g.items.length})`);
        for (const it of g.items.slice(0, PER_GROUP_CAP)) {
          const ageDays = Math.floor((Date.now() - new Date(it.created_at).getTime()) / 86_400_000);
          lines.push(`    • ${escapeHtml(it.title)} <i>· ${ageDays}d</i>`);
        }
        if (g.items.length > PER_GROUP_CAP) {
          lines.push(`    <i>+${g.items.length - PER_GROUP_CAP} more</i>`);
        }
      }

      lines.push('');
      lines.push(`<a href="${quazoUrl}">View the full backlog in HHP</a>`);
      message = lines.join('\n');

      // Hard truncate at 3900 chars to stay well under Telegram's
      // 4096 limit. Append an "and X more" footer if we truncate.
      if (message.length > 3900) {
        message = message.slice(0, 3850) + `\n\n<i>(digest truncated — see the link)</i>`;
      }
    }

    // ─── 4. Send to Telegram (or skip cleanly) ───────────────────
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    // Channel ID is now configurable from HHP — Phase 6.5 refactor.
    // Falls back to the env var if the setting hasn't been moved over
    // yet, so this swap is non-breaking for existing deployments.
    const channelId = (await getAppSetting(supabase, 'backlog_channel_id'))
      || process.env.TELEGRAM_BACKLOG_CHANNEL_ID
      || null;
    // Optional forum-topic thread to post into. Set via the same
    // settings dialog when the operator picks a thread instead of
    // a bare chat.
    const threadIdStr = await getAppSetting(supabase, 'backlog_channel_thread_id');
    const threadId = threadIdStr ? parseInt(threadIdStr, 10) : null;
    let sent: boolean = false;
    let skipReason: string | null = null;

    if (rows.length === 0) {
      skipReason = 'no open items';
    } else if (!botToken) {
      skipReason = 'TELEGRAM_BOT_TOKEN missing';
    } else if (!channelId) {
      skipReason = 'no backlog channel configured (set in /initiatives?tab=backlog → Settings)';
    } else {
      try {
        const sendBody: Record<string, any> = {
          chat_id: channelId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        };
        if (threadId && !Number.isNaN(threadId)) {
          sendBody.message_thread_id = threadId;
        }
        const tgRes = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sendBody),
          },
        );
        if (tgRes.ok) {
          sent = true;
        } else {
          const errJson = await tgRes.json().catch(() => ({}));
          skipReason = `TG send failed: ${errJson?.description || tgRes.status}`;
          console.error('[backlog-weekly-summary] TG send failed:', errJson);
        }
      } catch (err) {
        skipReason = `TG send threw: ${(err as Error).message}`;
        console.error('[backlog-weekly-summary] TG send threw:', err);
      }
    }

    // ─── 5. Log to agent_runs for cron-health-check visibility ───
    // Same pattern other cron jobs use — gives the health-check
    // ammo to flag "ran 0 times yesterday." Insert is best-effort;
    // we don't want a logging failure to mask the actual cron result.
    try {
      await (supabase as any).from('agent_runs').insert({
        agent_name: 'BACKLOG_WEEKLY_SUMMARY',
        run_type: 'cron',
        started_at: startedAtIso,
        completed_at: new Date().toISOString(),
        status: sent ? 'success' : (skipReason ? 'success' : 'failed'),
        output_summary: sent
          ? `Posted weekly digest with ${rows.length} open items.`
          : (skipReason || 'unknown skip'),
      });
    } catch (logErr) {
      console.error('[backlog-weekly-summary] agent_runs log failed:', logErr);
    }

    return NextResponse.json({
      ok: true,
      openItems: rows.length,
      sent,
      skipReason,
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    console.error('[backlog-weekly-summary] error:', err);
    // Best-effort failure log so the health check sees it.
    try {
      await (supabase as any).from('agent_runs').insert({
        agent_name: 'BACKLOG_WEEKLY_SUMMARY',
        run_type: 'cron',
        started_at: startedAtIso,
        completed_at: new Date().toISOString(),
        status: 'failed',
        error_message: err?.message || String(err),
      });
    } catch {/* swallow */}
    return NextResponse.json(
      { ok: false, error: err?.message || 'summary failed' },
      { status: 500 },
    );
  }
}

/** Minimal HTML escaper. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
