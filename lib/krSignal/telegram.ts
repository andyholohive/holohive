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

/** Send an HTML message; returns the sent message (incl. message_id). */
export async function sendMessage(chatId: string | number, html: string): Promise<{ message_id: number }> {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
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
