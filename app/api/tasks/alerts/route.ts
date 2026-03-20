import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';

/**
 * Daily 9 AM cron: sends overdue task notifications to each user via TG.
 * Also notifies assignees of stale tasks (no update in 7+ days).
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
    const today = new Date().toISOString().split('T')[0];

    // 1. Get all overdue tasks (due_date < today, not complete/paused)
    const { data: overdueTasks } = await supabase
      .from('tasks')
      .select('id, task_name, assigned_to, assigned_to_name, due_date')
      .lt('due_date', today)
      .not('status', 'in', '("complete","paused")');

    // 2. Get stale tasks (updated_at > 7 days ago, not complete/paused)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: staleTasks } = await supabase
      .from('tasks')
      .select('id, task_name, assigned_to, assigned_to_name, updated_at')
      .lt('updated_at', sevenDaysAgo.toISOString())
      .not('status', 'in', '("complete","paused")');

    // 3. Get user telegram IDs
    const userIds = new Set<string>();
    for (const t of overdueTasks || []) {
      if (t.assigned_to) userIds.add(t.assigned_to);
    }
    for (const t of staleTasks || []) {
      if (t.assigned_to) userIds.add(t.assigned_to);
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, telegram_id')
      .in('id', Array.from(userIds));

    const tgMap = new Map<string, string>();
    for (const p of profiles || []) {
      if (p.telegram_id) tgMap.set(p.id, p.telegram_id);
    }

    // 4. Group overdue tasks by user
    const overdueByUser = new Map<string, typeof overdueTasks>();
    for (const task of overdueTasks || []) {
      if (!task.assigned_to) continue;
      const existing = overdueByUser.get(task.assigned_to) || [];
      existing.push(task);
      overdueByUser.set(task.assigned_to, existing);
    }

    // 5. Group stale tasks by user
    const staleByUser = new Map<string, typeof staleTasks>();
    for (const task of staleTasks || []) {
      if (!task.assigned_to) continue;
      const existing = staleByUser.get(task.assigned_to) || [];
      existing.push(task);
      staleByUser.set(task.assigned_to, existing);
    }

    let notificationsSent = 0;

    // 6. Send notifications per user
    for (const userId of userIds) {
      const chatId = tgMap.get(userId);
      if (!chatId) continue;

      const userOverdue = overdueByUser.get(userId) || [];
      const userStale = staleByUser.get(userId) || [];

      if (userOverdue.length === 0 && userStale.length === 0) continue;

      let message = '';

      if (userOverdue.length > 0) {
        message += `⚠️ <b>Overdue Tasks (${userOverdue.length})</b>\n`;
        for (const t of userOverdue) {
          const daysOverdue = Math.ceil(
            (new Date().getTime() - new Date(t.due_date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
          );
          message += `• ${t.task_name} (${daysOverdue}d overdue)\n`;
        }
        message += '\n';
      }

      if (userStale.length > 0) {
        message += `🕰 <b>Stale Tasks (${userStale.length})</b>\n`;
        for (const t of userStale) {
          const daysSinceUpdate = Math.ceil(
            (Date.now() - new Date(t.updated_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          message += `• ${t.task_name} (no update in ${daysSinceUpdate}d)\n`;
        }
      }

      try {
        await TelegramService.sendToChat(chatId, message, 'HTML');
        notificationsSent++;
      } catch (err) {
        console.error(`Failed to send TG alert to user ${userId}:`, err);
      }
    }

    // 7. Also send summary to ops chat
    const totalOverdue = overdueTasks?.length || 0;
    const totalStale = staleTasks?.length || 0;

    if (totalOverdue > 0 || totalStale > 0) {
      const summary = [
        `📋 <b>Daily Task Alert Summary</b>`,
        ``,
        `⚠️ Overdue tasks: <b>${totalOverdue}</b>`,
        `🕰 Stale tasks: <b>${totalStale}</b>`,
        `📨 Notifications sent: <b>${notificationsSent}</b>`,
      ].join('\n');

      try {
        await TelegramService.sendMessage(summary, 'HTML');
      } catch (err) {
        console.error('Failed to send ops summary:', err);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      overdueTasks: totalOverdue,
      staleTasks: totalStale,
      notificationsSent,
    });
  } catch (error: any) {
    console.error('Alert cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
