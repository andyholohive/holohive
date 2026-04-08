import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/prospects — Fetch prospects with pagination and filters
 * Query: ?page=1&pageSize=50&status=new&category=DeFi&search=monad&sortBy=market_cap&sortAsc=false
 */
export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const status = searchParams.get('status') || undefined;
    const category = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;
    const sortBy = searchParams.get('sortBy') || 'scraped_at';
    const sortAsc = searchParams.get('sortAsc') === 'true';

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('prospects')
      .select('*', { count: 'exact' });

    if (status && status !== 'all') {
      if (status === 'new') {
        query = query.or('status.eq.new,status.is.null');
      } else if (status === 'needs_review') {
        query = query.eq('status', 'needs_review');
      } else {
        query = query.eq('status', status);
      }
    }
    if (category) query = query.eq('category', category);
    if (search) query = query.ilike('name', `%${search}%`);

    query = query.order(sortBy, { ascending: sortAsc }).range(from, to);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Also fetch categories and status counts
    const [catRes, statusRes] = await Promise.all([
      supabase.from('prospects').select('category').not('category', 'is', null),
      supabase.from('prospects').select('status'),
    ]);
    const categories = [...new Set((catRes.data || []).map(d => d.category).filter(Boolean))].sort();
    const statusCounts: Record<string, number> = {};
    (statusRes.data || []).forEach(d => {
      const s = d.status || 'new'; // Treat null as 'new'
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    return NextResponse.json({ data: data || [], count: count || 0, categories, statusCounts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
