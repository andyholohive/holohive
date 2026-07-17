import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side mirror of the client-portal email gate (app/public/portal/[id]).
 *
 * The portal authorizes a viewer by matching the typed email against the
 * client's rules: exact `clients.email`, `approved_emails[]`, same email-domain
 * as `clients.email`, or `approved_domains[]`. There is no persisted per-contact
 * identity — the email itself IS the recipient key.
 *
 * Used by the public document routes so a confidential PDF is only served to an
 * email that could pass the same gate (defence beyond the unguessable doc id).
 */
export interface PortalAuthResult {
  ok: boolean;
  clientId: string | null;
  clientName: string | null;
  reason: 'exact' | 'approved_email' | 'same_domain' | 'approved_domain' | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public / free email providers. If a client's primary email is on one of
 * these (e.g. a solo founder using x1@gmail.com), the "same domain as the
 * client's email" rule MUST NOT apply — otherwise ANY @gmail.com address on
 * earth would pass the gate (audit H1). Same-domain matching is only a valid
 * signal for corporate domains the client actually controls. Free-mail
 * contacts must be listed explicitly in clients.email / approved_emails.
 */
export const FREE_MAIL_DOMAINS = new Set<string>([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'gmx.net', 'zoho.com', 'yandex.com', 'mail.com', 'pm.me',
  'qq.com', '163.com', '126.com', 'naver.com', 'hanmail.net', 'daum.net',
]);

function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : null;
}

function isFreeMail(domain: string | null): boolean {
  return !!domain && FREE_MAIL_DOMAINS.has(domain);
}

/** Resolve a portal id-or-slug + gate email to an authorized client, or reject. */
export async function authorizePortalEmail(
  admin: SupabaseClient,
  idOrSlug: string,
  rawEmail: string,
): Promise<PortalAuthResult> {
  const email = (rawEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return { ok: false, clientId: null, clientName: null, reason: null };

  const col = UUID_RE.test(idOrSlug) ? 'id' : 'slug';
  const { data: client } = await (admin as any)
    .from('clients')
    .select('id, name, email, approved_emails, approved_domains')
    .eq(col, idOrSlug)
    .maybeSingle();
  if (!client) return { ok: false, clientId: null, clientName: null, reason: null };

  const primary = (client.email || '').trim().toLowerCase();
  const approvedEmails: string[] = (client.approved_emails ?? []).map((e: string) => (e || '').trim().toLowerCase());
  const approvedDomains: string[] = (client.approved_domains ?? []).map((d: string) => (d || '').trim().toLowerCase().replace(/^@/, ''));
  const dom = domainOf(email);

  const primaryDom = domainOf(primary);
  let reason: PortalAuthResult['reason'] = null;
  if (primary && email === primary) reason = 'exact';
  else if (approvedEmails.includes(email)) reason = 'approved_email';
  // Same-domain match ONLY for corporate domains — never free-mail (audit H1).
  else if (dom && primaryDom && dom === primaryDom && !isFreeMail(primaryDom)) reason = 'same_domain';
  // An explicitly approved_domain that is free-mail is also rejected — an admin
  // can't (accidentally or otherwise) open the gate to all of gmail.com.
  else if (dom && approvedDomains.includes(dom) && !isFreeMail(dom)) reason = 'approved_domain';

  return {
    ok: reason !== null,
    clientId: reason !== null ? (client.id as string) : null,
    clientName: (client.name as string) ?? null,
    reason,
  };
}
