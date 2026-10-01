/**
 * Korean crypto headlines for a client's portal News tab.
 *
 * Reads TokenPost and BlockMedia RSS live (cached by Next for 30 minutes) and
 * keeps headlines that mention the client, a peer, or a Korean exchange
 * listing. Headlines are translated once with Claude and cached in
 * korea_headline_translations, so a portal view never pays for a translation
 * it has already done. If translation is unavailable the Korean headline still
 * shows — an untranslated headline beats a missing one.
 *
 * The prospect scanner that used these feeds (lib/signals/scanners/
 * koreanNewsRSS.ts) stopped producing signals in April; the feeds themselves
 * still respond, which is all this needs.
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getClaudeClient } from '@/lib/claude';

export interface KoreaNewsItem {
  source: string;
  title: string;
  titleEn: string | null;
  link: string;
  published: string | null;
  kind: 'client' | 'peer' | 'market';
  matched: string | null;
}

const FEEDS = [
  { source: 'TokenPost', url: 'https://www.tokenpost.kr/rss' },
  // The trailing-slash URL 301s here; fetch follows it, but go direct.
  { source: 'BlockMedia', url: 'https://www.blockmedia.co.kr/feed' },
];

const MODEL = process.env.KOREA_NEWS_MODEL || 'claude-opus-4-8';

export async function fetchKoreaNews(
  admin: SupabaseClient,
  subject: { name: string; ticker: string; peers: string[] },
): Promise<KoreaNewsItem[]> {
  const items = (await Promise.all(FEEDS.map(readFeed))).flat();
  if (!items.length) return [];

  const clientTerms = await aliases(admin, [subject.name, subject.ticker]);
  const peerTerms = await aliases(admin, subject.peers.map(peerWord));

  const out: KoreaNewsItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.title)) continue;
    const c = firstMatch(it.title, clientTerms);
    const p = c ? null : firstMatch(it.title, peerTerms);
    const market = !c && !p && /(업비트|빗썸)/.test(it.title) && /(상장|원화)/.test(it.title);
    if (!c && !p && !market) continue;
    seen.add(it.title);
    out.push({ ...it, titleEn: null, kind: c ? 'client' : p ? 'peer' : 'market', matched: c ?? p ?? null });
  }
  // Client first, then peers, then a few market headlines; newest first within each.
  const rank = { client: 0, peer: 1, market: 2 } as const;
  out.sort((a, b) => rank[a.kind] - rank[b.kind] || String(b.published).localeCompare(String(a.published)));
  const picked = [
    ...out.filter((o) => o.kind !== 'market').slice(0, 6),
    ...out.filter((o) => o.kind === 'market').slice(0, 3),
  ].slice(0, 8);

  await translate(admin, picked);
  return picked;
}

async function readFeed(f: { source: string; url: string }) {
  try {
    const res = await fetch(f.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (HoloHive Portal)' },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 1800 },
    } as RequestInit & { next: { revalidate: number } });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 60).map((m) => {
      const it = m[1];
      const title = decode(tag(it, 'title'));
      return {
        source: f.source,
        title,
        link: decode(tag(it, 'link')).trim(),
        published: (() => { const d = tag(it, 'pubDate'); const t = Date.parse(d); return Number.isNaN(t) ? null : new Date(t).toISOString(); })(),
      };
    }).filter((x) => x.title);
  } catch {
    return [];
  }
}

/** Name, ticker and the Korean exchange name (e.g. 베니스) for each term. */
async function aliases(admin: SupabaseClient, words: string[]): Promise<string[]> {
  const terms = new Set<string>();
  const clean = words.map((w) => w.trim()).filter((w) => w.length >= 3);
  for (const w of clean) terms.add(w);
  if (clean.length) {
    const ors = clean.flatMap((w) => [`symbol.ilike.${esc(w)}`, `english_name.ilike.${esc(w)}`]).join(',');
    const { data } = await (admin as any).from('korean_exchange_markets').select('korean_name').or(ors).limit(20);
    for (const r of data ?? []) if (r.korean_name && r.korean_name.length >= 2) terms.add(r.korean_name);
  }
  return [...terms];
}

function firstMatch(title: string, terms: string[]): string | null {
  for (const t of terms) {
    // Latin terms match on word boundaries so "VVV" can't hit inside another word;
    // Korean terms match as substrings (no spaces between particles).
    const hit = /[A-Za-z]/.test(t)
      ? new RegExp(`(^|[^A-Za-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9]|$)`, 'i').test(title)
      : title.includes(t);
    if (hit) return t;
  }
  return null;
}

async function translate(admin: SupabaseClient, items: KoreaNewsItem[]) {
  if (!items.length) return;
  const db = admin as any;
  const keyed = items.map((i) => ({ i, hash: createHash('sha1').update(i.title).digest('hex') }));
  const { data: cached } = await db.from('korea_headline_translations').select('hash, en').in('hash', keyed.map((k) => k.hash));
  const hit = new Map((cached ?? []).map((c: any) => [c.hash, c.en]));
  const todo = keyed.filter((k) => !hit.has(k.hash));
  for (const k of keyed) if (hit.has(k.hash)) k.i.titleEn = hit.get(k.hash) as string;
  if (!todo.length || !process.env.ANTHROPIC_API_KEY) return;

  try {
    const res = await getClaudeClient().messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: 'Translate Korean crypto news headlines into plain, natural English. Keep token names and tickers as written. Reply with only a JSON array of strings, one per headline, in the same order.',
      messages: [{ role: 'user', content: JSON.stringify(todo.map((t) => t.i.title)) }],
    });
    const text = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
    if (!Array.isArray(arr) || arr.length !== todo.length) return;
    const rows = todo.map((t, n) => ({ hash: t.hash, ko: t.i.title, en: String(arr[n]).trim() }));
    rows.forEach((r, n) => { todo[n].i.titleEn = r.en; });
    await db.from('korea_headline_translations').upsert(rows, { onConflict: 'hash' });
  } catch {
    // Untranslated headlines still render in Korean.
  }
}

function tag(xml: string, name: string): string {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : '';
}
function decode(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'");
}
/** "render-token" → "Render", "fetch-ai" → "Fetch.ai"-ish search word. */
function peerWord(id: string) {
  return id.replace(/-(token|network|protocol)$/i, '').split('-')[0];
}
function esc(w: string) {
  return w.replace(/[,()]/g, '');
}
