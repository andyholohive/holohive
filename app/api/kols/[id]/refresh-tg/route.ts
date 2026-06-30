import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/kols/[id]/refresh-tg
 *
 * Doc 2 §4 Mode 3 — on-demand single-KOL profile refresh. Dispatches the
 * scan-one.yml workflow in the kol-telegram-mcp repo via GitHub REST.
 * Latency from dispatch → snapshot + profile update in DB is ~30-90s
 * (runner queue + boot + scan + 2 upserts). Caller should show a
 * "scan in progress, ~1 min" toast and re-fetch the score after a delay
 * rather than blocking on a 202.
 *
 * Auth: any authenticated user. Refresh is a read-only operation from
 * HHP's POV — the actual write happens in CI via the MCP write endpoints
 * which gate on CRON_SECRET.
 *
 * Env required:
 *   GH_DISPATCH_TOKEN — PAT with `actions:write` on the MCP repo
 *   GH_DISPATCH_REPO  — defaults to "andyholohive/kol-telegram-mcp"
 *   GH_DISPATCH_WORKFLOW — defaults to "scan-one.yml"
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json({
      error: 'GH_DISPATCH_TOKEN not configured',
      hint: 'Add a GitHub PAT with actions:write on the kol-telegram-mcp repo to Vercel env vars.',
    }, { status: 500 });
  }
  const repo = process.env.GH_DISPATCH_REPO || 'andyholohive/kol-telegram-mcp';
  const workflow = process.env.GH_DISPATCH_WORKFLOW || 'scan-one.yml';

  // Service-role read — RLS would block this for `member` users
  // otherwise. Refresh-TG is admin-ish but we let any signed-in user
  // trigger it; the MCP scan write side gates on CRON_SECRET so RLS
  // is fine to bypass for this lookup.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: kol, error: kolErr } = await (supabaseAdmin as any)
    .from('master_kols')
    .select('id, name, link, platform')
    .eq('id', params.id)
    .maybeSingle();

  if (kolErr || !kol) {
    return NextResponse.json({ error: 'KOL not found' }, { status: 404 });
  }

  // Only TG-platform KOLs can be scanned by Telethon. X / YouTube KOLs
  // would silently no-op the scan; reject up front so the UI knows.
  if (!_isTelegram(kol.platform)) {
    return NextResponse.json({
      error: 'KOL is not on Telegram',
      hint: `Platform is "${kol.platform}". Only TG KOLs can be refreshed via this endpoint.`,
    }, { status: 400 });
  }

  const handle = _extractHandle(kol.link);
  if (!handle) {
    return NextResponse.json({
      error: 'No usable TG handle on this KOL',
      hint: `link="${kol.link ?? '(empty)'}" — expected something like t.me/cobling or @cobling.`,
    }, { status: 400 });
  }

  // Fire the workflow dispatch. GitHub returns 204 No Content on success.
  // No body is returned, so we synthesize a 202-style "queued" response.
  const ghResp = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { handle: `@${handle}` },
      }),
    },
  );

  if (ghResp.status !== 204) {
    const text = await ghResp.text();
    return NextResponse.json({
      error: 'GitHub dispatch failed',
      status: ghResp.status,
      detail: text.slice(0, 500),
    }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    kol_id: kol.id,
    name: kol.name,
    handle: `@${handle}`,
    workflow,
    repo,
    queued_at: new Date().toISOString(),
    eta_seconds: 60,
    message: 'Scan queued. Snapshot + profile will land in ~60 seconds.',
  }, { status: 202 });
}

/** Same platform check shape scan_joined.py uses on the Python side.
 *  master_kols.platform is text[] (postgres array) — accept either an
 *  array containing any TG-flavored value or a bare string for legacy
 *  rows. */
function _isTelegram(platform: string[] | string | null | undefined): boolean {
  if (!platform) return false;
  const values = Array.isArray(platform) ? platform : [platform];
  return values.some(v => {
    const p = String(v ?? '').toLowerCase().trim();
    return p === 'telegram' || p === 'tg' || p === 'telegram channel';
  });
}

/** Normalize various TG link shapes → bare username. Mirrors scripts/scan_joined.py:_normalize. */
function _extractHandle(link: string | null | undefined): string | null {
  if (!link) return null;
  let s = String(link).trim();
  if (!s) return null;
  if (s.includes('t.me/')) s = s.split('t.me/', 2)[1];
  s = s.replace(/^@/, '').replace(/\/$/, '');
  // Drop deep-link paths (t.me/foo/123 → foo).
  s = s.split('/')[0];
  return s || null;
}
