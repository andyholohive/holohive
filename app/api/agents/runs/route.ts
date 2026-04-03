import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/runs — Fetch recent agent run history
 * Query params: ?limit=20&agent=RADAR&status=completed
 */
export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const agent = searchParams.get('agent');
    const status = searchParams.get('status');

    let query = supabase
      .from('agent_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (agent) {
      query = query.eq('agent_name', agent);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching agent runs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ runs: data || [] });
  } catch (error: any) {
    console.error('Agent runs API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/agents/runs/stats — Aggregate stats (cost, token usage, success rate)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'stats') {
      // Get aggregate stats for dashboard
      const { data: runs, error } = await supabase
        .from('agent_runs')
        .select('agent_name, status, duration_ms, tokens_used, cost_usd, started_at')
        .order('started_at', { ascending: false })
        .limit(200);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const stats = {
        total_runs: runs?.length || 0,
        completed: runs?.filter(r => r.status === 'completed').length || 0,
        failed: runs?.filter(r => r.status === 'failed').length || 0,
        running: runs?.filter(r => r.status === 'running').length || 0,
        total_tokens: runs?.reduce((sum, r) => sum + (r.tokens_used || 0), 0) || 0,
        total_cost_usd: runs?.reduce((sum, r) => sum + parseFloat(r.cost_usd || '0'), 0) || 0,
        avg_duration_ms: runs?.length
          ? Math.round(runs.reduce((sum, r) => sum + (r.duration_ms || 0), 0) / runs.length)
          : 0,
        by_agent: {} as Record<string, { runs: number; completed: number; failed: number; cost: number }>,
      };

      // Group by agent
      for (const run of runs || []) {
        if (!stats.by_agent[run.agent_name]) {
          stats.by_agent[run.agent_name] = { runs: 0, completed: 0, failed: 0, cost: 0 };
        }
        stats.by_agent[run.agent_name].runs++;
        if (run.status === 'completed') stats.by_agent[run.agent_name].completed++;
        if (run.status === 'failed') stats.by_agent[run.agent_name].failed++;
        stats.by_agent[run.agent_name].cost += parseFloat(run.cost_usd || '0');
      }

      return NextResponse.json({ stats });
    }

    if (action === 'handoffs') {
      // Get pending handoffs
      const { data: handoffs, error } = await supabase
        .from('agent_handoffs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ handoffs: handoffs || [] });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Agent runs API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
