import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/content-submissions/[id]/review
 *
 * Web fallback for TG-bot approval. Same outcome as tapping Approve/Reject
 * in the TG review channel:
 *   - Update content_submissions status + reviewer info
 *   - Mirror status flip to content_items (F3 path)
 *   - On approve: auto-create a `contents` row so the campaign Content
 *     Dashboard reflects the submission immediately
 *   - Notify the KOL via their per-KOL group chat (👍 on approve,
 *     "Submission issue" on reject)
 *
 * Auth:
 *   - super_admin role: always allowed (auto-included in approver list)
 *   - other users: must be in content_submission_approvers table
 *
 * Body: { action: 'approve' | 'reject', rejection_reason?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  // Look up user profile for role
  const { data: profile } = await (supabase as any)
    .from('users')
    .select('id, name, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: 'No user profile' }, { status: 403 });

  // Authorization: super_admin auto-included, otherwise must be in approvers
  const isSuperAdmin = profile.role === 'super_admin';
  let canApprove = isSuperAdmin;
  if (!canApprove) {
    const { data: approverRow } = await (supabase as any)
      .from('content_submission_approvers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    canApprove = !!approverRow;
  }
  if (!canApprove) {
    return NextResponse.json(
      { error: 'You are not authorized to approve/reject content submissions. Ask a super admin to add you to /admin/telegram-comm.' },
      { status: 403 },
    );
  }

  const body = await request.json();
  const action = body.action as 'approve' | 'reject';
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  }
  const rejectionReason = action === 'reject'
    ? (body.rejection_reason || 'Did not meet criteria. Contact your HoloHive lead for details.')
    : null;

  // Use service role for writes so RLS doesn't get in the way
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch the submission with live KOL + campaign names via JOIN
  const { data: sub, error: subErr } = await (adminClient as any)
    .from('content_submissions')
    .select(`
      id, kol_id, campaign_id, link, platform, content_type, status,
      kol:master_kols!inner(id, name),
      campaign:campaigns!inner(id, name)
    `)
    .eq('id', params.id)
    .maybeSingle();
  if (subErr || !sub) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }
  if (sub.status === 'approved' || sub.status === 'rejected') {
    return NextResponse.json({ error: `Already ${sub.status}` }, { status: 409 });
  }

  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  const nowIso = new Date().toISOString();

  // Update content_submissions
  await (adminClient as any)
    .from('content_submissions')
    .update({
      status: nextStatus,
      reviewed_by: user.id,
      reviewed_by_name: profile.name,
      reviewed_at: nowIso,
      rejection_reason: rejectionReason,
    })
    .eq('id', params.id);

  // Mirror to content_items (F3)
  await (adminClient as any)
    .from('content_items')
    .update(
      action === 'approve'
        ? { status: 'approved', approved_at: nowIso, approved_by: user.id, updated_at: nowIso }
        : { status: 'rejected', updated_at: nowIso },
    )
    .eq('link', sub.link)
    .neq('status', 'rejected');

  // On approve: auto-create a contents row so the campaign Content
  // Dashboard reflects the submission immediately. Closes the F2/F3 loop
  // that previously required manual logging.
  let createdContentId: string | null = null;
  let createContentError: string | null = null;
  if (action === 'approve') {
    // Find this KOL's campaign_kols row (the relationship key the
    // contents table requires).
    const { data: campaignKol } = await (adminClient as any)
      .from('campaign_kols')
      .select('id')
      .eq('campaign_id', sub.campaign_id)
      .eq('master_kol_id', sub.kol_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (campaignKol?.id) {
      // content_submissions uses friendlier values ('X (Twitter)', 'tweet')
      // than the contents CHECK constraints accept ('X', 'Post'). Map
      // before inserting so the constraint passes.
      const { data: contentRow, error: contentErr } = await (adminClient as any)
        .from('contents')
        .insert({
          campaign_kols_id: campaignKol.id,
          campaign_id: sub.campaign_id,
          content_link: sub.link,
          platform: mapSubmissionPlatformToContents(sub.platform),
          type: mapSubmissionTypeToContents(sub.content_type),
          status: 'posted',
          activation_date: nowIso.slice(0, 10),
        })
        .select('id')
        .single();
      if (contentErr) {
        console.error('[/api/content-submissions/review] contents insert failed:', contentErr);
        createContentError = contentErr.message ?? 'insert failed';
      } else {
        createdContentId = (contentRow as any)?.id ?? null;
      }
    } else {
      createContentError = 'KOL is not on this campaign (campaign_kols row missing).';
    }
  }

  // Notify the KOL via their per-KOL group chat (matches TG callback path)
  const { data: kolChat } = await (adminClient as any)
    .from('telegram_chats')
    .select('chat_id')
    .eq('master_kol_id', sub.kol_id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const kolChatId = (kolChat as any)?.chat_id ?? null;
  if (kolChatId && process.env.TELEGRAM_BOT_TOKEN) {
    const text = action === 'approve'
      ? '👍'
      : `Submission issue: <i>${rejectionReason}</i>\nPlease contact your HoloHive lead, then resubmit with <code>/submit</code>.`;
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: kolChatId,
        text,
        parse_mode: 'HTML',
      }),
    }).catch(() => {/* best effort */});
  }

  return NextResponse.json({
    success: true,
    action,
    submission_id: params.id,
    created_content_id: createdContentId,
    create_content_error: createContentError,
  });
}

/**
 * content_submissions stores friendlier display values than the contents
 * table's CHECK constraint accepts. Map to the canonical contents values
 * so the auto-insert on approve actually lands.
 *
 * contents.platform CHECK: ('X', 'Telegram')
 */
function mapSubmissionPlatformToContents(p: string | null | undefined): string {
  const s = (p ?? '').toLowerCase();
  if (s.includes('telegram') || s === 'tg') return 'Telegram';
  // X / X (Twitter) / Twitter — everything else collapses to X for now
  // (YouTube doesn't exist in contents.platform yet; that's a future
  // schema change, tracked as a v2 gap.)
  return 'X';
}

/**
 * contents.type CHECK: ('Post', 'Video', 'Article', 'AMA', 'Ambassadorship',
 *                       'Alpha', 'QRT', 'Thread', 'Spaces', 'Newsletter')
 */
function mapSubmissionTypeToContents(t: string | null | undefined): string {
  const s = (t ?? '').toLowerCase();
  if (s === 'tweet' || s === 'tg_post' || s === 'post') return 'Post';
  if (s === 'video') return 'Video';
  if (s === 'article') return 'Article';
  if (s === 'ama') return 'AMA';
  if (s === 'thread') return 'Thread';
  if (s === 'qrt') return 'QRT';
  if (s === 'spaces') return 'Spaces';
  // Default to Post — least surprising; the team can re-classify in the
  // Content Dashboard if the auto-mapping picked wrong.
  return 'Post';
}
