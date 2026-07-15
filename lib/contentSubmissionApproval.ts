/**
 * Shared approve-side helper for content_submissions.
 *
 * Both the web fallback (`/api/content-submissions/[id]/review`) and the
 * Telegram-bot inline Approve button call this so the campaign-side
 * `contents` row gets created either way. Previously only the web route
 * inserted into `contents`; the TG path updated `content_submissions` +
 * `content_items` but never created the row that the Content Dashboard
 * actually renders, so approvals from TG looked broken on the campaign.
 *
 * `platform` and `content_type` come from `content_submissions`, which
 * stores friendlier values (`'X (Twitter)'`, `'tweet'`) than `contents`
 * accepts. We map here so the CHECK constraints pass.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { markLineupSlotPosted } from './lineupSlotSync';

export interface ApproveSubmissionInput {
  submissionId: string;
  campaignId: string;
  kolId: string;
  link: string;
  platform: string | null | undefined;
  contentType: string | null | undefined;
}

export interface ApproveResult {
  contentId: string | null;
  error: string | null;
}

/**
 * Insert a `contents` row for an approved submission. Idempotent at the
 * boundary — duplicate (campaign_id, content_link) just returns the
 * existing row's id rather than erroring.
 *
 * [2026-07-15, per Andy] Status lands directly at 'posted' — approve is the
 * single human gate (admin+ only, same on TG and web), so the separate
 * 'pending_verification' → Verify step was redundant and confused users. The
 * Content Dashboard's Verify button still works for any manually-created
 * pending rows.
 */
export async function createApprovedContentsRow(
  admin: SupabaseClient,
  input: ApproveSubmissionInput,
): Promise<ApproveResult> {
  // [2026-07-05 AUDIT-FIX] order+limit(1) instead of bare .maybeSingle():
  // a duplicate (campaign, kol) roster pair would make .maybeSingle()
  // error out AFTER the submission was already marked approved, producing
  // a spurious "KOL is not on this campaign" with no retry path. No dups
  // exist in prod today; this is a cheap guard against the edge.
  const { data: campaignKol } = await (admin as any)
    .from('campaign_kols')
    .select('id, agreed_rate, master_kol:master_kols(id, standard_rate, repost_rate)')
    .eq('campaign_id', input.campaignId)
    .eq('master_kol_id', input.kolId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!campaignKol?.id) {
    return { contentId: null, error: 'KOL is not on this campaign (campaign_kols row missing).' };
  }

  const contentsType = mapSubmissionTypeToContents(input.contentType);
  const nowIso = new Date().toISOString();

  // Use the KOL-reported post date (content_items.posted_at, captured at
  // /submit) as the activation_date, not the approval date [Andy + Jdot
  // 2026-07-15]. Falls back to today when absent (legacy submissions). Keeps
  // the Content Dashboard's activation_date consistent with the SPA's week
  // bucketing.
  let activationDate = nowIso.slice(0, 10);
  const { data: itemRow } = await (admin as any)
    .from('content_items')
    .select('posted_at')
    .eq('campaign_id', input.campaignId)
    .eq('link', input.link)
    .neq('status', 'rejected')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((itemRow as any)?.posted_at) activationDate = (itemRow as any).posted_at;

  const { data: contentRow, error: contentErr } = await (admin as any)
    .from('contents')
    .insert({
      campaign_kols_id: campaignKol.id,
      campaign_id: input.campaignId,
      content_link: input.link,
      platform: mapSubmissionPlatformToContents(input.platform, input.link),
      type: contentsType,
      status: 'posted',
      activation_date: activationDate,
    })
    .select('id')
    .single();

  if (contentErr) {
    // 23505 = unique violation. If the campaign already has this link
    // (e.g. retry-after-failure, double tap), look up the existing row
    // and treat the approval as already-landed rather than erroring.
    if ((contentErr as any).code === '23505') {
      const { data: existing } = await (admin as any)
        .from('contents')
        .select('id')
        .eq('campaign_id', input.campaignId)
        .eq('content_link', input.link)
        .maybeSingle();
      return { contentId: (existing as any)?.id ?? null, error: null };
    }
    return { contentId: null, error: (contentErr as any).message ?? 'contents insert failed' };
  }

  const contentId = (contentRow as any)?.id ?? null;

  // [2026-07-06] Flip this KOL's slot in the current week's lineup to
  // 'posted' (best-effort — powers the Thursday "not all posted" ping).
  if (contentId) {
    void markLineupSlotPosted(admin, {
      campaignId: input.campaignId,
      masterKolId: input.kolId,
      dateIso: nowIso.slice(0, 10),
    });
  }

  // [2026-07-03] Mirror the manual /campaigns/[id] add-content flow —
  // auto-create a payment row keyed to this content. Amount priority
  // (matches KolDashboardTableView):
  //   1. Repost: master_kol.repost_rate
  //      → fallback master_kol.standard_rate * 0.5
  //   2. campaign_kol.agreed_rate (set at onboarding)
  //   3. master_kol.standard_rate (mastersheet)
  //   4. 0 (team fills in manually)
  // Payment insert is best-effort: failures are logged but do NOT roll
  // back the contents row — team can add a payment manually if this
  // silently fails.
  if (contentId) {
    const masterKol = (campaignKol as any).master_kol as { standard_rate: number | null; repost_rate: number | null } | null;
    const stdRate = masterKol?.standard_rate != null ? Number(masterKol.standard_rate) : null;
    const repostRate = masterKol?.repost_rate != null ? Number(masterKol.repost_rate) : null;
    const agreedRate = (campaignKol as any).agreed_rate != null ? Number((campaignKol as any).agreed_rate) : null;
    const amount = contentsType === 'Repost'
      ? (repostRate ?? (stdRate != null ? Math.round(stdRate * 0.5 * 100) / 100 : 0))
      : (agreedRate ?? stdRate ?? 0);

    const { error: paymentErr } = await (admin as any)
      .from('payments')
      .insert({
        campaign_id: input.campaignId,
        campaign_kol_id: (campaignKol as any).id,
        content_id: [contentId],
        amount,
        payment_date: null,
        payment_method: 'Fiat',
        notes: null,
      });
    if (paymentErr) {
      console.warn('[approve] payment auto-insert failed:', paymentErr);
    }
  }

  return { contentId, error: null };
}

/**
 * contents.platform CHECK: ('X', 'Telegram', 'YouTube')
 *
 * The link is the source of truth — a stored `platform` string can be stale
 * or wrong (e.g. a submission logged before the detector was fixed), and the
 * CHECK has no "Other" bucket, so a bare string map used to default EVERYTHING
 * unrecognized to 'X'. That mislabelled non-X links as X [Jdot 2026-07-14].
 * We now derive from the link host first, only falling back to the stored
 * string, and only landing on 'X' when the link genuinely looks like X.
 */
export function mapSubmissionPlatformToContents(
  p: string | null | undefined,
  link?: string | null,
): string {
  const fromLink = platformFromLinkHost(link);
  if (fromLink) return fromLink;

  const s = (p ?? '').toLowerCase();
  if (s.includes('telegram') || s === 'tg') return 'Telegram';
  if (s.includes('youtube') || s === 'yt') return 'YouTube';
  if (s.includes('x') || s.includes('twitter')) return 'X';
  // Genuinely unknown: default to X (constraint has no Other), but this is
  // now only reached when neither the link nor the stored string identify a
  // supported platform.
  return 'X';
}

/**
 * Map a submitted link's host to a contents.platform value, or null when the
 * host isn't a recognized platform. Exact-host / true-subdomain match only —
 * never a bare `endsWith`, which would match e.g. netflix.com as x.com.
 */
function platformFromLinkHost(link: string | null | undefined): 'X' | 'Telegram' | 'YouTube' | null {
  if (!link) return null;
  let host: string;
  try {
    host = new URL(link.trim()).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
  const matches = (domain: string) => host === domain || host.endsWith('.' + domain);
  if (matches('t.me') || matches('telegram.me')) return 'Telegram';
  if (matches('youtube.com') || matches('youtu.be')) return 'YouTube';
  if (matches('x.com') || matches('twitter.com')) return 'X';
  return null;
}

/**
 * contents.type CHECK: ('Post', 'Video', 'Article', 'AMA', 'Ambassadorship',
 *                       'Alpha', 'Repost', 'Thread', 'Spaces', 'Newsletter') — QRT renamed 2026-07-06
 */
export function mapSubmissionTypeToContents(t: string | null | undefined): string {
  const s = (t ?? '').toLowerCase();
  if (s === 'tweet' || s === 'tg_post' || s === 'post') return 'Post';
  if (s === 'video') return 'Video';
  if (s === 'article') return 'Article';
  if (s === 'ama') return 'AMA';
  if (s === 'thread') return 'Thread';
  if (s === 'qrt' || s === 'quote_rt' || s === 'repost') return 'Repost';
  if (s === 'spaces') return 'Spaces';
  return 'Post';
}
