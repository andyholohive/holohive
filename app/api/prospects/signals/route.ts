import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/prospects/signals — Fetch signals for a prospect or recent signals
 * Query: ?prospect_id=xxx — signals for a specific prospect
 * Query: ?recent=true&limit=50 — most recent signals across all prospects
 */
export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const prospectId = searchParams.get('prospect_id');
    const recent = searchParams.get('recent') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    if (prospectId) {
      // Get signals for a specific prospect
      const { data, error } = await supabase
        .from('prospect_signals')
        .select('*')
        .eq('prospect_id', prospectId)
        .order('relevancy_weight', { ascending: false })
        .order('detected_at', { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ signals: data || [] });
    }

    if (recent) {
      // Get most recent signals with prospect info
      const { data, error } = await supabase
        .from('prospect_signals')
        .select('*, prospects(name, symbol, logo_url, category)')
        .eq('is_active', true)
        .order('detected_at', { ascending: false })
        .limit(limit);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ signals: data || [] });
    }

    // Get signal summary stats (only active, non-expired signals)
    const { data: stats } = await supabase
      .from('prospect_signals')
      .select('signal_type, source_name')
      .eq('is_active', true);

    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const s of stats || []) {
      if (s.signal_type) byType[s.signal_type] = (byType[s.signal_type] || 0) + 1;
      if (s.source_name) bySource[s.source_name] = (bySource[s.source_name] || 0) + 1;
    }

    // Get prospects with highest korea scores
    const { data: topProspects } = await supabase
      .from('prospects')
      .select('id, name, symbol, category, market_cap, korea_relevancy_score, korea_signal_count, logo_url, source, status')
      .gt('korea_relevancy_score', 0)
      .order('korea_relevancy_score', { ascending: false })
      .limit(30);

    // Enrich each prospect with its signal types for frontend filtering
    const prospectIds = (topProspects || []).map((p: any) => p.id);
    let prospectSignalTypes: Record<string, string[]> = {};
    if (prospectIds.length > 0) {
      const { data: signalTypeData } = await supabase
        .from('prospect_signals')
        .select('prospect_id, signal_type')
        .in('prospect_id', prospectIds)
        .eq('is_active', true);

      for (const s of signalTypeData || []) {
        const pid = s.prospect_id as string;
        if (!pid) continue;
        if (!prospectSignalTypes[pid]) prospectSignalTypes[pid] = [];
        if (!prospectSignalTypes[pid].includes(s.signal_type)) {
          prospectSignalTypes[pid].push(s.signal_type);
        }
      }
    }

    const enrichedProspects = (topProspects || []).map((p: any) => ({
      ...p,
      signal_types: prospectSignalTypes[p.id] || [],
      has_intent_signals: (prospectSignalTypes[p.id] || []).some((t: string) => t.startsWith('korea_intent_')),
    }));

    return NextResponse.json({
      total_signals: (stats || []).length,
      by_type: byType,
      by_source: bySource,
      top_prospects: enrichedProspects,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
