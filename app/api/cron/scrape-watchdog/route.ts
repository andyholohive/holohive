import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/cron/scrape-watchdog — hourly at :45.
 *
 * GitHub's scheduler is not reliable for the Telegram channel scrape on this
 * account: on 2026-10-22 the 00:10 UTC run fired at 04:33 and the 06:10 run
 * never fired. The scraper itself is fine when it runs. So HHP watches the
 * OUTPUT (tg_channel_posts.pulled_at) and, when nothing has landed for
 * STALE_HOURS and no run is already going, dispatches the workflow itself.
 *
 * Sits under the health sweep's 9h alarm: this acts at 7h, the alarm still
 * fires if the dispatched run produces nothing. The workflow's own
 * `concurrency: telegram-session` lock makes a double dispatch harmless.
 *
 * Auth: Bearer ${CRON_SECRET}. GitHub: GH_DISPATCH_TOKEN (already used by
 * the Korea Scan refresh and the niche-drift cron).
 */

const STALE_HOURS = 7;
const REPO = () => process.env.GH_DISPATCH_REPO || 'andyholohive/kol-telegram-mcp';
const WORKFLOW = 'scrape-mindshare.yml';
const gh = (token: string) => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' });

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if ((request.headers.get('authorization') || '') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any;
  const startedAt = Date.now();
  const log = async (status: 'success' | 'failed', summary: string) => {
    try {
      await sb.from('agent_runs').insert({
        agent_name: 'SCRAPE_WATCHDOG', run_type: 'cron',
        started_at: new Date(startedAt).toISOString(), completed_at: new Date().toISOString(),
        status, output_summary: summary, error_message: status === 'failed' ? summary : null,
      });
    } catch { /* never fail the cron on its own log */ }
  };

  const { data: newest } = await sb.from('tg_channel_posts').select('pulled_at').order('pulled_at', { ascending: false }).limit(1).maybeSingle();
  const ageHours = newest?.pulled_at ? (Date.now() - Date.parse(newest.pulled_at)) / 3_600_000 : Infinity;
  if (ageHours < STALE_HOURS) {
    await log('success', `fresh — last pull ${ageHours.toFixed(1)}h ago.`);
    return NextResponse.json({ dispatched: false, reason: 'fresh', ageHours: +ageHours.toFixed(1) });
  }

  const token = process.env.GH_DISPATCH_TOKEN || process.env.GH_DISPATCH_PAT;
  if (!token) {
    await log('failed', `stale ${ageHours.toFixed(1)}h and GH_DISPATCH_TOKEN is not set — cannot dispatch.`);
    return NextResponse.json({ dispatched: false, reason: 'no token' }, { status: 500 });
  }

  // Don't pile on: a run that's queued or running will land posts shortly.
  const runsRes = await fetch(`https://api.github.com/repos/${REPO()}/actions/workflows/${WORKFLOW}/runs?per_page=3`, { headers: gh(token), cache: 'no-store' }).catch(() => null);
  const runs: any[] = runsRes?.ok ? ((await runsRes.json()).workflow_runs ?? []) : [];
  const live = runs.find((r) => r.status === 'queued' || r.status === 'in_progress' || r.status === 'waiting');
  if (live) {
    await log('success', `stale ${ageHours.toFixed(1)}h but a run is ${live.status} (started ${live.created_at}); not dispatching.`);
    return NextResponse.json({ dispatched: false, reason: 'run in progress', run: live.id });
  }

  const res = await fetch(`https://api.github.com/repos/${REPO()}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST', headers: { ...gh(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }),
  }).catch((e) => e as Error);
  if (res instanceof Error || res.status !== 204) {
    const why = res instanceof Error ? res.message : `GitHub returned ${res.status}`;
    await log('failed', `stale ${ageHours.toFixed(1)}h — dispatch FAILED: ${why}`);
    return NextResponse.json({ dispatched: false, reason: why }, { status: 502 });
  }
  await log('success', `stale ${ageHours.toFixed(1)}h — dispatched ${WORKFLOW} (GitHub's schedule missed its slot).`);
  return NextResponse.json({ dispatched: true, ageHours: +ageHours.toFixed(1) });
}
