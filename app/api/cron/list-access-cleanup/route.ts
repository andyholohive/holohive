import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/list-access-cleanup
 *
 * Daily cron. Finds list_access_grants where expires_at has passed and
 * revoked_at is still null. For each:
 *   1. Mark the grant revoked: revoked_at=NOW(), revoked_reason='auto-expired'
 *   2. Remove the email from the parent list's approved_emails array
 *
 * Both happen so the array (read-time gate) and the grants table
 * (audit/state) stay consistent.
 *
 * Auth: Bearer ${CRON_SECRET}, same pattern as the other crons.
 */

export async function GET(request: Request) {
  if (process.env.CRON_SECRET) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const startedAt = Date.now();
  const nowIso = new Date().toISOString();

  // Find all expired-but-not-yet-revoked grants
  const { data: expiredGrants, error: fetchErr } = await (supabase as any)
    .from('list_access_grants')
    .select('id, list_id, email, expires_at, granted_at')
    .is('revoked_at', null)
    .not('expires_at', 'is', null)
    .lt('expires_at', nowIso)
    .limit(1000);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const expired = (expiredGrants || []) as any[];
  if (expired.length === 0) {
    return NextResponse.json({
      ok: true,
      revoked_count: 0,
      lists_touched: 0,
      duration_ms: Date.now() - startedAt,
    });
  }

  // Group by list_id so we can update each list's approved_emails array
  // in one shot per list (instead of N updates per list).
  const byList = new Map<string, string[]>();
  for (const g of expired) {
    const existing = byList.get(g.list_id) || [];
    existing.push(g.email.trim().toLowerCase());
    byList.set(g.list_id, existing);
  }

  // For each affected list: read current approved_emails, filter out
  // the expired ones, write back. Done sequentially per list because
  // we need a read-modify-write cycle.
  let listsTouched = 0;
  let listsFailed = 0;
  // Use Array.from to avoid the downlevelIteration flag — older TS
  // target on this codebase doesn't allow direct iteration of Map.entries().
  for (const [listId, expiredEmails] of Array.from(byList.entries())) {
    const { data: list } = await (supabase as any)
      .from('lists')
      .select('approved_emails')
      .eq('id', listId)
      .single();
    if (!list) { listsFailed++; continue; }

    const current = (Array.isArray(list.approved_emails) ? list.approved_emails : [])
      .map((e: string) => e.trim().toLowerCase());
    const next = current.filter((e: string) => !expiredEmails.includes(e));

    const { error: updErr } = await (supabase as any)
      .from('lists')
      .update({ approved_emails: next, updated_at: nowIso })
      .eq('id', listId);

    if (updErr) {
      console.error(`[cron list-access-cleanup] list ${listId} update failed:`, updErr.message);
      listsFailed++;
    } else {
      listsTouched++;
    }
  }

  // Mark all the expired grants as auto-revoked in one batch.
  const grantIds = expired.map(g => g.id);
  const { error: revokeErr } = await (supabase as any)
    .from('list_access_grants')
    .update({
      revoked_at: nowIso,
      revoked_reason: 'auto-expired',
    })
    .in('id', grantIds);

  if (revokeErr) {
    console.error('[cron list-access-cleanup] grants update failed:', revokeErr.message);
  }

  return NextResponse.json({
    ok: true,
    revoked_count: expired.length,
    lists_touched: listsTouched,
    lists_failed: listsFailed,
    duration_ms: Date.now() - startedAt,
    sample: expired.slice(0, 5).map(g => ({ list_id: g.list_id, email: g.email, expires_at: g.expires_at })),
  });
}
