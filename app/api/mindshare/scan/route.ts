import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { runMindshareScan } from '@/lib/mindshareScanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/mindshare/scan?backfill=1
 * POST /api/mindshare/scan?projectId=<uuid>  — backfill one project's history
 *
 * Admin-gated wrapper around the mindshare scanner so the UI can
 * trigger a manual run without exposing CRON_SECRET. The cron route
 * (/api/cron/mindshare-scan) keeps its bearer-token auth for Vercel.
 *
 * Auth: signed-in user with role admin | super_admin.
 */
export async function POST(request: Request) {
  // 1) Verify session
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {}, remove() {},
      },
    }
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2) Verify admin
  const { data: profile } = await (sb as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = profile?.role;
  if (role !== 'admin' && role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const backfill = url.searchParams.get('backfill') === '1';
  const projectId = url.searchParams.get('projectId');
  // Resume cursor for a paged scoped backfill — the previous call's resume_after.
  const after = url.searchParams.get('after');

  // 3) Run scan with the service-role client so RLS doesn't get in the way.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    // Scoped backfill: give ONE project its history without disturbing the
    // shared watermark. A new project would otherwise start at zero and only
    // ever see posts ingested after its creation — the corpus reaches back to
    // April 2026 and the cursor is already past all of it. [2026-08-08]
    if (projectId) {
      let cursor: string | null = after;
      const totals = { messages_scanned: 0, messages_eligible: 0, mentions_added: 0, daily_rows_upserted: 0 };
      let pages = 0;
      // PostgREST caps a page at 1,000 rows regardless of .limit(), so this
      // pages. MAX_PAGES keeps one request inside maxDuration; the caller
      // re-invokes while has_more is true.
      const MAX_PAGES = 12;
      while (pages < MAX_PAGES) {
        const page = await runMindshareScan(supabase, { projectIds: [projectId], pulledAfter: cursor });
        pages += 1;
        totals.messages_scanned += page.messages_scanned;
        totals.messages_eligible += page.messages_eligible;
        totals.mentions_added += page.mentions_added;
        totals.daily_rows_upserted += page.daily_rows_upserted;
        if (!page.watermark_advanced_to) break;
        cursor = page.watermark_advanced_to;
      }
      return NextResponse.json({
        ok: true, project_id: projectId, pages, ...totals,
        has_more: pages >= MAX_PAGES,
        resume_after: cursor,
      });
    }

    const result = await runMindshareScan(supabase, { backfill });
    return NextResponse.json({ ok: true, backfill, ...result });
  } catch (err: any) {
    console.error('[mindshare/scan] error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'scan failed' }, { status: 500 });
  }
}
