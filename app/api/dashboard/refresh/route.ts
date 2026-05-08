import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { generatePriorityDashboard } from '@/lib/dashboardAnalyzer';

export const dynamic = 'force-dynamic';
// LLM analysis can take 30-60s for chat-heavy weeks. Bump from default.
export const maxDuration = 120;

/**
 * POST /api/dashboard/refresh
 *
 * Manually regenerate the current week's snapshot. Calls the same
 * analyzer the Monday cron uses (lib/dashboardAnalyzer.ts), so output
 * is guaranteed identical between manual + automatic refresh.
 *
 * UPSERT keyed on week_of — re-runs replace the existing row instead
 * of creating duplicates. created_by stamped with the user who clicked
 * the Refresh button (cron runs leave it null; generation_method
 * distinguishes them).
 *
 * Auth: must be a logged-in user.
 */

function mondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export async function POST() {
  const cookieStore = cookies();
  const sbAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {}, remove() {},
      },
    }
  );
  const { data: { user }, error: authErr } = await sbAuth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const weekOf = mondayOfWeek(new Date());

  let result;
  try {
    result = await generatePriorityDashboard(supabase, weekOf);
  } catch (err: any) {
    console.error('[dashboard/refresh] analyzer failed:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Dashboard analyzer failed' },
      { status: 500 },
    );
  }

  const { data, error } = await (supabase as any)
    .from('dashboard_snapshots')
    .upsert(
      {
        week_of: weekOf,
        generated_at: new Date().toISOString(),
        generation_method: 'manual',
        payload: result.payload,
        source_summary: result.source_summary,
        cost_usd: result.cost_usd,
        created_by: user.id,
      },
      { onConflict: 'week_of' },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ snapshot: data });
}
