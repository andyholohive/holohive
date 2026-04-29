/**
 * Reminder Rule Evaluators
 * Each evaluator queries Supabase and returns items that need attention.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

export interface ReminderItem {
  label: string;
  detail?: string;
}

export interface ReminderResult {
  items: ReminderItem[];
  isEmpty: boolean;
}

type EvaluatorFn = (
  supabase: SupabaseClient<Database>,
  params: Record<string, any>
) => Promise<ReminderResult>;

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ─── 1. KOL Stats Stale ──────────────────────────────────────────────
async function kolStatsStale(
  supabase: SupabaseClient<Database>,
  params: Record<string, any>
): Promise<ReminderResult> {
  const threshold = params.threshold_days || 90;
  const cutoff = daysAgo(threshold);

  // KOLs never updated or not updated within threshold
  const { data: staleKols } = await supabase
    .from('master_kols')
    .select('name, updated_at')
    .is('archived_at', null)
    .or(`updated_at.is.null,updated_at.lt.${cutoff}`)
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(50);

  const items: ReminderItem[] = (staleKols || []).map((k) => {
    const daysSince = k.updated_at
      ? Math.ceil((Date.now() - new Date(k.updated_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return {
      label: k.name,
      detail: daysSince ? `${daysSince}d since last update` : 'Never updated',
    };
  });

  return { items, isEmpty: items.length === 0 };
}

// ─── 2. Client Check-in ──────────────────────────────────────────────
async function clientCheckin(
  supabase: SupabaseClient<Database>,
  params: Record<string, any>
): Promise<ReminderResult> {
  const advanceDays = params.advance_days || 1;
  const now = new Date().toISOString();
  const upcoming = daysFromNow(advanceDays);

  const { data: opps } = await supabase
    .from('crm_opportunities')
    .select('name, next_meeting_at, next_meeting_type, owner_id')
    .not('next_meeting_at', 'is', null)
    .gte('next_meeting_at', now)
    .lte('next_meeting_at', upcoming)
    .order('next_meeting_at', { ascending: true });

  // Look up owner names
  const ownerIds = Array.from(new Set((opps || []).map((o) => o.owner_id).filter(Boolean))) as string[];
  let ownerMap = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .in('id', ownerIds);
    for (const u of users || []) {
      ownerMap.set(u.id, u.name);
    }
  }

  const items: ReminderItem[] = (opps || []).map((o) => {
    const meetDate = o.next_meeting_at ? new Date(o.next_meeting_at).toLocaleDateString() : '';
    const owner = o.owner_id ? ownerMap.get(o.owner_id) || '' : '';
    const meetType = o.next_meeting_type || 'check-in';
    return {
      label: o.name,
      detail: `${meetType} on ${meetDate}${owner ? ` (${owner})` : ''}`,
    };
  });

  return { items, isEmpty: items.length === 0 };
}

// ─── 3. CDL Needs Updating ───────────────────────────────────────────
async function cdlNeedsUpdate(
  supabase: SupabaseClient<Database>,
  params: Record<string, any>
): Promise<ReminderResult> {
  const threshold = params.threshold_days || 14;
  const cutoff = daysAgo(threshold);

  // Get active clients
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('is_active', true)
    .is('archived_at', null);

  if (!clients || clients.length === 0) return { items: [], isEmpty: true };

  // Get latest CDL entry per client
  const clientIds = clients.map((c) => c.id);
  const { data: recentLogs } = await supabase
    .from('client_delivery_log')
    .select('client_id, logged_at')
    .in('client_id', clientIds)
    .gte('logged_at', cutoff);

  const clientsWithRecentLog = new Set((recentLogs || []).map((l) => l.client_id));

  const items: ReminderItem[] = clients
    .filter((c) => !clientsWithRecentLog.has(c.id))
    .map((c) => ({
      label: c.name,
      detail: `No delivery log in ${threshold}+ days`,
    }));

  return { items, isEmpty: items.length === 0 };
}

// ─── 4. Weekly CDL Review ────────────────────────────────────────────
async function weeklyCdlReview(
  _supabase: SupabaseClient<Database>,
  _params: Record<string, any>
): Promise<ReminderResult> {
  // Static reminder — no query needed
  return {
    items: [{ label: 'Time for weekly CDL review', detail: 'Review all client delivery logs for completeness' }],
    isEmpty: false,
  };
}

// ─── 5. Content Metrics Stale ────────────────────────────────────────
async function contentMetricsStale(
  supabase: SupabaseClient<Database>,
  params: Record<string, any>
): Promise<ReminderResult> {
  const threshold = params.threshold_days || 7;
  const cutoff = daysAgo(threshold);

  // Content with activation_date set (published) but no metrics, older than threshold
  const { data: staleContent } = await supabase
    .from('contents')
    .select('id, activation_date, campaign_id, campaign_kols_id, impressions, likes, comments, retweets, bookmarks')
    .not('activation_date', 'is', null)
    .lt('activation_date', cutoff)
    .is('impressions', null)
    .is('likes', null)
    .is('comments', null)
    .limit(50);

  if (!staleContent || staleContent.length === 0) return { items: [], isEmpty: true };

  // Get KOL names via campaign_kols → master_kols
  const ckIds = Array.from(new Set(staleContent.map((c) => c.campaign_kols_id)));
  const { data: ckData } = await supabase
    .from('campaign_kols')
    .select('id, master_kol_id')
    .in('id', ckIds);

  const kolIds = Array.from(new Set((ckData || []).map((ck) => ck.master_kol_id)));
  const { data: kols } = await supabase
    .from('master_kols')
    .select('id, name')
    .in('id', kolIds);

  const kolMap = new Map<string, string>();
  for (const k of kols || []) kolMap.set(k.id, k.name);
  const ckToKol = new Map<string, string>();
  for (const ck of ckData || []) ckToKol.set(ck.id, kolMap.get(ck.master_kol_id) || 'Unknown');

  // Get campaign names
  const campaignIds = Array.from(new Set(staleContent.map((c) => c.campaign_id)));
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name')
    .in('id', campaignIds);
  const campMap = new Map<string, string>();
  for (const c of campaigns || []) campMap.set(c.id, c.name);

  const items: ReminderItem[] = staleContent.map((c) => {
    const kolName = ckToKol.get(c.campaign_kols_id) || 'Unknown KOL';
    const campName = campMap.get(c.campaign_id) || 'Unknown Campaign';
    const pubDate = c.activation_date ? new Date(c.activation_date).toLocaleDateString() : '';
    return {
      label: `${kolName} — ${campName}`,
      detail: `Published ${pubDate}, no metrics recorded`,
    };
  });

  return { items, isEmpty: items.length === 0 };
}

// ─── 6. Form Submission (event-driven, skipped by cron) ──────────────
async function formSubmission(
  _supabase: SupabaseClient<Database>,
  _params: Record<string, any>
): Promise<ReminderResult> {
  // This is event-driven, not cron-evaluated
  return { items: [], isEmpty: true };
}

// ─── 7. CRM Follow-up ───────────────────────────────────────────────
async function crmFollowup(
  supabase: SupabaseClient<Database>,
  params: Record<string, any>
): Promise<ReminderResult> {
  const threshold = params.threshold_days || 7;
  const cutoff = daysAgo(threshold);

  // Mirror the comprehensive closed-stage list used by the
  // crm_followups_due MCP tool. The previous list (closed_won /
  // closed_lost / disqualified) missed:
  //   - v2_closed_won / v2_closed_lost (the v2 sales pipeline stages
  //     used by ~30+ rows in prod — most "lost" deals live here, not
  //     in plain "closed_lost")
  //   - dead, unqualified (Lead pipeline terminal states)
  //   - account_churned (Account pipeline terminal)
  // Without these, the daily reminder would over-flag terminal deals
  // as "needing follow-up" — the exact noise this rule is meant to avoid.
  const closedStages = [
    'closed_won',
    'closed_lost',
    'v2_closed_won',
    'v2_closed_lost',
    'dead',
    'unqualified',
    'disqualified',
    'account_churned',
  ];

  const { data: opps } = await supabase
    .from('crm_opportunities')
    .select('name, last_contacted_at, stage, owner_id')
    .not('stage', 'in', `(${closedStages.join(',')})`)
    .or(`last_contacted_at.is.null,last_contacted_at.lt.${cutoff}`)
    .order('last_contacted_at', { ascending: true, nullsFirst: true })
    .limit(30);

  // Look up owner names
  const ownerIds = Array.from(new Set((opps || []).map((o) => o.owner_id).filter(Boolean))) as string[];
  let ownerMap = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .in('id', ownerIds);
    for (const u of users || []) {
      ownerMap.set(u.id, u.name);
    }
  }

  const items: ReminderItem[] = (opps || []).map((o) => {
    const daysSince = o.last_contacted_at
      ? Math.ceil((Date.now() - new Date(o.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const owner = o.owner_id ? ownerMap.get(o.owner_id) || '' : '';
    return {
      label: o.name,
      detail: `${daysSince ? `${daysSince}d since last contact` : 'Never contacted'}${owner ? ` (${owner})` : ''}`,
    };
  });

  return { items, isEmpty: items.length === 0 };
}

// ─── 8. Payment Reminder (Saturdays) ────────────────────────────────
async function paymentReminder(
  supabase: SupabaseClient<Database>,
  params: Record<string, any>
): Promise<ReminderResult> {
  const excludePatterns: string[] = params.exclude_campaign_patterns || ['KOL Round'];

  // Get unpaid payments
  const { data: unpaid } = await supabase
    .from('payments')
    .select('id, amount, campaign_id, campaign_kol_id, recipient_name, payment_method')
    .is('payment_date', null)
    .limit(100);

  if (!unpaid || unpaid.length === 0) return { items: [], isEmpty: true };

  // Get campaign names to filter out excluded patterns
  const campaignIds = Array.from(new Set(unpaid.map((p) => p.campaign_id)));
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name')
    .in('id', campaignIds);
  const campMap = new Map<string, string>();
  for (const c of campaigns || []) campMap.set(c.id, c.name);

  // Filter out excluded campaign patterns
  const filtered = unpaid.filter((p) => {
    const campName = campMap.get(p.campaign_id) || '';
    return !excludePatterns.some((pattern) =>
      campName.toLowerCase().includes(pattern.toLowerCase())
    );
  });

  if (filtered.length === 0) return { items: [], isEmpty: true };

  // Get KOL names via campaign_kols
  const ckIds = Array.from(new Set(filtered.map((p) => p.campaign_kol_id).filter(Boolean))) as string[];
  let ckToKol = new Map<string, string>();
  if (ckIds.length > 0) {
    const { data: ckData } = await supabase
      .from('campaign_kols')
      .select('id, master_kol_id')
      .in('id', ckIds);
    const kolIds = Array.from(new Set((ckData || []).map((ck) => ck.master_kol_id)));
    if (kolIds.length > 0) {
      const { data: kols } = await supabase
        .from('master_kols')
        .select('id, name')
        .in('id', kolIds);
      const kolMap = new Map<string, string>();
      for (const k of kols || []) kolMap.set(k.id, k.name);
      for (const ck of ckData || []) ckToKol.set(ck.id, kolMap.get(ck.master_kol_id) || 'Unknown');
    }
  }

  const items: ReminderItem[] = filtered.map((p) => {
    const kolName = p.campaign_kol_id ? ckToKol.get(p.campaign_kol_id) || p.recipient_name || 'Unknown' : p.recipient_name || 'Unknown';
    const campName = campMap.get(p.campaign_id) || 'Unknown Campaign';
    return {
      label: `${kolName} — ${campName}`,
      detail: `$${p.amount} (${p.payment_method})`,
    };
  });

  return { items, isEmpty: items.length === 0 };
}

// ─── 9. New KOL — No Group Chat ─────────────────────────────────────
async function newKolNoGc(
  supabase: SupabaseClient<Database>,
  params: Record<string, any>
): Promise<ReminderResult> {
  const lookback = params.lookback_days || 7;
  const cutoff = daysAgo(lookback);

  const { data: newKols } = await supabase
    .from('master_kols')
    .select('name, created_at, group_chat')
    .gte('created_at', cutoff)
    .is('archived_at', null)
    .or('group_chat.is.null,group_chat.eq.false')
    .order('created_at', { ascending: false });

  const items: ReminderItem[] = (newKols || []).map((k) => ({
    label: k.name,
    detail: `Added ${k.created_at ? new Date(k.created_at).toLocaleDateString() : 'recently'} — no GC connected`,
  }));

  return { items, isEmpty: items.length === 0 };
}

// ─── 10. New CRM Opp — No Group Chat ────────────────────────────────
async function newCrmNoGc(
  supabase: SupabaseClient<Database>,
  params: Record<string, any>
): Promise<ReminderResult> {
  const lookback = params.lookback_days || 7;
  const cutoff = daysAgo(lookback);

  const { data: newOpps } = await supabase
    .from('crm_opportunities')
    .select('name, created_at, gc, tg_handle')
    .gte('created_at', cutoff)
    .or('gc.is.null,gc.eq.')
    .order('created_at', { ascending: false });

  const items: ReminderItem[] = (newOpps || []).map((o) => ({
    label: o.name,
    detail: `Added ${o.created_at ? new Date(o.created_at).toLocaleDateString() : 'recently'} — no GC connected${o.tg_handle ? ` (TG: ${o.tg_handle})` : ''}`,
  }));

  return { items, isEmpty: items.length === 0 };
}

// ─── Evaluator Registry ──────────────────────────────────────────────
export const evaluators: Record<string, EvaluatorFn> = {
  kol_stats_stale: kolStatsStale,
  client_checkin: clientCheckin,
  cdl_needs_update: cdlNeedsUpdate,
  weekly_cdl_review: weeklyCdlReview,
  content_metrics_stale: contentMetricsStale,
  form_submission: formSubmission,
  crm_followup: crmFollowup,
  payment_reminder: paymentReminder,
  new_kol_no_gc: newKolNoGc,
  new_crm_no_gc: newCrmNoGc,
};

// Emoji per rule type for message formatting
export const RULE_EMOJI: Record<string, string> = {
  kol_stats_stale: '\u{1F4CA}',       // 📊
  client_checkin: '\u{1F4C5}',        // 📅
  cdl_needs_update: '\u{1F4DD}',      // 📝
  weekly_cdl_review: '\u{1F4CB}',     // 📋
  content_metrics_stale: '\u{1F4C8}', // 📈
  form_submission: '\u{1F4E9}',       // 📩
  crm_followup: '\u{1F4DE}',         // 📞
  payment_reminder: '\u{1F4B0}',      // 💰
  new_kol_no_gc: '\u{1F517}',        // 🔗
  new_crm_no_gc: '\u{1F517}',        // 🔗
};
