import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { RESERVED_SUBDOMAINS } from '@/lib/shortLinkService';

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
  if (!SLUG_RE.test(slug)) {
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
  return NextResponse.json({ link: data });
}
