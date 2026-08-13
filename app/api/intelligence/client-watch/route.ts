import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

/**
 * GET /api/intelligence/client-watch
 *
 * Korea Signal · Client Watch — how much each live client is being talked
 * about in the Korean Telegram channels we crawl.
 *
 * Costs ZERO Telegram calls. Every figure comes from tg_mentions, which
 * the mindshare scanner already populates from the standing corpus. That
 * was the whole argument for the panel: the posts are collected, they
 * just weren't being read per client.
 *
 * THE WINDOW IS THE POINT. The crawler didn't start covering most
 * channels until late July 2026, so "few mentions" and "we weren't
 * watching yet" look identical in the numbers. The response carries the
 * corpus window explicitly, and flags any client whose engagement began
 * before broad coverage did — those rows are narrow, not low, and a CM
 * comparing them side by side would otherwise read a crawl artifact as a
 * performance difference.
 */
export async function GET(request: Request) {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } },
  );
  const { data: { user } } = await sb.auth.getUser();
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = !!cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`;
  if (!user && !bearerOk) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = Date.now();
  const d7 = new Date(now - 7 * 86400_000).toISOString();
  const d14 = new Date(now - 14 * 86400_000).toISOString();
  const d30 = new Date(now - 30 * 86400_000).toISOString();

  // Live book only: archived clients still carry is_active, so the flag
  // alone over-counts badly (it reads 35 against a real book of 7).
  const { data: clientRows, error: cErr } = await (supabase as any)
    .from('clients')
    .select('id, name, is_ad_hoc')
    .is('archived_at', null)
    .eq('is_active', true)
    .order('name');
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const clients = (clientRows ?? []) as any[];

  const { data: projectRows } = await (supabase as any)
    .from('mindshare_projects')
    .select('id, name, client_id, tracked_keywords')
    .not('client_id', 'is', null);
  const projectByClient = new Map<string, any>(
    ((projectRows ?? []) as any[]).map(p => [p.client_id, p]),
  );

  const projectIds = [...projectByClient.values()].map(p => p.id);
  const { data: mentionRows } = projectIds.length
    ? await (supabase as any)
        .from('tg_mentions')
        .select('project_id, message_date, channel_id')
        .in('project_id', projectIds)
        .gte('message_date', d30)
    : { data: [] };
  const mentions = (mentionRows ?? []) as any[];

  // Engagement start per client — a stint that opened before the corpus
  // did is what makes a row's number narrow rather than low.
  const { data: stintRows } = await (supabase as any)
    .from('client_stints')
    .select('client_id, start_date');
  const engagementStart = new Map<string, string>();
  for (const s of ((stintRows ?? []) as any[])) {
    if (!s.start_date) continue;
    const cur = engagementStart.get(s.client_id);
    if (!cur || s.start_date < cur) engagementStart.set(s.client_id, s.start_date);
  }

  // Corpus depth. `earliest` is one backfilled outlier; `broad_since` is
  // the median channel's first post, which is the honest answer to "how
  // far back does this actually see".
  const { data: windowRow } = await (supabase as any).rpc('corpus_coverage_window').single();
  const corpusWindow = windowRow ?? { earliest: null, broad_since: null, channels: 0 };

  const rows = clients.map(c => {
    const project = projectByClient.get(c.id) ?? null;
    const mine = project ? mentions.filter(m => m.project_id === project.id) : [];
    const last7 = mine.filter(m => m.message_date >= d7);
    const prev7 = mine.filter(m => m.message_date >= d14 && m.message_date < d7);
    const started = engagementStart.get(c.id) ?? null;
    return {
      client_id: c.id,
      client_name: c.name,
      is_ad_hoc: !!c.is_ad_hoc,
      project_id: project?.id ?? null,
      keywords: project?.tracked_keywords ?? [],
      mentions_7d: last7.length,
      mentions_prev_7d: prev7.length,
      mentions_30d: mine.length,
      channels_30d: new Set(mine.map(m => m.channel_id).filter(Boolean)).size,
      engagement_started: started,
      // True when we started watching after the engagement began, i.e.
      // the count cannot describe the whole relationship.
      predates_coverage: !!(started && corpusWindow.broad_since && started < corpusWindow.broad_since),
    };
  });

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    corpus_window: corpusWindow,
    untracked: rows.filter(r => !r.project_id).map(r => r.client_name),
    clients: rows,
  });
}
