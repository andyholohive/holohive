import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mcp/kol-brief/page-ref — attach the generator's published Vercel
 * page to a confirmed week's brief tokens (KOL Brief Delivery spec §6/§9).
 *
 * The kr-kol-comms generator, after publishing one page per angle for a
 * confirmed lineup week, calls this to set page_ref on every per-KOL token for
 * that angle. Once set, the per-KOL /public/brief/[token] page iframes the real
 * creative card instead of the "being prepared" placeholder.
 *
 * page_ref is per-angle (spec: "Published Vercel page for that angle"); all
 * KOL tokens on the same angle share it — the per-KOL-ness is the token/link
 * and its open tracking, not the page content.
 *
 * Auth: Bearer ${CRON_SECRET} (server-to-server), same as the other MCP write
 * routes. Service-role write (bypasses RLS). Allow-listed via /api/mcp/.
 *
 * Body — batch (preferred):
 *   { "lineup_id": "<uuid>", "pages": [ { "angle_no": 1, "page_ref": "https://…" }, … ] }
 * or single:
 *   { "campaign_id": "<uuid>", "week_number": 3, "angle_no": 1, "page_ref": "https://…" }
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'server configuration error' }, { status: 500 });
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const isUrl = (v: unknown) => { try { new URL(String(v)); return true; } catch { return false; } };

  // Normalise both shapes into a list of updates.
  type Update = { angle_no: number; page_ref: string };
  let updates: Update[] = [];
  let lineupId: string | null = null;
  let campaignId: string | null = null;
  let weekNumber: number | null = null;

  if (Array.isArray(body.pages)) {
    lineupId = body.lineup_id ? String(body.lineup_id) : null;
    campaignId = body.campaign_id ? String(body.campaign_id) : null;
    weekNumber = Number.isFinite(body.week_number) ? Number(body.week_number) : null;
    if (!lineupId && !(campaignId && weekNumber != null)) {
      return NextResponse.json({ error: 'lineup_id (or campaign_id + week_number) is required' }, { status: 400 });
    }
    for (const p of body.pages) {
      if (!Number.isFinite(p?.angle_no) || !isUrl(p?.page_ref)) {
        return NextResponse.json({ error: 'each page needs a numeric angle_no and a valid page_ref URL' }, { status: 400 });
      }
      updates.push({ angle_no: Number(p.angle_no), page_ref: String(p.page_ref) });
    }
  } else {
    if (!Number.isFinite(body.angle_no) || !isUrl(body.page_ref)) {
      return NextResponse.json({ error: 'angle_no (number) and page_ref (URL) are required' }, { status: 400 });
    }
    lineupId = body.lineup_id ? String(body.lineup_id) : null;
    campaignId = body.campaign_id ? String(body.campaign_id) : null;
    weekNumber = Number.isFinite(body.week_number) ? Number(body.week_number) : null;
    if (!lineupId && !(campaignId && weekNumber != null)) {
      return NextResponse.json({ error: 'lineup_id (or campaign_id + week_number) is required' }, { status: 400 });
    }
    updates = [{ angle_no: Number(body.angle_no), page_ref: String(body.page_ref) }];
  }

  let updated = 0;
  const results: Array<{ angle_no: number; updated: number }> = [];
  for (const u of updates) {
    let q = (admin as any)
      .from('kol_brief_tokens')
      .update({ page_ref: u.page_ref, updated_at: new Date().toISOString() })
      .eq('angle_no', u.angle_no);
    q = lineupId ? q.eq('lineup_id', lineupId) : q.eq('campaign_id', campaignId).eq('week_number', weekNumber);
    const { data, error } = await q.select('id');
    if (error) {
      return NextResponse.json({ error: error.message, angle_no: u.angle_no }, { status: 500 });
    }
    const n = (data ?? []).length;
    updated += n;
    results.push({ angle_no: u.angle_no, updated: n });
  }

  return NextResponse.json({ ok: true, tokensUpdated: updated, byAngle: results });
}
