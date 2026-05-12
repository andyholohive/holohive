import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { runReminders } from '@/lib/reminderService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/reminders/test?rule=<rule_type>
 *
 * Admin-gated wrapper around runReminders() so the /reminders admin UI
 * can fire a one-off test without exposing CRON_SECRET. The Vercel
 * cron endpoint (/api/cron/reminders) keeps its bearer-token auth.
 *
 * Auth: signed-in user with role admin | super_admin.
 *
 * Behaviour: passes the rule_type through as testRuleType, which makes
 * the engine bypass the placeholder-chat-id skip — so the user can
 * verify the evaluator's query before they wire up a real TG chat.
 * Messages are NOT actually sent to placeholder chats either way (the
 * engine still skips the network call in that case).
 */
export async function POST(request: Request) {
  // 1) Verify the caller has a valid session
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

  // 2) Verify the caller is an admin
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
  const ruleType = url.searchParams.get('rule') || undefined;

  // 3) Run the engine with service-role so RLS doesn't get in the way.
  //    Same client shape the cron endpoint uses.
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const start = Date.now();
    const { results, errors } = await runReminders(supabase, ruleType);
    const totalDuration = Date.now() - start;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      test_mode: !!ruleType,
      rules_evaluated: results.length,
      messages_sent: results.filter(r => r.message_sent).length,
      total_items_found: results.reduce((sum, r) => sum + r.items_found, 0),
      duration_ms: totalDuration,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('[reminders/test] error:', err);
    return NextResponse.json({ error: err?.message || 'Test run failed' }, { status: 500 });
  }
}
