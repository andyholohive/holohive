/**
 * Can this client get a Korea brief this week, and if not, what's in the way?
 *
 * Two halves, kept separate so the logic can be tested without a database:
 *   - loadBriefFacts()        reads the facts for one client (server-only)
 *   - assessBriefReadiness()  pure: facts → status + checklist
 *
 * Checks that can't pass until an earlier one does are marked 'waits', not
 * 'fix'. Without that, a client with Korea Signal switched off read as three
 * separate problems when it is one (Umia, 2026-10-01).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface BriefFacts {
  hasConfig: boolean;
  configActive: boolean;
  /** This week's weekly report exists (any review status). */
  reportGenerated: boolean;
  /** Result of the report's delivery pre-check; null when nothing was checked. */
  botReachable: boolean | null;
  postsTotal: number;
  postsThisWeek: number;
  commentsTotal: number;
  commentsKorean: number;
}

export type ReadinessLevel = 'ready' | 'partial' | 'blocked';
export type CheckState = 'ok' | 'fix' | 'waits';

export interface ReadinessCheck {
  key: 'config' | 'active' | 'report' | 'bot' | 'posts' | 'comments';
  label: string;
  detail: string;
  state: CheckState;
}

export interface BriefReadiness {
  level: ReadinessLevel;
  /** One or two words for a tab ("Ready", "Blocked"). */
  short: string;
  /** One line for the card ("Blocked: the bot can't reach their group"). */
  headline: string;
  checks: ReadinessCheck[];
}

export function assessBriefReadiness(f: BriefFacts): BriefReadiness {
  const off = !f.hasConfig || !f.configActive;
  const checks: ReadinessCheck[] = [
    { key: 'config', label: 'Korea Signal set up', state: f.hasConfig ? 'ok' : 'fix',
      detail: f.hasConfig ? 'Ticker, venues and peers configured' : 'No configuration — nothing can be generated' },
    { key: 'active', label: 'Weekly report switched on', state: f.configActive ? 'ok' : f.hasConfig ? 'fix' : 'waits',
      detail: f.configActive ? 'Generates every Saturday' : f.hasConfig ? 'Configured but switched off' : 'Needs setup first' },
    { key: 'report', label: 'This week’s report generated', state: f.reportGenerated ? 'ok' : off ? 'waits' : 'fix',
      detail: f.reportGenerated ? 'Waiting for review' : 'None this week' },
    { key: 'bot', label: 'Bot can post in their group', state: f.botReachable === true ? 'ok' : f.botReachable === false ? 'fix' : 'waits',
      detail: f.botReachable === true ? 'Checked when the report was generated'
        : f.botReachable === false ? 'Telegram says “chat not found” — add the bot to the group'
        : 'Not checked — no report generated' },
    { key: 'posts', label: 'Campaign posts logged', state: f.postsTotal > 0 ? 'ok' : 'fix',
      detail: f.postsTotal > 0 ? `${f.postsThisWeek} this week · ${f.postsTotal} total` : 'No posts in HHP for this campaign' },
    // Nothing for Koreans to comment on until there are posts.
    { key: 'comments', label: 'Korean comments collected', state: f.commentsTotal > 0 ? 'ok' : f.postsTotal > 0 ? 'fix' : 'waits',
      detail: f.commentsTotal > 0 ? `${f.commentsTotal} comments · ${f.commentsKorean} in Korean` : 'None yet' },
  ];

  if (!f.hasConfig) return { level: 'blocked', short: 'Not set up', headline: 'Needs Korea Signal setup', checks };
  if (f.reportGenerated && f.botReachable === false) return { level: 'blocked', short: 'Blocked', headline: 'Blocked: the bot can’t reach their group', checks };
  if (!f.configActive) return { level: 'partial', short: 'Switched off', headline: 'Korea Signal is switched off', checks };
  if (f.reportGenerated) return { level: 'ready', short: 'Ready', headline: 'Ready to send this week', checks };
  return { level: 'partial', short: 'No report', headline: 'No report this week', checks };
}

/**
 * Read the facts for one client. `week` is the report window
 * (KoreaSummary.week) — posts are counted by activation date inside it.
 */
export async function loadBriefFacts(
  admin: SupabaseClient,
  clientId: string,
  week: { start: string; end: string },
): Promise<BriefFacts> {
  const db = admin as any;
  const { data: kc } = await db.from('kr_signal_clients').select('id, is_active')
    .or(`client_id.eq.${clientId},content_log_source.eq.hhp:${clientId}`).limit(1).maybeSingle();

  const [{ data: report }, { data: camps }] = await Promise.all([
    kc ? db.from('kr_signal_client_weekly').select('preflight')
      .eq('client_id', kc.id).eq('week_ending', week.start).maybeSingle() : Promise.resolve({ data: null }),
    db.from('campaigns').select('id').eq('client_id', clientId),
  ]);
  const campaignIds = (camps ?? []).map((c: any) => c.id);

  const { data: posts } = campaignIds.length
    ? await db.from('contents').select('id, activation_date').in('campaign_id', campaignIds)
    : { data: [] as any[] };
  const contentIds = (posts ?? []).map((p: any) => p.id);
  const { data: comments } = contentIds.length
    ? await db.from('post_comments').select('lang').in('content_id', contentIds).limit(5000)
    : { data: [] as any[] };

  const pre = report?.preflight;
  return {
    hasConfig: !!kc,
    configActive: !!kc?.is_active,
    reportGenerated: !!report,
    botReachable: pre && typeof pre.ok === 'boolean' ? pre.ok : null,
    postsTotal: (posts ?? []).length,
    postsThisWeek: (posts ?? []).filter((p: any) => p.activation_date >= week.start && p.activation_date <= week.end).length,
    commentsTotal: (comments ?? []).length,
    commentsKorean: (comments ?? []).filter((c: any) => c.lang === 'ko').length,
  };
}
