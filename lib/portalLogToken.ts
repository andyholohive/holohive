import crypto from 'crypto';

/**
 * Signed beacon token for the Document Portal access log (audit H6).
 *
 * `/api/documents/log` is public/allow-listed (the portal viewer carries no
 * session), so a raw viewer_email in the beacon body is spoofable and can be
 * used to spam the team Telegram alert. Instead, the gated view-url route
 * (which DOES run the portal email gate) mints a short-lived HMAC token binding
 * the document id + the gate-verified email. The viewer echoes it on every
 * beacon; the log route trusts the email from the VERIFIED token only, never
 * the body. No token → the event is still stored, but with no attributed email
 * and no alert.
 *
 * Key material: CRON_SECRET (already required in prod) with the service-role
 * key as a fallback so local/dev without CRON_SECRET still works. Server-only —
 * this module must never be imported into a client bundle.
 */
function secret(): string {
  const k = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!k) throw new Error('portalLogToken: no signing secret configured');
  return k;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const TTL_MS = 12 * 60 * 60 * 1000; // 12h — covers a long reading session past the 1h signed-URL.

/** Mint a token binding (documentId, email) with a 12h expiry. */
export function signLogToken(documentId: string, email: string, now: number = Date.now()): string {
  const payload = { d: documentId, e: email.trim().toLowerCase(), x: now + TTL_MS };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
  return `${body}.${sig}`;
}

/**
 * Verify a token against the expected document id. Returns the bound email on
 * success, or null on any failure (missing, malformed, bad signature, expired,
 * or document-id mismatch). Constant-time signature compare.
 */
export function verifyLogToken(token: unknown, expectedDocumentId: string): string | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let expected: string;
  try {
    expected = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (!payload || payload.d !== expectedDocumentId) return null;
    if (typeof payload.x !== 'number' || payload.x < Date.now()) return null;
    return typeof payload.e === 'string' ? payload.e : null;
  } catch {
    return null;
  }
}
