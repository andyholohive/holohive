import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { createApprovedContentsRow } from '@/lib/contentSubmissionApproval';

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
      kol_receipt_chat_id, kol_receipt_message_id,
      kol:master_kols!inner(id, name),
      campaign:campaigns!inner(id, name, client:clients(name))
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
    const result = await createApprovedContentsRow(adminClient, {
      submissionId: params.id,
      campaignId: sub.campaign_id,
      kolId: sub.kol_id,
      link: sub.link,
      platform: sub.platform,
      contentType: sub.content_type,
    });
    createdContentId = result.contentId;
    createContentError = result.error;
    if (createContentError) {
      console.error('[/api/content-submissions/review] contents insert failed:', createContentError);
    }
  }

  // Notify the KOL. On approve, prefer EDITING their original /submit
  // receipt to drop the "pending review" tail — "…, submitted for X." —
  // matching the TG callback path. Fall back to a fresh per-KOL-chat
  // message for rejects and for legacy submissions with no recorded receipt.
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const receiptChatId = (sub as any).kol_receipt_chat_id;
  const receiptMessageId = (sub as any).kol_receipt_message_id;
  const displayName = (sub as any).campaign?.client?.name || (sub as any).campaign?.name || 'your campaign';
  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let receiptEdited = false;
  if (action === 'approve' && !createContentError && receiptChatId && receiptMessageId && botToken) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: receiptChatId,
        message_id: Number(receiptMessageId),
        text: `✅ Got it — submitted for <b>${escHtml(displayName)}</b>.`,
        parse_mode: 'HTML',
      }),
    }).catch(() => null);
    receiptEdited = !!(res && (res as Response).ok);
  }

  // Approve never sends a second message — it only edits the receipt (above).
  // If there was no receipt to edit (legacy rows), stay silent. Reject still
  // sends its own message so the KOL knows to fix + resubmit.
  if (action === 'reject') {
    const { data: kolChat } = await (adminClient as any)
      .from('telegram_chats')
      .select('chat_id')
      .eq('master_kol_id', sub.kol_id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const kolChatId = (kolChat as any)?.chat_id ?? null;
    if (kolChatId && botToken) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: kolChatId,
          text: `Submission issue: <i>${rejectionReason}</i>\nPlease contact your HoloHive lead, then resubmit with <code>/submit</code>.`,
          parse_mode: 'HTML',
        }),
      }).catch(() => {/* best effort */});
    }
  }

  return NextResponse.json({
    success: true,
    action,
    submission_id: params.id,
    created_content_id: createdContentId,
    create_content_error: createContentError,
  });
}

