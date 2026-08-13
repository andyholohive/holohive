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
  /** Ingestion time — what the scan watermark advances on. */
  pulled_at: string;
}

interface ScanResult {
  messages_scanned: number;
  /** Of those scanned, how many came from a channel we actually count.
   *  scanned > 0 with eligible == 0 is the signature of the 2026-08-08
   *  channel-id mismatch: posts arriving, none of them joinable. Surfaced so
   *  a health check can catch that shape instead of reporting a green
   *  "scanned 1000, added 0". */
  messages_eligible: number;
  mentions_added: number;
  daily_rows_upserted: number;
  watermark_advanced_to: string | null;
  duration_ms: number;
}

/**
 * Run one incremental scan. Backfill = true ignores the watermark and
 * re-scans every message (used by the "rebuild" admin action).
 */
/**
 * Telegram exposes the same channel under two id conventions and both are in
 * our data:
 *
 *   tg_channel_posts.channel_tg_id      "1127796099"      (Telethon peer id)
 *   tg_monitored_channels.channel_tg_id "-1001127796099"  (Bot API id)
 *
 * The scraper writes the first, the monitored-channel registry stores the
 * second. Comparing them raw matched only 7 of 64 posting channels, so 98% of
 * the corpus was silently dropped before keyword matching — 3,438 posts in a
 * week reduced to 74, and mindshare sat at ~17 mentions across 82 projects.
 * [2026-08-08]
 *
 * Canonical form is the bare digits. Normalise on read rather than rewriting
 * either table: both producers keep working in their native convention, and a
 * future writer using either one still joins.
 */
export function normalizeChannelId(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // -1001127796099 -> 1127796099 ; -1127796099 -> 1127796099
  return s.replace(/^-100/, '').replace(/^-/, '') || null;
}

/**
 * Does `haystack` contain `needle` as a word, rather than as a fragment
 * buried inside a longer one?
 *
 * [2026-08-13] Matching used to be a bare `includes`, which counted
 * "Ven*tria*l striatum", "As*tria*" and "*tria*l" as mentions of Tria.
 * Measured across every ASCII-keyword mention: 1,689 of 4,248 (40%)
 * matched only as a substring. Every project's number was inflated, and
 * these are numbers that end up in front of clients.
 *
 * Korean needs a different rule, not the same one. Hangul attaches
 * particles directly to nouns (하이퍼리퀴드는, 하이퍼리퀴드가), so a
 * trailing-boundary test rejects genuine mentions — which is why this
 * started out as plain substring matching for Hangul.
 *
 * [2026-08-14] Substring was too loose in the other direction: short
 * transliterations landed inside ordinary words. 뮤 (MEW) matched
 * 커*뮤*니티 — "community" — 678 times in 30 days against 18 real
 * mentions, which put a meme coin at #3 on the leaderboard. 세이 (Sei)
 * matched 오디*세이*, "Odyssey", every single time. Across all short
 * Hangul keywords that was 1,233 of 6,041 mentions, 20% of the month.
 *
 * The asymmetry is the fix: Korean particles are suffixes, never
 * prefixes. So a Hangul keyword must not be *preceded* by Hangul, while
 * anything may follow it. 커|뮤 is rejected, 하이퍼리퀴드|는 survives, and
 * 이더리움 still counts for 이더 because the keyword starts the word.
 */
const HANGUL = /[가-힣]/;

export function matchesKeyword(loweredText: string, keyword: string): boolean {
  const latin = /[a-z0-9]/i.test(keyword);
  let from = 0;
  for (;;) {
    const i = loweredText.indexOf(keyword, from);
    if (i === -1) return false;
    const before = i === 0 ? '' : loweredText[i - 1];
    if (latin) {
      const after = loweredText[i + keyword.length] ?? '';
      // A neighbouring letter or digit means we landed mid-word. Anything
      // else — space, punctuation, $, emoji, Hangul — is a real boundary.
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    } else if (!HANGUL.test(before)) {
      // Leading boundary only — see above.
      return true;
    }
    from = i + 1;
  }
}

/**
 * Is this keyword short enough that it will match ordinary language?
 *
 * One or two Hangul syllables is where the false-positive problem lives
 * even with the boundary rule above: 온도 (Ondo) is the everyday word for
 * "temperature" and stands alone as its own word, so no boundary test can
 * separate it from a real mention. Surfaced at save time rather than
 * silently dropped, because a few are legitimate — 이더 genuinely opens
 * 이더리움.
 */
export function isRiskyKeyword(keyword: string): boolean {
  const k = keyword.trim();
  if (!k) return false;
  if (/[a-z0-9]/i.test(k)) return false;
  return HANGUL.test(k) && [...k].length <= 2;
}

export async function runMindshareScan(
  supabase: SupabaseClient,
  opts: {
    backfill?: boolean;
    /** Scope the run to these projects only, ignoring the global watermark and
     *  leaving it untouched. This is how a newly-created project gets its
     *  history: the shared cursor has long since passed every old post, and
     *  moving it backwards would make every other project re-scan the whole
     *  corpus. Pair with `pulledAfter` to page. */
    projectIds?: string[];
    /** Explicit cursor for a scoped run — pass back the previous call's
     *  `watermark_advanced_to` to fetch the next page. */
    pulledAfter?: string | null;
  } = {},
): Promise<ScanResult> {
  const scoped = Array.isArray(opts.projectIds) && opts.projectIds.length > 0;
  const start = Date.now();

  // 1. Load active projects + their keywords. Drop projects with empty
  //    keyword lists — nothing to match.
  let projectQuery = (supabase as any)
    .from('mindshare_projects')
    .select('id, name, client_id, tracked_keywords')
    .eq('is_active', true);
  if (scoped) projectQuery = projectQuery.in('id', opts.projectIds as string[]);
  const { data: projectRows } = await projectQuery;
  const projects: MindshareProject[] = ((projectRows || []) as any[])
    .map(p => ({
      ...p,
      tracked_keywords: Array.isArray(p.tracked_keywords) ? p.tracked_keywords : [],
    }))
    .filter(p => p.tracked_keywords.length > 0);

  if (projects.length === 0) {
    return { messages_scanned: 0, messages_eligible: 0, mentions_added: 0, daily_rows_upserted: 0, watermark_advanced_to: null, duration_ms: Date.now() - start };
  }

  // 2. Load Korean monitored channels. Only messages from these count
  //    toward Korean mindshare.
  const { data: koreanChannelRows } = await (supabase as any)
    .from('tg_monitored_channels')
    .select('channel_tg_id')
    .eq('language', 'ko')
    .eq('is_active', true);
  const koreanChannelIds = new Set<string>(
    ((koreanChannelRows || []) as any[])
      .map(r => normalizeChannelId(r.channel_tg_id))
      .filter(Boolean) as string[],
  );

  // 3. Load watermark.
  const { data: stateRow } = await (supabase as any)
    .from('mindshare_scan_state')
    .select('last_scanned_message_date')
    .eq('id', 1)
    .single();
  const watermark: string | null = scoped
    ? (opts.pulledAfter ?? null)
    : opts.backfill
      ? null
      : (stateRow?.last_scanned_message_date ?? null);

  // 4. Pull messages newer than the watermark. Cap at 5000 per run to
  //    keep Vercel function under timeout. If we have a backlog it'll
  //    drain over multiple runs.
  // [2026-07-27] Reads tg_channel_posts, not telegram_messages — the crawler
  // now writes there so mindshare, coverage and KOL scoring share one raw
  // store. Columns are aliased back to the old names so everything downstream
  // (hit matching, dedupe, daily rollup, the watermark) is untouched.
  //
  // subject_type IS NULL restricts this to raw channel pulls. Coverage rows in
  // the same table carry a subject and a query — they were pulled to answer
  // "who covered Robinhood", and counting them as organic mindshare would
  // inflate a project's mention count with our own prospect research.
  // The watermark tracks pulled_at (ingestion time), not posted_at. It used
  // to track posted_at, which quietly dropped any post that arrived out of
  // chronological order — exactly what a historical backfill produces, since
  // those rows land today carrying last month's timestamps and so sort behind
  // a watermark that has already moved past them. pulled_at is monotonic with
  // arrival, so "everything ingested since I last ran" is the honest question.
  let msgQuery = (supabase as any)
    .from('tg_channel_posts')
    .select('id, chat_id:channel_tg_id, text, message_date:posted_at, pulled_at')
    .is('subject_type', null)
    .order('pulled_at', { ascending: true })
    .limit(5000);
  if (watermark) {
    msgQuery = msgQuery.gt('pulled_at', watermark);
  }
  const { data: messageRows } = await msgQuery;
  const messages: TelegramMessage[] = (messageRows || []) as TelegramMessage[];

  if (messages.length === 0) {
    if (!scoped) await (supabase as any)
      .from('mindshare_scan_state')
      .update({
        last_run_at: new Date().toISOString(),
        last_run_mentions_added: 0,
        last_run_duration_ms: Date.now() - start,
      })
      .eq('id', 1);
    return { messages_scanned: 0, messages_eligible: 0, mentions_added: 0, daily_rows_upserted: 0, watermark_advanced_to: null, duration_ms: Date.now() - start };
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

  let eligible = 0;
  for (const m of messages) {
    if (!m.text) continue;
    // If we have configured Korean channels, restrict to them. Otherwise
    // (no channels classified yet) count everything — better to surface
    // SOMETHING than nothing for v1.
    const normChatId = normalizeChannelId(m.chat_id);
    if (koreanChannelIds.size > 0 && (!normChatId || !koreanChannelIds.has(normChatId))) continue;
    eligible += 1;

    const lowered = m.text.toLowerCase();
    for (const p of compiledProjects) {
      // First matching keyword wins (don't double-count one message
      // for one project even if multiple of its keywords appear).
      const matched = p.lowerKeywords.find(kw => matchesKeyword(lowered, kw));
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
    // Query with BOTH conventions: the posts carry bare ids, the registry
    // stores the -100 form, and an .in() on one shape finds none of the other.
    const distinctChatIds = Array.from(new Set(hits.map(h => h.chat_id)));
    const lookupIds = Array.from(new Set(
      distinctChatIds.flatMap(id => {
        const bare = normalizeChannelId(id);
        return bare ? [id, bare, `-100${bare}`] : [id];
      }),
    ));
    const { data: monitoredRows } = await (supabase as any)
      .from('tg_monitored_channels')
      .select('id, channel_tg_id')
      .in('channel_tg_id', lookupIds);
    // Same two-convention problem as the eligibility check above — key the
    // lookup on the normalised id so channel_reach isn't undercounted.
    const chatIdToMonitoredUuid = new Map<string, string>(
      ((monitoredRows || []) as any[])
        .map(r => [normalizeChannelId(r.channel_tg_id), r.id] as [string | null, string])
        .filter((e): e is [string, string] => e[0] !== null),
    );

    const insertable = hits.map(h => ({
      project_id: h.project_id,
      client_id: h.client_id,
      // null when chat isn't linked to a monitored channel record yet
      channel_id: chatIdToMonitoredUuid.get(normalizeChannelId(h.chat_id) ?? '') ?? null,
      message_text: h.message_text,
      message_date: h.message_date,
      matched_keyword: h.matched_keyword,
    }));

    // Dedup against rows that already exist in the touched window so a
    // backfill (or any re-run that re-processes the same messages)
    // doesn't double-count. The unique index on
    // (project_id, message_date, md5(message_text)) backs this up at
    // the DB level — the in-memory pre-filter just keeps the chunked
    // insert from failing on a single dupe.
    if (insertable.length > 0) {
      const minDate = insertable.reduce((m, h) => h.message_date < m ? h.message_date : m, insertable[0].message_date);
      const maxDate = insertable.reduce((m, h) => h.message_date > m ? h.message_date : m, insertable[0].message_date);
      const projectIds = Array.from(new Set(insertable.map(h => h.project_id)));
      const { data: existingRows } = await (supabase as any)
        .from('tg_mentions')
        .select('project_id, message_text, message_date')
        .in('project_id', projectIds)
        .gte('message_date', minDate)
        .lte('message_date', maxDate);
      const existingKeys = new Set<string>(
        ((existingRows || []) as any[]).map((r: any) =>
          `${r.project_id}::${r.message_date}::${r.message_text}`),
      );
      const fresh = insertable.filter(h =>
        !existingKeys.has(`${h.project_id}::${h.message_date}::${h.message_text}`),
      );

      // Collapse duplicates WITHIN this batch too. The `existingKeys` filter
      // above only removes rows already in the table; two posts carrying the
      // same text on the same date (a forward, or the same announcement pasted
      // into several channels) still collide on
      // uniq_tg_mentions_project_msg. Postgres rejects the whole INSERT on one
      // dupe, so a single collision used to cost the entire 500-row chunk —
      // observed during the 2026-08-08 backfill, where one pass scanned 1,000
      // posts and recorded zero. [2026-08-08]
      const batchSeen = new Set<string>();
      const deduped = fresh.filter(h => {
        const key = `${h.project_id}::${h.message_date}::${h.message_text}`;
        if (batchSeen.has(key)) return false;
        batchSeen.add(key);
        return true;
      });

      if (deduped.length > 0) {
        // Insert in chunks to avoid Postgres parameter limits.
        const CHUNK = 500;
        for (let i = 0; i < deduped.length; i += CHUNK) {
          const slice = deduped.slice(i, i + CHUNK);
          const { error } = await (supabase as any).from('tg_mentions').insert(slice);
          if (!error) { mentionsAdded += slice.length; continue; }
          if (error.code !== '23505') {
            console.error('[mindshare] tg_mentions insert error:', error);
            continue;
          }
          // Belt and braces: a race with a concurrent run can still collide.
          // Fall back to row-by-row so one bad row can't sink 499 good ones.
          for (const row of slice) {
            const { error: rowErr } = await (supabase as any).from('tg_mentions').insert(row);
            if (!rowErr) mentionsAdded += 1;
            else if (rowErr.code !== '23505') {
              console.error('[mindshare] tg_mentions row insert error:', rowErr);
            }
          }
        }
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
    // Sorted, because the range filter below reads the first and last entries
    // as min and max. A Set iterates in insertion order, so this used to work
    // only by accident: rows arrived ordered by message_date, which made the
    // insertion order chronological. Ordering by pulled_at removed that
    // coincidence and produced an inverted `gte min .. lte max` range, which
    // matches no rows — the daily rollup silently upserted nothing.
    const dayList = Array.from(touchedDays).sort();
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

  // 9. Advance watermark to the last row we processed. Rows come back ordered
  //    by pulled_at, so the tail is the highest ingestion time — matching the
  //    .gt('pulled_at', watermark) filter above. Must stay pulled_at: taking
  //    message_date here would reintroduce the skip this change removes.
  const newWatermark = messages[messages.length - 1].pulled_at;
  if (!scoped) await (supabase as any)
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
    messages_eligible: eligible,
    mentions_added: mentionsAdded,
    daily_rows_upserted: dailyRowsUpserted,
    watermark_advanced_to: newWatermark,
    duration_ms: Date.now() - start,
  };
}
