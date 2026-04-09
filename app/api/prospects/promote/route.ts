import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/prospects/promote — Promote prospect(s) to pipeline opportunities
 * Body: { id: string } — single promote
 * Body: { ids: string[] } — bulk promote
 *
 * Uses server-side Supabase client directly (not ProspectsService)
 * to avoid browser-client auth issues in API routes.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    // Bulk promote
    if (body.ids && Array.isArray(body.ids)) {
      let promoted = 0, errors = 0;
      for (const id of body.ids) {
        try {
          await promoteSingle(supabase, id, user.id);
          promoted++;
        } catch {
          errors++;
        }
      }
      return NextResponse.json({ promoted, errors });
    }

    // Single promote
    if (body.id) {
      const oppId = await promoteSingle(supabase, body.id, user.id);
      return NextResponse.json({ success: true, opportunity_id: oppId });
    }

    return NextResponse.json({ error: 'id or ids required' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Promote a single prospect to a pipeline opportunity using the server client.
 */
async function promoteSingle(supabase: any, prospectId: string, ownerId: string): Promise<string> {
  // 1. Fetch the prospect
  const { data: prospect, error: fetchError } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', prospectId)
    .single();

  if (fetchError || !prospect) {
    throw new Error(`Prospect not found (id: ${prospectId})`);
  }
  if (prospect.status === 'promoted') {
    throw new Error('Already promoted');
  }

  // 2. Create opportunity in crm_opportunities
  const notes = [
    prospect.category ? `Category: ${prospect.category}` : '',
    prospect.market_cap ? `Market Cap: $${Number(prospect.market_cap).toLocaleString()}` : '',
    prospect.symbol ? `Symbol: ${prospect.symbol}` : '',
    prospect.source_url ? `Source: ${prospect.source_url}` : '',
    prospect.korea_relevancy_score ? `Korea Relevancy Score: ${prospect.korea_relevancy_score}` : '',
  ].filter(Boolean).join('\n');

  const { data: opp, error: oppError } = await supabase
    .from('crm_opportunities')
    .insert({
      name: prospect.name,
      stage: 'cold_dm',
      source: `scraped_${prospect.source}`,
      website_url: prospect.website_url || null,
      owner_id: ownerId,
      notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (oppError) {
    throw new Error(`Failed to create opportunity: ${oppError.message}`);
  }

  // 3. Mark prospect as promoted
  await supabase
    .from('prospects')
    .update({
      status: 'promoted',
      promoted_opportunity_id: opp.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', prospectId);

  return opp.id;
}

/**
 * PATCH /api/prospects/promote — Dismiss or update status
 * Body: { id: string, status: 'dismissed' | 'reviewed' | 'new' }
 * Body: { ids: string[], status: 'dismissed' }
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const status = body.status;

    if (body.ids && Array.isArray(body.ids) && status) {
      const { error } = await supabase
        .from('prospects')
        .update({ status, updated_at: new Date().toISOString() })
        .in('id', body.ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, updated: body.ids.length });
    }

    if (body.id && status) {
      const { error } = await supabase
        .from('prospects')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/prospects/promote — Delete prospect(s)
 * Body: { id: string } — single delete
 * Body: { ids: string[] } — bulk delete
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const ids = body.ids || (body.id ? [body.id] : []);

    if (ids.length === 0) {
      return NextResponse.json({ error: 'id or ids required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('prospects')
      .delete()
      .in('id', ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
