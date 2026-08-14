import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { saveWeeklyEdit, getWeeklyReviewById } from '@/lib/krSignal/store';
import { buildReportHtml } from '@/lib/krSignal/reportEdit';
import { approveAndSend, skipReport } from '@/lib/krSignal/reviewActions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * POST /api/kr-signal/review/[id] — act on one queued weekly report.
 *
 * body: { action: 'save' | 'send' | 'skip', title?, body? }
 *
 *   save → store the edited copy, stay pending. Editing is not approving:
 *          fixing a typo must not be able to ship the report by itself.
 *   send → save any pending edit, then deliver and mark sent.
 *   skip → decline this week.
 *
 * Shares approveAndSend / skipReport with the Telegram buttons, so the two
 * surfaces cannot diverge on what "approved" does.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;

  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = body?.action as 'save' | 'send' | 'skip' | undefined;
  if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 });

  // Name the actor from their HHP profile — this is the in-app path, so unlike
  // the Telegram buttons we always have an account to attribute to.
  const { data: profile } = await supabase
    .from('users').select('id, name').eq('id', user.id).maybeSingle();
  const actor = {
    name: (profile as any)?.name ?? user.email ?? 'HHP user',
    userId: (profile as any)?.id ?? null,
  };

  try {
    const row = await getWeeklyReviewById(supabase, id);
    if (!row) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    // Persist the edit first for both 'save' and 'send', so what gets
    // delivered is exactly what the operator had on screen.
    if ((action === 'save' || action === 'send') && typeof body?.body === 'string') {
      const html = buildReportHtml({ title: String(body?.title ?? ''), body: String(body.body) });
      await saveWeeklyEdit(supabase, id, html);
    }

    if (action === 'save') {
      return NextResponse.json({ ok: true, saved: true });
    }

    if (action === 'skip') {
      const res = await skipReport(supabase, id, actor);
      if (!res.ok) {
        return NextResponse.json(
          { error: res.alreadyDecided ? `Already ${res.alreadyDecided}.` : res.error },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true, skipped: true });
    }

    const res = await approveAndSend(supabase, id, actor);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.alreadyDecided ? `Already ${res.alreadyDecided}.` : res.error },
        { status: res.alreadyDecided ? 409 : 502 },
      );
    }
    return NextResponse.json({ ok: true, sent: true, message_id: res.messageId, chat_id: res.chatId });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
