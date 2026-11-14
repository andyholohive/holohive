import { escapeHtml } from '@/lib/telegramHtml';
import { tg, kstClock } from './tg';
import { getDraftConfig, type DraftConfig } from './config';
import { resolveStaff, type DraftStaff } from './resolve';
import { isKorean, toKoreanNote } from './llm';
import { cardKeyboard, approveMessage, changesMessage } from './card';
import { handleDraftPick } from './intake';
import { sendOutbound } from './worker';

/**
 * Team side of /draft: taps on the review card and the change-note reply.
 *
 * Anyone on staff can decide (Jdot, 2026-11-14: the row records who did).
 * The database decides races: every status change is a conditional update on
 * `status = 'pending_review'`, so the first tap wins and the second is told
 * who handled it.
 */
const DRAFT_COLS = `
  id, status, version_n, kol_chat_id, kol_thread_id, source_message_id,
  lint_flags, gloss_failed, lineup_slot_id,
  review_chat_id, review_thread_id, review_message_id, review_card_html,
  reviewed_by, outbound_preview_message_id, send_at, outbound_sent_at,
  kol:master_kols!inner(id, name, telegram_username),
  reviewer:users!content_drafts_reviewed_by_fkey(name)
`;

async function loadDraft(sb: any, id: string): Promise<any | null> {
  const { data, error } = await sb.from('content_drafts').select(DRAFT_COLS).eq('id', id).maybeSingle();
  if (error) console.error('[/draft] load failed:', error.message);
  return data ?? null;
}

const handleOf = (d: any): string | null => (d?.kol?.telegram_username || '').replace(/^@/, '') || null;

function keyboardFor(d: any, confirming = false) {
  return cardKeyboard({
    draftId: d.id, matched: !!d.lineup_slot_id,
    flagCount: Array.isArray(d.lint_flags) ? d.lint_flags.length : 0,
    glossFailed: !!d.gloss_failed,
    kolChatId: String(d.kol_chat_id), kolThreadId: d.kol_thread_id ?? null,
    sourceMessageId: Number(d.source_message_id), confirming,
  });
}

/** Re-render the card's last message with a stamp line and no buttons. */
async function stampCard(d: any, stampHtml: string) {
  if (!d.review_chat_id || !d.review_message_id || !d.review_card_html) return;
  await tg('editMessageText', {
    chat_id: d.review_chat_id, message_id: d.review_message_id,
    text: `${d.review_card_html}\n\n${stampHtml}`,
    parse_mode: 'HTML', link_preview_options: { is_disabled: true },
  });
}

/**
 * Show the outbound message in the topic with a Cancel button and schedule
 * the send. With a zero window it goes straight out.
 */
async function queueOutbound(sb: any, cfg: DraftConfig, d: any, text: string) {
  if (cfg.cancelWindowS <= 0) {
    await sb.from('content_drafts').update({ send_at: new Date().toISOString() }).eq('id', d.id);
    await sendOutbound(sb, cfg, d.id);
    return;
  }
  const preview = await tg<{ message_id: number }>('sendMessage', {
    chat_id: d.review_chat_id,
    ...(d.review_thread_id || cfg.reviewThreadId ? { message_thread_id: d.review_thread_id || cfg.reviewThreadId } : {}),
    text: `📤 <b>Sending to the KOL in about ${cfg.cancelWindowS}s</b>\n\n${escapeHtml(text)}`,
    parse_mode: 'HTML', link_preview_options: { is_disabled: true },
    reply_parameters: { message_id: d.review_message_id, allow_sending_without_reply: true },
    reply_markup: { inline_keyboard: [[{ text: '✖️ Cancel', callback_data: `drf:cx:${d.id}` }]] },
  });
  await sb.from('content_drafts').update({
    outbound_preview_message_id: preview.ok ? preview.result.message_id : null,
    send_at: new Date(Date.now() + cfg.cancelWindowS * 1000).toISOString(),
  }).eq('id', d.id);
}

async function alreadyHandled(sb: any, id: string): Promise<string> {
  const d = await loadDraft(sb, id);
  if (d?.status === 'superseded') return 'Superseded by a newer version';
  return `Already handled by ${d?.reviewer?.name || 'someone else'}`;
}

async function approve(sb: any, cfg: DraftConfig, cq: any, staff: DraftStaff, id: string, withConfirm: boolean) {
  const answer = (text?: string) => tg('answerCallbackQuery', { callback_query_id: cq.id, ...(text ? { text } : {}) });
  const d = await loadDraft(sb, id);
  if (!d) { await answer('Draft not found'); return; }
  const flagCount = Array.isArray(d.lint_flags) ? d.lint_flags.length : 0;
  // A stale one-tap button must not skip the second tap.
  if (!withConfirm && (flagCount > 0 || d.gloss_failed)) {
    await tg('editMessageReplyMarkup', { chat_id: d.review_chat_id, message_id: d.review_message_id, reply_markup: { inline_keyboard: keyboardFor(d, true) } });
    await answer(flagCount > 0 ? 'This draft has flags. Tap again to confirm.' : 'No English read on this draft. Tap again to confirm.');
    return;
  }
  const text = approveMessage(handleOf(d), d.kol.name);
  const { data: won } = await sb
    .from('content_drafts')
    .update({
      status: 'approved', reviewed_by: staff.id, reviewed_at: new Date().toISOString(),
      approved_with_flags: flagCount > 0,
      outbound_kind: 'approve', outbound_text: text,
      change_prompt_message_id: null, change_prompt_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id).eq('status', 'pending_review')
    .select('id');
  if (!won?.length) { await answer(await alreadyHandled(sb, id)); return; }
  await answer('Approved');
  await stampCard(d, `✅ <b>Approved by ${escapeHtml(staff.name)}</b> · ${kstClock()} KST${flagCount > 0 ? ' · with flags' : ''}`);
  await queueOutbound(sb, cfg, d, text);
}

async function requestChanges(sb: any, cq: any, staff: DraftStaff, id: string) {
  const answer = (text?: string) => tg('answerCallbackQuery', { callback_query_id: cq.id, ...(text ? { text } : {}) });
  const d = await loadDraft(sb, id);
  if (!d) { await answer('Draft not found'); return; }
  if (d.status !== 'pending_review') { await answer(await alreadyHandled(sb, id)); return; }
  const from = cq.from || {};
  const mention = from.username ? `@${from.username}` : `<a href="tg://user?id=${from.id}">${escapeHtml(staff.name)}</a>`;
  const prompt = await tg<{ message_id: number }>('sendMessage', {
    chat_id: d.review_chat_id,
    ...(cq.message?.message_thread_id ? { message_thread_id: cq.message.message_thread_id } : {}),
    text: `${mention} What should change? English or Korean is fine.`,
    parse_mode: 'HTML',
    reply_parameters: { message_id: d.review_message_id, allow_sending_without_reply: true },
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'Change note for the KOL' },
  });
  if (!prompt.ok) { await answer('Could not open the note prompt. Try again.'); return; }
  await sb.from('content_drafts')
    .update({ change_prompt_message_id: prompt.result.message_id, change_prompt_by: staff.id })
    .eq('id', id).eq('status', 'pending_review');
  await answer('Reply to the prompt with your note');
}

async function cancelOutbound(sb: any, cq: any, staff: DraftStaff, id: string) {
  const answer = (text?: string) => tg('answerCallbackQuery', { callback_query_id: cq.id, ...(text ? { text } : {}) });
  // Only wins while the send job has not claimed the row.
  const { data: won } = await sb
    .from('content_drafts')
    .update({
      status: 'pending_review', reviewed_by: null, reviewed_at: null, approved_with_flags: false,
      outbound_kind: null, outbound_text: null, send_at: null, outbound_preview_message_id: null,
      change_note_raw: null, change_note_ko: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id).in('status', ['approved', 'changes_requested'])
    .is('outbound_sent_at', null).not('send_at', 'is', null)
    .select('id');
  if (!won?.length) { await answer('Too late, it was already sent'); return; }
  await answer('Cancelled. Nothing was sent.');
  const d = await loadDraft(sb, id);
  if (cq.message?.message_id) {
    await tg('editMessageText', {
      chat_id: cq.message.chat.id, message_id: cq.message.message_id,
      text: `✖️ Cancelled by ${escapeHtml(staff.name)}. Nothing was sent to the KOL.`, parse_mode: 'HTML',
    });
  }
  if (d?.review_chat_id && d.review_message_id && d.review_card_html) {
    await tg('editMessageText', {
      chat_id: d.review_chat_id, message_id: d.review_message_id,
      text: d.review_card_html, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: keyboardFor(d) },
    });
  }
}

/** Every `drf:` button, in the KOL group (picker) or the Drafts topic. */
export async function handleDraftCallback(sb: any, cq: any): Promise<void> {
  const [, action, id, extra] = String(cq.data || '').split(':');
  if (action === 'pk' || action === 'px') {
    await handleDraftPick(sb, cq, action, id, extra);
    return;
  }
  const staff = await resolveStaff(sb, cq.from?.id);
  if (!staff) {
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Team only' });
    return;
  }
  const cfg = await getDraftConfig(sb);
  if (action === 'ap') return approve(sb, cfg, cq, staff, id, false);
  if (action === 'a2') return approve(sb, cfg, cq, staff, id, true);
  if (action === 'a1') {
    const d = await loadDraft(sb, id);
    if (!d || d.status !== 'pending_review') {
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: d ? await alreadyHandled(sb, id) : 'Draft not found' });
      return;
    }
    await tg('editMessageReplyMarkup', { chat_id: d.review_chat_id, message_id: d.review_message_id, reply_markup: { inline_keyboard: keyboardFor(d, true) } });
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Tap again to confirm' });
    return;
  }
  if (action === 'rc') return requestChanges(sb, cq, staff, id);
  if (action === 'cx') return cancelOutbound(sb, cq, staff, id);
  await tg('answerCallbackQuery', { callback_query_id: cq.id });
}

/**
 * A reply to the "What should change?" prompt. Returns true when the message
 * was one, so the webhook can stop there.
 */
export async function handleChangeNoteReply(sb: any, message: any): Promise<boolean> {
  const promptId = message?.reply_to_message?.message_id;
  if (!promptId || !message.reply_to_message?.from?.is_bot || !message.chat?.id) return false;
  const note = String(message.text ?? '').trim();
  if (!note || note.startsWith('/')) return false;

  const { data: hit } = await sb
    .from('content_drafts').select('id')
    .eq('change_prompt_message_id', promptId)
    .eq('review_chat_id', message.chat.id)
    .maybeSingle();
  if (!hit?.id) return false;

  const say = (text: string) => tg('sendMessage', {
    chat_id: message.chat.id,
    ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}),
    text, parse_mode: 'HTML',
    reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
  });
  const staff = await resolveStaff(sb, message.from?.id);
  if (!staff) return true;
  const cfg = await getDraftConfig(sb);
  const d = await loadDraft(sb, hit.id);
  if (!d) return true;
  if (d.status !== 'pending_review') { await say(escapeHtml(await alreadyHandled(sb, hit.id))); return true; }

  // Korean goes out exactly as written. Anything else is translated before
  // the status changes, so a failed translation leaves the draft pending.
  let noteKo = note;
  if (!isKorean(note)) {
    try {
      noteKo = await toKoreanNote(note);
    } catch (err: any) {
      console.error('[/draft] change-note translation failed:', err?.message);
      await say('⚠️ Could not translate the note. Reply to the prompt again, or write it in Korean.');
      return true;
    }
  }
  const text = changesMessage(handleOf(d), d.kol.name, noteKo);
  const { data: won } = await sb
    .from('content_drafts')
    .update({
      status: 'changes_requested', reviewed_by: staff.id, reviewed_at: new Date().toISOString(),
      change_note_raw: note, change_note_ko: noteKo,
      outbound_kind: 'changes', outbound_text: text,
      change_prompt_message_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', hit.id).eq('status', 'pending_review')
    .select('id');
  if (!won?.length) { await say(escapeHtml(await alreadyHandled(sb, hit.id))); return true; }
  await stampCard(d, `✏️ <b>Changes requested by ${escapeHtml(staff.name)}</b> · ${kstClock()} KST`);
  await queueOutbound(sb, cfg, d, text);
  return true;
}

