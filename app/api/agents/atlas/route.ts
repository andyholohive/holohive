import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { AtlasAgent } from '@/lib/agents/atlasAgent';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/agents/atlas — Score an opportunity (on-demand)
 * Body: { opportunity_id: string } — score a single opportunity
 * Body: { batch: true, stages?: string[] } — score all opportunities in given stages
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const agent = new AtlasAgent();
    const result = await agent.run(body, 'on_demand', user.id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('ATLAS API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
