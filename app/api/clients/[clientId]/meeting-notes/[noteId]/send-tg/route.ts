import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { TelegramService } from '@/lib/telegramService';
import { formatDate } from '@/lib/dateFormat';

export const dynamic = 'force-dynamic';

/**
 * POST /api/clients/[clientId]/meeting-notes/[noteId]/send-tg
 *
 * Push a client call note summary to the client's Telegram group.
 *
 * [2026-06-15] Rewired to honor the spec literally — notes now live on
 * `client_context.call_notes` JSONB, so we read + update by JSONB
 * element id (the `noteId` route param). The old route hit
 * client_meeting_notes; that path is now dormant.
 *
 * Flow:
 *   1. Pull the client_context row → find the note element by id
 *   2. Format the note as TG HTML (date + content + open HH action items)
 *   3. Send via TelegramService.sendToChat
 *   4. On success: write back the full call_notes array with
 *      sent_to_client_tg_at + sent_to_client_tg_by stamped on the
 *      target element
 *
 * Body: optional { force?: boolean } — re-send when an earlier send is
 * on record. Default false so accidental double-clicks don't spam.
 *
 * Auth: any authenticated user. Same as before.
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

  // Service-role client for the JSONB update (RLS-safe).
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let body: { force?: boolean } = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }

  // ─── Lookup the client_context row ─────────────────────────────
  type Note = {
    id: string;
    meeting_date: string;
    content: string;
    action_items: Array<{
      text: string;
      owner_client_side: boolean;
      is_done: boolean;
    }>;
    sent_to_client_tg_at: string | null;
    sent_to_client_tg_by: string | null;
  };

  const [{ data: ctx, error: ctxErr }, { data: client }] = await Promise.all([
    (supabaseAdmin as any)
      .from('client_context')
      .select('id, telegram_chat_id, call_notes')
      .eq('client_id', params.clientId)
      .maybeSingle(),
    (supabaseAdmin as any)
      .from('clients')
      .select('name')
      .eq('id', params.clientId)
      .maybeSingle(),
  ]);

  if (ctxErr || !ctx) {
    return NextResponse.json({ error: 'Client context not found' }, { status: 404 });
  }

  const callNotes = (((ctx as any).call_notes ?? []) as Note[]);
  const noteIdx = callNotes.findIndex(n => n.id === params.noteId);
  if (noteIdx < 0) {
    return NextResponse.json({ error: 'Call note not found' }, { status: 404 });
  }
  const note = callNotes[noteIdx];

  if (note.sent_to_client_tg_at && !body.force) {
    return NextResponse.json({
      ok: true,
      skipped: 'already_sent',
      sent_at: note.sent_to_client_tg_at,
    });
  }

  const chatId = ((ctx as any).telegram_chat_id ?? '').trim();
  if (!chatId) {
    return NextResponse.json({
      ok: false,
      error: 'No telegram_chat_id configured on this client',
      hint: 'Set client_context.telegram_chat_id from the Context tab before sending.',
    }, { status: 400 });
  }

  // ─── Format the TG message ─────────────────────────────────────
  const clientName = (client as any)?.name || 'Client';
  const meetingDateFmt = note.meeting_date
    ? formatDate(note.meeting_date + (note.meeting_date.includes('T') ? '' : 'T00:00:00'))
    : 'Recent';

  // HTML escape user-provided strings before interpolating.
  const esc = (s: string | null | undefined): string =>
    (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const openItems = (note.action_items ?? []).filter(i => !i.is_done);
  const contentBlock = note.content ? `${esc(note.content)}\n` : '';
  const actionsBlock = openItems.length > 0
    ? `\n<b>Action Items</b>\n${openItems.map(i => `• ${esc(i.text)}${i.owner_client_side ? '' : ' <i>(Holo Hive)</i>'}`).join('\n')}`
    : '';

  const message =
    `🤝 <b>${esc(clientName)} — Sync Recap</b>\n` +
    `<i>${esc(meetingDateFmt)}</i>\n\n` +
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

  // ─── Stamp the success on the JSONB element ────────────────────
  const nowIso = new Date().toISOString();
  const nextNotes = [...callNotes];
  nextNotes[noteIdx] = {
    ...note,
    sent_to_client_tg_at: nowIso,
    sent_to_client_tg_by: user.id,
  };

  await (supabaseAdmin as any)
    .from('client_context')
    .update({ call_notes: nextNotes, updated_at: nowIso })
    .eq('id', (ctx as any).id);

  return NextResponse.json({
    ok: true,
    sent_at: nowIso,
    chat_id: chatId,
    re_send: !!note.sent_to_client_tg_at,
  });
}
