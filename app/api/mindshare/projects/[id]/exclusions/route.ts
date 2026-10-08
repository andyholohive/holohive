import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { lowerList, matchProject } from '@/lib/mindshareScanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/mindshare/projects/[id]/exclusions (admin+)
 * Body: { phrases: string[], apply?: boolean }
 *
 * Excluded phrases are blanked out of a post before keyword matching
 * (lib/mindshareScanner.ts stripExcluded), so "jump crypto" stops counting
 * for JUMP. New scans honour them automatically; this route makes the PAST
 * agree too, which is why exclusions save here rather than through the
 * project PATCH:
 *   apply=false  dry run — how many existing mentions would drop, with samples
 *   apply=true   save the phrases, delete mentions that no longer match any
 *                keyword, and recount mindshare_daily for the affected days
 * tg_mentions rows are derived from tg_channel_posts, so removing one isn't
 * data loss: clearing the phrase and re-running the project's backfill
 * restores it.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const phrases: string[] = (Array.isArray(body?.phrases) ? body.phrases : [])
    .filter((x: unknown): x is string => typeof x === 'string').map((x: string) => x.trim()).filter(Boolean).slice(0, 30);
  const apply = body?.apply === true;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }) as any;

  const { data: project } = await db.from('mindshare_projects').select('id, name, tracked_keywords').eq('id', params.id).maybeSingle();
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const keywords = lowerList(project.tracked_keywords);
  const excludes = lowerList(phrases);

  const mentions: Array<{ id: string; message_text: string | null; message_date: string; channel_id: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('tg_mentions').select('id, message_text, message_date, channel_id').eq('project_id', params.id).range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    mentions.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  // Only mentions the exclusion itself knocks out: they match today's keywords
  // without exclusions and stop matching with them. Mentions left over from a
  // keyword that was removed earlier are not this route's business.
  const drop = mentions.filter((x) => x.message_text && matchProject(x.message_text, keywords, []) && !matchProject(x.message_text, keywords, excludes));

  if (!apply) {
    return NextResponse.json({
      total: mentions.length,
      remove: drop.length,
      samples: drop.slice(0, 6).map((x) => ({ date: x.message_date, text: (x.message_text ?? '').replace(/\s+/g, ' ').slice(0, 160) })),
    });
  }

  const { error: saveErr } = await db.from('mindshare_projects').update({ exclude_keywords: phrases, updated_at: new Date().toISOString() }).eq('id', params.id);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  const ids = drop.map((x) => x.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db.from('tg_mentions').delete().in('id', ids.slice(i, i + 200)).eq('project_id', params.id);
    if (error) return NextResponse.json({ error: `Saved the phrases but removing old mentions failed: ${error.message}` }, { status: 500 });
  }

  // Recount the affected days from what's left. Days that lost every mention
  // are written as 0 rather than left holding the old count.
  const days = Array.from(new Set(drop.map((x) => x.message_date.slice(0, 10))));
  const dropped = new Set(ids);
  const rows = days.map((day) => {
    const left = mentions.filter((x) => !dropped.has(x.id) && x.message_date.slice(0, 10) === day);
    return { project_id: params.id, day, mention_count: left.length, channel_reach: new Set(left.map((x) => x.channel_id).filter(Boolean)).size };
  });
  if (rows.length) {
    const { error } = await db.from('mindshare_daily').upsert(rows, { onConflict: 'project_id,day' });
    if (error) return NextResponse.json({ error: `Removed old mentions but the daily recount failed: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ total: mentions.length, removed: drop.length, days: rows.length });
}
