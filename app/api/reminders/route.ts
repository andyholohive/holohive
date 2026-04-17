import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reminders — List all reminder rules (with optional recent logs)
 */
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: rules, error } = await supabase
      .from('reminder_rules' as any)
      .select('*')
      .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Get recent logs for each rule (last run)
    const ruleIds = (rules || []).map((r: any) => r.id);
    let logsMap: Record<string, any[]> = {};

    if (ruleIds.length > 0) {
      const { data: logs } = await supabase
        .from('reminder_logs' as any)
        .select('*')
        .in('rule_id', ruleIds)
        .order('run_at', { ascending: false })
        .limit(50);

      for (const log of (logs || []) as any[]) {
        if (!logsMap[log.rule_id]) logsMap[log.rule_id] = [];
        if (logsMap[log.rule_id].length < 5) logsMap[log.rule_id].push(log);
      }
    }

    const enriched = (rules || []).map((r: any) => ({
      ...r,
      recent_logs: logsMap[r.id] || [],
    }));

    return NextResponse.json({ rules: enriched });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/reminders — Create a new reminder rule
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { name, rule_type, description, telegram_chat_id, telegram_thread_id, schedule_type, params } = body;

    if (!name || !rule_type || !telegram_chat_id) {
      return NextResponse.json({ error: 'name, rule_type, and telegram_chat_id are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('reminder_rules' as any)
      .insert({
        name,
        rule_type,
        description: description || null,
        telegram_chat_id,
        telegram_thread_id: telegram_thread_id || null,
        schedule_type: schedule_type || 'daily',
        params: params || {},
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rule: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/reminders — Update an existing reminder rule
 * Body: { id, ...fields }
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Only allow updating specific fields
    const allowed: Record<string, any> = {};
    const allowedFields = ['name', 'description', 'telegram_chat_id', 'telegram_thread_id', 'schedule_type', 'params', 'is_active'];
    for (const key of allowedFields) {
      if (key in updates) allowed[key] = updates[key];
    }
    allowed.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('reminder_rules' as any)
      .update(allowed)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rule: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/reminders — Delete a reminder rule
 * Body: { id }
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { error } = await supabase
      .from('reminder_rules' as any)
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
