import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mindshare/channels/import
 *
 * Body: { text: string, language?: 'ko' | 'en' | string }
 *
 * Bulk-add Korean Telegram channels by pasting one line per entry.
 * Parses each line as either:
 *   @username
 *   https://t.me/username
 *   t.me/username
 *   "Display Name @username"
 *
 * Skips dupes against existing channel_username. New rows default to
 * is_active=true and language='ko'.
 *
 * Admin-gated.
 */
export async function POST(request: Request) {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } }
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await (sb as any).from('users').select('role').eq('id', user.id).single();
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const text: string = body?.text || '';
  const language: string = body?.language || 'ko';
  if (!text.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });

  // Parse one entry per non-empty line.
  // Extract username (first @-prefixed handle or t.me/<handle>).
  // Use the rest of the line (without the URL/handle) as channel_name
  // when present; fallback to the username itself.
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsed: { username: string; name: string }[] = [];
  for (const line of lines) {
    const handleMatch = line.match(/(?:@|t\.me\/)([A-Za-z0-9_]{4,})/);
    if (!handleMatch) continue;
    const username = handleMatch[1];
    // Strip the matched URL/handle from the line; the remainder is the
    // human-readable name. Trim quotes/dashes/colons for cleanliness.
    let name = line.replace(handleMatch[0], '').replace(/^[\s"'\-:|]+|[\s"'\-:|]+$/g, '').trim();
    if (!name) name = username;
    parsed.push({ username, name });
  }

  if (parsed.length === 0) {
    return NextResponse.json({ error: 'No valid entries found. Use @username, t.me/username, or one per line.' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Skip dupes — check existing usernames first
  const { data: existing } = await (supabase as any)
    .from('tg_monitored_channels')
    .select('channel_username')
    .in('channel_username', parsed.map(p => p.username));
  const existingSet = new Set<string>(((existing || []) as any[]).map(e => e.channel_username));

  const toInsert = parsed
    .filter(p => !existingSet.has(p.username))
    .map(p => ({
      channel_name: p.name,
      channel_username: p.username,
      language,
      is_active: true,
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: parsed.length, parsed: parsed.length });
  }

  const { error } = await (supabase as any)
    .from('tg_monitored_channels')
    .insert(toInsert);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    inserted: toInsert.length,
    skipped: existingSet.size,
    parsed: parsed.length,
  });
}
