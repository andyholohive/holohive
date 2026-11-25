/**
 * Thin Telegram Bot API caller for the /draft flow.
 *
 * The webhook's own send helpers only return a message id or a boolean, and
 * only know callback buttons. /draft needs the error text (to report a failed
 * send in the topic), URL buttons, ForceReply and copyMessages, so it calls
 * the API directly through this one function.
 */
export type TgResult<T = any> = { ok: true; result: T } | { ok: false; description: string };

export async function tg<T = any>(method: string, body: Record<string, unknown>): Promise<TgResult<T>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, description: 'TELEGRAM_BOT_TOKEN not configured' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!json?.ok) return { ok: false, description: json?.description || `HTTP ${res.status}` };
    return { ok: true, result: json.result as T };
  } catch (err: any) {
    return { ok: false, description: err?.message || 'network error' };
  }
}

/** Download a Telegram file as base64. Null when it can't be fetched or is too large. */
export async function downloadTelegramFile(fileId: string, maxBytes = 4_500_000): Promise<{ base64: string; mediaType: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const meta = await tg<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId });
  if (!meta.ok || !meta.result.file_path) return null;
  if (meta.result.file_size && meta.result.file_size > maxBytes) return null;
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${meta.result.file_path}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return null;
    const ext = meta.result.file_path.split('.').pop()?.toLowerCase();
    const mediaType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    return { base64: buf.toString('base64'), mediaType };
  } catch {
    return null;
  }
}

/** HH:MM in Korea time. */
export function kstClock(d = new Date()): string {
  const k = new Date(d.getTime() + 9 * 3_600_000);
  return `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * Delete a "What should change?" prompt. Its ForceReply keeps putting the
 * reviewer's chat box back into reply mode every time they open the topic,
 * until the message is gone (Quazo, 2026-11-26), so every path that finishes
 * with a prompt removes it. Failures are ignored: it may already be deleted.
 */
export async function deletePrompt(chatId: number | string | null | undefined, messageId: number | null | undefined): Promise<void> {
  if (!chatId || !messageId) return;
  await tg('deleteMessage', { chat_id: chatId, message_id: messageId });
}
