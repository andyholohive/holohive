import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/links/reconcile — weekly Drive reconcile (Link Log Automation §3).
 *
 * HHP has no Google Drive credentials, so the Drive side runs as an Apps
 * Script on the Shared Drive (Jdot's side — zero-credential Drive access
 * with a weekly trigger). The script enumerates every Doc/Sheet/Slide and
 * POSTs the full inventory here; this endpoint owns the diff:
 *
 *   1. Inventory file not in the log            → insert as DRAFT
 *      (source 'drive-reconcile'; a human publishes on /links, same
 *      review-queue flow as plugin writes — brief §2).
 *   2. Logged link (with file_id) not in inventory → stamp dead_at
 *      (file deleted/moved out of the Drive; surfaced on /links).
 *   3. Dead link whose file_id reappears          → clear dead_at.
 *
 * Auth: same bearer tokens as POST /api/links (LINKS_WRITE_TOKEN or
 * CRON_SECRET). Allow-listed exactly in middleware.
 *
 * Body:
 * {
 *   "files": [ { "fileId": "...", "name": "...", "url": "...", "type"?: "..." }, ... ],
 *   "dryRun"?: true   // report the diff without writing anything
 * }
 *
 * The inventory must be COMPLETE for dead-link detection to be sound —
 * a partial list would mark everything absent as dead. Callers sending a
 * partial batch should pass "partial": true, which skips steps 2 & 3.
 */

const MAX_FILES = 5000;

function authorized(request: NextRequest): boolean {
  const header = request.headers.get('authorization') || '';
  const linksToken = process.env.LINKS_WRITE_TOKEN;
  const cronSecret = process.env.CRON_SECRET;
  if (linksToken && header === `Bearer ${linksToken}`) return true;
  if (cronSecret && header === `Bearer ${cronSecret}`) return true;
  return false;
}

/** Mirror of normaliseType in ../route.ts (kept local — both are tiny). */
const KNOWN_TYPES = new Set([
  'client delivery', 'templates', 'report/research', 'operations', 'public/pr',
  'resources', 'list', 'loom', 'sales', 'guide', 'contract', 'others',
]);
function normaliseType(raw: unknown): string {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return 'others';
  if (KNOWN_TYPES.has(v)) return v;
  if (v === 'report' || v === 'research') return 'report/research';
  if (v === 'public' || v === 'pr') return 'public/pr';
  return 'others';
}

type InventoryFile = { fileId: string; name: string; url: string; type?: string };

export async function POST(request: NextRequest) {
  try {
    if (!authorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.files)) {
      return NextResponse.json({ error: 'Body must include a files[] array' }, { status: 400 });
    }
    if (body.files.length > MAX_FILES) {
      return NextResponse.json({ error: `files[] exceeds ${MAX_FILES} entries` }, { status: 400 });
    }
    const dryRun = body.dryRun === true;
    const partial = body.partial === true;

    // Validate + dedupe the inventory by fileId.
    const inventory = new Map<string, InventoryFile>();
    for (const raw of body.files) {
      const fileId = String(raw?.fileId ?? raw?.file_id ?? '').trim();
      const name = String(raw?.name ?? '').trim();
      const url = String(raw?.url ?? '').trim();
      if (!fileId || !name || !url) continue; // skip malformed entries silently, count below
      inventory.set(fileId, { fileId, name, url, type: raw?.type });
    }
    const skippedMalformed = body.files.length - inventory.size;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[/api/links/reconcile] Missing Supabase env');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Current log state — only file_id + url matter for the diff.
    const { data: existingRows, error: fetchErr } = await (supabaseAdmin as any)
      .from('links')
      .select('id, file_id, url, dead_at');
    if (fetchErr) {
      console.error('[/api/links/reconcile] fetch failed:', fetchErr);
      return NextResponse.json({ error: 'Failed to read links' }, { status: 500 });
    }
    const byFileId = new Map<string, any>();
    const knownUrls = new Set<string>();
    for (const row of existingRows as any[]) {
      if (row.file_id) byFileId.set(row.file_id, row);
      if (row.url) knownUrls.add(row.url);
    }

    // 1. New files → drafts. Match by file_id first, then exact URL (a
    //    hand-logged row without file_id shouldn't be duplicated).
    const toCreate: InventoryFile[] = [];
    for (const f of inventory.values()) {
      if (byFileId.has(f.fileId)) continue;
      if (knownUrls.has(f.url)) continue;
      toCreate.push(f);
    }

    // 2 & 3. Dead / revived — only sound against a complete inventory.
    const toMarkDead: any[] = [];
    const toRevive: any[] = [];
    if (!partial) {
      for (const [fileId, row] of byFileId) {
        const present = inventory.has(fileId);
        if (!present && !row.dead_at) toMarkDead.push(row);
        if (present && row.dead_at) toRevive.push(row);
      }
    }

    if (!dryRun) {
      if (toCreate.length > 0) {
        const now = new Date().toISOString();
        const rows = toCreate.map(f => ({
          name: f.name,
          url: f.url,
          file_id: f.fileId,
          link_types: [normaliseType(f.type)],
          access: 'team',
          status: 'draft',
          source: 'drive-reconcile',
          created_at: now,
          updated_at: now,
        }));
        const { error } = await (supabaseAdmin as any).from('links').insert(rows);
        if (error) {
          console.error('[/api/links/reconcile] insert failed:', error);
          return NextResponse.json({ error: 'Failed to insert drafts' }, { status: 500 });
        }
      }
      if (toMarkDead.length > 0) {
        const { error } = await (supabaseAdmin as any)
          .from('links')
          .update({ dead_at: new Date().toISOString() })
          .in('id', toMarkDead.map(r => r.id));
        if (error) console.error('[/api/links/reconcile] dead-mark failed:', error);
      }
      if (toRevive.length > 0) {
        const { error } = await (supabaseAdmin as any)
          .from('links')
          .update({ dead_at: null })
          .in('id', toRevive.map(r => r.id));
        if (error) console.error('[/api/links/reconcile] revive failed:', error);
      }
    }

    return NextResponse.json({
      dryRun,
      partial,
      inventorySize: inventory.size,
      skippedMalformed,
      createdDrafts: toCreate.length,
      markedDead: toMarkDead.length,
      revived: toRevive.length,
    });
  } catch (err) {
    console.error('[/api/links/reconcile] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
