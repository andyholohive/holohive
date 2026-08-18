import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mcp/tg-run — record what a Telegram read run actually spent.
 *
 * [2026-08-18] Jdot on Dispatch: "request budget, not money. No per-call
 * cost, which is why the spend row reads $0, and a $0.00 on every confirm
 * just teaches everyone to click through. Show estimated requests, which
 * account, and whether it fits before a timeout. calls_24h can't answer
 * that alone since throttling fires on a much shorter window, so add
 * calls_60m."
 *
 * His answer assumed a calls_24h counter to extend. There wasn't one —
 * nothing in the DB, nothing in code, and the mockup only says "calls" in
 * prose. So this is the ledger, built with 60m as the primary window
 * rather than 24h with 60m bolted on: a day's total reads comfortable
 * while the account is already flood-waiting.
 *
 * Run grain, not call grain. The MCP counts in-process via RunBudget and
 * posts once at the end — a per-call write would be traffic we then have
 * to account for too.
 *
 * Auth: Bearer CRON_SECRET, same as the other /api/mcp routes.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const account = String(body.account ?? 'main');
  const tool = String(body.tool ?? 'unknown');
  if (!['main', 'coverage'].includes(account)) {
    return NextResponse.json({ error: `unknown account: ${account}` }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from('tg_api_runs')
    .insert({
      account,
      tool,
      // A run that flood-waited is not 'ok' however it finished — the
      // account paid for it either way, and hiding that is how a scan
      // "succeeds" for weeks while the session is being throttled.
      status: body.status ?? (Number(body.flood_waits) > 0 ? 'flood' : 'ok'),
      calls: Number(body.calls) || 0,
      flood_waits: Number(body.flood_waits) || 0,
      flood_seconds: Number(body.flood_seconds) || 0,
      channels: body.channels == null ? null : Number(body.channels),
      detail: body.detail ?? null,
      started_at: body.started_at ?? new Date().toISOString(),
      finished_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}
