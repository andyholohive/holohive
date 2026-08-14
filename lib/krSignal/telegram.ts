/**
 * KR Signal Bot — Telegram client (spec §8). Uses its OWN bot token
 * (KR_SIGNAL_BOT_TOKEN), separate from HHP's main bot, so this client-facing
 * market bot can never cross-post into team/KOL chats (guardrail §9).
 * HTML parse mode; sendMessage returns message_id (stored for the +24h edit).
 */

function token(): string {
  const t = process.env.KR_SIGNAL_BOT_TOKEN;
  if (!t) throw new Error("KR_SIGNAL_BOT_TOKEN not set");
  return t;
}

async function call<T = any>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.error_code} ${json.description}`);
  return json.result as T;
}

export const getMe = () => call("getMe");

/** Send an HTML message; returns the sent message (incl. message_id).
 *  Pass threadId to post into a specific forum topic (message_thread_id). */
export async function sendMessage(
  chatId: string | number,
  html: string,
  threadId?: string | number | null
): Promise<{ message_id: number }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (threadId !== undefined && threadId !== null && String(threadId) !== "") {
    body.message_thread_id = Number(threadId);
  }
  try {
    return await call<{ message_id: number }>("sendMessage", body);
  } catch (e) {
    // Bots can't always send custom emoji (<tg-emoji>). On failure, strip the
    // tags — keeping the inner fallback glyph — and resend so the report lands.
    if (/<tg-emoji/i.test(html)) {
      const plain = html.replace(/<tg-emoji[^>]*>(.*?)<\/tg-emoji>/gi, "$1");
      return await call<{ message_id: number }>("sendMessage", { ...body, text: plain });
    }
    throw e;
  }
}

/** Edit a previously sent message in place — used for the Day-1 recap (Stage 2, §7.D/§8). */
export async function editMessageText(chatId: string | number, messageId: number, html: string) {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

export const setMyCommands = (commands: { command: string; description: string }[]) =>
  call("setMyCommands", { commands });

// ─── Review workflow (weekly report manual verification) ──────────────────
//
// The weekly report is now generated a day early, parked in `pending_review`,
// and only reaches the client once someone approves it from the ops chat.
// These are the primitives that flow needs: an inline keyboard to carry the
// decision, a callback ack so Telegram stops spinning, and getChat so we can
// prove the destination is reachable BEFORE anyone approves.

export interface InlineButton { text: string; callback_data: string }

/** Send an HTML message carrying an inline keyboard (one row per array). */
export async function sendMessageWithButtons(
  chatId: string | number,
  html: string,
  buttons: InlineButton[][],
  threadId?: string | number | null
): Promise<{ message_id: number }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons },
  };
  if (threadId !== undefined && threadId !== null && String(threadId) !== "") {
    body.message_thread_id = Number(threadId);
  }
  return call<{ message_id: number }>("sendMessage", body);
}

/** Ack a button tap. Telegram shows a spinner on the button until this lands. */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<void> {
  await call("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: showAlert } : {}),
  }).catch(() => {
    // Callback ids expire after ~60s. A stale ack is not worth failing the
    // decision the operator actually made.
  });
}

/** Replace a review card's text and drop its buttons — used once a report is
 *  approved / skipped so a decided report can't be decided twice. */
export async function editMessageAndClearButtons(
  chatId: string | number,
  messageId: number,
  html: string
): Promise<void> {
  await call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => {
    // Editing is cosmetic. If the card is gone (deleted, too old), the state
    // change already happened in the DB and that is what governs.
  });
}

export interface ChatProbe { ok: boolean; title?: string | null; error?: string }

/** Can the bot actually post here? Answered at generate time so a broken
 *  destination is visible on the review card instead of surfacing as a failed
 *  send nobody reads. */
export async function probeChat(chatId: string | number): Promise<ChatProbe> {
  try {
    const chat = await call<{ title?: string; username?: string }>("getChat", { chat_id: chatId });
    return { ok: true, title: chat?.title ?? chat?.username ?? null };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
