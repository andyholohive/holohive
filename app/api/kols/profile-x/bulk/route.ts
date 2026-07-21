import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { profileXHandle, applyXProfile, xHandleFromLink } from '@/lib/kolXProfile';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Bulk X-profile backfill — super-admin only. Because Grok reads cost money
 * (~$0.01–0.05 per KOL) and each x_search takes 10–70s, this processes a
 * small batch per call and reports how many remain. The UI calls it
 * repeatedly to walk the whole untagged-X-KOL set with visible progress and
 * a cost tally.
 *
 * GET  → preview: { eligible, est_cost_usd } (no writes).
 * POST { limit?, execute:true } → profile up to `limit` untagged X-only KOLs,
 *        returns { processed, succeeded, results, remaining, cost_usd }.
 *
 * "Untagged X-only" = platform includes X, not Telegram, creator_type empty,
 * and link is an x.com/twitter.com URL.
 */

const ROUGH_COST_PER_KOL = 0.02; // token-dominated; see live-test evidence
const MAX_LIMIT = 12;            // keeps a batch under the 300s maxDuration

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Untagged X-only KOLs with a parseable handle, ordered deterministically. */
async function loadEligible(admin: ReturnType<typeof serviceClient>, limit: number) {
  // creator_type empty is the "untagged" signal; filter platform + handle in JS
  // since array-contains semantics differ across columns.
  const { data, error } = await (admin as any)
    .from('master_kols')
    .select('id, name, link, platform, creator_type')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; name: string; link: string | null; platform: string[] | null; creator_type: string[] | null }>;
  const eligible = rows.filter(r =>
    Array.isArray(r.platform) && r.platform.includes('X') && !r.platform.includes('Telegram') &&
    (!r.creator_type || r.creator_type.length === 0) &&
    !!xHandleFromLink(r.link),
  );
  return { total: eligible.length, batch: eligible.slice(0, limit) };
}

export async function GET(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const admin = serviceClient();
    const { total } = await loadEligible(admin, 0);
    return NextResponse.json({ eligible: total, est_cost_usd: Number((total * ROUGH_COST_PER_KOL).toFixed(2)) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'preview failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  if (!process.env.GROK_API_KEY) {
    return NextResponse.json({ error: 'GROK_API_KEY not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(body?.limit) || 6));
  if (body?.execute !== true) {
    return NextResponse.json({ error: 'pass { execute: true } to run; use GET for a dry-run preview' }, { status: 400 });
  }

  try {
    const admin = serviceClient();
    const { total, batch } = await loadEligible(admin, limit);

    const results: Array<{ id: string; name: string; handle: string; ok: boolean; creator_types?: string[]; niche_tags?: string[]; reason?: string }> = [];
    let cost = 0;
    let succeeded = 0;
    for (const kol of batch) {
      const handle = xHandleFromLink(kol.link)!;
      const r = await profileXHandle(handle);
      cost += (r as any).cost_usd ?? 0;
      if (r.ok) {
        const { error } = await applyXProfile(admin, kol.id, r);
        if (error) {
          results.push({ id: kol.id, name: kol.name, handle, ok: false, reason: `DB: ${error}` });
        } else {
          succeeded++;
          results.push({ id: kol.id, name: kol.name, handle, ok: true, creator_types: r.creator_types, niche_tags: r.niche_tags });
        }
      } else {
        results.push({ id: kol.id, name: kol.name, handle, ok: false, reason: r.reason });
      }
    }

    return NextResponse.json({
      processed: batch.length,
      succeeded,
      results,
      remaining: Math.max(0, total - succeeded),
      cost_usd: Number(cost.toFixed(4)),
    });
  } catch (err: any) {
    console.error('[profile-x/bulk] error:', err);
    return NextResponse.json({ error: err?.message ?? 'bulk run failed' }, { status: 500 });
  }
}
