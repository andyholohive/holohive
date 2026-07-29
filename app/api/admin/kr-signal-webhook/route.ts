import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/admin/kr-signal-webhook — inspect and register the KR Signal
 * bot's Telegram webhook, server-side.
 *
 * Why this exists: the webhook is the one piece of KR Signal config that does
 * NOT live in Vercel. Telegram stores it, set once by a setWebhook call, and
 * its secret_token has to match KR_SIGNAL_WEBHOOK_SECRET exactly. Two secrets
 * copied by hand into two systems is a silent-failure machine: a mismatch
 * drops every update with a 200, getWebhookInfo still reads healthy, and the
 * bot just goes quiet. That is precisely the failure this endpoint was written
 * to end.
 *
 * Here the server reads both values from its own environment and hands them to
 * Telegram itself, so the two sides cannot disagree, and no operator ever has
 * to hold either secret.
 *
 * GET  — read-only getWebhookInfo. Safe to call any time.
 * POST — setWebhook, then re-read. The only mutating path; it changes state at
 *        Telegram, not here.
 *
 * Never returns a secret value — only whether each one is present.
 */

const WEBHOOK_PATH = '/api/webhooks/kr-signal-telegram';

function tokenOrError() {
  const token = process.env.KR_SIGNAL_BOT_TOKEN;
  if (!token) {
    return {
      token: null,
      response: NextResponse.json(
        { ok: false, error: 'KR_SIGNAL_BOT_TOKEN is not set on this deployment.' },
        { status: 200 },
      ),
    };
  }
  return { token, response: null };
}

/**
 * The URL Telegram should call. NEXT_PUBLIC_BASE_URL is canonical; the request
 * origin is the fallback. Deliberately NOT caller-supplied — a typo'd host
 * would register a webhook that silently never fires, which is the exact class
 * of bug this endpoint exists to remove.
 */
function webhookUrl(request: Request): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  const origin = base || new URL(request.url).origin;
  return `${origin}${WEBHOOK_PATH}`;
}

async function getInfo(token: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const json: any = await res.json().catch(() => null);
  if (!json?.ok) {
    return { ok: false as const, error: json?.description || `Telegram returned ${res.status}` };
  }
  const r = json.result ?? {};
  return {
    ok: true as const,
    info: {
      url: r.url || null,
      has_custom_certificate: !!r.has_custom_certificate,
      pending_update_count: r.pending_update_count ?? 0,
      last_error_date: r.last_error_date ? new Date(r.last_error_date * 1000).toISOString() : null,
      last_error_message: r.last_error_message || null,
      max_connections: r.max_connections ?? null,
      // Telegram does not echo the secret back, so a mismatch is invisible here.
      // It reports whether one was set at all, which is still worth surfacing.
      ip_address: r.ip_address || null,
    },
  };
}

export async function GET(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const { token, response } = tokenOrError();
  if (!token) return response;

  const expected = webhookUrl(request);
  const result = await getInfo(token);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 200 });

  return NextResponse.json({
    ok: true,
    expected_url: expected,
    url_matches: result.info.url === expected,
    // Presence only, never values.
    has_bot_token: true,
    has_webhook_secret: !!process.env.KR_SIGNAL_WEBHOOK_SECRET,
    ...result.info,
  });
}

export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const { token, response } = tokenOrError();
  if (!token) return response;

  const url = webhookUrl(request);
  const secret = process.env.KR_SIGNAL_WEBHOOK_SECRET;

  const body: Record<string, string> = { url };
  // Omitting secret_token CLEARS any previously registered one, which is the
  // correct pairing: no secret in the env means the route's gate is off, so
  // Telegram must stop sending a token the route would no longer check.
  if (secret) body.secret_token = secret;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => null);
  if (!json?.ok) {
    return NextResponse.json(
      { ok: false, error: json?.description || `Telegram returned ${res.status}` },
      { status: 200 },
    );
  }

  // Read back rather than trusting the write — the point of this endpoint is
  // to replace assumptions about Telegram's state with an observation of it.
  const after = await getInfo(token);

  return NextResponse.json({
    ok: true,
    registered_url: url,
    secret_sent: !!secret,
    description: json.description || 'Webhook was set',
    ...(after.ok ? { url_matches: after.info.url === url, ...after.info } : {}),
  });
}
