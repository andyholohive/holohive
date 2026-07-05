/**
 * Telegram webhook secret handling.
 *
 * [2026-07-05 AUDIT-FIX] The webhook previously verified the
 * X-Telegram-Bot-Api-Secret-Token header ONLY when TELEGRAM_WEBHOOK_SECRET
 * was set — and it never was in prod, so any anonymous POST with a forged
 * update payload could drive the whole bot (close tasks, approve content,
 * create payments) via the service-role client.
 *
 * The fix must not depend on someone remembering to add an env var, so the
 * secret falls back to a value DERIVED from the bot token:
 *
 *     sha256(TELEGRAM_BOT_TOKEN) — hex
 *
 * Only Telegram (which knows the secret we registered via setWebhook) and
 * this app (which knows the bot token) can produce it. If
 * TELEGRAM_WEBHOOK_SECRET is later set explicitly, BOTH values are accepted
 * so the env change and the webhook re-registration don't have to be
 * simultaneous.
 *
 * Telegram secret_token constraints: 1-256 chars of [A-Za-z0-9_-]. A hex
 * sha256 digest (64 chars) satisfies this.
 */

import { createHash } from 'crypto';

/** All header values the webhook should accept, in preference order. */
export function acceptedWebhookSecrets(): string[] {
  const secrets: string[] = [];
  const configured = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (configured) secrets.push(configured);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    secrets.push(createHash('sha256').update(botToken).digest('hex'));
  }
  return secrets;
}

/** The secret to register with Telegram via setWebhook. */
export function primaryWebhookSecret(): string | null {
  return acceptedWebhookSecrets()[0] ?? null;
}
