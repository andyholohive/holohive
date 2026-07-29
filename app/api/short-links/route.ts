import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { RESERVED_SUBDOMAINS } from '@/lib/shortLinkService';
import {
  provisionSubdomain, provisioningConfigured, provisioningStatus,
  type ProvisionResult,
} from '@/lib/domainProvisioning';

export const dynamic = 'force-dynamic';

/**
 * Short-link CRUD.
 *
 * GET  /api/short-links — every link with its click count.
 * POST /api/short-links — create one.
 *
 * admin + super_admin: creating a branded link is ops work (a CM building
 * a KOL brief), not a super-admin-only setting.
 */

const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
// Empty slug === the subdomain root (tria.holohive.io itself).
const SLUG_RE = /^[a-z0-9][a-z0-9/_-]{0,127}$/;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: Request) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;

  const supabase = admin();
  const { data: links, error } = await (supabase as any)
    .from('short_links')
    .select('*, client:clients(id, name), campaign:campaigns(id, name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Click counts in one pass rather than a count query per row.
  const ids = ((links as any[]) ?? []).map(l => l.id);
  const counts = new Map<string, number>();
  const lastClick = new Map<string, string>();
  if (ids.length > 0) {
    const { data: clicks } = await (supabase as any)
      .from('short_link_clicks')
      .select('short_link_id, clicked_at')
      .in('short_link_id', ids);
    for (const c of ((clicks as any[]) ?? [])) {
      counts.set(c.short_link_id, (counts.get(c.short_link_id) ?? 0) + 1);
      const prev = lastClick.get(c.short_link_id);
      if (!prev || c.clicked_at > prev) lastClick.set(c.short_link_id, c.clicked_at);
    }
  }

  return NextResponse.json({
    links: ((links as any[]) ?? []).map(l => ({
      ...l,
      click_count: counts.get(l.id) ?? 0,
      last_clicked_at: lastClick.get(l.id) ?? null,
    })),
    // Drives the dialog copy: with credentials set the UI promises automatic
    // setup, without them it shows the manual CNAME steps. Never leaks the
    // credential values themselves — only whether they exist.
    autoDns: provisioningConfigured(),
    // Per-variable presence booleans (never values) so a half-configured
    // setup names its own missing piece instead of failing generically.
    dnsConfig: provisioningStatus(),
  });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const subdomain = String(body.subdomain ?? '').trim().toLowerCase();
  // Leading/trailing slashes are the most common paste artifact ("/fitcheck").
  const slug = String(body.slug ?? '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  const destination_url = String(body.destination_url ?? '').trim();

  if (!SUBDOMAIN_RE.test(subdomain)) {
    return NextResponse.json({ error: 'Subdomain must be lowercase letters, numbers or hyphens.' }, { status: 400 });
  }
  if ((RESERVED_SUBDOMAINS as readonly string[]).includes(subdomain)) {
    return NextResponse.json(
      { error: `"${subdomain}" is reserved for the app itself and can't be used for a link.` },
      { status: 400 },
    );
  }
  if (slug !== '' && !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Path must be lowercase letters, numbers, hyphens or underscores.' }, { status: 400 });
  }
  let destHost: string;
  try {
    const u = new URL(destination_url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme');
    destHost = u.host;
  } catch {
    return NextResponse.json({ error: 'Destination must be a full http(s):// URL.' }, { status: 400 });
  }
  // A link pointing at its own host would loop forever through the rewrite.
  if (destHost.toLowerCase() === `${subdomain}.holohive.io`) {
    return NextResponse.json({ error: 'Destination points back at this link — that would loop.' }, { status: 400 });
  }

  const supabase = admin();

  // Is this subdomain already serving links? If so its DNS is already done and
  // we skip provisioning entirely — the common case after the first link.
  const { data: sibling } = await (supabase as any)
    .from('short_links')
    .select('id, dns_status')
    .eq('subdomain', subdomain)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  const { data, error } = await (supabase as any)
    .from('short_links')
    .insert({
      subdomain,
      slug,
      destination_url,
      label: body.label?.trim() || null,
      client_id: body.client_id || null,
      campaign_id: body.campaign_id || null,
      created_by: guard.user?.id ?? null,
      dns_status: sibling ? (sibling.dns_status ?? 'manual') : 'pending',
    })
    .select()
    .single();

  if (error) {
    if ((error as any).code === '23505') {
      return NextResponse.json(
        { error: `${subdomain}.holohive.io/${slug} already exists.` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // New subdomain → create the CNAME and attach the Vercel domain ourselves.
  // Deliberately after the insert: the link row is the user's work and must
  // survive a DNS failure, which is then visible as dns_status='failed' with
  // a Retry button rather than a lost form.
  let provision: ProvisionResult | null = null;
  if (!sibling) {
    provision = await provisionSubdomain(subdomain);
    await (supabase as any)
      .from('short_links')
      .update({
        dns_status: provision.status,
        dns_error: provision.error ?? null,
        dns_checked_at: new Date().toISOString(),
      })
      .eq('id', (data as any).id);
  }

  return NextResponse.json({
    link: { ...(data as any), dns_status: provision?.status ?? (data as any).dns_status },
    provision,
    subdomainWasNew: !sibling,
  });
}
