import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/prospects/funding — Fetch funding radar data
 * Query: ?filter=all|korean_vc|recent|not_in_pipeline
 * Query: ?limit=50
 * Query: ?search=name
 */
export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const limit = parseInt(searchParams.get('limit') || '100');
    const search = searchParams.get('search') || '';

    // Fetch funded prospects
    let query = supabase
      .from('prospects')
      .select('id, name, symbol, category, market_cap, price, logo_url, source_url, source, status, website_url, twitter_url, telegram_url, funding_total, funding_round, last_funding_date, investors, has_korean_vc, icp_score, korea_relevancy_score')
      .not('funding_total', 'is', null)
      .gt('funding_total', 0)
      .order('funding_total', { ascending: false })
      .limit(limit);

    if (filter === 'korean_vc') {
      query = query.eq('has_korean_vc', true);
    } else if (filter === 'not_in_pipeline') {
      query = query.neq('status', 'promoted');
    } else if (filter === 'recent') {
      // Sort by detection date instead
      query = query.order('updated_at', { ascending: false });
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data: prospects, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch recent funding rounds
    const { data: recentRounds } = await supabase
      .from('funding_rounds')
      .select('*, prospects(name, symbol, logo_url, status)')
      .order('detected_at', { ascending: false })
      .limit(50);

    // Stats
    const { data: stats } = await supabase
      .from('prospects')
      .select('has_korean_vc, status, funding_total')
      .not('funding_total', 'is', null)
      .gt('funding_total', 0);

    const totalFunded = (stats || []).length;
    const koreanVcCount = (stats || []).filter((s: any) => s.has_korean_vc).length;
    const notInPipeline = (stats || []).filter((s: any) => s.status !== 'promoted').length;
    const totalRaised = (stats || []).reduce((sum: number, s: any) => sum + (Number(s.funding_total) || 0), 0);

    return NextResponse.json({
      prospects: prospects || [],
      recent_rounds: recentRounds || [],
      stats: {
        total_funded: totalFunded,
        korean_vc_count: koreanVcCount,
        not_in_pipeline: notInPipeline,
        total_raised: totalRaised,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
