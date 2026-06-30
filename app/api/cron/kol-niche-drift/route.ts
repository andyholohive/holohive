/**
 * GET /api/cron/kol-niche-drift
 *
 * Doc 2 Q7b — 30-day niche drift suggestion cron.
 *
 * Daily at 04:30 UTC. Finds TG-platform KOLs whose channel snapshot is
 * either missing or >30 days old, then dispatches the kol-telegram-mcp
 * scan-one.yml workflow for each (rate-limited to avoid blasting GitHub
 * Actions and our own runner minutes). The scan re-runs the AI niche
 * inference step in scripts/scan_joined.py → if the model now thinks
 * a KOL is e.g. "DeFi + Trading" instead of just "DeFi" it lands as a
 * direct update to master_kols.niche_tags via /api/mcp/kol-profile/update.
 *
 * MVP behaviour: niche updates auto-apply (no review queue). The team
 * sees the new tags on the KOL modal Score tab + the /kols list column
 * and can manually override via the existing edit dialog. A future
 * iteration can layer on a "review queue" + diff UI per the original
 * spec note — for now, the monthly + drift crons keep the data fresh
 * enough that drift suggestions land in days, not weeks, which is the
 * value the team actually needs.
 *
 * Per-run cap is 25 KOLs so:
 *   - We stay under the daily GitHub Actions free-tier budget
 *     (25 × ~90s = ~38 min/day; budget is 2000 min/mo)
 *   - One slow-running scan won't starve the rest
 *   - Roster turnover means the queue empties in a few days
 *
 * Auth: Bearer ${CRON_SECRET}. Same gate as the other crons.
 *
 * Logged to agent_runs as KOL_NICHE_DRIFT.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STALENESS_DAYS = 30;
const MAX_DISPATCHES_PER_RUN = 25;
// Brief pause between dispatches so we're not slamming the GH API.
// Each dispatch is a small POST; ~100ms is enough to be polite.
const DELAY_MS = 100;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const ghToken = process.env.GH_DISPATCH_TOKEN;
  if (!ghToken) {
    return NextResponse.json({
      error: 'GH_DISPATCH_TOKEN not configured',
      hint: 'See /api/kols/[id]/refresh-tg for the setup steps.',
    }, { status: 500 });
  }
  const ghRepo = process.env.GH_DISPATCH_REPO || 'andyholohive/kol-telegram-mcp';
  const ghWorkflow = process.env.GH_DISPATCH_WORKFLOW || 'scan-one.yml';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const startedAt = new Date();
  const { data: runRow } = await (sb as any)
    .from('agent_runs')
    .insert({
      agent_name: 'KOL_NICHE_DRIFT',
      started_at: startedAt.toISOString(),
      status: 'running',
    })
    .select('id')
    .single();
  const agentRunId = runRow?.id ?? null;

  try {
    // Find TG-platform KOLs with a usable link that haven't been scanned
    // in 30+ days (or never). Resolved client-side: postgres can't easily
    // express "max(snapshot_date) is older than X" without a window query
    // and the roster is small (<500 rows). Pull all TG KOLs + their latest
    // snapshot date, filter in JS, sort by oldest-first.
    const { data: kols, error: kolsErr } = await (sb as any)
      .from('master_kols')
      .select('id, name, link, platform, kol_channel_snapshots(snapshot_date)')
      .not('link', 'is', null)
      .neq('link', '')
      .is('archived_at', null);
    if (kolsErr) throw new Error(`kols query failed: ${kolsErr.message}`);

    const today = new Date();
    const staleCutoff = new Date(today.getTime() - STALENESS_DAYS * 86_400_000);

    type Row = {
      id: string;
      name: string;
      link: string;
      platform: string[] | string | null;
      kol_channel_snapshots: Array<{ snapshot_date: string }> | null;
    };
    const candidates = ((kols ?? []) as Row[])
      .filter(k => _isTelegram(k.platform))
      .map(k => {
        const dates = (k.kol_channel_snapshots ?? [])
          .map(s => s.snapshot_date)
          .sort();
        const latest = dates.length ? new Date(dates[dates.length - 1]) : null;
        const handle = _extractHandle(k.link);
        return { kol: k, latest, handle, isStale: !latest || latest < staleCutoff };
      })
      .filter(x => x.isStale && x.handle)
      .sort((a, b) => (a.latest?.getTime() ?? 0) - (b.latest?.getTime() ?? 0))
      .slice(0, MAX_DISPATCHES_PER_RUN);

    let dispatched = 0;
    let failed = 0;
    const failures: Array<{ name: string; error: string }> = [];

    for (const c of candidates) {
      try {
        const resp = await fetch(
          `https://api.github.com/repos/${ghRepo}/actions/workflows/${ghWorkflow}/dispatches`,
          {
            method: 'POST',
            headers: {
              'Accept': 'application/vnd.github+json',
              'Authorization': `Bearer ${ghToken}`,
              'X-GitHub-Api-Version': '2022-11-28',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ref: 'main',
              inputs: { handle: `@${c.handle}` },
            }),
          },
        );
        if (resp.status === 204) {
          dispatched++;
        } else {
          failed++;
          failures.push({ name: c.kol.name, error: `HTTP ${resp.status}` });
        }
      } catch (err: any) {
        failed++;
        failures.push({ name: c.kol.name, error: err?.message ?? 'unknown' });
      }
      await sleep(DELAY_MS);
    }

    const output = {
      candidates_total: candidates.length,
      dispatched,
      failed,
      staleness_days: STALENESS_DAYS,
      max_per_run: MAX_DISPATCHES_PER_RUN,
      ...(failures.length ? { failures } : {}),
    };
    if (agentRunId) {
      await (sb as any)
        .from('agent_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: failed > 0 && dispatched === 0 ? 'error' : 'success',
          output,
        })
        .eq('id', agentRunId);
    }
    return NextResponse.json({ success: true, ...output });
  } catch (err: any) {
    if (agentRunId) {
      await (sb as any)
        .from('agent_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'error',
          error: err?.message ?? String(err),
        })
        .eq('id', agentRunId);
    }
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}

function _isTelegram(platform: string[] | string | null | undefined): boolean {
  if (!platform) return false;
  const values = Array.isArray(platform) ? platform : [platform];
  return values.some(v => {
    const p = String(v ?? '').toLowerCase().trim();
    return p === 'telegram' || p === 'tg' || p === 'telegram channel';
  });
}

function _extractHandle(link: string | null | undefined): string | null {
  if (!link) return null;
  let s = String(link).trim();
  if (!s) return null;
  if (s.includes('t.me/')) s = s.split('t.me/', 2)[1];
  s = s.replace(/^@/, '').replace(/\/$/, '');
  s = s.split('/')[0];
  return s || null;
}
