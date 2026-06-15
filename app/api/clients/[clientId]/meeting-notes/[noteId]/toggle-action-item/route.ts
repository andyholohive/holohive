import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/clients/[clientId]/meeting-notes/[noteId]/toggle-action-item
 *
 * Toggle a single action item's is_done flag on a call note stored in
 * client_context.call_notes JSONB. Used by the Team Dashboard's Recent
 * Call Notes card so operators can tick action items off without
 * opening the full Edit Portal modal.
 *
 * Body: { itemId: string, is_done: boolean }
 *
 * Auth: any authenticated user. Matches the send-tg route's auth — the
 * gate is "logged into HQ," not super-admin, because the call notes
 * data is the team's working surface.
 *
 * Per spec: toggling is_done does NOT auto-close the linked HQ task
 * (humans decide). It only mutates the action item's display state on
 * the dashboard / modal. Same behaviour as CallNotesTab's inline toggle.
 */
export async function POST(
  request: Request,
  { params }: { params: { clientId: string; noteId: string } },
) {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { itemId?: string; is_done?: boolean } = {};
  try { body = await request.json(); } catch { /* invalid JSON falls through to validation */ }

  const itemId = (body.itemId ?? '').trim();
  if (!itemId || typeof body.is_done !== 'boolean') {
    return NextResponse.json(
      { error: 'itemId (string) and is_done (boolean) are required' },
      { status: 400 },
    );
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch the client_context row for this client.
  const { data: ctx, error: ctxErr } = await (supabaseAdmin as any)
    .from('client_context')
    .select('id, call_notes')
    .eq('client_id', params.clientId)
    .maybeSingle();

  if (ctxErr || !ctx) {
    return NextResponse.json({ error: 'Client context not found' }, { status: 404 });
  }

  type ActionItem = {
    id: string;
    text: string;
    owner_user_id: string | null;
    owner_client_side: boolean;
    is_done: boolean;
    auto_created_task_id: string | null;
  };
  type Note = {
    id: string;
    action_items?: ActionItem[];
    [k: string]: any;
  };

  const callNotes = (((ctx as any).call_notes ?? []) as Note[]);
  const noteIdx = callNotes.findIndex(n => n.id === params.noteId);
  if (noteIdx < 0) {
    return NextResponse.json({ error: 'Call note not found' }, { status: 404 });
  }

  const targetNote = callNotes[noteIdx];
  const items = (targetNote.action_items ?? []) as ActionItem[];
  const itemIdx = items.findIndex(i => i.id === itemId);
  if (itemIdx < 0) {
    return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
  }

  // Idempotent: if the requested state matches, return early without
  // an extra write. Saves an UPDATE round-trip on double-clicks.
  if (items[itemIdx].is_done === body.is_done) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const nextItems = items.map((it, idx) =>
    idx === itemIdx ? { ...it, is_done: body.is_done as boolean } : it,
  );
  const nextNotes = callNotes.map((n, idx) =>
    idx === noteIdx ? { ...n, action_items: nextItems } : n,
  );

  const { error: updErr } = await (supabaseAdmin as any)
    .from('client_context')
    .update({ call_notes: nextNotes, updated_at: new Date().toISOString() })
    .eq('id', (ctx as any).id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, is_done: body.is_done });
}
