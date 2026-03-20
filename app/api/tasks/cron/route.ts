import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

/**
 * Daily cron safety net for recurring tasks.
 * Generates any missed recurring instances and evaluates stale tasks.
 *
 * Secured by CRON_SECRET header check.
 */
export async function GET(request: Request) {
  // Verify cron secret
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

  const results: Record<string, any> = {};

  try {
    // 1. Generate missed recurring instances
    const { data: completedRecurring } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'complete')
      .not('recurring_config', 'is', null);

    let recurringGenerated = 0;

    for (const task of completedRecurring || []) {
      const config = task.recurring_config as any;
      if (!config?.frequency) continue;

      const nextDueDate = calculateNextDueDate(task.due_date, config);
      if (config.end_date && nextDueDate > config.end_date) continue;

      // Check if next instance already exists
      const { data: anyPending } = await supabase
        .from('tasks')
        .select('id')
        .eq('task_name', task.task_name)
        .neq('status', 'complete')
        .not('recurring_config', 'is', null)
        .limit(1);

      if (anyPending && anyPending.length > 0) continue;

      // Clone the task
      await supabase.from('tasks').insert({
        task_name: task.task_name,
        assigned_to: task.assigned_to,
        assigned_to_name: task.assigned_to_name,
        due_date: nextDueDate,
        frequency: task.frequency,
        task_type: task.task_type,
        link: task.link,
        description: task.description,
        status: 'to_do',
        priority: task.priority,
        client_id: task.client_id,
        parent_task_id: task.parent_task_id,
        recurring_config: task.recurring_config,
        created_by: task.created_by,
        created_by_name: task.created_by_name,
      });

      // Log the action
      await supabase.from('task_automation_logs').insert({
        task_id: task.id,
        action_taken: 'recurring_clone',
        details: { next_due_date: nextDueDate, source_task_id: task.id },
      });

      recurringGenerated++;
    }

    results.recurringGenerated = recurringGenerated;

    // 2. Count stale tasks (updated_at > 7 days, not complete/paused)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count: staleCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .lt('updated_at', sevenDaysAgo.toISOString())
      .not('status', 'in', '("complete","paused")');

    results.staleTaskCount = staleCount || 0;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results,
    });
  } catch (error: any) {
    console.error('Cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function calculateNextDueDate(currentDueDate: string | null, config: any): string {
  const base = currentDueDate ? new Date(currentDueDate + 'T00:00:00') : new Date();

  switch (config.frequency) {
    case 'daily':
      base.setDate(base.getDate() + 1);
      break;
    case 'weekly':
      base.setDate(base.getDate() + 7);
      if (config.day_of_week !== undefined) {
        const diff = (config.day_of_week - base.getDay() + 7) % 7;
        if (diff > 0) base.setDate(base.getDate() + diff);
      }
      break;
    case 'monthly':
      base.setMonth(base.getMonth() + 1);
      if (config.day_of_month) {
        const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        base.setDate(Math.min(config.day_of_month, lastDay));
      }
      break;
  }

  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
