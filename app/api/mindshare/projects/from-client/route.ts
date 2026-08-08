import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { callClaude } from '@/lib/claude';
import { runMindshareScan } from '@/lib/mindshareScanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/mindshare/projects/from-client
 *
 * Body: { client_id: string, name: string }
 *
 * One call, three steps: suggest keywords for the client's name, create the
 * mindshare project linked to that client, and backfill it against the whole
 * archive. Called from the Add Client flow so a new client starts with
 * mindshare tracking instead of someone remembering to set it up on
 * /mindshare weeks later. [2026-08-09]
 *
 * Returns enough for the caller to SHOW what it did — keywords and the
 * mention count — rather than silently doing it. A wrong keyword set is the
 * likely failure here, and it's only correctable if it's visible.
 *
 * Idempotent: if the client already has a project, returns it untouched with
 * already_existed: true.
 *
 * Auth: signed-in admin | super_admin (same gate as the rest of /api/mindshare).
 */

const SYSTEM_PROMPT = `You are helping build a Korean crypto mindshare tracker. Given a project name, return the exact substrings that should trigger a match against Korean-language Telegram messages.

Rules:
- Include the official project name (case as usually written)
- Include the official token ticker in ALL CAPS if it exists
- Include the Korean transliteration (한글 spelling) — this is critical
- Include common English variants (e.g. "eth", "bitcoin")
- Prefer SHORT single tokens. Multi-word phrases like "TRUMP token" or "base chain" almost never appear verbatim in chat and match nothing.
- DO NOT include ambiguous 2-letter tickers alone if they'd match unrelated words (e.g. "ON", "IN")
- DO NOT include emoji or special chars
- 3-6 keywords per project is the target
- If the project is unknown or fictional, return a best-guess based on the name

Respond with ONLY a JSON object of shape {"keywords": ["...", "..."]} — no prose, no markdown fences.`;

export async function POST(request: Request) {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } },
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await (sb as any).from('users').select('role').eq('id', user.id).single();
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const clientId = typeof body?.client_id === 'string' ? body.client_id : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!clientId || !name) {
    return NextResponse.json({ error: 'client_id and name are required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    // Don't create a second project for a client that already has one — the
    // Add Client flow can be re-run against an existing client.
    const { data: existing } = await (supabase as any)
      .from('mindshare_projects')
      .select('id, name, tracked_keywords')
      .eq('client_id', clientId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        ok: true,
        already_existed: true,
        project: existing,
        keywords: existing.tracked_keywords || [],
        mentions_added: 0,
      });
    }

    // 1. Suggest keywords. A failure here is not fatal — fall back to the
    //    bare client name so the project still exists and is editable.
    let keywords: string[] = [];
    let keywordSource: 'ai' | 'fallback' = 'ai';
    try {
      const res = await callClaude([SYSTEM_PROMPT], `Project: ${name}`, {
        model: 'claude-haiku-4-5', maxTokens: 300, temperature: 0.2,
      });
      const raw = res.content.trim();
      const s = raw.indexOf('{');
      const e = raw.lastIndexOf('}');
      if (s >= 0 && e >= 0) {
        const parsed = JSON.parse(raw.slice(s, e + 1));
        keywords = Array.isArray(parsed?.keywords)
          ? parsed.keywords.filter((k: unknown) => typeof k === 'string' && k.trim().length > 0)
          : [];
      }
    } catch (err) {
      console.error('[mindshare/from-client] keyword suggestion failed', err);
    }
    if (keywords.length === 0) {
      keywords = [name];
      keywordSource = 'fallback';
    }

    // 2. Create the project, linked to the client.
    const { data: project, error: insErr } = await (supabase as any)
      .from('mindshare_projects')
      .insert({
        name,
        client_id: clientId,
        tracked_keywords: keywords,
        is_active: true,
      })
      .select('id, name, tracked_keywords')
      .single();
    if (insErr) throw new Error(insErr.message);

    // 3. Backfill against the archive. Scoped, so the shared scan watermark
    //    stays put — see runMindshareScan's `projectIds` option.
    let cursor: string | null = null;
    let mentionsAdded = 0;
    let scanned = 0;
    for (let page = 0; page < 12; page++) {
      const r = await runMindshareScan(supabase, { projectIds: [project.id], pulledAfter: cursor });
      mentionsAdded += r.mentions_added;
      scanned += r.messages_scanned;
      if (!r.watermark_advanced_to) break;
      cursor = r.watermark_advanced_to;
    }

    return NextResponse.json({
      ok: true,
      already_existed: false,
      project,
      keywords,
      keyword_source: keywordSource,
      mentions_added: mentionsAdded,
      posts_scanned: scanned,
    });
  } catch (err: any) {
    console.error('[mindshare/from-client] error:', err);
    return NextResponse.json({ error: err?.message || 'failed' }, { status: 500 });
  }
}
