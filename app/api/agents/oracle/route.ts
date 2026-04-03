import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { OracleAgent } from '@/lib/agents/oracleAgent';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/agents/oracle — Generate a call brief / deep research
 * Body: { opportunity_id: string, call_type?: 'DISCOVERY' | 'FOLLOW_UP' | 'PROPOSAL' }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.opportunity_id) {
      return NextResponse.json({ error: 'opportunity_id is required' }, { status: 400 });
    }

    const agent = new OracleAgent();
    const result = await agent.run(body, 'on_demand', user.id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('ORACLE API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
