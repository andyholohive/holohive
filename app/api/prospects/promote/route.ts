import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Allowed sales-pipeline stages a discovery prospect can be promoted into.
 * Mirrors PIPELINE_STAGES in lib/salesPipelineService.ts. We validate
 * server-side so the UI can't hand us an invalid stage and we don't have
 * to trust the client.
 */
const ALLOWED_PROMOTE_STAGES = [
  'cold_dm', 'warm', 'tg_intro', 'booked', 'discovery_done',
  'proposal_call', 'v2_contract', 'v2_closed_won',
] as const;
type PromoteStage = typeof ALLOWED_PROMOTE_STAGES[number];

/**
 * POST /api/prospects/promote — Promote prospect(s) to pipeline opportunities
 * Body: { id: string, stage?: string } — single promote
 * Body: { ids: string[], stage?: string } — bulk promote (all get same stage)
 *
 * `stage` is the target sales-pipeline stage. Defaults to 'cold_dm' for
 * backward compatibility (the original behavior). Validated against
 * ALLOWED_PROMOTE_STAGES — anything else returns 400.
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

    // Validate stage (if provided). Default to cold_dm to match the
    // original endpoint behavior so existing callers don't break.
    const stage: PromoteStage = body.stage ?? 'cold_dm';
    if (!ALLOWED_PROMOTE_STAGES.includes(stage)) {
      return NextResponse.json(
        { error: `Invalid stage '${stage}'. Allowed: ${ALLOWED_PROMOTE_STAGES.join(', ')}` },
        { status: 400 },
      );
    }

    // Bulk promote
    if (body.ids && Array.isArray(body.ids)) {
      let promoted = 0, errors = 0;
      for (const id of body.ids) {
        try {
          await promoteSingle(supabase, id, user.id, stage);
          promoted++;
        } catch {
          errors++;
        }
      }
      return NextResponse.json({ promoted, errors, stage });
    }

    // Single promote
    if (body.id) {
      const oppId = await promoteSingle(supabase, body.id, user.id, stage);
      return NextResponse.json({ success: true, opportunity_id: oppId, stage });
    }

    return NextResponse.json({ error: 'id or ids required' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Promote a single prospect to a pipeline opportunity using the server client.
 * `stage` is the target sales-pipeline stage (validated by the caller).
 */
async function promoteSingle(supabase: any, prospectId: string, ownerId: string, stage: PromoteStage): Promise<string> {
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
      stage,
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
