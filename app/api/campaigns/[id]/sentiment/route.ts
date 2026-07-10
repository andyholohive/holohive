import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/campaigns/[id]/sentiment — TG Comment Sentiment rollup (spec v3).
 *
 * Two tracks, per the spec's "never collapse to a number alone" rule:
 *  - quantitative: volume split (noise/hype/substantive), sentiment
 *    distribution over SUBSTANTIVE comments only (positive/negative/fud),
 *    question volume as its own line, raw + reaction-weighted positive
 *    share, weekly trend.
 *  - quote bank: every substantive comment (buckets 3/4/5/6), verbatim,
 *    bucketed, reaction-ordered, deduped by dedup_group, with a t.me link.
 *
 * FUD spike default (pending Jdot's threshold): fud >= 15% of substantive
 * OR >= 5 FUD comments on a single post.
 *
 * Auth: Supabase session (middleware default). Service client used for the
 * read because post_comments is service-role-only.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  const sb = createClient(url, key);

  const { data: contents } = await (sb as any)
    .from('contents')
    .select('id, content_link')
    .eq('campaign_id', campaignId)
    .eq('platform', 'Telegram');
  const contentIds = ((contents ?? []) as any[]).map(c => c.id);
  const linkById = new Map<string, string>(((contents ?? []) as any[]).map(c => [c.id, c.content_link || '']));
  if (contentIds.length === 0) {
    return NextResponse.json({ hasData: false });
  }

  const { data: rows, error } = await (sb as any)
    .from('post_comments')
    .select('content_id, tg_comment_id, text, en_gloss, lang, author_username, sent_at, reaction_total, dedup_group, sentiment_label, sentiment_theme')
    .in('content_id', contentIds)
    .not('sentiment_label', 'is', null)
    .order('reaction_total', { ascending: false, nullsFirst: false })
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = (rows ?? []) as any[];
  if (all.length === 0) return NextResponse.json({ hasData: false });

  const by = (l: string) => all.filter(r => r.sentiment_label === l);
  const noise = by('noise').length, hype = by('hype').length;
  const pos = by('positive'), neg = by('negative'), fud = by('fud'), q = by('question');
  const substantive = pos.length + neg.length + fud.length + q.length;
  const scored = pos.length + neg.length + fud.length; // sentiment over 3/4/6 only
  const w = (arr: any[]) => arr.reduce((s, r) => s + 1 + (Number(r.reaction_total) || 0), 0);
  const wTotal = w(pos) + w(neg) + w(fud);

  // FUD spike: share OR concentration on one post (default thresholds).
  const fudByPost = new Map<string, number>();
  for (const r of fud) fudByPost.set(r.content_id, (fudByPost.get(r.content_id) || 0) + 1);
  const fudShare = scored > 0 ? fud.length / scored : 0;
  const fudSpike = fudShare >= 0.15 || Math.max(0, ...fudByPost.values()) >= 5;

  // Weekly trend over substantive sentiment (positive share of scored).
  const weeks = new Map<string, { pos: number; scored: number; questions: number }>();
  for (const r of [...pos, ...neg, ...fud, ...q]) {
    const d = new Date(r.sent_at);
    const wk = new Date(d);
    wk.setUTCDate(d.getUTCDate() - d.getUTCDay() + 1); // Monday key
    const kkey = wk.toISOString().slice(0, 10);
    const cur = weeks.get(kkey) || { pos: 0, scored: 0, questions: 0 };
    if (r.sentiment_label === 'question') cur.questions++;
    else { cur.scored++; if (r.sentiment_label === 'positive') cur.pos++; }
    weeks.set(kkey, cur);
  }
  const trend = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, v]) => ({ week, positivePct: v.scored ? Math.round((v.pos / v.scored) * 100) : null, questions: v.questions }));

  // Quote bank — substantive only, uncapped, verbatim, dedup-collapsed,
  // reaction-ordered (rows arrive pre-sorted).
  const seenDedup = new Set<string>();
  const quote = (r: any) => ({
    text: r.text,
    enGloss: r.en_gloss || null,
    lang: r.lang || null,
    author: r.author_username ? `@${r.author_username}` : 'anonymous',
    reactions: Number(r.reaction_total) || 0,
    sentAt: r.sent_at,
    theme: r.sentiment_theme || null,
    link: linkById.get(r.content_id) ? `${linkById.get(r.content_id)}?comment=${r.tg_comment_id}` : null,
  });
  const bank = (arr: any[]) => arr.filter(r => {
    if (!r.dedup_group) return true;
    if (seenDedup.has(r.dedup_group)) return false;
    seenDedup.add(r.dedup_group);
    return true;
  }).map(quote);

  return NextResponse.json({
    hasData: true,
    volume: { total: all.length, noise, hype, substantive },
    sentiment: {
      positive: pos.length, negative: neg.length, fud: fud.length,
      positivePctRaw: scored ? Math.round((pos.length / scored) * 100) : null,
      positivePctWeighted: wTotal ? Math.round((w(pos) / wTotal) * 100) : null,
    },
    questions: { count: q.length, spike: substantive > 0 && q.length / substantive >= 0.3 },
    fud: { count: fud.length, sharePct: Math.round(fudShare * 100), spike: fudSpike },
    trend,
    quoteBank: {
      topPraise: bank(pos),
      topCriticism: bank(neg),
      questions: bank(q),
      fudConcern: bank(fud),
    },
  });
}
