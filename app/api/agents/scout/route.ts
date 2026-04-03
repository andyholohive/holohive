import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { ScoutAgent } from '@/lib/agents/scoutAgent';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/agents/scout — Qualify a prospect
 * Body: { url: string } — qualify by URL
 * Body: { company_name: string } — qualify by name
 * Optional: { auto_create: boolean } — create opportunity if qualified (default: false)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.url && !body.company_name) {
      return NextResponse.json({ error: 'Either url or company_name is required' }, { status: 400 });
    }

    const agent = new ScoutAgent();
    const result = await agent.run(body, 'on_demand', user.id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('SCOUT API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
