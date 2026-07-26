/**
 * Orphaned CRM owners — detect + reassign.
 *
 * Background [2026-07-25]: `crm_opportunities.owner_id` has no FK constraint,
 * so when a teammate is offboarded and their `public.users` profile row goes
 * away, their opportunities keep pointing at a UUID that resolves to nobody.
 * The pipeline still holds the deals, but every owner-scoped view reads them
 * as unowned and nobody picks them up. That happened with philton@holohive.io
 * (649 active opps, went quiet 2026-05-28) and juneenft@gmail.com (33).
 *
 * This is deliberately NOT a philton special-case: it detects any owner_id
 * with no matching users row, labels it with the auth email so a human can
 * tell who it was, and offers a single reassignment. If someone else leaves,
 * it fires again on its own.
 *
 * Service role is required for two reasons: `auth.users` isn't reachable from
 * the browser client at all, and the reassignment writes across every row of
 * a departed user's book in one statement.
 *
 * GET  → { orphans: [{ ownerId, email, activeOpps, totalOpps, lastActivityAt }] }
 * POST → { fromOwnerId, toUserId } reassigns that owner's opportunities.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

/** Stages that don't count as live pipeline — mirrors the reconcile query. */
const CLOSED_STAGES = ['dead', 'v2_closed_lost', 'v2_closed_won', 'unqualified', ''];

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  // Every distinct owner_id on the board, and every real user id.
  const [oppsRes, usersRes] = await Promise.all([
    (admin as any).from('crm_opportunities').select('owner_id, stage'),
    (admin as any).from('users').select('id, name, role'),
  ]);

  if (oppsRes.error) {
    return NextResponse.json({ error: oppsRes.error.message }, { status: 500 });
  }

  const realUserIds = new Set(((usersRes.data as any[]) || []).map(u => u.id));
  const byOwner = new Map<string, { active: number; total: number }>();

  for (const row of ((oppsRes.data as any[]) || [])) {
    const id = row.owner_id;
    if (!id || realUserIds.has(id)) continue; // null owners aren't orphans, they're just blank
    const bucket = byOwner.get(id) || { active: 0, total: 0 };
    bucket.total += 1;
    if (!CLOSED_STAGES.includes(row.stage)) bucket.active += 1;
    byOwner.set(id, bucket);
  }

  // Put a human name to each ghost. listUsers is paginated; the team is small
  // enough that one large page covers it, but we page defensively.
  const emailById = new Map<string, string>();
  try {
    for (let page = 1; page <= 5; page++) {
      const { data, error } = await (admin as any).auth.admin.listUsers({ page, perPage: 200 });
      if (error || !data?.users?.length) break;
      for (const u of data.users) emailById.set(u.id, u.email || '');
      if (data.users.length < 200) break;
    }
  } catch (err) {
    console.error('[orphaned-owners] auth lookup failed:', err);
    // Non-fatal — the dialog can still show counts, just without the email.
  }

  // Last time the departed owner actually did anything, for context.
  const orphanIds = Array.from(byOwner.keys());
  const lastActivityById = new Map<string, string | null>();
  if (orphanIds.length > 0) {
    const { data: acts } = await (admin as any)
      .from('crm_activities')
      .select('owner_id, created_at')
      .in('owner_id', orphanIds)
      .order('created_at', { ascending: false });
    for (const a of ((acts as any[]) || [])) {
      if (!lastActivityById.has(a.owner_id)) lastActivityById.set(a.owner_id, a.created_at);
    }
  }

  const orphans = orphanIds
    .map(id => ({
      ownerId: id,
      email: emailById.get(id) || null,
      activeOpps: byOwner.get(id)!.active,
      totalOpps: byOwner.get(id)!.total,
      lastActivityAt: lastActivityById.get(id) || null,
    }))
    // Biggest book first — that's the one worth deciding on.
    .sort((a, b) => b.activeOpps - a.activeOpps);

  const assignees = ((usersRes.data as any[]) || [])
    .filter(u => ['super_admin', 'admin', 'member'].includes(u.role))
    .map(u => ({ id: u.id, name: u.name }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return NextResponse.json({ orphans, assignees });
}

export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  let body: { fromOwnerId?: string; toUserId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { fromOwnerId, toUserId } = body;
  if (!fromOwnerId || !toUserId) {
    return NextResponse.json({ error: 'fromOwnerId and toUserId are required' }, { status: 400 });
  }

  // Refuse to reassign onto another ghost — that would just move the problem.
  const { data: target } = await (admin as any)
    .from('users').select('id, name').eq('id', toUserId).maybeSingle();
  if (!target) {
    return NextResponse.json({ error: 'Target user not found' }, { status: 400 });
  }

  // Guard the other direction too: only orphans are reassignable here. A real
  // user's book should move through normal reassignment UI, not this repair.
  const { data: sourceIsReal } = await (admin as any)
    .from('users').select('id').eq('id', fromOwnerId).maybeSingle();
  if (sourceIsReal) {
    return NextResponse.json(
      { error: 'That owner still has a profile — use normal reassignment' },
      { status: 400 },
    );
  }

  const { data: moved, error } = await (admin as any)
    .from('crm_opportunities')
    .update({ owner_id: toUserId, updated_at: new Date().toISOString() })
    .eq('owner_id', fromOwnerId)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Move their activity history too, so the audit trail follows the book.
  const { error: actErr } = await (admin as any)
    .from('crm_activities')
    .update({ owner_id: toUserId })
    .eq('owner_id', fromOwnerId);
  if (actErr) console.error('[orphaned-owners] activity reassign failed:', actErr);

  console.log(
    `[orphaned-owners] ${guard.user?.name || 'cron'} reassigned ${moved?.length ?? 0} opps `
    + `from ${fromOwnerId} to ${target.name}`,
  );

  return NextResponse.json({ reassigned: moved?.length ?? 0, to: target.name });
}
