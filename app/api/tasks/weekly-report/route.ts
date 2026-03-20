import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';

/**
 * Weekly cron (Friday 5 PM): sends a summary report of the week's task activity
 * to the ops chat via Telegram.
 *
 * Secured by CRON_SECRET header check.
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
    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const today = now.toISOString().split('T')[0];

    // 1. Tasks completed this week
    const { data: completedThisWeek } = await supabase
      .from('tasks')
      .select('id, task_name, assigned_to_name, completed_at')
      .eq('status', 'complete')
      .gte('completed_at', weekAgo.toISOString());

    // 2. Tasks created this week
    const { count: createdCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString());

    // 3. Currently overdue
    const { data: overdueTasks } = await supabase
      .from('tasks')
      .select('id, task_name, assigned_to_name, due_date')
      .lt('due_date', today)
      .not('status', 'in', '("complete","paused")');

    // 4. Stale tasks (no update in 7+ days)
    const { count: staleCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .lt('updated_at', weekAgo.toISOString())
      .not('status', 'in', '("complete","paused")');

    // 5. Tasks in progress
    const { count: inProgressCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'in_progress');

    // 6. Per-member completion stats
    const memberStats = new Map<string, number>();
    for (const t of completedThisWeek || []) {
      const name = t.assigned_to_name || 'Unassigned';
      memberStats.set(name, (memberStats.get(name) || 0) + 1);
    }

    // Build report message
    const completedCount = completedThisWeek?.length || 0;
    const overdueCount = overdueTasks?.length || 0;

    const lines = [
      `📊 <b>Weekly Task Report</b>`,
      `<i>${weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</i>`,
      ``,
      `✅ Completed: <b>${completedCount}</b>`,
      `📝 Created: <b>${createdCount || 0}</b>`,
      `🔄 In Progress: <b>${inProgressCount || 0}</b>`,
      `⚠️ Overdue: <b>${overdueCount}</b>`,
      `🕰 Stale (7d+): <b>${staleCount || 0}</b>`,
    ];

    if (memberStats.size > 0) {
      lines.push(``, `<b>Completed by Member:</b>`);
      const sorted = [...memberStats.entries()].sort((a, b) => b[1] - a[1]);
      for (const [name, count] of sorted) {
        lines.push(`  • ${name}: ${count}`);
      }
    }

    if (overdueCount > 0 && overdueTasks) {
      lines.push(``, `<b>Overdue Tasks:</b>`);
      for (const t of overdueTasks.slice(0, 10)) {
        const daysOverdue = Math.ceil(
          (now.getTime() - new Date(t.due_date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
        );
        lines.push(`  • ${t.task_name} (${t.assigned_to_name || 'Unassigned'}, ${daysOverdue}d)`);
      }
      if (overdueCount > 10) {
        lines.push(`  ... and ${overdueCount - 10} more`);
      }
    }

    const message = lines.join('\n');

    try {
      await TelegramService.sendMessage(message, 'HTML');
    } catch (err) {
      console.error('Failed to send weekly report:', err);
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      completed: completedCount,
      created: createdCount || 0,
      overdue: overdueCount,
      stale: staleCount || 0,
      inProgress: inProgressCount || 0,
    });
  } catch (error: any) {
    console.error('Weekly report error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
