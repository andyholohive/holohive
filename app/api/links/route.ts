import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/links — automated Link Log write path (Link Log Automation brief).
 *
 * Called server-to-server by the delivery plugin / weekly Drive-reconcile job.
 * The interactive team form still posts to /api/links/submit (session-gated);
 * this route is for hands-off automation and is auth'd by a dedicated token.
 *
 * Auth (checked here; the path is allow-listed in middleware so a cookieless
 * caller reaches this handler):
 *   Authorization: Bearer ${LINKS_WRITE_TOKEN}   ← give this to Jdot for the plugin
 *   Authorization: Bearer ${CRON_SECRET}         ← accepted fallback (server-to-server)
 *
 * Behaviour:
 *   - Stores the Drive fileId, not just the URL, so links survive Drive
 *     moves/renames (file IDs are stable; URLs go dead on reorg).
 *   - Idempotent: matches an existing row by file_id first, then url. Existing
 *     row → update in place; otherwise insert. Never duplicates.
 *   - New rows land as `draft` (not published), mirroring the Client Delivery
 *     Log: the plugin/reconcile writes drafts, a human publishes on /links.
 *   - Reuses the existing type + access enums.
 *
 * Body: { name, url, fileId?, type?, link_types?, access?, status?, source?,
 *         client?, client_id?, description? }
 */

// Canonical values for the links.link_types[] taxonomy (mirrors /links LINK_TYPES).
const KNOWN_TYPES = new Set([
  'client delivery', 'templates', 'report/research', 'operations', 'public/pr',
  'resources', 'list', 'loom', 'sales', 'guide', 'contract', 'others',
]);
const ACCESS_VALUES = new Set(['public', 'partners', 'team', 'client']);
const STATUS_VALUES = new Set(['draft', 'active', 'inactive', 'archived']);

/** Normalise an incoming type label/value ("Client Delivery", "client delivery") to a taxonomy value. */
function normaliseType(raw: unknown): string {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return 'others';
  if (KNOWN_TYPES.has(v)) return v;
  // Tolerate the label form ("Report/Research") and a couple of aliases.
  if (v === 'report' || v === 'research') return 'report/research';
  if (v === 'public' || v === 'pr') return 'public/pr';
  return 'others';
}

function authorized(request: NextRequest): boolean {
  const header = request.headers.get('authorization') || '';
  const linksToken = process.env.LINKS_WRITE_TOKEN;
  const cronSecret = process.env.CRON_SECRET;
  if (linksToken && header === `Bearer ${linksToken}`) return true;
  if (cronSecret && header === `Bearer ${cronSecret}`) return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    if (!authorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const name = String(body.name ?? '').trim();
    const url = String(body.url ?? '').trim();
    const fileId = body.fileId ? String(body.fileId).trim() : (body.file_id ? String(body.file_id).trim() : null);

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });
    try { new URL(url); } catch { return NextResponse.json({ error: 'Invalid url format' }, { status: 400 }); }

    // Resolve link_types: accept an explicit array, else a single `type`.
    let linkTypes: string[];
    if (Array.isArray(body.link_types) && body.link_types.length > 0) {
      linkTypes = Array.from(new Set(body.link_types.map(normaliseType)));
    } else if (body.type) {
      linkTypes = [normaliseType(body.type)];
    } else {
      linkTypes = ['others'];
    }

    const access = ACCESS_VALUES.has(String(body.access ?? '').toLowerCase())
      ? String(body.access).toLowerCase()
      : 'team';
    // Automation defaults to draft; callers may explicitly request another
    // valid status (e.g. a trusted backfill), but never fall out of the enum.
    const status = STATUS_VALUES.has(String(body.status ?? '').toLowerCase())
      ? String(body.status).toLowerCase()
      : 'draft';
    const source = body.source ? String(body.source).trim() : 'automation';

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[/api/links] Missing Supabase env');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Idempotency: match by file_id first (stable across moves/renames), then url.
    let existingId: string | null = null;
    if (fileId) {
      const { data } = await (supabaseAdmin as any)
        .from('links').select('id').eq('file_id', fileId).limit(1).maybeSingle();
      existingId = (data as any)?.id ?? null;
    }
    if (!existingId) {
      const { data } = await (supabaseAdmin as any)
        .from('links').select('id').eq('url', url).limit(1).maybeSingle();
      existingId = (data as any)?.id ?? null;
    }

    const payload: Record<string, any> = {
      name,
      url,
      file_id: fileId,
      link_types: linkTypes,
      access,
      client: body.client ? String(body.client).trim() : null,
      client_id: body.client_id || null,
      description: body.description ? String(body.description).trim() : null,
      source,
      updated_at: new Date().toISOString(),
    };

    if (existingId) {
      // Update in place. Do NOT overwrite status on an already-reviewed row —
      // re-syncing a published link must not silently demote it back to draft.
      const { data: link, error } = await (supabaseAdmin as any)
        .from('links').update(payload).eq('id', existingId).select().single();
      if (error) {
        console.error('[/api/links] update failed:', error);
        return NextResponse.json({ error: 'Failed to update link' }, { status: 500 });
      }
      return NextResponse.json({ action: 'updated', link });
    }

    const { data: link, error } = await (supabaseAdmin as any)
      .from('links').insert([{ ...payload, status }]).select().single();
    if (error) {
      console.error('[/api/links] insert failed:', error);
      return NextResponse.json({ error: 'Failed to create link' }, { status: 500 });
    }
    return NextResponse.json({ action: 'created', link });
  } catch (err) {
    console.error('[/api/links] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
