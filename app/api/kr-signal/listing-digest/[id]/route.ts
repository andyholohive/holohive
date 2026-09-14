import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { digestTextToHtml, unpairedBoldMarkers } from '@/lib/krSignal/digestEdit';
import { buildListingDigestCard, listingDigestButtons } from '@/lib/krSignal/reviewCard';
import { editMessageText } from '@/lib/krSignal/telegram';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/kr-signal/listing-digest/[id] — save an edited listings digest.
 *
 * [2026-09-14, Andy] The weekly report has had an Edit path since August; the
 * listings digest had the `edited_html` column and the "prefer the edit"
 * helper but nothing that could write to it, so the copy that reached clients
 * was whatever the cron generated.
 *
 * The body is plain text, not markup — see lib/krSignal/digestEdit for why.
 * It is converted here rather than in the browser so the stored HTML is
 * produced by exactly one code path no matter what calls this.
 *
 * Only a digest still awaiting review can be edited. Editing one already sent
 * would change the record of what a client received, which is worse than not
 * being able to fix it.
 */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  // [2026-09-14, Andy] Admins edit too, not just super_admins. Editing copy
  // before it is approved is ordinary campaign work — Jaymz, Jeremyin and
  // Quazo are plain admins who run these comms — and approval is a separate
  // action, so a wider edit gate cannot ship anything on its own.
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  let text: string;
  try {
    ({ text } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Body must be JSON with a "text" field.' }, { status: 400 });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'The digest cannot be saved empty.' }, { status: 400 });
  }

  const { data: row, error: readErr } = await (supabase as any)
    .from('kr_signal_listing_digests')
    .select('id, status, week_ending, digest_html, preflight, review_chat_id, review_message_id')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'No such digest.' }, { status: 404 });
  if (row.status !== 'pending_review') {
    return NextResponse.json(
      { error: `This digest is already ${row.status.replace('_', ' ')} and can no longer be edited.` },
      { status: 409 },
    );
  }

  const edited_html = digestTextToHtml(text);

  const { error: writeErr } = await (supabase as any)
    .from('kr_signal_listing_digests')
    .update({ edited_html, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

  // Keep the review card in step. Someone approving from Telegram must be
  // approving what they can see, not the version this edit replaced — an
  // approval against stale copy is the one failure this feature could
  // introduce. Best-effort: the edit is saved either way, and the response
  // says whether the card kept up.
  let cardUpdated = false;
  let cardError: string | null = null;
  if (row.review_chat_id && row.review_message_id) {
    try {
      const card = buildListingDigestCard({
        weekLabel: `Week ending ${row.week_ending}`,
        html: edited_html,
        preflight: row.preflight ?? [],
        listingCount: (edited_html.match(/\n/g) ?? []).length,
      });
      await editMessageText(
        row.review_chat_id, row.review_message_id, card, listingDigestButtons(row.id),
      );
      cardUpdated = true;
    } catch (e: any) {
      cardError = String(e?.message ?? e);
    }
  }

  return NextResponse.json({
    ok: true,
    cardUpdated,
    cardError,
    unpairedMarkers: unpairedBoldMarkers(text),
  });
}
