import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { callClaude } from '@/lib/claude';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function checkAdmin() {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } }
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const, status: 401, msg: 'Unauthorized' };
  const { data: profile } = await (sb as any).from('users').select('role').eq('id', user.id).single();
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return { ok: false as const, status: 403, msg: 'Admin only' };
  }
  return { ok: true as const };
}

const SYSTEM_PROMPT = `You are helping build a Korean crypto mindshare tracker. Given a project name, return the exact substrings that should trigger a match against Korean-language Telegram messages.

Rules:
- Include the official project name (case as usually written)
- Include the official token ticker in ALL CAPS if it exists
- Include the Korean transliteration (한글 spelling) — this is critical
- Include common English variants (e.g. "eth", "bitcoin")
- DO NOT include ambiguous 2-letter tickers alone if they'd match unrelated words (e.g. "ON", "IN")
- DO NOT include emoji or special chars
- 3-6 keywords per project is the target
- If the project is unknown or fictional, return a best-guess based on the name

Respond with ONLY a JSON object of shape {"keywords": ["...", "..."]} — no prose, no markdown fences.`;

export async function POST(request: Request) {
  const auth = await checkAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const category = typeof body?.category === 'string' ? body.category.trim() : '';
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const userPrompt = category
    ? `Project: ${name}\nCategory: ${category}`
    : `Project: ${name}`;

  try {
    const res = await callClaude(
      [SYSTEM_PROMPT],
      userPrompt,
      { model: 'claude-haiku-4-5', maxTokens: 300, temperature: 0.2 }
    );
    const raw = res.content.trim();
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd < 0) {
      return NextResponse.json({ error: 'model returned non-JSON', raw }, { status: 500 });
    }
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    const keywords = Array.isArray(parsed?.keywords)
      ? parsed.keywords.filter((k: unknown) => typeof k === 'string' && k.trim().length > 0)
      : [];
    return NextResponse.json({ keywords, cost_usd: res.cost_usd });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'suggestion failed' }, { status: 500 });
  }
}
