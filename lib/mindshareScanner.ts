/**
 * Korean mindshare scanner.
 *
 * Walks new rows in telegram_messages, matches each against every
 * active project's keywords (case-insensitive substring), and writes
 * resulting hits to tg_mentions + upserts daily rollups into
 * mindshare_daily.
 *
 * Idempotent — safe to call repeatedly. Watermark in
 * mindshare_scan_state.last_scanned_message_date guarantees we only
 * process each message once.
 *
 * Channel scope: only messages from monitored channels with
 * language='ko' are counted. The leaderboard is Korea-specific.
 *
 * Performance: O(messages * projects * keywords). 294 existing rows ×
 * (eventually) 50 projects × 5 avg keywords = ~73k checks per scan,
 * which is fine. If/when message volume scales 10x, we'd switch to
 * Postgres full-text search instead of in-memory matching.
 */
import { SupabaseClient } from '@supabase/supabase-js';

interface MindshareProject {
  id: string;
  name: string;
  client_id: string | null;
  tracked_keywords: string[];
}

interface TelegramMessage {
  id: string;
  chat_id: string;
  text: string | null;
  message_date: string;
}

interface ScanResult {
  messages_scanned: number;
  mentions_added: number;
  daily_rows_upserted: number;
  watermark_advanced_to: string | null;
  duration_ms: number;
}

/**
 * Run one incremental scan. Backfill = true ignores the watermark and
 * re-scans every message (used by the "rebuild" admin action).
 */
export async function runMindshareScan(
  supabase: SupabaseClient,
  opts: { backfill?: boolean } = {},
): Promise<ScanResult> {
  const start = Date.now();

  // 1. Load active projects + their keywords. Drop projects with empty
  //    keyword lists — nothing to match.
  const { data: projectRows } = await (supabase as any)
    .from('mindshare_projects')
    .select('id, name, client_id, tracked_keywords')
    .eq('is_active', true);
  const projects: MindshareProject[] = ((projectRows || []) as any[])
    .map(p => ({
      ...p,
      tracked_keywords: Array.isArray(p.tracked_keywords) ? p.tracked_keywords : [],
    }))
    .filter(p => p.tracked_keywords.length > 0);

  if (projects.length === 0) {
    return { messages_scanned: 0, mentions_added: 0, daily_rows_upserted: 0, watermark_advanced_to: null, duration_ms: Date.now() - start };
  }

  // 2. Load Korean monitored channels. Only messages from these count
  //    toward Korean mindshare. Channel rows are matched against the
  //    telegram_chats table by chat_id later.
  const { data: koreanChannelRows } = await (supabase as any)
    .from('tg_monitored_channels')
    .select('channel_tg_id')
    .eq('language', 'ko')
    .eq('is_active', true);
  const koreanChannelIds = new Set<string>(
    ((koreanChannelRows || []) as any[]).map(r => r.channel_tg_id).filter(Boolean),
  );

  // 3. Load watermark.
  const { data: stateRow } = await (supabase as any)
    .from('mindshare_scan_state')
    .select('last_scanned_message_date')
    .eq('id', 1)
    .single();
  const watermark: string | null = opts.backfill ? null : (stateRow?.last_scanned_message_date ?? null);

  // 4. Pull messages newer than the watermark. Cap at 5000 per run to
  //    keep Vercel function under timeout. If we have a backlog it'll
  //    drain over multiple runs.
  let msgQuery = (supabase as any)
    .from('telegram_messages')
    .select('id, chat_id, text, message_date')
    .order('message_date', { ascending: true })
    .limit(5000);
  if (watermark) {
    msgQuery = msgQuery.gt('message_date', watermark);
  }
  const { data: messageRows } = await msgQuery;
  const messages: TelegramMessage[] = (messageRows || []) as TelegramMessage[];

  if (messages.length === 0) {
    await (supabase as any)
      .from('mindshare_scan_state')
      .update({
        last_run_at: new Date().toISOString(),
        last_run_mentions_added: 0,
        last_run_duration_ms: Date.now() - start,
      })
      .eq('id', 1);
    return { messages_scanned: 0, mentions_added: 0, daily_rows_upserted: 0, watermark_advanced_to: null, duration_ms: Date.now() - start };
  }

  // 5. Pre-compile lowercase keywords per project for fast matching.
  //    Each project becomes (id, name, client_id, lowerKeywords[]).
  const compiledProjects = projects.map(p => ({
    id: p.id,
    name: p.name,
    client_id: p.client_id,
    lowerKeywords: p.tracked_keywords
      .map(k => (typeof k === 'string' ? k.toLowerCase().trim() : ''))
      .filter(Boolean),
  }));

  // 6. Walk messages. For each: skip if not from a Korean channel, then
  //    try to match each project's keywords. A single message can match
  //    multiple projects (one row per project per message).
  type Hit = {
    project_id: string;
    client_id: string | null;
    message_id: string;
    chat_id: string;
    message_text: string;
    message_date: string;
    matched_keyword: string;
  };
  const hits: Hit[] = [];

  for (const m of messages) {
    if (!m.text) continue;
    // If we have configured Korean channels, restrict to them. Otherwise
    // (no channels classified yet) count everything — better to surface
    // SOMETHING than nothing for v1.
    if (koreanChannelIds.size > 0 && !koreanChannelIds.has(m.chat_id)) continue;

    const lowered = m.text.toLowerCase();
    for (const p of compiledProjects) {
      // First matching keyword wins (don't double-count one message
      // for one project even if multiple of its keywords appear).
      const matched = p.lowerKeywords.find(kw => lowered.includes(kw));
      if (!matched) continue;
      hits.push({
        project_id: p.id,
        client_id: p.client_id,
        message_id: m.id,
        chat_id: m.chat_id,
        message_text: m.text,
        message_date: m.message_date,
        matched_keyword: matched,
      });
    }
  }

  // 7. Insert hits into tg_mentions. channel_id (FK → tg_monitored_channels.id)
  //    is set when we can match telegram_messages.chat_id against
  //    tg_monitored_channels.channel_tg_id; falls back to NULL otherwise
  //    (column is nullable). channel_reach metric will undercount until
  //    the channel_tg_id values are populated, but mention_count stays
  //    accurate either way.
  let mentionsAdded = 0;
  if (hits.length > 0) {
    const distinctChatIds = Array.from(new Set(hits.map(h => h.chat_id)));
    const { data: monitoredRows } = await (supabase as any)
      .from('tg_monitored_channels')
      .select('id, channel_tg_id')
      .in('channel_tg_id', distinctChatIds);
    const chatIdToMonitoredUuid = new Map<string, string>(
      ((monitoredRows || []) as any[])
        .filter(r => r.channel_tg_id)
        .map(r => [r.channel_tg_id, r.id]),
    );

    const insertable = hits.map(h => ({
      project_id: h.project_id,
      client_id: h.client_id,
      // null when chat isn't linked to a monitored channel record yet
      channel_id: chatIdToMonitoredUuid.get(h.chat_id) ?? null,
      message_text: h.message_text,
      message_date: h.message_date,
      matched_keyword: h.matched_keyword,
    }));

    if (insertable.length > 0) {
      // Insert in chunks to avoid Postgres parameter limits.
      const CHUNK = 500;
      for (let i = 0; i < insertable.length; i += CHUNK) {
        const slice = insertable.slice(i, i + CHUNK);
        const { error } = await (supabase as any).from('tg_mentions').insert(slice);
        if (!error) mentionsAdded += slice.length;
        else console.error('[mindshare] tg_mentions insert error:', error);
      }
    }
  }

  // 8. Recompute mindshare_daily for the date range we just touched.
  //    Simpler than incremental upserts: delete + reinsert for affected
  //    days. The number of unique days per scan is tiny (≤90).
  const touchedDays = new Set<string>();
  for (const h of hits) touchedDays.add(h.message_date.slice(0, 10));

  let dailyRowsUpserted = 0;
  if (touchedDays.size > 0) {
    const dayList = Array.from(touchedDays);
    // Recount from tg_mentions for each touched day, all projects.
    const { data: rollupRows } = await (supabase as any)
      .from('tg_mentions')
      .select('project_id, message_date, channel_id')
      .gte('message_date', dayList[0] + 'T00:00:00')
      .lte('message_date', dayList[dayList.length - 1] + 'T23:59:59')
      .not('project_id', 'is', null);

    type DayKey = string;
    const counts = new Map<DayKey, { mentions: number; channels: Set<string> }>();
    for (const r of (rollupRows || []) as any[]) {
      const day = (r.message_date as string).slice(0, 10);
      const key = `${r.project_id}::${day}`;
      let bucket = counts.get(key);
      if (!bucket) {
        bucket = { mentions: 0, channels: new Set() };
        counts.set(key, bucket);
      }
      bucket.mentions++;
      // Only count non-null channel_ids — until tg_monitored_channels has
      // channel_tg_id populated for the chats the bot is in, channel_id
      // will mostly be NULL and channel_reach will be 0. mention_count
      // is the primary metric and stays correct.
      if (r.channel_id) bucket.channels.add(r.channel_id);
    }

    const dailyRows = Array.from(counts.entries()).map(([key, val]) => {
      const [project_id, day] = key.split('::');
      return { project_id, day, mention_count: val.mentions, channel_reach: val.channels.size };
    });

    if (dailyRows.length > 0) {
      const { error } = await (supabase as any)
        .from('mindshare_daily')
        .upsert(dailyRows, { onConflict: 'project_id,day' });
      if (error) console.error('[mindshare] mindshare_daily upsert error:', error);
      else dailyRowsUpserted = dailyRows.length;
    }
  }

  // 9. Advance watermark to the latest message we processed.
  const newWatermark = messages[messages.length - 1].message_date;
  await (supabase as any)
    .from('mindshare_scan_state')
    .update({
      last_scanned_message_date: newWatermark,
      last_run_at: new Date().toISOString(),
      last_run_mentions_added: mentionsAdded,
      last_run_duration_ms: Date.now() - start,
    })
    .eq('id', 1);

  return {
    messages_scanned: messages.length,
    mentions_added: mentionsAdded,
    daily_rows_upserted: dailyRowsUpserted,
    watermark_advanced_to: newWatermark,
    duration_ms: Date.now() - start,
  };
}
