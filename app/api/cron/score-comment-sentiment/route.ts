import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/score-comment-sentiment
 *
 * Daily cron. Reads a batch of un-scored rows from post_comments,
 * groups them per-post (so the model sees the full thread context
 * when scoring individual comments), and asks Claude to return a
 * positive/neutral/negative label + one short theme keyword per row.
 *
 * Cost shape: one Claude call per post-thread, not per comment. For
 * the current eligible-post rate (~25/day) this is well inside the
 * budget. Model defaults to claude-opus-4-8; flip via SENTIMENT_MODEL
 * env var (e.g. claude-haiku-4-5) if volume grows.
 *
 * Auth: Bearer ${CRON_SECRET}. Logs to agent_runs with
 * agent_name='COMMENT_SENTIMENT'.
 */

const DEFAULT_MODEL = 'claude-opus-4-8';
const BATCH_POSTS_PER_RUN = 20;   // caps a single cron run's Claude spend
const MAX_COMMENTS_PER_POST = 100;

type UnscoredRow = {
  id: string;
  content_id: string;
  tg_comment_id: number;
  text: string;
  parent_comment_id: number | null;
  reactions_json: Array<{ emoticon?: string; count?: number }> | null;
};

/** v3 six-bucket taxonomy (spec Layer 3). Sentiment is computed over
 *  positive/negative/fud only — noise + hype are volume, questions are
 *  their own signal ("a wall of questions means the narrative is not
 *  landing"), never folded into the score. */
type BucketLabel = 'noise' | 'hype' | 'positive' | 'negative' | 'question' | 'fud';
const BUCKETS: BucketLabel[] = ['noise', 'hype', 'positive', 'negative', 'question', 'fud'];

type Verdict = {
  tg_comment_id: number;
  sentiment_label: BucketLabel;
  sentiment_theme: string;
  en_gloss: string | null;
};

const hasHangul = (s: string) => /[ㄱ-ㆎ가-힣]/.test(s || '');
const hasLatin = (s: string) => /[a-zA-Z]{2,}/.test(s || '');
const detectLang = (s: string) =>
  hasHangul(s) ? (hasLatin(s) ? 'mixed' : 'ko') : 'en';
const reactionTotal = (r: UnscoredRow['reactions_json']) =>
  Array.isArray(r) ? r.reduce((s, x) => s + (Number(x?.count) || 0), 0) : 0;
/** Copy-paste farming collapses into a dedup_group (normalized text). */
const dedupKey = (s: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase env' }, { status: 500 });
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }
  const model = process.env.SENTIMENT_MODEL || DEFAULT_MODEL;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const startedAt = new Date();
  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({
      agent_name: 'COMMENT_SENTIMENT',
      run_type: 'scheduled',
      status: 'running',
      started_at: startedAt.toISOString(),
      input_params: { model, batch_posts_per_run: BATCH_POSTS_PER_RUN },
    })
    .select('id')
    .single();
  const runId = runRow?.id;

  const finish = async (
    status: 'completed' | 'failed',
    summary: Record<string, unknown>,
    error?: string,
  ) => {
    if (!runId) return;
    const endedAt = new Date();
    await (supabase as any)
      .from('agent_runs')
      .update({
        status,
        completed_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        output_summary: summary,
        error_message: error ?? null,
      })
      .eq('id', runId);
  };

  try {
    // Pull unscored rows. Order by content_id so we group them
    // per-post naturally without a second query.
    const { data: rows, error: fetchErr } = await (supabase as any)
      .from('post_comments')
      .select('id, content_id, tg_comment_id, text, parent_comment_id, reactions_json')
      .is('sentiment_scored_at', null)
      .order('content_id')
      .order('sent_at')
      .limit(BATCH_POSTS_PER_RUN * MAX_COMMENTS_PER_POST);

    if (fetchErr) {
      await finish('failed', {}, fetchErr.message);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    const unscored: UnscoredRow[] = rows || [];
    if (unscored.length === 0) {
      await finish('completed', { posts: 0, comments: 0, scored: 0 });
      return NextResponse.json({ success: true, posts: 0, comments: 0, scored: 0 });
    }

    // Group by content_id, cap posts we'll process this run.
    const byPost = new Map<string, UnscoredRow[]>();
    for (const r of unscored) {
      const arr = byPost.get(r.content_id) || [];
      if (arr.length < MAX_COMMENTS_PER_POST) arr.push(r);
      byPost.set(r.content_id, arr);
    }
    const posts = Array.from(byPost.entries()).slice(0, BATCH_POSTS_PER_RUN);

    let scored = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const [contentId, comments] of posts) {
      try {
        const verdicts = await scorePost(anthropic, model, contentId, comments);
        const byId = new Map(verdicts.map(v => [v.tg_comment_id, v]));

        // Update each row individually — Supabase doesn't support a
        // multi-row UPDATE with different values per row without an RPC.
        // For 100-comment batches this is fine; if it becomes a bottleneck,
        // move to a bulk RPC that takes JSON.
        // Dedup pre-pass (spec Layer 2): identical normalized text across
        // 2+ comments on the post gets a shared dedup_group tag.
        const textCounts = new Map<string, number>();
        for (const c of comments) {
          const k = dedupKey(c.text);
          if (k) textCounts.set(k, (textCounts.get(k) || 0) + 1);
        }

        const scoredAt = new Date().toISOString();
        for (const c of comments) {
          const v = byId.get(c.tg_comment_id);
          if (!v) continue;
          const k = dedupKey(c.text);
          const { error: uErr } = await (supabase as any)
            .from('post_comments')
            .update({
              sentiment_label: v.sentiment_label,
              sentiment_theme: v.sentiment_theme.slice(0, 40),
              en_gloss: v.en_gloss ? v.en_gloss.slice(0, 300) : null,
              lang: detectLang(c.text),
              reaction_total: reactionTotal(c.reactions_json),
              dedup_group: k && (textCounts.get(k) || 0) > 1 ? k.slice(0, 120) : null,
              sentiment_scored_at: scoredAt,
            })
            .eq('id', c.id);
          if (!uErr) scored++;
        }
      } catch (err: any) {
        failed++;
        if (failures.length < 10) failures.push(`${contentId}: ${err?.message || err}`);
      }
    }

    const summary = {
      model,
      posts_considered: posts.length,
      comments_considered: unscored.length,
      scored,
      failed_posts: failed,
      first_failures: failures,
    };
    await finish('completed', summary);
    return NextResponse.json({ success: true, ...summary });
  } catch (err: any) {
    console.error('[score-comment-sentiment]', err);
    await finish('failed', {}, err?.message ?? 'Unknown error');
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}

// ─── Claude call ─────────────────────────────────────────────────────

/**
 * Ask Claude to classify every comment on one post. Sends the full
 * thread so the model can read replies-in-context (a "wow" after a
 * bearish thread reads differently than after a bullish one).
 * Returns one verdict per input tg_comment_id — any row Claude drops
 * gets no update (stays unscored, retried on the next run).
 */
async function scorePost(
  anthropic: Anthropic,
  model: string,
  contentId: string,
  comments: UnscoredRow[],
): Promise<Verdict[]> {
  // v3 taxonomy (spec Layer 3): GATE BEFORE YOU SCORE. Noise/hype are
  // classified but never touch the sentiment rollup. Score in the
  // ORIGINAL language — translate-then-score flattens KR sarcasm/slang;
  // the EN gloss is display-only for the quote bank.
  const system = [
    'You classify Telegram discussion-group comments on a crypto KOL post.',
    'Classify each comment into EXACTLY ONE bucket:',
    '  "noise"    — farming: gm, emoji-only, "done", tag-a-friend, one-word hype with no content.',
    '  "hype"     — generic hype: bullish, LFG, rockets. Engagement signal, no real feedback.',
    '  "positive" — substantive positive: a real reason or specific praise.',
    '  "negative" — substantive criticism: complaints, doubts, bug reports, specific pushback.',
    '  "question" — genuine question or confusion about the product/mechanics.',
    '  "fud"      — trust/security/rug/team concerns (separate from ordinary criticism).',
    'Read Korean natively — do NOT translate before judging tone.',
    'When parent_text is present, the comment is a REPLY: judge it in that context',
    '(a bare "no, that is not it" inverts meaning depending on what it answers).',
    'sentiment_theme: one short lowercase English keyword (1-3 words) for the angle.',
    'en_gloss: for non-English comments in buckets positive/negative/question/fud, a short',
    '          faithful English gloss of the comment. null for English comments and for noise/hype.',
    'Respond ONLY with a JSON array. Every input comment must appear in the output.',
  ].join('\n');

  const parentText = new Map<number, string>();
  for (const c of comments) parentText.set(c.tg_comment_id, c.text || '');

  const commentsPayload = comments.map(c => ({
    id: c.tg_comment_id,
    text: (c.text || '').slice(0, 2000),
    parent_text: c.parent_comment_id
      ? (parentText.get(c.parent_comment_id) || null)?.slice(0, 500) ?? null
      : null,
  }));

  const user = [
    `Post: ${contentId}`,
    `Comments (${commentsPayload.length}):`,
    JSON.stringify(commentsPayload, null, 2),
    '',
    'Return: [{"tg_comment_id": <id>, "sentiment_label": "...", "sentiment_theme": "...", "en_gloss": "..."|null}, ...]',
  ].join('\n');

  const msg = await anthropic.messages.create({
    model,
    max_tokens: Math.max(1024, comments.length * 140),
    system,
    messages: [{ role: 'user', content: user }],
    thinking: { type: 'adaptive' },
  });

  const textBlock = msg.content.find(b => b.type === 'text') as any;
  const raw = textBlock?.text || '';
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`No JSON array in response: ${raw.slice(0, 200)}`);
  }
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) throw new Error('Response is not an array');

  const verdicts: Verdict[] = [];
  for (const row of parsed) {
    const id = Number(row?.tg_comment_id);
    const label = row?.sentiment_label;
    const theme = String(row?.sentiment_theme || '').toLowerCase().trim();
    if (!Number.isFinite(id)) continue;
    if (!BUCKETS.includes(label)) continue;
    if (!theme) continue;
    const gloss = typeof row?.en_gloss === 'string' && row.en_gloss.trim() ? row.en_gloss.trim() : null;
    verdicts.push({ tg_comment_id: id, sentiment_label: label, sentiment_theme: theme, en_gloss: gloss });
  }
  return verdicts;
}
