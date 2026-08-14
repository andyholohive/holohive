import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { listWeekliesAwaitingReview } from '@/lib/krSignal/store';
import { parseReportHtml, effectiveHtml } from '@/lib/krSignal/reportEdit';
import { loadClientById } from '@/lib/krSignal/config';

export const dynamic = 'force-dynamic';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/kr-signal/review[?clientId=<kr_signal_clients.id>]
 *
 * The in-app half of the weekly review queue: everything generated but not
 * yet decided. Returns the report already split into editable parts so the
 * dialog never has to touch Telegram HTML — see lib/krSignal/reportEdit.
 *
 * Auth is a logged-in session; the data is internal market analysis, and the
 * decision it feeds (does a client see this) is a team action.
 */
export async function GET(request: Request) {
  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  const clientId = new URL(request.url).searchParams.get('clientId') || undefined;

  try {
    const rows = await listWeekliesAwaitingReview(supabase, clientId);
    const items = await Promise.all(rows.map(async (row) => {
      const cfg = await loadClientById(supabase, row.client_id);
      const parts = parseReportHtml(effectiveHtml(row));
      return {
        id: row.id,
        client_id: row.client_id,
        hhp_client_id: cfg?.client_id ?? null,
        client_name: cfg?.name ?? null,
        week_ending: row.week_ending,
        status: row.status,
        edited: !!row.edited_html,
        preflight: row.preflight,
        // Resolved fresh rather than read off the row: the operator may have
        // fixed the destination since generation, and the panel should show
        // where it would go NOW, not where it would have gone.
        destination_chat_id: cfg?.resolved_chat_id ?? null,
        title: parts.title,
        body: parts.body,
      };
    }));
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
