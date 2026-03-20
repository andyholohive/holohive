import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mindshare — Ingest a mention from a TG bot or external source.
 * Body: { client_id, channel_id?, message_text, translated_text?, sentiment?, matched_keyword, message_date? }
 *
 * GET /api/mindshare?client_id=xxx — Get weekly summary for a client.
 *
 * Secured by CRON_SECRET.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function checkAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { client_id, channel_id, message_text, translated_text, sentiment, matched_keyword, message_date } = body;

    if (!client_id || !matched_keyword) {
      return NextResponse.json({ error: 'client_id and matched_keyword are required' }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data, error } = await supabase.from('tg_mentions').insert({
      client_id,
      channel_id: channel_id || null,
      message_text: message_text || null,
      translated_text: translated_text || null,
      sentiment: sentiment || 'neutral',
      matched_keyword,
      message_date: message_date || new Date().toISOString(),
    }).select().single();

    if (error) throw error;

    return NextResponse.json({ success: true, mention: data });
  } catch (error: any) {
    console.error('Mindshare ingest error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');

  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }

  const supabase = getSupabase();

  try {
    const [{ data: weekly }, { data: config }, { count: totalMentions }] = await Promise.all([
      supabase
        .from('client_mindshare_weekly')
        .select('*')
        .eq('client_id', clientId)
        .order('week_number', { ascending: true }),
      supabase
        .from('client_mindshare_config')
        .select('*')
        .eq('client_id', clientId)
        .single(),
      supabase
        .from('tg_mentions')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId),
    ]);

    return NextResponse.json({
      config,
      weekly: weekly || [],
      totalMentions: totalMentions || 0,
    });
  } catch (error: any) {
    console.error('Mindshare fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
