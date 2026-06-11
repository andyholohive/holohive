import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/clients/[clientId]/meeting-notes/[noteId]/send-tg
 *
 * [2026-06-11] Phase 2 Bucket C.10 — push a client meeting note summary
 * to the client's Telegram group. Replaces the manual "someone copy-
 * pastes the summary into the TG group" step that was sitting in the
 * team's weekly sync ritual.
 *
 * Flow:
 *   1. Look up the meeting note + the linked client_context for the
 *      target chat_id
 *   2. Format the note as TG HTML (title, date, content, action items)
 *   3. Send via the existing TelegramService.sendToChat helper
 *   4. On success: stamp sent_to_client_tg_at + sent_to_client_tg_by
 *      so the dashboard "Sent to client TG" badge can render
 *
 * Body: optional { force?: boolean } — if true, re-sends even when an
 * earlier send is already on record. Default false so accidental
 * double-clicks don't spam the client.
 *
 * Auth: any authenticated admin / super_admin.
 */
export async function POST(
  request: Request,
  { params }: { params: { clientId: string; noteId: string } },
) {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Service-role client for the cross-write
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let body: { force?: boolean } = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }

  // ─── Lookup meeting note ───────────────────────────────────────
  const { data: note, error: noteErr } = await (supabaseAdmin as any)
    .from('client_meeting_notes')
    .select('id, client_id, title, content, meeting_date, attendees, sent_to_client_tg_at')
    .eq('id', params.noteId)
    .eq('client_id', params.clientId)
    .maybeSingle();
  if (noteErr || !note) {
    return NextResponse.json({ error: 'Meeting note not found' }, { status: 404 });
  }

  if (note.sent_to_client_tg_at && !body.force) {
    return NextResponse.json({
      ok: true,
      skipped: 'already_sent',
      sent_at: note.sent_to_client_tg_at,
    });
  }

  // ─── Lookup client context for chat_id + display name ──────────
  const [{ data: ctx }, { data: client }] = await Promise.all([
    (supabaseAdmin as any)
      .from('client_context')
      .select('telegram_chat_id')
      .eq('client_id', params.clientId)
      .maybeSingle(),
    (supabaseAdmin as any)
      .from('clients')
      .select('name')
      .eq('id', params.clientId)
      .maybeSingle(),
  ]);

  const chatId = (ctx as any)?.telegram_chat_id?.trim();
  if (!chatId) {
    return NextResponse.json({
      ok: false,
      error: 'No telegram_chat_id configured on this client',
      hint: 'Set client_context.telegram_chat_id from the Context tab before sending.',
    }, { status: 400 });
  }

  // ─── Optional: pull HH-side action items so the message includes them ──
  const { data: actionItems } = await (supabaseAdmin as any)
    .from('meeting_action_items')
    .select('id, action_text, owner_user_id, owner_client_side, is_done')
    .eq('meeting_note_id', params.noteId)
    .order('created_at', { ascending: true });

  const items = ((actionItems ?? []) as Array<{
    action_text: string;
    owner_client_side: boolean;
    is_done: boolean;
  }>).filter(i => !i.is_done);

  // ─── Format the TG message ─────────────────────────────────────
  const clientName = (client as any)?.name || 'Client';
  const meetingDateFmt = note.meeting_date
    ? new Date(note.meeting_date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : 'Recent';

  // Escape user-provided strings before interpolating into HTML.
  const esc = (s: string | null | undefined): string =>
    (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const titleLine = note.title ? `<b>${esc(note.title)}</b>\n` : '';
  const contentBlock = note.content ? `${esc(note.content)}\n` : '';
  const actionsBlock = items.length > 0
    ? `\n<b>Action items</b>\n${items.map(i => `• ${esc(i.action_text)}${i.owner_client_side ? '' : ' <i>(Holo Hive)</i>'}`).join('\n')}`
    : '';

  const message =
    `🤝 <b>${esc(clientName)} — sync recap</b>\n` +
    `<i>${esc(meetingDateFmt)}</i>\n\n` +
    titleLine +
    contentBlock +
    actionsBlock;

  // ─── Send via TG ───────────────────────────────────────────────
  const sent = await TelegramService.sendToChat(chatId, message, 'HTML');
  if (!sent) {
    return NextResponse.json({
      ok: false,
      error: 'Telegram send failed',
      hint: 'Check that TELEGRAM_BOT_TOKEN is configured and the bot is a member of the chat.',
    }, { status: 502 });
  }

  // ─── Stamp the success on the note ─────────────────────────────
  const nowIso = new Date().toISOString();
  await (supabaseAdmin as any)
    .from('client_meeting_notes')
    .update({
      sent_to_client_tg_at: nowIso,
      sent_to_client_tg_by: user.id,
    })
    .eq('id', params.noteId);

  return NextResponse.json({
    ok: true,
    sent_at: nowIso,
    chat_id: chatId,
    re_send: !!note.sent_to_client_tg_at,
  });
}
