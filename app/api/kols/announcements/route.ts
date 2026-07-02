import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { KolAnnouncementService } from '@/lib/kolAnnouncementService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/kols/announcements
 *
 * Bulk-send a Markdown message to a set of KOL group chats. Body:
 *   { text: string, kolIds: string[] }
 *
 * Auth: super_admin only (audits sender). Rate-limited to 1 send / 1.1s
 * inside the service so a 30-KOL blast takes ~33s — well under the 300s
 * function budget declared above.
 *
 * The response includes ok/failed counts + a failures[] array for
 * per-recipient error surfacing in the UI. Skipped[] holds KOLs that
 * had no linked group chat, so the composer can point out the ones
 * that couldn't be reached.
 */
export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  let body: { text?: string; kolIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = (body.text ?? '').trim();
  const kolIds = Array.isArray(body.kolIds) ? body.kolIds.filter(Boolean) : [];
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  if (kolIds.length === 0) return NextResponse.json({ error: 'kolIds is required' }, { status: 400 });
  if (kolIds.length > 100) {
    return NextResponse.json({ error: 'Max 100 recipients per send' }, { status: 400 });
  }
  if (text.length > 4000) {
    // Telegram's actual limit is 4096. Round down for a safety margin.
    return NextResponse.json({ error: 'Message exceeds 4000 char limit' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const senderUserId = guard.user?.id ?? null;
  const service = new KolAnnouncementService(supabase);
  try {
    const result = await service.send({ bodyText: text, kolIds, senderUserId });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[kols/announcements] send failed', err);
    return NextResponse.json(
      { error: err?.message ?? 'Send failed' },
      { status: 500 },
    );
  }
}
