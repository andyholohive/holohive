import { tg, downloadTelegramFile, deletePrompt } from './tg';
import { getDraftConfig, draftAllowedInChat, type DraftConfig } from './config';
import { resolveKolByChat, findOpenSlots, slotDeadline, type DraftKol, type OpenSlot } from './resolve';
import { glossDraft, matchBannedTerms, lintRules, type LintFlag, type DraftImage } from './llm';
import { buildCardMessages, cardKeyboard } from './card';

/**
 * /draft intake: a KOL (or a team member on their behalf) shares a draft in
 * the KOL group, the bot records it and posts a review card to the Drafts
 * topic. Mirrors /submit one stage earlier. Spec: Jdot, 2026-11-12.
 */
export const DRAFT_COMMAND_RE = /^\/draft(?:@\w+)?(?=\s|$)/i;

export function isDraftCommand(message: any): boolean {
  return DRAFT_COMMAND_RE.test(message?.text ?? message?.caption ?? '');
}

interface MediaPart { messageId: number; fileId: string | null; kind: 'image' | 'file' }

interface DraftPayload {
  kolChatId: string;
  kolThreadId: number | null;
  /** The message the decision is sent back as a reply to: the draft itself. */
  sourceMessageId: number;
  commandMessageId: number;
  submittedBy: number | null;
  bodyText: string | null;
  media: MediaPart[];
  docUrl: string | null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function mediaOf(m: any): MediaPart | null {
  if (Array.isArray(m?.photo) && m.photo.length) {
    return { messageId: m.message_id, fileId: m.photo[m.photo.length - 1].file_id, kind: 'image' };
  }
  if (m?.document) {
    const isImage = typeof m.document.mime_type === 'string' && m.document.mime_type.startsWith('image/');
    return { messageId: m.message_id, fileId: m.document.file_id, kind: isImage ? 'image' : 'file' };
  }
  if (m?.video || m?.animation) return { messageId: m.message_id, fileId: null, kind: 'file' };
  return null;
}

/**
 * Album parts arrive as separate webhook calls and only one carries the
 * caption, so every album message in a /draft-enabled chat is noted here and
 * collected when the command arrives.
 */
export async function bufferAlbumPart(sb: any, message: any): Promise<void> {
  if (!message?.media_group_id || !message?.chat?.id) return;
  const part = mediaOf(message);
  if (!part) return;
  const cfg = await getDraftConfig(sb);
  if (!draftAllowedInChat(cfg, message.chat.id)) return;
  const { error } = await sb.from('draft_media_buffer').upsert({
    chat_id: message.chat.id,
    media_group_id: String(message.media_group_id),
    message_id: message.message_id,
    file_id: part.fileId,
    kind: part.kind,
  }, { onConflict: 'chat_id,message_id' });
  if (error) console.warn('[/draft] album buffer write failed:', error.message);
}

async function albumParts(sb: any, chatId: string, groupId: string): Promise<MediaPart[]> {
  const { data } = await sb
    .from('draft_media_buffer')
    .select('message_id, file_id, kind')
    .eq('chat_id', chatId)
    .eq('media_group_id', groupId)
    .order('message_id', { ascending: true });
  return ((data ?? []) as Array<{ message_id: number; file_id: string | null; kind: string }>)
    .map(r => ({ messageId: Number(r.message_id), fileId: r.file_id, kind: r.kind === 'image' ? 'image' as const : 'file' as const }));
}

const GDOC_RE = /https?:\/\/docs\.google\.com\/document\/d\/([\w-]+)[^\s]*/i;

/** Text of a link-readable Google Doc, or null when it needs a sign-in. */
async function fetchGoogleDocText(docId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`, { redirect: 'follow' });
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') || '').includes('text/plain')) return null;
    const text = (await res.text()).replace(/^﻿/, '').trim();
    return text ? text.slice(0, 20_000) : null;
  } catch {
    return null;
  }
}

/** Pull the draft out of the command message, in any of the four accepted forms. */
async function capture(sb: any, message: any): Promise<DraftPayload | null> {
  const chatId = String(message.chat.id);
  const raw: string = message.text ?? message.caption ?? '';
  const after = raw.replace(DRAFT_COMMAND_RE, '').trim();
  const ownMedia = mediaOf(message);

  // In a forum topic every message "replies" to the topic's first message;
  // that is not a reply to a draft.
  const reply = message.reply_to_message;
  const realReply = reply && !reply.forum_topic_created && reply.message_id !== message.message_thread_id ? reply : null;

  // `/draft` alone as a reply logs the replied-to message. Anything typed
  // after the command, or media attached to it, is the draft itself.
  const src = !after && !ownMedia && realReply ? realReply : message;
  let text: string = src === message ? after : String(src.text ?? src.caption ?? '').replace(DRAFT_COMMAND_RE, '').trim();

  let media: MediaPart[] = [];
  const own = mediaOf(src);
  if (src.media_group_id) {
    // Give the sibling album messages a moment to land when they are being
    // sent together with the command.
    if (src === message) await sleep(2500);
    media = await albumParts(sb, chatId, String(src.media_group_id));
  }
  if (own && !media.some(p => p.messageId === own.messageId)) media.push(own);
  media.sort((a, b) => a.messageId - b.messageId);

  let docUrl: string | null = null;
  const doc = text.match(GDOC_RE);
  if (doc) {
    docUrl = doc[0];
    const docText = await fetchGoogleDocText(doc[1]);
    const rest = text.replace(doc[0], '').trim();
    text = docText ? (rest ? `${rest}\n\n${docText}` : docText) : rest;
  }

  if (!text && media.length === 0 && !docUrl) return null;
  return {
    kolChatId: chatId,
    kolThreadId: message.message_thread_id || null,
    sourceMessageId: src.message_id,
    commandMessageId: message.message_id,
    submittedBy: message.from?.id ?? null,
    bodyText: text || null,
    media,
    docUrl,
  };
}

async function replyInKolChat(p: { kolChatId: string; kolThreadId: number | null }, replyTo: number, text: string) {
  return tg('sendMessage', {
    chat_id: p.kolChatId,
    ...(p.kolThreadId ? { message_thread_id: p.kolThreadId } : {}),
    text,
    reply_parameters: { message_id: replyTo, allow_sending_without_reply: true },
  });
}

export async function handleDraftCommand(sb: any, message: any): Promise<void> {
  const chatId = String(message.chat?.id ?? '');
  if (!chatId) return;
  const cfg = await getDraftConfig(sb);
  if (!draftAllowedInChat(cfg, chatId)) return;
  const where = { kolChatId: chatId, kolThreadId: message.message_thread_id || null };

  const kol = await resolveKolByChat(sb, chatId);
  if (!kol) {
    await replyInKolChat(where, message.message_id, "This chat isn't linked to a KOL yet. A Holo Hive team member can link it on /crm/telegram. Then /draft will work here.");
    return;
  }

  const payload = await capture(sb, message);
  if (!payload) {
    await replyInKolChat(where, message.message_id, '초안 내용을 /draft 뒤에 적어주시거나, 초안 메시지에 답장으로 /draft 를 보내주세요!');
    return;
  }

  const slots = await findOpenSlots(sb, kol.id);
  if (slots.length <= 1) {
    await createDraft(sb, cfg, kol, payload, slots[0] ?? null);
    return;
  }

  // Several clients at once: ask which one, hold the draft until the tap.
  await sb.from('pending_drafts').delete().lt('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString());
  const { data: pending, error } = await sb
    .from('pending_drafts')
    .insert({ kol_id: kol.id, payload })
    .select('id')
    .single();
  if (error || !pending?.id) {
    console.error('[/draft] pending_drafts insert failed:', error?.message);
    await replyInKolChat(where, message.message_id, '⚠️ 잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요!');
    return;
  }
  // callback_data is capped at 64 bytes, so the campaign is the first 8
  // characters of its id, resolved back on the tap (same as /submit).
  const buttons = slots.map(s => [{ text: s.clientName, callback_data: `drf:pk:${pending.id}:${s.campaignId.slice(0, 8)}` }]);
  buttons.push([{ text: '❌ 취소', callback_data: `drf:px:${pending.id}` }]);
  await tg('sendMessage', {
    chat_id: chatId,
    ...(where.kolThreadId ? { message_thread_id: where.kolThreadId } : {}),
    text: '어떤 프로젝트 초안인가요?',
    reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
    reply_markup: { inline_keyboard: buttons },
  });
}

/** Tap on the client picker in the KOL group. */
export async function handleDraftPick(sb: any, cq: any, action: 'pk' | 'px', pendingId: string, campaignPrefix?: string): Promise<void> {
  const chatId = String(cq.message?.chat?.id ?? '');
  const messageId = cq.message?.message_id;
  const answer = (text?: string) => tg('answerCallbackQuery', { callback_query_id: cq.id, ...(text ? { text } : {}) });
  const cfg = await getDraftConfig(sb);
  if (!draftAllowedInChat(cfg, chatId)) { await answer(); return; }

  // Deleting the row is the claim: a second tap finds nothing.
  const { data: rows } = await sb.from('pending_drafts').delete().eq('id', pendingId).select('kol_id, payload');
  const pending = (rows as any[])?.[0];
  if (!pending) { await answer('이미 처리됐어요.'); return; }
  if (action === 'px') {
    await answer();
    await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: '취소했어요.' });
    return;
  }
  const kol = await resolveKolByChat(sb, chatId);
  const slot = kol ? (await findOpenSlots(sb, kol.id)).find(s => s.campaignId.startsWith(campaignPrefix || '~')) : null;
  await answer();
  if (!kol || kol.id !== pending.kol_id) {
    await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: '⚠️ 잠시 문제가 생겼어요. /draft 를 다시 보내주세요!' });
    return;
  }
  await createDraft(sb, cfg, kol, pending.payload as DraftPayload, slot ?? null, { chatId, messageId });
}

/**
 * Record the draft, acknowledge it in the KOL group, then post the review
 * card. The acknowledgement goes out before the gloss and rule check so the
 * KOL is never left waiting on a model call.
 */
async function createDraft(
  sb: any, cfg: DraftConfig, kol: DraftKol, p: DraftPayload, slot: OpenSlot | null,
  editPicker?: { chatId: string; messageId: number },
): Promise<void> {
  // Version per slot; an older draft still waiting for review is superseded.
  let version = 1;
  let superseded: Array<{ review_chat_id: number | null; review_message_id: number | null; review_card_html: string | null; change_prompt_message_id: number | null }> = [];
  if (slot) {
    const { data: last } = await sb
      .from('content_drafts').select('version_n')
      .eq('lineup_slot_id', slot.slotId)
      .order('version_n', { ascending: false }).limit(1).maybeSingle();
    version = ((last as any)?.version_n ?? 0) + 1;
    const { data: old } = await sb
      .from('content_drafts')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('lineup_slot_id', slot.slotId).eq('status', 'pending_review')
      .select('review_chat_id, review_message_id, review_card_html, change_prompt_message_id');
    superseded = (old ?? []) as typeof superseded;
  }

  const { data: row, error } = await sb
    .from('content_drafts')
    .insert({
      campaign_id: slot?.campaignId ?? null,
      lineup_slot_id: slot?.slotId ?? null,
      kol_id: kol.id,
      version_n: version,
      status: slot ? 'pending_review' : 'unmatched',
      kol_chat_id: p.kolChatId,
      kol_thread_id: p.kolThreadId,
      source_message_id: p.sourceMessageId,
      submitted_by_tg_user_id: p.submittedBy,
      body_text: p.bodyText,
      media_file_ids: p.media.map(m => m.fileId).filter(Boolean),
      media_message_ids: p.media.map(m => m.messageId),
      doc_url: p.docUrl,
    })
    .select('id')
    .single();
  if (error || !row?.id) {
    console.error('[/draft] content_drafts insert failed:', error?.message);
    await replyInKolChat(p, p.commandMessageId, '⚠️ 잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요!');
    return;
  }
  const draftId: string = row.id;

  const receipt = slot
    ? `✅ 초안 접수됐습니다! ${slot.clientName} 팀 검토 후 바로 안내드릴게요 ^^`
    : '현재 진행 중인 캠페인이 없어요, 담당자 확인 후 안내드릴게요!';
  if (editPicker) await tg('editMessageText', { chat_id: editPicker.chatId, message_id: editPicker.messageId, text: receipt });
  else await replyInKolChat(p, p.commandMessageId, receipt);

  for (const old of superseded) {
    await deletePrompt(old.review_chat_id, old.change_prompt_message_id);
    if (!old.review_chat_id || !old.review_message_id || !old.review_card_html) continue;
    await tg('editMessageText', {
      chat_id: old.review_chat_id, message_id: old.review_message_id,
      text: `${old.review_card_html}\n\n♻️ <b>Superseded by v${version}</b>`,
      parse_mode: 'HTML', link_preview_options: { is_disabled: true },
    });
  }

  // English read. Without one, approving takes a second tap.
  let gloss: string | null = null;
  let transcript = '';
  let glossFailed = false;
  const images: DraftImage[] = [];
  for (const m of p.media.filter(x => x.kind === 'image' && x.fileId).slice(0, 4)) {
    const img = await downloadTelegramFile(m.fileId as string);
    if (img) images.push(img);
  }
  if (p.bodyText || images.length) {
    try {
      const g = await glossDraft({ text: p.bodyText, images });
      gloss = g.english; transcript = g.transcript;
    } catch (err: any) {
      console.error('[/draft] gloss failed:', err?.message);
      glossFailed = true;
    }
  } else {
    glossFailed = true;
  }

  // Per-client rule check: exact banned terms first, then the plain-language rules.
  let flags: LintFlag[] = [];
  const draftText = [p.bodyText, transcript].filter(Boolean).join('\n');
  if (slot && draftText) {
    const { data: camp } = await sb.from('campaigns').select('draft_rules').eq('id', slot.campaignId).maybeSingle();
    const rules = (camp as any)?.draft_rules || {};
    const banned: string[] = Array.isArray(rules.banned_terms) ? rules.banned_terms.filter((t: any) => typeof t === 'string') : [];
    const plain: string[] = Array.isArray(rules.rules) ? rules.rules.filter((t: any) => typeof t === 'string') : [];
    flags = matchBannedTerms(draftText, banned);
    try {
      // A span the banned-term match already caught is not listed twice.
      const seen = new Set(flags.map(f => f.span));
      flags = flags.concat((await lintRules(draftText, plain)).filter(f => !seen.has(f.span)));
    } catch (err: any) {
      console.error('[/draft] rule check failed:', err?.message);
    }
  }

  await sb.from('content_drafts').update({ gloss_en: gloss, gloss_failed: glossFailed, lint_flags: flags, updated_at: new Date().toISOString() }).eq('id', draftId);

  if (!cfg.reviewChatId) {
    console.error('[/draft] drafts_chat_id is not set; draft', draftId, 'has no review card');
    return;
  }
  const topic = cfg.reviewThreadId ? { message_thread_id: cfg.reviewThreadId } : {};

  // Media first, then the card as a reply to it.
  let replyTo: number | null = null;
  let mediaNote: string | null = null;
  if (p.media.length) {
    const copied = await tg<Array<{ message_id: number }>>('copyMessages', {
      chat_id: cfg.reviewChatId, ...topic,
      from_chat_id: p.kolChatId,
      message_ids: p.media.map(m => m.messageId),
    });
    if (copied.ok && copied.result.length) {
      replyTo = copied.result[0].message_id;
      mediaNote = '[media in the message above]';
    } else {
      mediaNote = '[media could not be copied, open the KOL chat to view it]';
      if (!copied.ok) console.error('[/draft] copyMessages failed:', copied.description);
    }
  }

  const messages = buildCardMessages({
    draftId, version, matched: !!slot,
    clientName: slot?.clientName ?? null,
    weekNumber: slot?.weekNumber ?? null,
    angleIndex: slot?.angleIndex ?? null,
    angleName: slot?.angleName ?? null,
    kolName: kol.name, kolHandle: kol.handle,
    deadline: slot ? slotDeadline(slot.weekOf) : null,
    bodyText: p.bodyText, mediaNote, docUrl: p.docUrl,
    gloss, flags,
    kolChatId: p.kolChatId, kolThreadId: p.kolThreadId, sourceMessageId: p.sourceMessageId,
  });
  const keyboard = cardKeyboard({
    draftId, matched: !!slot, flagCount: flags.length, glossFailed,
    kolChatId: p.kolChatId, kolThreadId: p.kolThreadId, sourceMessageId: p.sourceMessageId,
  });

  let lastId: number | null = null;
  for (let i = 0; i < messages.length; i++) {
    const isLast = i === messages.length - 1;
    const sent = await tg<{ message_id: number }>('sendMessage', {
      chat_id: cfg.reviewChatId, ...topic,
      text: messages[i], parse_mode: 'HTML', link_preview_options: { is_disabled: true },
      ...(i === 0 && replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
      ...(isLast && keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
    if (!sent.ok) {
      console.error('[/draft] review card send failed:', sent.description);
      return;
    }
    lastId = sent.result.message_id;
  }
  await sb.from('content_drafts').update({
    review_chat_id: cfg.reviewChatId,
    review_thread_id: cfg.reviewThreadId,
    review_message_id: lastId,
    review_card_html: messages[messages.length - 1],
    updated_at: new Date().toISOString(),
  }).eq('id', draftId);
}
