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

    if (status && status !== 'all') query = query.eq('status', status);
    if (category) query = query.eq('category', category);
    if (search) query = query.ilike('name', `%${search}%`);

    query = query.order(sortBy, { ascending: sortAsc }).range(from, to);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Also fetch categories for filter dropdown
    const { data: catData } = await supabase
      .from('prospects')
      .select('category')
      .not('category', 'is', null);
    const categories = [...new Set((catData || []).map(d => d.category).filter(Boolean))].sort();

    return NextResponse.json({ data: data || [], count: count || 0, categories });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
