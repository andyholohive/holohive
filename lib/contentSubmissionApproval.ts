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

export interface ApproveSubmissionInput {
  submissionId: string;
  campaignId: string;
  kolId: string;
  link: string;
  platform: string | null | undefined;
  contentType: string | null | undefined;
  approverId: string;
}

export interface ApproveResult {
  contentId: string | null;
  error: string | null;
}

/**
 * Insert a `contents` row for an approved submission. Idempotent at the
 * boundary — duplicate (campaign_id, content_link) just returns the
 * existing row's id rather than erroring. Status lands at
 * 'pending_verification' per TGB-V2 — team flips to 'posted' via the
 * Verify button on the campaign Content Dashboard.
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
  const { data: contentRow, error: contentErr } = await (admin as any)
    .from('contents')
    .insert({
      campaign_kols_id: campaignKol.id,
      campaign_id: input.campaignId,
      content_link: input.link,
      platform: mapSubmissionPlatformToContents(input.platform),
      type: contentsType,
      status: 'pending_verification',
      activation_date: nowIso.slice(0, 10),
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

  // [2026-07-03] Mirror the manual /campaigns/[id] add-content flow —
  // auto-create a payment row keyed to this content. Amount priority
  // (matches KolDashboardTableView):
  //   1. QRT (repost): master_kol.repost_rate
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
    const amount = contentsType === 'QRT'
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
 */
export function mapSubmissionPlatformToContents(p: string | null | undefined): string {
  const s = (p ?? '').toLowerCase();
  if (s.includes('telegram') || s === 'tg') return 'Telegram';
  if (s.includes('youtube') || s === 'yt') return 'YouTube';
  return 'X';
}

/**
 * contents.type CHECK: ('Post', 'Video', 'Article', 'AMA', 'Ambassadorship',
 *                       'Alpha', 'QRT', 'Thread', 'Spaces', 'Newsletter')
 */
export function mapSubmissionTypeToContents(t: string | null | undefined): string {
  const s = (t ?? '').toLowerCase();
  if (s === 'tweet' || s === 'tg_post' || s === 'post') return 'Post';
  if (s === 'video') return 'Video';
  if (s === 'article') return 'Article';
  if (s === 'ama') return 'AMA';
  if (s === 'thread') return 'Thread';
  if (s === 'qrt' || s === 'quote_rt') return 'QRT';
  if (s === 'spaces') return 'Spaces';
  return 'Post';
}
