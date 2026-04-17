import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { runReminders } from '@/lib/reminderService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/reminders — Daily reminder cron
 * Evaluates all active reminder rules and sends TG notifications.
 *
 * Query params:
 *   ?test_rule=rule_type — Run only a specific rule type (for testing)
 *
 * Auth: Bearer ${CRON_SECRET}
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { searchParams } = new URL(request.url);
    const testRule = searchParams.get('test_rule') || undefined;

    const start = Date.now();
    const { results, errors } = await runReminders(supabase, testRule);
    const totalDuration = Date.now() - start;

    const rulesEvaluated = results.length;
    const messagesSent = results.filter((r) => r.message_sent).length;
    const totalItems = results.reduce((sum, r) => sum + r.items_found, 0);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      test_mode: !!testRule,
      rules_evaluated: rulesEvaluated,
      messages_sent: messagesSent,
      total_items_found: totalItems,
      duration_ms: totalDuration,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[Reminders Cron] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
