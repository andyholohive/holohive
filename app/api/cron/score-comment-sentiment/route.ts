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
};

type Verdict = {
  tg_comment_id: number;
  sentiment_label: 'positive' | 'neutral' | 'negative';
  sentiment_theme: string;
};

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    const querySecret = new URL(request.url).searchParams.get('secret');
    if (auth !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
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
      .select('id, content_id, tg_comment_id, text')
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
        const scoredAt = new Date().toISOString();
        for (const c of comments) {
          const v = byId.get(c.tg_comment_id);
          if (!v) continue;
          const { error: uErr } = await (supabase as any)
            .from('post_comments')
            .update({
              sentiment_label: v.sentiment_label,
              sentiment_theme: v.sentiment_theme.slice(0, 40),
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
  const system = [
    'You classify Telegram discussion-group comments on a crypto KOL post.',
    'For each comment, output ONE JSON row with sentiment_label and a short theme keyword.',
    'sentiment_label: "positive" (endorsement, hype, agreement, thanks),',
    '                 "negative" (criticism, doubt, FUD, complaint), or',
    '                 "neutral"  (question, price ask, off-topic, ambiguous).',
    'sentiment_theme: one short (1-3 word) English keyword describing the comment\'s angle,',
    '                 e.g. "hype", "price ask", "confusion", "shilling", "gratitude",',
    '                 "questioning fundamentals", "off-topic". Lowercase.',
    'Respond ONLY with a JSON array. No preamble. Every input comment must appear in the output.',
  ].join('\n');

  const commentsPayload = comments.map(c => ({
    id: c.tg_comment_id,
    text: (c.text || '').slice(0, 2000),
  }));

  const user = [
    `Post: ${contentId}`,
    `Comments (${commentsPayload.length}):`,
    JSON.stringify(commentsPayload, null, 2),
    '',
    'Return: [{"tg_comment_id": <id>, "sentiment_label": "...", "sentiment_theme": "..."}, ...]',
  ].join('\n');

  const msg = await anthropic.messages.create({
    model,
    max_tokens: Math.max(1024, comments.length * 60),
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
    if (label !== 'positive' && label !== 'neutral' && label !== 'negative') continue;
    if (!theme) continue;
    verdicts.push({ tg_comment_id: id, sentiment_label: label, sentiment_theme: theme });
  }
  return verdicts;
}
